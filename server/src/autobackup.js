/**
 * 每天自動備份所有人的資料庫。
 *
 * 用 SQLite 的 VACUUM INTO 而不是複製檔案：WAL 模式下直接 cp 會漏掉還沒寫回
 * 主檔的資料，備份看起來正常、實際上少了最近的紀錄。這個教訓是付過代價的。
 *
 * 備份放在資料目錄底下（Docker 裡就是 /data/backups），所以跟著 volume 走，
 * 容器重建不會掉。
 */
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, getDb } from './db.js';
import { USERS } from './users.js';

export const backupDir  = () => process.env.BACKUP_DIR || join(DATA_DIR, 'backups');
export const backupHour = () => {
  const h = Number(process.env.BACKUP_HOUR ?? 3);
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 3;
};
export const backupKeep = () => {
  const n = Number(process.env.BACKUP_KEEP ?? 7);
  return Number.isInteger(n) && n > 0 ? n : 7;
};
export const backupEnabled = () => process.env.BACKUP_ENABLED !== 'false';

const stamp = (d = new Date()) =>
  d.toLocaleString('sv-SE').replace(/[-: ]/g, '').replace(/^(\d{8})/, '$1-').slice(0, 15);

/** 只留最近 N 份，其餘刪掉 */
function prune() {
  const root = backupDir();
  let dirs;
  try {
    dirs = readdirSync(root)
      .filter(n => /^\d{8}-\d{6}$/.test(n))
      .filter(n => { try { return statSync(join(root, n)).isDirectory(); } catch { return false; } })
      .sort()
      .reverse();
  } catch { return []; }

  const drop = dirs.slice(backupKeep());
  for (const d of drop) {
    try { rmSync(join(root, d), { recursive: true, force: true }); } catch { /* 下次再試 */ }
  }
  return drop;
}

/** 跑一次備份。回傳這次產出的目錄與各檔案大小。 */
export function runBackup() {
  const dir = join(backupDir(), stamp());
  mkdirSync(dir, { recursive: true });

  const files = [];
  for (const u of USERS) {
    const out = join(dir, `fit-${u.id}.db`);
    // 用既有連線而不是另開一個：它看得到同一份 WAL，也少一個檔案控制代碼
    getDb(u.id).prepare('VACUUM INTO ?').run(out);
    let size = 0;
    try { size = statSync(out).size; } catch { /* 理論上不會 */ }
    files.push({ user: u.id, path: out, size });
  }

  const pruned = prune();
  return { dir, files, pruned };
}

/** 最近一次備份的資訊，給 /api/health 與 status.sh 用 */
export function lastBackup() {
  const root = backupDir();
  try {
    const dirs = readdirSync(root).filter(n => /^\d{8}-\d{6}$/.test(n)).sort();
    if (!dirs.length) return null;
    const name = dirs[dirs.length - 1];
    const full = join(root, name);
    const files = readdirSync(full).filter(f => f.endsWith('.db'));
    const bytes = files.reduce((a, f) => a + (statSync(join(full, f)).size || 0), 0);
    return { at: name, dir: full, files: files.length, bytes, kept: dirs.length };
  } catch { return null; }
}

/* ---------------- 排程 ---------------- */

let timer = null;

function nextRun(from = new Date()) {
  const t = new Date(from);
  t.setHours(backupHour(), 0, 0, 0);
  if (t <= from) t.setDate(t.getDate() + 1);
  return t;
}

function schedule() {
  clearTimeout(timer);
  const next = nextRun();
  timer = setTimeout(() => {
    try {
      const r = runBackup();
      const mb = (r.files.reduce((a, f) => a + f.size, 0) / 1024 / 1024).toFixed(1);
      console.log(`[backup] 已備份 ${r.files.length} 個資料庫（${mb}MB）→ ${r.dir}`
        + (r.pruned.length ? `，清掉 ${r.pruned.length} 份舊的` : ''));
    } catch (err) {
      console.warn(`[backup] 失敗：${err.message}`);
    }
    schedule();   // 每次跑完重算下一次，筆電睡醒或時間跳動都能自我修正
  }, next - Date.now());
  timer.unref?.();
  console.log(`[backup] 下一次自動備份：${next.toLocaleString('zh-TW', { hour12: false })}`);
}

export function startAutoBackup() {
  if (!backupEnabled()) {
    console.warn('[backup] BACKUP_ENABLED=false，自動備份不會啟動');
    return;
  }
  mkdirSync(backupDir(), { recursive: true });

  // 開機時若今天還沒備份過就先補一次：這台機器常常是關機狀態，
  // 等到凌晨三點才備份的話，很多天根本輪不到。
  const last = lastBackup();
  const todayStamp = stamp().slice(0, 8);
  if (!last || last.at.slice(0, 8) !== todayStamp) {
    try {
      const r = runBackup();
      console.log(`[backup] 啟動時補一份（今天還沒備份過）→ ${r.dir}`);
    } catch (err) {
      console.warn(`[backup] 啟動備份失敗：${err.message}`);
    }
  }
  console.log(`[backup] 每天 ${backupHour()}:00 備份，保留最近 ${backupKeep()} 份，位置 ${backupDir()}`);
  schedule();
}
