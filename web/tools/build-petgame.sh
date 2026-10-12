#!/usr/bin/env bash
# 把 game/pet 匯出成網頁版，輸出到 web/public/petgame/。
#
# 匯出的結果（.wasm 約 40 MB）刻意不進版控：那是建置產物，而且會
# 把這個教學用的 repo 撐大一個量級。沒有匯出也不會壞——前端抓不到
# /petgame/index.js 時會留在原本的靜態寵物圖。
#
# 第一次執行需要 Godot 與匯出範本，照 TOOLING.md 的說明放到 .tools/godot/。
set -e
cd "$(dirname "$0")/../.."

GODOT=.tools/godot/godot
OUT=web/public/petgame

[ -x "$GODOT" ] || { echo "❌ 找不到 $GODOT，先看 TOOLING.md 的「Godot」一節"; exit 1; }

mkdir -p "$OUT"
# --headless 不開視窗；匯出前要先讓編輯器掃一次專案，不然資源還沒匯入
"$GODOT" --headless --path game/pet --import
"$GODOT" --headless --path game/pet --export-release "Web" "../../$OUT/index.html"

# 預壓縮：index.wasm 有 38 MB，不壓的話開一次寵物頁就是 38 MB 的流量。
# @fastify/static 開了 preCompressed，瀏覽器送 Accept-Encoding 時會直接拿
# 這兩份，不必每次即時壓。brotli 大約 9 MB，gzip 大約 13 MB。
echo ""
echo "預壓縮…"
for f in "$OUT"/index.wasm "$OUT"/index.js "$OUT"/index.pck; do
  [ -f "$f" ] || continue
  gzip -9 -kf "$f"
  command -v brotli > /dev/null && brotli -f -q 11 "$f"
done

echo ""
echo "完成：$OUT"
du -h "$OUT"/* | sort -h
