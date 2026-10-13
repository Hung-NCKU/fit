#!/usr/bin/env bash
# 把 pet/穿搭/ 的衣櫃圖切成個別的穿戴商品，輸出 web/public/pets/wear/<物種>-<編號>.webp。
#
# 這批素材是「每隻動物一套自己的衣櫃」：配色跟著該物種走（天竺鼠是草綠米白、
# 小狗是天藍、貓是橘白），所以商城也跟著改成「只賣目前這隻的衣服」，
# 不再是一份兩百多件、每隻都一樣的清單。
#
# 一個資料夾裡有二十張，一半是衣櫃圖、一半是穿搭示範。用尺寸分：
# 直式 1122x1402 是衣櫃，橫式 1448x1086 是示範圖（目前沒用到）。
#
# 衣櫃圖本來就是透明背景，所以不必去背，直接做連通區域分析就好。
# 正中間那一塊是動物本體，不是商品，要排除掉。
#
# 需要 imagemagick 與 webp。
set -e
cd "$(dirname "$0")/../.."

SRC="pet/穿搭"
OUT=web/public/pets/wear

[ -d "$SRC" ] || { echo "❌ 找不到 $SRC"; exit 1; }
command -v convert > /dev/null || { echo "❌ 需要 imagemagick"; exit 1; }
command -v cwebp   > /dev/null || { echo "❌ 需要 webp"; exit 1; }
mkdir -p "$OUT"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 衣櫃圖的編號 1~10，順序跟動作圖鑑的面板一樣
IDS=(guinea tortoise dog ferret cat parrot chinchilla hamster rabbit hedgehog)

for n in $(seq 1 10); do
  # 直式的那一張才是衣櫃圖
  src=$(for f in "$SRC"/*-"$n".png; do
          [ "$(identify -format '%wx%h' "$f")" = "1122x1402" ] && echo "$f"
        done | head -1)
  [ -z "$src" ] && { echo "  ⚠️  找不到第 $n 張衣櫃圖"; continue; }

  id=${IDS[$(( n - 1 ))]}

  # area-threshold 濾掉描邊的碎屑；帽子上的小花之類的細節不會獨立成塊，
  # 因為它們跟本體是連在一起畫的。
  # 偵測前先侵蝕：小狗那張的帽 T 跟雨衣是靠在一起畫的，不先把接點咬斷
  # 會被當成同一件，切出來是兩件衣服擠在一格。侵蝕只用來分家，
  # 裁切時再把框放回侵蝕掉的那一圈。
  ERODE=4
  boxes=$(convert "$src" -alpha extract -threshold 30% \
            -morphology Erode Disk:$ERODE \
            -define connected-components:verbose=true \
            -define connected-components:area-threshold=8000 \
            -connected-components 8 null: 2>&1 \
          | grep 'gray(255)' | awk '{print $2}')

  # 排除動物本體：牠在正中央。用「框有沒有蓋到圖片中心」判斷，
  # 比用面積可靠——有些物種的雨衣畫得比動物還大。
  # 其餘的先依列（y 中心除以容差）再依 x 排序，編號才會是由上而下、由左而右。
  sorted=$(echo "$boxes" | awk -F'[x+]' -v cx=561 -v cy=701 '{
      w=$1; h=$2; x=$3; y=$4;
      if (x <= cx && cx <= x + w && y <= cy && cy <= y + h) next;   # 動物本體
      row = int((y + h / 2) / 260);
      printf "%d %d %dx%d+%d+%d\n", row, x, w, h, x, y;
    }' | sort -k1,1n -k2,2n | awk '{print $3}')

  i=0
  while read -r box; do
    [ -z "$box" ] && continue
    i=$(( i + 1 ))
    bw=${box%%x*}; rest=${box#*x}; bh=${rest%%+*}
    bx=$(echo "$box" | cut -d+ -f2); by=$(echo "$box" | cut -d+ -f3)
    m=$(( ERODE + 2 ))
    nx=$(( bx - m )); ny=$(( by - m ))
    [ $nx -lt 0 ] && nx=0
    [ $ny -lt 0 ] && ny=0
    box="$(( bw + m * 2 ))x$(( bh + m * 2 ))+${nx}+${ny}"

    convert "$src" -crop "$box" +repage -trim +repage "$TMP/one.png"

    # 注：小狗那張的帽 T 跟雨衣是疊在一起畫的，侵蝕咬不斷，
    # 而「寬高比」也分不出來：那块是 1.71，而鸚鵡的圓巾是 1.95。
    # 所以不自動切，那一格当成「兩件組」賣，跟畫面上看到的一致。

    convert "$TMP/one.png" -resize 200x200 "$OUT/$id-$i.png"
    cwebp -quiet -q 86 -exact "$OUT/$id-$i.png" -o "$OUT/$id-$i.webp"
    rm -f "$OUT/$id-$i.png"
  done <<< "$sorted"

  printf "  %-11s %2d 件\n" "$id" "$i"
done

echo ""
echo "完成：$OUT（$(ls "$OUT"/*.webp | wc -l) 件，$(du -sh "$OUT" | cut -f1)）"
