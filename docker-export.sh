#!/usr/bin/env bash
# 把目前的資料庫匯出到 docker/seed/，建置映像時會一起打包進去。
#
#   ./docker-export.sh              匯出所有人
#   ./docker-export.sh eli          只匯出指定的人
#   ./docker-export.sh --clear      清空 docker/seed/（改成乾淨的空白映像）
#
# 用 VACUUM INTO 而不是 cp：WAL 模式下直接複製 .db 會漏掉還沒寫回主檔的資料，
# 產出的種子看起來正常，實際上少了最近的紀錄。
set -e
cd "$(dirname "$0")"
export PATH="$PWD/.tools/node/bin:$PATH"

SEED="docker/seed"
mkdir -p "$SEED"

if [ "$1" = "--clear" ]; then
  rm -f "$SEED"/*.db
  echo "已清空 $SEED/，之後建置出來的映像不含任何資料（第一次啟動會自動建立空白資料庫）。"
  exit 0
fi

rm -f "$SEED"/*.db

node -e '
const { DatabaseSync } = require("node:sqlite");
const { readdirSync } = require("node:fs");
const { join } = require("node:path");
const [, outDir, only] = process.argv;   // argv[0] 是 node 本身

let files = readdirSync("server/data").filter(f => /^fit-.*\.db$/.test(f));
if (only) files = files.filter(f => f === `fit-${only}.db`);
if (!files.length) { console.error(only ? `找不到 fit-${only}.db` : "找不到任何資料庫"); process.exit(1); }

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
' "$SEED" "$1"

echo ""
echo "已匯出到 $SEED/"
du -sh "$SEED" | sed 's/^/  共 /'
echo ""
echo "⚠️  這裡面是真實的健康紀錄。它不會進版控（.gitignore 已排除），"
echo "    但會被打進 Docker 映像 —— 不要把這個映像推到公開的 registry。"
echo ""
echo "接著建置：docker build -t fit ."
