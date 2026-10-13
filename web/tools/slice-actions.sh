#!/usr/bin/env bash
# 把 pet/十種可愛動物動作精靈圖鑑.png 切成每個物種、每個動作一張圖，
# 輸出 web/public/pets/act-<物種>-<動作>.webp。
#
# 在這之前只有貓有動作圖（八張，從概念圖裡切的），其他九種不管在做什麼
# 都是同一張靜態本體。有了這張圖鑑，十種動物都有五個動作：
# 待機 / 行走 / 進食 / 睡覺 / 玩耍。
#
# 刻意只取每一列的其中一隻，不做逐格動畫——會動的部分交給 CSS。
#
# 版面：五欄兩列共十個面板，每個面板有標題列加五個動作列。
# 每一列畫了三到四隻，而且位置不規則，所以不能用固定的欄格線取；
# 改成把整列的背景去掉之後取最大的連通區域，也就是最完整的那一隻。
#
# 需要 imagemagick 與 webp。
set -e
cd "$(dirname "$0")/../.."

SRC="pet/十種可愛動物動作精靈圖鑑.png"
OUT=web/public/pets

[ -f "$SRC" ] || { echo "❌ 找不到 $SRC"; exit 1; }
command -v convert > /dev/null || { echo "❌ 需要 imagemagick"; exit 1; }
command -v cwebp   > /dev/null || { echo "❌ 需要 webp"; exit 1; }
mkdir -p "$OUT"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 面板的左界與寬度。量出來的——這張圖鑑的面板並非等寬
# （最左邊 335、中間只有 288），照等分切會切到隔壁。
XS=(3 338 646 934 1233)
WS=(335 308 288 299 300)
# 兩排面板的上界
YS=(3 517)

# 面板裡第一個動作列的中心，以及每一列的間距（量出來都很一致）
ROW0=78
PITCH=86.5
BAND=104         # 取多高的一條。比列距（86.5）還高，寧可夾到上下列的一角
                 # 也不要把主角的頭或腳切掉——多出來的碎塊後面會濾掉
LABEL=56         # 左邊那塊「待機／行走…」標籤的寬度，要跳過

# 面板順序就是圖上的 A~J
IDS=(guinea tortoise dog ferret cat parrot chinchilla hamster rabbit hedgehog)
ACTS=(idle walk eat sleep play)

made=0
for p in $(seq 0 9); do
  col=$(( p % 5 )); row=$(( p / 5 ))
  px=${XS[$col]}; pw=${WS[$col]}; py=${YS[$row]}
  id=${IDS[$p]}

  for a in $(seq 0 4); do
    act=${ACTS[$a]}
    cy=$(printf '%.0f' "$(echo "$py + $ROW0 + $a * $PITCH" | bc -l)")
    top=$(( cy - BAND / 2 ))
    # 第一列的帶子往上會吃到標題列（那是一塊深色圓角矩形，去背去不掉，
    # 還會被當成主體）。夾在內容區開始的地方。
    [ $top -lt $(( py + 44 )) ] && top=$(( py + 44 ))
    x=$(( px + LABEL ))
    w=$(( pw - LABEL - 6 ))

    convert "$SRC" -crop "${w}x${BAND}+${x}+${top}" +repage "$TMP/band.png"

    # 去背：從四個角洪水填充。面板底色是柔和的漸層，但一條 78px 高的帶子
    # 之內變化很小，所以單一 fuzz 就夠。用洪水填充而不是色鍵，
    # 動物身上同樣接近底色的白肚子才不會被一起挖掉。
    convert "$TMP/band.png" -alpha set \
      -fill none -fuzz 22% \
      -draw 'matte 0,0 floodfill' \
      -draw "matte $(( w - 1 )),0 floodfill" \
      -draw "matte 0,$(( BAND - 1 )) floodfill" \
      -draw "matte $(( w - 1 )),$(( BAND - 1 )) floodfill" \
      -channel alpha -morphology Erode Octagon:1 +channel \
      "$TMP/cut.png"

    # 一列裡有三到四隻，只要最左邊那一隻。
    #
    # 不能用連通區域：兔子、雪貂、龍貓在原圖上是肩併肩甚至交纏在一起的，
    # 整列會被當成同一塊（先侵蝕再分家也沒用，牠們是真的重疊）。
    # 改看每一欄被塗到的高度，從第一個波峰往右找到「瘦一截」的谷底當分界——
    # 完全分開時谷底剛好是 0，同一套邏輯兩種都涵蓋。
    read -r sx sw < <(
      convert "$TMP/cut.png" -alpha extract -threshold 40% -resize "${w}x1!" txt:- \
        | node web/tools/first-sprite.js
    )
    [ "${sw:-0}" -lt 10 ] && { echo "  ⚠️  $id/$act 找不到主體"; continue; }

    convert "$TMP/cut.png" -crop "${sw}x${BAND}+${sx}+0" +repage "$TMP/win.png"

    # 帶子取得比列距高，所以上下會夾到隔壁列露出來的一角。
    # 橫向已經只剩一隻了，這時候取最大的連通區域就乾淨了。
    box=$(convert "$TMP/win.png" -alpha extract -threshold 40% \
            -define connected-components:verbose=true \
            -define connected-components:area-threshold=300 \
            -connected-components 8 null: 2>&1 \
          | grep 'gray(255)' | sort -k4 -n -r | head -1 | awk '{print $2}')
    [ -z "$box" ] && { echo "  ⚠️  $id/$act 找不到主體"; continue; }

    convert "$TMP/win.png" -crop "$box" +repage \
            -trim +repage -resize 260x200 "$TMP/one.png"
    cwebp -quiet -q 86 -exact "$TMP/one.png" -o "$OUT/act-$id-$act.webp"
    made=$(( made + 1 ))
  done
  printf "  %-11s %s\n" "$id" "$(ls "$OUT"/act-$id-*.webp 2>/dev/null | wc -l) 個動作"
done

echo ""
echo "完成：$OUT（$made 張，$(du -ch "$OUT"/act-*-*.webp | tail -1 | cut -f1)）"
