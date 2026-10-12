#!/usr/bin/env bash
# 把 pet/素材/ 的圖鑑素材轉成網頁用的 WebP，並產生商城目錄。
#
# 這份素材比先前 slice-items.sh 自動切出來的好得多：已經去背、已經分類、
# 還附一份 素材索引.csv 標了每一樣的真實名稱。先前那版的名稱是我對著
# 圖猜的（「星球盆栽」「文件架」…），現在直接用作者寫的。
#
# 產出兩樣東西：
#   web/public/pets/lib/<id>.webp   個別素材
#   server/src/pet-catalog.json     商城目錄（id / 分區 / 部位 / 名稱 / 價格）
#
# 目錄是產生出來的，但會進版控：伺服器啟動時不該依賴 ImageMagick。
#
# 需要 imagemagick 與 webp。
set -e
cd "$(dirname "$0")/../.."

CSV="pet/素材/素材索引.csv"
SRC="pet/素材"
OUT="web/public/pets/lib"
JSON="server/src/pet-catalog.json"

[ -f "$CSV" ] || { echo "❌ 找不到 $CSV"; exit 1; }
command -v convert > /dev/null || { echo "❌ 需要 imagemagick"; exit 1; }
command -v cwebp   > /dev/null || { echo "❌ 需要 webp"; exit 1; }
mkdir -p "$OUT"

# 分類 -> 代號｜部位｜分區名稱｜起價｜每項遞增
#
# 02_寵物角色 故意不列：那十隻是另一套角色插畫，不是商品。寵物本體
# 仍然用 十隻萌寵角色卡插畫.png 切出來的，不然選寵物的卡片會對不上。
map() {
  case "$1" in
    *場景擺飾/小房間) echo "room|decor|小房間擺飾|40|8" ;;
    *場景擺飾/庭院)   echo "yard|decor|庭院擺飾|45|8" ;;
    *場景擺飾/海灘)   echo "beach|decor|海邊擺飾|45|8" ;;
    *場景擺飾/太空艙) echo "space|decor|太空艙擺飾|70|10" ;;
    *場景擺飾/健身房) echo "gym|decor|健身房擺飾|60|10" ;;
    03_帽子)          echo "hat|hat|帽子|60|12" ;;
    04_衣服)          echo "cloth|cloth|衣服|80|14" ;;
    05_鞋子襪子)      echo "shoe|shoe|鞋襪|50|10" ;;
    06_配件)          echo "acc|acc|配件|60|12" ;;
    07_玩具)          echo "toy|decor|玩具|40|8" ;;
    08_食物餐具)      echo "food|decor|食物餐具|35|6" ;;
    09_植物)          echo "plant|decor|植物|40|8" ;;
    10_收藏獎勵)      echo "trophy|decor|收藏獎勵|90|20" ;;
    11_節慶裝飾)      echo "fest|decor|節慶裝飾|70|12" ;;
    *) echo "" ;;
  esac
}

echo "[" > "$JSON.tmp"
first=1

# 編號用「每一區的流水號」，不用檔名前綴的數字——
# 圖鑑 2 的健身房資料夾裡數字會歸零重來（…05_獎盃架、然後又一個 01_計時器），
# 照檔名編會撞出重複的 id，後面切出來的圖就把前面的蓋掉了。
declare -A seq

# CSV 的第一行有 BOM，而且後面幾欄含逗號（框座標是 "(17, 330, …)"），
# 不過我們只要前四欄，在那之前沒有引號，用逗號切是安全的。
# 用程序替代而不是管線，迴圈才跟腳本在同一個 shell，seq 才存得住。
while IFS=, read -r book cat name png rest; do
  [ -z "$png" ] && continue
  info=$(map "$cat")
  [ -z "$info" ] && continue

  IFS='|' read -r code slot group base step <<< "$info"
  book_no=${book#圖鑑}
  key="$book_no-$code"
  seq[$key]=$(( ${seq[$key]:-0} + 1 ))
  i=${seq[$key]}
  id="lib-$book_no-$code-$(printf '%02d' "$i")"

  if [ ! -f "$SRC/$png" ]; then
    echo "  ⚠️  缺 $png"
    continue
  fi

  # -trim 去掉多餘的透明邊，長邊統一 160；-exact 保住透明區的顏色
  convert "$SRC/$png" -trim +repage -resize 160x160 "$OUT/$id.png"
  cwebp -quiet -q 82 -exact "$OUT/$id.png" -o "$OUT/$id.webp"
  rm -f "$OUT/$id.png"

  price=$(( base + (i - 1) * step ))
  [ $first -eq 1 ] && first=0 || echo "," >> "$JSON.tmp"
  printf '  {"id":"%s","slot":"%s","group":"%s","name":"%s","price":%d,"img":"/pets/lib/%s.webp"}' \
    "$id" "$slot" "$group" "$name" "$price" "$id" >> "$JSON.tmp"
done < <(tail -n +2 "$CSV" | tr -d '\r')

echo "" >> "$JSON.tmp"
echo "]" >> "$JSON.tmp"
mv "$JSON.tmp" "$JSON"

echo ""
echo "素材：$OUT（$(ls "$OUT"/*.webp 2>/dev/null | wc -l) 個，$(du -sh "$OUT" | cut -f1)）"
echo "目錄：$JSON（$(grep -c '"id"' "$JSON") 件商品）"
