/**
 * 臨時訪客帳號。
 *
 * 固定使用者（Martina、Eli、訪客）寫在 users.js、密碼放 server/.env，
 * 要新增得改程式再重啟。想讓人臨時試用就太麻煩了，所以訪客改成執行時建立：
 * 主頁按一下就多一個帳號，密碼當場產生、只顯示一次。
 *
 * 存在 server/data/guests.json——跟資料庫放在一起，本來就不進版控。
 * 密碼是明碼，跟 .env 裡那幾組一樣；這個專案從頭到尾就是這個威脅模型
 *（一台自己的機器、只有認識的人連得到），不在這裡假裝更嚴格。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 不從 db.js 讀 DATA_DIR：db.js 會 import users.js、users.js 會 import 這裡，
// 繞回去就變成循環相依。這一行跟 db.js 的算法刻意保持一致。
const DATA_DIR = process.env.FIT_DATA_DIR || join(__dirname, '..', 'data');
const FILE = join(DATA_DIR, 'guests.json');

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
