// 資料庫查詢工具。WSL 裡沒有 sqlite3 指令，用 Node 內建的 node:sqlite 代勞。
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

// 第一個參數若是使用者名稱就切換資料庫：./db.sh eli meals
const KNOWN = ['eli', 'martina'];  // martina 已停用，資料庫保留，仍可 ./db.sh martina ... 查舊紀錄
const argv = process.argv.slice(2);
const USER = KNOWN.includes((argv[0] || '').toLowerCase()) ? argv.shift().toLowerCase() : KNOWN[0];
const DB = join(DATA, `fit-${USER}.db`);

// 不能用 readOnly：資料庫是 WAL 模式，唯讀連線在沒有其他行程持有 -shm 時
// 讀不到 WAL 裡還沒 checkpoint 的資料，會回報過時的內容。
// 改用一般連線讓 SQLite 正常讀 WAL，「不會改到資料」由下面只允許 SELECT 來保證。
const db = new DatabaseSync(DB);

/* ---------- 輸出成對齊的表格 ---------- */

const width = (s) => [...String(s)].reduce((w, c) => w + (/[一-鿿　-〿＀-￯]/.test(c) ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - width(s)));

function table(rows, { max = 60 } = {}) {
  if (!rows.length) return console.log('  （沒有資料）');
  const cols = Object.keys(rows[0]);
  // 中文字佔 2 欄，所以要按「顯示寬度」截斷，不是按字數
  const cell = (v) => {
    if (v === null || v === undefined) return '—';
    const s = String(v).replace(/\s+/g, ' ');
    if (width(s) <= max) return s;
    let out = '', w = 0;
    for (const ch of s) {
      const cw = width(ch);
      if (w + cw > max - 1) break;
      out += ch; w += cw;
    }
    return out + '…';
  };
  const w = cols.map(c => Math.max(width(c), ...rows.map(r => width(cell(r[c])))));
  console.log('  ' + cols.map((c, i) => pad(c, w[i])).join('  '));
  console.log('  ' + w.map(n => '─'.repeat(n)).join('  '));
  for (const r of rows) console.log('  ' + cols.map((c, i) => pad(cell(r[c]), w[i])).join('  '));
  console.log(`  (${rows.length} 筆)`);
}

/* ---------- 預設檢視 ---------- */

const VIEWS = {
  meals: {
    title: '飲食紀錄',
    sql: `SELECT date 日期, meal_type 餐別, name 食物, portion 份量,
                 ROUND(kcal) 熱量, ROUND(protein_g) 蛋白質, ROUND(carb_g) 碳水, ROUND(fat_g) 脂肪,
                 source 來源, CASE WHEN photo != '' THEN '有' ELSE '' END 照片
          FROM meals ORDER BY date DESC, id DESC LIMIT 50`,
  },
  workouts: {
    title: '訓練紀錄',
    sql: `SELECT date 日期, exercise 動作, category 部位, sets 組, reps 次,
                 weight_kg 重量, duration_min 分鐘, rpe RPE, source 來源
          FROM workouts ORDER BY date DESC, id DESC LIMIT 50`,
  },
  weights: {
    title: '體重紀錄',
    sql: 'SELECT date 日期, weight_kg 體重, body_fat_pct 體脂, note 備註 FROM weights ORDER BY date DESC LIMIT 50',
  },
  chat: {
    title: '對話紀錄',
    sql: `SELECT id, created_at 時間, role 角色, content 內容,
                 CASE WHEN image != '' THEN '有' ELSE '' END 照片
          FROM chat_messages ORDER BY id DESC LIMIT 30`,
    max: 70,
  },
  profile: { title: '個人檔案', sql: 'SELECT * FROM profile' },
  photos: {
    title: '照片（存在資料庫裡，不含 BLOB 本體）',
    sql: `SELECT p.id, p.mime 格式, ROUND(p.size/1024.0) 大小KB, p.created_at 上傳時間,
                 (SELECT COUNT(*) FROM meals  WHERE photo = p.id) 關聯飲食,
                 (SELECT COUNT(*) FROM chat_messages WHERE image = p.id) 關聯對話
          FROM photos p ORDER BY p.created_at DESC LIMIT 50`,
  },
  days: {
    title: '每日彙總',
    sql: `SELECT d.date 日期,
                 ROUND(COALESCE(m.kcal,0)) 熱量, ROUND(COALESCE(m.protein,0)) 蛋白質,
                 COALESCE(w.items,0) 訓練項目, ROUND(COALESCE(w.volume,0)) 訓練量kg,
                 wt.weight_kg 體重
          FROM (SELECT date FROM meals UNION SELECT date FROM workouts UNION SELECT date FROM weights) d
          LEFT JOIN (SELECT date, SUM(kcal) kcal, SUM(protein_g) protein FROM meals GROUP BY date) m ON m.date = d.date
          LEFT JOIN (SELECT date, COUNT(*) items, SUM(sets*reps*weight_kg) volume FROM workouts GROUP BY date) w ON w.date = d.date
          LEFT JOIN weights wt ON wt.date = d.date
          ORDER BY d.date DESC LIMIT 30`,
  },
};

/* ---------- 主程式 ---------- */

const arg = argv.join(' ').trim();

if (!arg || arg === 'all') {
  console.log(`使用者：${USER}\n資料庫：${DB}\n`);
  const counts = ['meals', 'workouts', 'weights', 'chat_messages']
    .map(t => `${t} ${db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c} 筆`);
  const ph = db.prepare('SELECT COUNT(*) c, COALESCE(SUM(size),0) s FROM photos').get();
  counts.push(`photos ${ph.c} 張 (${(ph.s / 1024 / 1024).toFixed(1)}MB)`);
  console.log('總覽：' + counts.join(' | ') + '\n');
  for (const key of ['days', 'meals', 'workouts', 'weights', 'chat']) {
    const v = VIEWS[key];
    console.log(`\n── ${v.title}（${key}）`);
    table(db.prepare(v.sql).all(), { max: v.max });
  }
  console.log(`\n用法：./db.sh [${KNOWN.join('|')}] [meals|workouts|weights|chat|photos|profile|days]`);
  console.log('      ./db.sh eli meals      看 Eli 的飲食');
  console.log('      ./db.sh "SELECT ..."   自訂查詢（唯讀）');
} else if (VIEWS[arg]) {
  console.log(`── ${VIEWS[arg].title}`);
  table(db.prepare(VIEWS[arg].sql).all(), { max: VIEWS[arg].max });
} else if (/^\s*(select|with)\b/i.test(arg) && !/;\s*\S/.test(arg)) {
  // 只接受單一句 SELECT / WITH，擋掉用分號串接 DELETE 之類的寫法
  try {
    table(db.prepare(arg).all(), { max: 80 });
  } catch (e) {
    console.error('SQL 錯誤：', e.message);
    process.exit(1);
  }
} else {
  console.error(`看不懂「${arg}」。可用：${Object.keys(VIEWS).join(' / ')}，或直接寫 SELECT 查詢（唯讀）。`);
  console.error(`要看別人的紀錄：./db.sh <${KNOWN.join('|')}> <檢視>`);
  process.exit(1);
}
