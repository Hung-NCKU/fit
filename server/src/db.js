import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync, existsSync } from 'node:fs';
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

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  actions    TEXT NOT NULL DEFAULT '[]',
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

/** 取得某位使用者的資料庫連線（第一次呼叫時建立檔案與 schema） */
export function getDb(userId) {
  if (connections.has(userId)) return connections.get(userId);
  const user = getUser(userId);
  if (!user) throw Object.assign(new Error(`未知的使用者 ${userId}`), { status: 400 });

  const db = new DatabaseSync(dbPath(userId));
  createSchema(db);
  seedProfile(db, user);
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
