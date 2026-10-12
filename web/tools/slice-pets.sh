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
CONCEPT="$PET/可愛寵物生活遊戲概念圖.png"
OUT=web/public/pets

for f in "$CARDS" "$CONCEPT"; do
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

# ---- 3) 場景：概念圖上排的五個環境 ----
echo "場景："
SCENES=(room garden beach space gym)
for i in 0 1 2 3 4; do
  id=${SCENES[$i]}
  convert "$CONCEPT" -crop "300x300+$(( i * 307 + 4 ))+14" +repage -resize 420x420 "$OUT/scene-$id.png"
  webp_flat "$OUT/scene-$id.png" "$OUT/scene-$id.webp"
  say "scene-$id" "$OUT/scene-$id.webp"
done

# ---- 4) 動作：概念圖的「寵物動作」區塊，去背後疊在場景上 ----
# 用「從四角洪水填充」而不是整體色鍵：只拿掉與邊界相連的米白底，
# 貓肚子那塊同樣接近白色的區域不會被誤刪。
cutout() {
  # 先鑲一圈底色邊框，讓四邊的背景連成一片，從 0,0 填一次就夠。
  # 這台是 ImageMagick 6，透明度的繪圖原語叫 matte（IM7 才是 alpha）。
  convert "$1" -alpha set -bordercolor "#FDF6E4" -border 1 \
    -fuzz 14% -fill none -draw 'matte 0,0 floodfill' \
    -shave 1x1 \
    -channel alpha -morphology Erode Octagon:1 +channel "$1"
  # 洪水填充會在邊緣留一圈半透明的米白，看起來像白邊。
  # 把 alpha 往內縮一個像素就乾淨了。
}

cut_act() {   # cut_act <名稱> <x> <y> <w> <h>
  convert "$CONCEPT" -crop "${4}x${5}+${2}+${3}" +repage -trim +repage \
          -resize 320x240 "$OUT/act-$1.png"
  cutout "$OUT/act-$1.png"
  webp_alpha "$OUT/act-$1.png" "$OUT/act-$1.webp"
  say "act-$1" "$OUT/act-$1.webp"
}

echo "動作（貓）："
R1=(walk eat sleep play stretch)      # 第一排五格，寬 124，x 從 492 起
for i in 0 1 2 3 4; do
  cut_act "${R1[$i]}" $(( 492 + i * 124 )) 796 124 74
done
# 第二排六格寬 103，只取需要的：舔毛(0)、發呆(1)、開心(5)
cut_act groom $(( 492 + 0 * 103 )) 886 103 78
cut_act idle  $(( 492 + 1 * 103 )) 886 103 78
cut_act happy $(( 492 + 5 * 103 )) 886 103 78

echo ""
echo "完成：$OUT（$(ls "$OUT" | wc -l) 個檔案，$(du -sh "$OUT" | cut -f1)）"
