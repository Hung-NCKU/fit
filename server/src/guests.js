/**
 * 訪客帳號。
 *
 * 訪客**不是一個會留下來的帳號**，而是「還沒決定要不要用」的狀態：
 * 登入頁按「以訪客身分試用」就開一個，進去先玩玩看。真的想留下來，
 * 在 App 右上角按「建立帳號」填名字與身體數據，那一刻才變成正式使用者。
 *
 * 沒建帳號就關掉視窗的話，這個訪客會被清掉——連同他的資料庫。
 * 瀏覽器關閉沒有可靠的事件（beacon 不保證送達），所以改用「閒置多久」判斷：
 * 每次請求更新 last_seen，超過 TEMP_TTL_MIN 沒動靜的暫時訪客就掃掉。
 *
 * 固定使用者（Martina、Eli）寫在 users.js、密碼放 server/.env，要改得動程式。
 * 訪客與升級後的帳號則存在 server/data/guests.json——跟資料庫放在一起，
 * 本來就不進版控。密碼是明碼，跟 .env 那幾組一樣；這個專案的威脅模型從頭到尾
 * 就是「一台自己的機器、只有認識的人連得到」，不在這裡假裝更嚴格。
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 不從 db.js 讀 DATA_DIR：db.js 會 import users.js、users.js 會 import 這裡，
// 繞回去就變成循環相依。這一行跟 db.js 的算法刻意保持一致。
const DATA_DIR = process.env.FIT_DATA_DIR || join(__dirname, '..', 'data');
const FILE = join(DATA_DIR, 'guests.json');

/** 暫時訪客閒置超過這麼多分鐘就清掉。夠長到填得完表單，夠短到不會積一堆。 */
export const TEMP_TTL_MIN = 60;

/** 好唸、好轉述的密碼：兩個單字加四位數 */
const WORDS = [
  'sun', 'moon', 'tree', 'bird', 'lake', 'star', 'wind', 'rain',
  'leaf', 'snow', 'fish', 'rock', 'fire', 'cloud', 'river', 'stone',
];
const makePassword = () =>
  `${WORDS[randomInt(WORDS.length)]}-${WORDS[randomInt(WORDS.length)]}-${randomInt(1000, 10000)}`;

function read() {
  if (!existsSync(FILE)) return { nextId: 2, guests: [] };
  try {
    const j = JSON.parse(readFileSync(FILE, 'utf8'));
    return { nextId: Number(j.nextId) || 2, guests: Array.isArray(j.guests) ? j.guests : [] };
  } catch {
    // 檔案壞掉不該讓整個後端起不來——當成沒有訪客，原檔留著讓人去看
    console.warn(`[guests] ${FILE} 讀不起來，這次忽略`);
    return { nextId: 2, guests: [] };
  }
}

function write(state) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(state, null, 2)}\n`);
}

/** 開機時讀進來的訪客。users.js 會把它們併進 USERS。 */
export function loadGuests() {
  return read().guests;
}

/**
 * 建一個新訪客。回傳的物件含明碼密碼——**只有這一次**拿得到，
 * 呼叫端要負責顯示給使用者看。
 */
export function createGuest() {
  const state = read();
  const n = state.nextId;
  const guest = {
    id: `guest-${n}`,
    name: `訪客 ${n}`,
    password: makePassword(),
    guest: true,
    temp: true,                      // 還沒建帳號，閒置太久會被掃掉
    last_seen: Date.now(),
    created_at: new Date().toLocaleString('sv-SE'),
    // seed 是建資料庫那一次用的，每欄都必填。放中性的暫定值，
    // 登入後跟教練說一次真實數字就會重算（update_goal）。
    seed: {
      sex: 'female', age: 30, height_cm: 170, weight_kg: 65,
      goal_weight_kg: 65, activity: 1.55, goal: 'maintain',
      notes: '臨時訪客帳號，身體數據是暫定的。跟教練說一次真實的年齡、身高、體重與目標，牠會重算。',
    },
  };
  state.guests.push(guest);
  state.nextId = n + 1;
  write(state);
  return guest;
}

/** 有動靜就續命。寫檔很便宜（檔案很小），但還是節流一下，避免每個請求都寫。 */
export function touchGuest(id) {
  const state = read();
  const g = state.guests.find(x => x.id === id && x.temp);
  if (!g) return;
  const now = Date.now();
  if (now - (g.last_seen || 0) < 60_000) return;   // 一分鐘內不重複寫
  g.last_seen = now;
  write(state);
}

/**
 * 把暫時訪客升級成正式帳號：給名字、脫掉 temp，從此不會被掃掉。
 * 身體數據不在這裡寫——那是個人檔案的事，由 db.js 的 updateProfile 處理。
 */
export function promoteGuest(id, name) {
  const state = read();
  const g = state.guests.find(x => x.id === id);
  if (!g) return null;
  g.name = String(name || g.name).slice(0, 20);
  delete g.temp;
  delete g.last_seen;
  write(state);
  return g;
}

/**
 * 清掉閒置太久、而且還沒建帳號的訪客。
 *
 * 資料庫檔案一起刪：那是試用期間的暫存資料，本來就說好不留的。
 * （手動刪除正式帳號時則會保留檔案——那是另一回事，見 deleteGuest。）
 */
export function sweepTempGuests() {
  const state = read();
  const cutoff = Date.now() - TEMP_TTL_MIN * 60_000;
  const dead = state.guests.filter(g => g.temp && (g.last_seen || 0) < cutoff);
  if (!dead.length) return [];

  state.guests = state.guests.filter(g => !dead.includes(g));
  write(state);

  for (const g of dead) {
    for (const suffix of ['', '-shm', '-wal']) {
      try { rmSync(join(DATA_DIR, `fit-${g.id}.db${suffix}`), { force: true }); } catch { /* 清不掉就算了 */ }
    }
  }
  return dead.map(g => g.id);
}

/**
 * 刪掉一個訪客。
 * 資料庫檔案刻意留著不刪——萬一按錯，紀錄還在。id 不會重複使用
 *（nextId 只會往上加），所以留著也不會被下一個訪客撿到。
 */
export function deleteGuest(id) {
  const state = read();
  const before = state.guests.length;
  state.guests = state.guests.filter(g => g.id !== id);
  if (state.guests.length === before) return false;
  write(state);
  return true;
}
