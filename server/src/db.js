import {workoutEnergy} from './workout-energy.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { USERS, getUser } from './users.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// FIT_DATA_DIR 可指到別的目錄，測試時用拋棄式資料，才不會動到正式紀錄
export const DATA_DIR = process.env.FIT_DATA_DIR || join(__dirname, '..', 'data');
export const UPLOAD_DIR = join(DATA_DIR, 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

export const dbPath = (userId) => join(DATA_DIR, `fit-${userId}.db`);

/* ---------------- Schema ---------------- */

function createSchema(db) {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  db.exec(`
CREATE TABLE IF NOT EXISTS profile (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  name          TEXT    NOT NULL DEFAULT '我',
  sex           TEXT    NOT NULL DEFAULT 'female',
  age           INTEGER NOT NULL,
  height_cm     REAL    NOT NULL,
  weight_kg     REAL    NOT NULL,
  goal_weight_kg REAL   NOT NULL,
  activity      REAL    NOT NULL DEFAULT 1.55,
  goal          TEXT    NOT NULL DEFAULT 'muscle_gain',
  target_kcal      INTEGER NOT NULL,
  target_protein_g INTEGER NOT NULL,
  target_carb_g    INTEGER NOT NULL,
  target_fat_g     INTEGER NOT NULL,
  notes         TEXT    NOT NULL DEFAULT '',
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS meals (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL,
  meal_type  TEXT NOT NULL DEFAULT 'snack',
  name       TEXT NOT NULL,
  portion    TEXT NOT NULL DEFAULT '',
  kcal       REAL NOT NULL DEFAULT 0,
  protein_g  REAL NOT NULL DEFAULT 0,
  carb_g     REAL NOT NULL DEFAULT 0,
  fat_g      REAL NOT NULL DEFAULT 0,
  source     TEXT NOT NULL DEFAULT 'manual',
  note       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);

CREATE TABLE IF NOT EXISTS workouts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  date         TEXT NOT NULL,
  exercise     TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'other',
  sets         INTEGER NOT NULL DEFAULT 0,
  reps         INTEGER NOT NULL DEFAULT 0,
  weight_kg    REAL NOT NULL DEFAULT 0,
  duration_min REAL NOT NULL DEFAULT 0,
  rpe          REAL NOT NULL DEFAULT 0,
  source       TEXT NOT NULL DEFAULT 'manual',
  note         TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date);
CREATE TABLE IF NOT EXISTS workout_save_requests (
  request_id TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL,
  workout_id INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS weights (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  date         TEXT NOT NULL UNIQUE,
  weight_kg    REAL NOT NULL,
  body_fat_pct REAL,
  note         TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS photos (
  id         TEXT PRIMARY KEY,
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  data       BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS coach_plans (
  fingerprint TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS coach_deliveries (
  kind TEXT NOT NULL,
  delivery_key TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  PRIMARY KEY (kind, delivery_key)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS pet (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  species    TEXT NOT NULL,
  name       TEXT NOT NULL DEFAULT '',
  coins      INTEGER NOT NULL DEFAULT 0,
  equipped   TEXT NOT NULL DEFAULT '{}',     -- JSON：{ bg, hat, toy }
  settled_to TEXT NOT NULL DEFAULT '',       -- 代幣結算到哪一天，避免重複發
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 每天熱量達標的 +8 只發一次，用日期當主鍵擋重複
CREATE TABLE IF NOT EXISTS pet_companions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  species TEXT NOT NULL,
  name TEXT NOT NULL,
  equipped TEXT NOT NULL DEFAULT '{}',
  purchase_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS pet_selection (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  pet_key TEXT NOT NULL DEFAULT 'main'
);

CREATE TABLE IF NOT EXISTS pet_daily_bonus (
  date       TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 新增獎勵保留憑證，刪除飲食也不能重置每日額度
CREATE TABLE IF NOT EXISTS pet_meal_rewards (
  meal_id INTEGER PRIMARY KEY,
  date TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pet_meal_rewards_date ON pet_meal_rewards(date);

CREATE TABLE IF NOT EXISTS pet_items (
  item_id     TEXT PRIMARY KEY,
  acquired_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
-- 一週晚餐規劃（搬自「好好煮 Chef」）。
-- 整份設定跟菜單是一個 JSON：欄位會跟著功能變，而這裡不需要查詢單一欄位，
-- 拆成關聯式的表只是增加 migration 的麻煩。
CREATE TABLE IF NOT EXISTS meal_plan (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  settings   TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS pet_room_decor (
  scene TEXT NOT NULL,
  item_id TEXT NOT NULL REFERENCES pet_items(item_id),
  x REAL NOT NULL DEFAULT 70,
  y REAL NOT NULL DEFAULT 85,
  scale REAL NOT NULL DEFAULT 1,
  PRIMARY KEY (scene, item_id)
);
CREATE TABLE IF NOT EXISTS pet_room_positions (
  scene TEXT NOT NULL,
  pet_key TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  PRIMARY KEY (scene,pet_key)
);

-- 換寵物會把上一隻連同代幣與買過的東西全部清掉。開發期間這件事發生過四次，
-- 每次都只能靠手動改資料庫救回來，而且當天的備份不見得涵蓋得到。
-- 換掉之前先把舊的那隻整隻存進這裡，就不會再有「無法復原」這回事。
CREATE TABLE IF NOT EXISTS pet_care_play_slots (
  pet_key TEXT NOT NULL,
  date TEXT NOT NULL,
  slot TEXT NOT NULL,
  amount INTEGER NOT NULL,
  PRIMARY KEY(pet_key,date,slot)
);
CREATE TABLE IF NOT EXISTS pet_care_interactions (
  pet_key TEXT NOT NULL,date TEXT NOT NULL,count INTEGER NOT NULL DEFAULT 0,last_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(pet_key,date)
);
CREATE TABLE IF NOT EXISTS pet_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  species     TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  coins       INTEGER NOT NULL DEFAULT 0,
  equipped    TEXT NOT NULL DEFAULT '{}',
  settled_to  TEXT NOT NULL DEFAULT '',
  items       TEXT NOT NULL DEFAULT '[]',   -- JSON 陣列：買過的東西
  created_at  TEXT NOT NULL DEFAULT '',     -- 這隻當初是什麼時候領養的
  replaced_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  actions    TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS chat_requests (
  request_id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'running',
  phase TEXT NOT NULL DEFAULT '準備訊息',
  actions TEXT NOT NULL DEFAULT '[]',
  result TEXT,
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS coach_push_deliveries (
  kind TEXT NOT NULL,
  delivery_key TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  last_attempt INTEGER NOT NULL,
  PRIMARY KEY(kind,delivery_key,endpoint)
);
CREATE TABLE IF NOT EXISTS pet_reward_ledger (
  reward_key TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  reason TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`);

  // 舊資料庫補欄位（CREATE TABLE IF NOT EXISTS 不會幫已存在的表加欄位）
  const addColumn = (table, column, definition) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (cols.some(c => c.name === column)) return;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  };
  addColumn('meals', 'photo', "TEXT NOT NULL DEFAULT ''");
  addColumn('chat_messages', 'image', "TEXT NOT NULL DEFAULT ''");
  addColumn('chat_messages', 'model', "TEXT NOT NULL DEFAULT ''");   // 這則回覆實際是哪個模型答的
  // 體態：體重與體脂原本就有，再補一個腰圍。
  // 腰圍是脂肪的代理指標：體重在漲而腰圍沒漲，就是增肌而不是增脂。
  // 可為空，只想記體重的人不被迫填。
  addColumn('weights', 'waist_cm', 'REAL');
  addColumn('profile','body_fat_pct','REAL');
  addColumn('profile','goal_body_fat_pct','REAL');
  addColumn('workouts', 'set_details', "TEXT NOT NULL DEFAULT '[]'");
  addColumn('workouts', 'calories_kcal', 'REAL');
  addColumn('workouts', 'calorie_meta', "TEXT NOT NULL DEFAULT '{}'");

  // 餐點縮圖（JPEG）。清單裡的小圖本來直接載原始照片，平均 300KB；
  // 縮成約 15KB 後第一次要求時算一次，之後存這裡重複使用。
  addColumn('photos', 'thumb', 'BLOB');
  addColumn('pet_room_decor', 'locked', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('pet_room_decor', 'layer', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('pet_room_decor', 'rotation', 'REAL NOT NULL DEFAULT 0');
}

/* ---------------- 營養目標 ---------------- */

/** Mifflin-St Jeor + 活動係數 + 增肌熱量盈餘 */
export function calcTargets({ sex, age, height_cm, weight_kg, goal_weight_kg, activity, goal }) {
  const s = sex === 'male' ? 5 : -161;
  const bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + s;
  const tdee = bmr * activity;
  const surplus = goal === 'muscle_gain' ? 350 : goal === 'fat_loss' ? -350 : 0;
  const kcal = Math.round((tdee + surplus) / 10) * 10;

  // 體重過輕時以目標體重計算蛋白質，避免蛋白質目標被低體重拖低
  const proteinBase = Math.max(weight_kg, goal_weight_kg || weight_kg);
  const protein = Math.round(proteinBase * 2.0);
  const fat = Math.round((kcal * 0.25) / 9);
  const carb = Math.round((kcal - protein * 4 - fat * 9) / 4);

  return { bmr: Math.round(bmr), tdee: Math.round(tdee),
           target_kcal: kcal, target_protein_g: protein, target_carb_g: carb, target_fat_g: fat };
}

function seedProfile(db, user) {
  if (db.prepare('SELECT COUNT(*) AS n FROM profile').get().n > 0) return;
  const s = user.seed;
  const t = calcTargets(s);
  db.prepare(`
    INSERT INTO profile (id, name, sex, age, height_cm, weight_kg, goal_weight_kg, activity, goal,
                         target_kcal, target_protein_g, target_carb_g, target_fat_g, notes)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(user.name, s.sex, s.age, s.height_cm, s.weight_kg, s.goal_weight_kg, s.activity, s.goal,
         t.target_kcal, t.target_protein_g, t.target_carb_g, t.target_fat_g, s.notes);
}

/* ---------------- 連線管理 ---------------- */

const connections = new Map();

/** 關掉某位使用者的連線並刪掉資料庫檔（刪除帳號用，無法復原） */
export function destroyDb(userId) {
  const db = connections.get(userId);
  if (db) { try { db.close(); } catch { /* 已經關了 */ } connections.delete(userId); }
  for (const suffix of ['', '-shm', '-wal']) {
    try { rmSync(`${dbPath(userId)}${suffix}`, { force: true }); } catch { /* 清不掉就算了 */ }
  }
}

/** 取得某位使用者的資料庫連線（第一次呼叫時建立檔案與 schema） */
export function getDb(userId) {
  if (connections.has(userId)) return connections.get(userId);
  const user = getUser(userId);
  if (!user) throw Object.assign(new Error(`未知的使用者 ${userId}`), { status: 400 });

  const db = new DatabaseSync(dbPath(userId));
  createSchema(db);
  seedProfile(db, user);
  const profileWeight=db.prepare('SELECT weight_kg FROM profile WHERE id=1').get().weight_kg;
  for(const row of db.prepare('SELECT * FROM workouts WHERE calories_kcal IS NULL').all()) {
    try {
      const energy=workoutEnergy({...row,set_details:JSON.parse(row.set_details || '[]'),calories_kcal:undefined},profileWeight);
      if(energy.calories_kcal!==null) db.prepare('UPDATE workouts SET calories_kcal=?,calorie_meta=? WHERE id=? AND calories_kcal IS NULL').run(energy.calories_kcal,JSON.stringify(energy.calorie_meta),row.id);
    } catch { /* Invalid legacy values stay unestimated; keep the original record. */ }
  }
  migratePhotosFromDisk(db);
  connections.set(userId, db);
  return db;
}

/**
 * 單人版時代的照片存在 data/uploads/ 下，DB 只記檔名。
 * 只有 Martina 的資料庫需要接收這些舊照片（那時只有她在用）。
 */
function migratePhotosFromDisk(db) {
  if (process.env.FIT_DATA_DIR) return;   // 測試用的資料目錄不做搬移
  let files;
  try { files = readdirSync(UPLOAD_DIR); } catch { return; }
  if (!files.length) return;

  const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' };
  const used = db.prepare("SELECT photo FROM meals WHERE photo != '' UNION SELECT image FROM chat_messages WHERE image != ''").all()
    .map(r => r.photo ?? r.image);
  if (!used.length) return;   // 這個資料庫沒有指向任何舊照片就不要撿

  const exists = db.prepare('SELECT 1 FROM photos WHERE id = ?');
  const insert = db.prepare('INSERT INTO photos (id, mime, size, data) VALUES (?, ?, ?, ?)');
  let moved = 0;
  for (const file of files) {
    if (!used.includes(file) || exists.get(file)) continue;
    const mime = MIME[file.split('.').pop()?.toLowerCase()];
    if (!mime) continue;
    try {
      const buf = readFileSync(join(UPLOAD_DIR, file));
      insert.run(file, mime, buf.length, buf);
      moved++;
    } catch { /* 讀不到就跳過 */ }
  }
  if (moved) console.log(`[db] 已將 ${moved} 張照片從檔案搬進資料庫`);
}

/* ---------------- 對外的小工具 ---------------- */

export function getProfile(userId) {
  const db = getDb(userId);
  const p = db.prepare('SELECT * FROM profile WHERE id = 1').get();
  const auto = calcTargets(p);
  return { ...p, bmr: auto.bmr, tdee: auto.tdee, user: userId };
}

export const GOAL_LABEL = { muscle_gain: '增肌', maintain: '維持', fat_loss: '減脂' };

const TARGET_KEYS = ['target_kcal', 'target_protein_g', 'target_carb_g', 'target_fat_g'];

/**
 * 更新個人檔案。身體數據或目標一變就依公式重算四個營養目標；
 * 若這次有明確指定某個目標值（例如「蛋白質改成 120g」），那一項以指定值為準。
 * @returns {{ before: object, after: object }}
 */
export function updateProfile(userId, patch = {}, { recalc = true } = {}) {
  const db = getDb(userId);
  const before = getProfile(userId);

  const clean = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === '') continue;
    clean[k] = v;
  }
  if (clean.goal && !GOAL_LABEL[clean.goal]) {
    throw Object.assign(new Error(`不支援的目標：${clean.goal}`), { status: 400 });
  }

  const p = { ...before, ...clean };
  const targets = recalc ? calcTargets(p) : {};
  for (const k of TARGET_KEYS) {
    if (clean[k] !== undefined) targets[k] = Math.round(Number(clean[k]));   // 明確指定的優先
    else if (!recalc) targets[k] = p[k];
  }

  db.prepare(`
    UPDATE profile SET name=?, sex=?, age=?, height_cm=?, weight_kg=?, goal_weight_kg=?,
           activity=?, goal=?, target_kcal=?, target_protein_g=?, target_carb_g=?,
           target_fat_g=?, notes=?, updated_at=datetime('now','localtime')
    WHERE id=1
  `).run(String(p.name), String(p.sex), Number(p.age), Number(p.height_cm), Number(p.weight_kg),
         Number(p.goal_weight_kg), Number(p.activity), String(p.goal),
         targets.target_kcal, targets.target_protein_g, targets.target_carb_g, targets.target_fat_g,
         String(p.notes ?? ''));

  return { before, after: getProfile(userId) };
}

export const getPhoto = (userId, id) =>
  getDb(userId).prepare('SELECT mime, size, data FROM photos WHERE id = ?').get(id);

export const savePhoto = (userId, id, mime, buf) =>
  getDb(userId).prepare('INSERT INTO photos (id, mime, size, data) VALUES (?, ?, ?, ?)')
    .run(id, mime, buf.length, buf);

export const orphanPhotos = (userId) => getDb(userId).prepare(`
  SELECT id, size, created_at FROM photos
  WHERE id NOT IN (SELECT photo FROM meals WHERE photo != '')
    AND id NOT IN (SELECT image FROM chat_messages WHERE image != '')
`).all();

/** 開機時先把所有人的資料庫建好，才不會第一次登入才卡住 */
export function initAllDatabases() {
  for (const u of USERS) {
    const fresh = !existsSync(dbPath(u.id));
    getDb(u.id);
    if (fresh) console.log(`[db] 已建立 ${u.name} 的資料庫：${dbPath(u.id)}`);
  }
}
