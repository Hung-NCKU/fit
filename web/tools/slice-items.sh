#!/usr/bin/env bash
# 把 pet/商品_N.png 切成個別的商品圖，輸出 web/public/pets/item-N-M.webp。
#
# 十張的排版都不一樣（商品_1 是 5+5，商品_10 是 4+3+2），所以不能用固定格線。
# 改用連通區域分析自動找出每個物件的範圍，再依「先上後下、先左後右」編號。
#
# 需要 imagemagick 與 webp。
set -e
cd "$(dirname "$0")/../.."

OUT=web/public/pets
mkdir -p "$OUT"
command -v convert > /dev/null || { echo "❌ 需要 imagemagick"; exit 1; }

for n in $(seq 1 10); do
  SRC="pet/商品_$n.png"
  [ -f "$SRC" ] || { echo "  ⚠️  缺 $SRC"; continue; }

  # 取出每個物件的 bounding box。area-threshold 濾掉陰影碎片與雜點。
  # 第一列是整張圖的背景（gray(0)），用 grep 過濾掉。
  # 偵測前先膨脹：像石子路那種由幾顆不相連的石頭組成的物件，
  # 不先把鄰近碎塊黏起來就會被當成好幾個商品。膨脹只用於找範圍，
  # 實際裁切仍用原圖。
  BOXES=$(convert "$SRC" -alpha extract -threshold 20% \
            -morphology Dilate Disk:4 \
            -define connected-components:verbose=true \
            -define connected-components:area-threshold=3000 \
            -connected-components 8 /dev/null 2>&1 \
          | grep 'gray(255)' | awk '{print $2}')

  # 依「列」再依 x 排序：把 y 相近的歸成同一列（容差 120px），列內再比 x
  SORTED=$(echo "$BOXES" | awk -F'[x+]' '{
      w=$1; h=$2; x=$3; y=$4;
      row = int((y + h/2) / 120);          # 以中心的 y 分列
      printf "%d %d %dx%d+%d+%d\n", row, x, w, h, x, y;
    }' | sort -k1,1n -k2,2n | awk '{print $3}')

  i=0
  while read -r box; do
    [ -z "$box" ] && continue
    i=$(( i + 1 ))
    # 外擴 12px 避免描邊被切到；-trim 之後再統一縮到 160
    convert "$SRC" -crop "$box" +repage -bordercolor none -border 12 \
            -trim +repage -resize 160x160 "$OUT/item-$n-$i.png"
    cwebp -quiet -q 82 -exact "$OUT/item-$n-$i.png" -o "$OUT/item-$n-$i.webp"
    rm -f "$OUT/item-$n-$i.png"
  done <<< "$SORTED"

  printf "  商品_%-3s %2d 樣\n" "$n" "$i"
done

echo ""
echo "完成：$OUT（$(ls "$OUT"/item-*.webp 2>/dev/null | wc -l) 樣商品，$(du -ch "$OUT"/item-*.webp 2>/dev/null | tail -1 | cut -f1)）"
