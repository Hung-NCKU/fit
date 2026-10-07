#!/usr/bin/env bash
# 備份所有使用者的資料庫（含照片）。
# 用 SQLite 的 VACUUM INTO，會把 WAL 裡的內容一併寫進去，產出單一完整檔案，
# 後端執行中也可以安全備份 —— 直接 cp fit-*.db 會漏掉 WAL 裡還沒寫回主檔的資料。
set -e
cd "$(dirname "$0")"
export PATH="$PWD/.tools/node/bin:$PATH"

DIR="${1:-backups/$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$DIR"

node -e '
const { DatabaseSync } = require("node:sqlite");
const { readdirSync } = require("node:fs");
const { join } = require("node:path");
const outDir = process.argv[1];

const files = readdirSync("server/data").filter(f => /^fit-.*\.db$/.test(f));
if (!files.length) { console.error("找不到任何資料庫"); process.exit(1); }

for (const f of files) {
  const out = join(outDir, f);
  new DatabaseSync(join("server/data", f)).prepare("VACUUM INTO ?").run(out);
  const b = new DatabaseSync(out);
  const n = (t) => b.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  const mb = (b.prepare("SELECT COALESCE(SUM(size),0) s FROM photos").get().s / 1024 / 1024).toFixed(1);
  console.log(`${f}`);
  console.log(`  飲食 ${n("meals")} 筆 / 訓練 ${n("workouts")} 筆 / 體重 ${n("weights")} 筆`);
  console.log(`  對話 ${n("chat_messages")} 則 / 照片 ${n("photos")} 張 (${mb}MB)`);
}
console.log(`\n備份完成：${outDir}`);
' "$DIR"

echo ""
echo "要還原就把檔案複製回 server/data/（先停掉後端，"
echo "並一併刪除同名的 -wal 與 -shm 檔）。"
