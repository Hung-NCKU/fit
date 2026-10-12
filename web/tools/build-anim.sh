#!/usr/bin/env bash
# 把 pet/切片與動畫/pet_animation_batch2/ 的逐格動畫轉成網頁用的素材。
#
# 這批是十隻動物各一張 4 欄 × 5 列、每格 96×96 的 sprite sheet，
# 五個動作各佔一列：idle / walk / eat / sleep / play，每個動作還附了
# 幀數與 fps。有了這個，十種動物都有真正的逐格動畫，不必再靠
# 「只有貓有八張動作圖、其他九種只能用程序動畫」那套折衷。
#
# 產出：
#   web/public/pets/anim/<id>.webp   sprite sheet（無損）
#   server/src/pet-anim.json         每隻的格子大小、列號、幀數、fps
#
# sheet 一定要用無損壓縮。有損的 WebP 會讓相鄰格子的像素互相滲色，
# 切成 96×96 之後每一格的邊緣都會帶著隔壁格的殘影。
set -e
cd "$(dirname "$0")/../.."

SRC="pet/切片與動畫/pet_animation_batch2"
OUT="web/public/pets/anim"
JSON="server/src/pet-anim.json"

[ -d "$SRC" ] || { echo "❌ 找不到 $SRC"; exit 1; }
command -v cwebp > /dev/null || { echo "❌ 需要 webp"; exit 1; }
mkdir -p "$OUT"

# 素材的資料夾名稱跟我們的物種 id 不完全一樣
id_of() {
  case "$1" in
    budgie)     echo "parrot" ;;
    guinea_pig) echo "guinea" ;;
    *)          echo "$1" ;;
  esac
}

echo "{" > "$JSON.tmp"
first=1

for dir in "$SRC"/*/; do
  name=$(basename "$dir")
  sheet="$dir$name"_spritesheet.png
  meta="$dir/animations.json"
  [ -f "$sheet" ] || continue
  [ -f "$meta" ] || { echo "  ⚠️  $name 沒有 animations.json"; continue; }

  id=$(id_of "$name")
  cwebp -quiet -lossless -exact "$sheet" -o "$OUT/$id.webp"

  fw=$(node -p "require('$PWD/$meta').frame_width")
  fh=$(node -p "require('$PWD/$meta').frame_height")

  # 每格 96×96 裡，動物實際佔多少高度。
  #
  # 動物特性表的 size 說的是「這隻站著時該佔場景高度的幾成」，但畫面上
  # 縮放的是整個格子，而格子四周留了不少空白——貓只佔 50/96。直接照
  # size 縮放會讓每隻都比該有的小，而且小動物縮得更兇（留白比例不一樣）。
  # 把這個比例量出來，繪圖端除掉它，size 的意思才名副其實。
  fill=$(convert "$sheet" -crop "${fw}x${fh}+0+0" +repage -trim info: \
         | awk -v h="$fh" '{split($3,a,"x"); printf "%.3f", a[2]/h}')

  # animations.json 的欄位名稱跟我們要的不一樣，順便轉成扁平一點的格式
  entry=$(node -e '
    const fs = require("fs");
    const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const acts = {};
    for (const [k, v] of Object.entries(m.actions)) {
      acts[k] = { row: v.sprite_sheet_row, frames: v.frames, fps: v.fps };
    }
    process.stdout.write(JSON.stringify({
      w: m.frame_width, h: m.frame_height,
      fill: Number(process.argv[3]),
      sheet: `/pets/anim/${process.argv[2]}.webp`,
      acts,
    }));
  ' "$meta" "$id" "$fill")

  [ $first -eq 1 ] && first=0 || echo "," >> "$JSON.tmp"
  printf '  "%s": %s' "$id" "$entry" >> "$JSON.tmp"
  printf "  %-11s %s  佔格 %s\n" "$id" "$(du -h "$OUT/$id.webp" | cut -f1)" "$fill"
done

echo "" >> "$JSON.tmp"
echo "}" >> "$JSON.tmp"
mv "$JSON.tmp" "$JSON"

echo ""
echo "完成：$OUT（$(ls "$OUT"/*.webp | wc -l) 張，$(du -sh "$OUT" | cut -f1)）"
