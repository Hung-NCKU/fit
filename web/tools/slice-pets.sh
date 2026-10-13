#!/usr/bin/env bash
# 把 pet/ 底下的素材切成網頁用的 WebP，輸出到 web/public/pets/。
#
#   <id>.webp         角色卡（含底色與名字）—— 選寵物時用
#   <id>-pet.webp     去背的寵物本體      —— 場景裡用，可以疊在任何背景上
#   scene-<id>.webp   五個環境的完整插畫  —— 商城的 bg_* 用
#   act-<name>.webp   貓的八種動作（去背）—— 作息動畫用
#
# 動作圖目前只有貓有（概念圖的「寵物動作」區塊畫的就是同一隻貓）。
# 其他九種沒有動作版本，前端會自動退回該物種的靜態圖。
#
# 需要 imagemagick 與 webp：sudo apt-get install imagemagick webp
set -e
cd "$(dirname "$0")/../.."

PET=pet
CARDS="$PET/十隻萌寵角色卡插畫.png"
OUT=web/public/pets

for f in "$CARDS"; do
  [ -f "$f" ] || { echo "❌ 找不到 $f"; exit 1; }
done
command -v convert > /dev/null || { echo "❌ 需要 imagemagick"; exit 1; }
command -v cwebp   > /dev/null || { echo "❌ 需要 webp"; exit 1; }
mkdir -p "$OUT"

# 有透明度的圖要加 -exact，否則 cwebp 會更動透明區域的顏色而出現雜邊
webp_alpha() { cwebp -quiet -q 80 -exact "$1" -o "$2" && rm -f "$1"; }
webp_flat()  { cwebp -quiet -q 80        "$1" -o "$2" && rm -f "$1"; }
say() { printf "  %-16s %s\n" "$1" "$(du -h "$2" | cut -f1)"; }

# id 與中文檔名的對應。順序要跟角色卡插畫一致（左到右、上到下）。
IDS=(cat dog rabbit hamster guinea hedgehog ferret parrot tortoise chinchilla)
SRCS=(貓 狗 兔 倉鼠 天竺鼠 刺蝟 貂 鸚鵡 烏龜 龍貓)

# ---- 1) 寵物本體：用 pet/ 底下各自的高解析去背檔 ----
echo "寵物本體："
for i in "${!IDS[@]}"; do
  id=${IDS[$i]}; src="$PET/${SRCS[$i]}.png"
  if [ -f "$src" ]; then
    convert "$src" -trim +repage -resize 420x420 "$OUT/$id-pet.png"
    webp_alpha "$OUT/$id-pet.png" "$OUT/$id-pet.webp"
    say "$id-pet" "$OUT/$id-pet.webp"
  else
    echo "  ⚠️  缺 $src，跳過"
  fi
done

# ---- 2) 角色卡：選寵物的清單用，保留原本的底色與名字 ----
echo "角色卡："
CW=$(( 1536 / 5 )); CH=$(( 1024 / 2 ))
i=0
for r in 0 1; do
  for c in 0 1 2 3 4; do
    id=${IDS[$i]}; i=$(( i + 1 ))
    convert "$CARDS" -crop "${CW}x${CH}+$(( c * CW ))+$(( r * CH ))" +repage \
            -resize 300x500 "$OUT/$id.png"
    webp_flat "$OUT/$id.png" "$OUT/$id.webp"
  done
done
echo "  10 張"

# ---- 3) 場景、4) 貓的動作：已經不在這裡產生了 ----
#
# 場景改由 web/tools/build-scenes.sh 用乾淨的素材組出來。原本這裡是從
# 概念圖裁的，而那五張插畫裡本來就各畫了一隻動物，遊戲再放一隻就變成兩隻。
# 留著會更糟：跑一次就把組好的場景蓋回有動物的版本。
#
# 動作圖改由 web/tools/slice-actions.sh 從 十種可愛動物動作精靈圖鑑.png 切，
# 十種動物各五個動作；這裡原本只切得出貓的八張。

echo ""
echo "完成：$OUT（$(ls "$OUT" | wc -l) 個檔案，$(du -sh "$OUT" | cut -f1)）"
