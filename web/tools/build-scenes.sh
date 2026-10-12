#!/usr/bin/env bash
# 組出五張「沒有動物」的場景背景，輸出 web/public/pets/scene-<id>.webp。
#
# 為什麼要自己組：原本的場景是從兩本圖鑑的插畫裁下來的，每一張裡面
# 本來就畫了一隻動物（貓躺在床上、狗坐在草地上）。遊戲裡又放了一隻會動的
# 寵物，畫面上就變成兩隻。那些動物是趴在家具上畫的，去背會把床一起挖掉，
# 補圖也補不乾淨。
#
# 所以改成：牆面與地板自己畫，家具用圖鑑切好的去背素材擺上去。
# 素材本來就是乾淨的單件物品，組出來的房間一隻動物也沒有，
# 而且地板線由我們決定，遊戲裡的寵物與擺飾才站得住。
#
# 需要 imagemagick 與 webp。
set -e
cd "$(dirname "$0")/../.."

LIB=web/public/pets/lib
OUT=web/public/pets
W=640; H=400
GROUND=312            # 地板線，要跟 game/pet/pet_body.gd 的 GROUND（0.78）一致

command -v convert > /dev/null || { echo "❌ 需要 imagemagick"; exit 1; }
command -v cwebp   > /dev/null || { echo "❌ 需要 webp"; exit 1; }
[ -d "$LIB" ] || { echo "❌ 先跑 web/tools/build-catalog.sh"; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 畫底：上半是牆（或天空），下半是地板。
# 牆用上下漸層，房間才不會像一塊色卡；地板用純色加一條暗邊當踢腳線。
base() {   # base <輸出> <牆上色> <牆下色> <地板色>
  convert -size "${W}x${GROUND}" "gradient:$2-$3" "$TMP/wall.png"
  convert -size "${W}x$(( H - GROUND ))" "xc:$4" "$TMP/floor.png"
  convert "$TMP/wall.png" "$TMP/floor.png" -append \
          -fill "#0000001e" -draw "rectangle 0,$GROUND $W,$(( GROUND + 4 ))" "$1"
}

# 只留素材裡最大的那一塊。
#
# 圖鑑的素材是用像素色差自動分離的，作者在使用說明裡也提醒過邊緣可能有殘影。
# 實際遇到的是遮陽傘上方黏了一截海平線，放進場景就變成半空中一根藍色橫槓。
# 單件家具本來就只有一塊，取最大的連通區域再裁一次就乾淨了。
clean() {  # clean <來源> <輸出>
  local box
  box=$(convert "$1" -alpha extract -threshold 20% \
          -define connected-components:verbose=true \
          -connected-components 8 null: 2>&1 \
        | grep 'gray(255)' | sort -k4 -n -r | head -1 | awk '{print $2}')
  if [ -n "$box" ]; then
    convert "$1" -crop "$box" +repage "$2"
  else
    cp "$1" "$2"
  fi
}

# 擺一件家具。座標是「底部中心」，所以不管素材多高都站得穩。
put() {    # put <底圖> <素材id> <底部中心x> <底部y> <高度px>
  local canvas=$1 id=$2 cx=$3 by=$4 ht=$5
  local f="$LIB/$id.webp"
  [ -f "$f" ] || { echo "  ⚠️  缺 $id"; return; }
  clean "$f" "$TMP/raw.png"
  convert "$TMP/raw.png" -resize "x$ht" "$TMP/i.png"
  local w h
  w=$(identify -format '%w' "$TMP/i.png")
  h=$(identify -format '%h' "$TMP/i.png")
  convert "$canvas" "$TMP/i.png" -geometry "+$(( cx - w / 2 ))+$(( by - h ))" \
          -composite "$canvas"
}

# 掛在牆上的東西（畫、窗戶、海報），座標是中心點。
hang() {   # hang <底圖> <素材id> <中心x> <中心y> <高度px>
  local canvas=$1 id=$2 cx=$3 cy=$4 ht=$5
  local f="$LIB/$id.webp"
  [ -f "$f" ] || { echo "  ⚠️  缺 $id"; return; }
  clean "$f" "$TMP/raw.png"
  convert "$TMP/raw.png" -resize "x$ht" "$TMP/i.png"
  local w h
  w=$(identify -format '%w' "$TMP/i.png")
  h=$(identify -format '%h' "$TMP/i.png")
  convert "$canvas" "$TMP/i.png" -geometry "+$(( cx - w / 2 ))+$(( cy - h / 2 ))" \
          -composite "$canvas"
}

save() {   # save <底圖> <id>
  cwebp -quiet -q 86 "$1" -o "$OUT/scene-$2.webp"
  printf "  %-8s %s\n" "$2" "$(du -h "$OUT/scene-$2.webp" | cut -f1)"
}

C=$TMP/c.png

# 家具靠兩側、中間留一段空地，寵物才有地方走來走去。

# ---- 小房間 ----
base "$C" "#fcf3e0" "#f2e0bf" "#d9ab74"
convert "$C" -fill "#00000012" -draw "rectangle 0,$(( GROUND + 30 )) $W,$(( GROUND + 34 ))" "$C"
hang "$C" lib-2-room-10 176 96 86       # 壁畫
put  "$C" lib-3-room-05 74  "$GROUND" 186   # 書架
put  "$C" lib-3-room-01 248 "$GROUND" 104   # 小床
put  "$C" lib-3-room-11 332 "$GROUND" 86    # 小夜燈
put  "$C" lib-3-room-06 498 "$GROUND" 168   # 抓抓板
put  "$C" lib-2-room-05 578 "$GROUND" 124   # 盆栽
save "$C" room

# ---- 庭院 ----
base "$C" "#bfe4f6" "#eaf6e1" "#8fc95f"
convert "$C" -fill "#00000010" -draw "rectangle 0,$(( GROUND + 34 )) $W,$(( GROUND + 38 ))" "$C"
put  "$C" lib-3-yard-11 330 "$GROUND" 104   # 木柵欄
put  "$C" lib-3-yard-03 104 "$GROUND" 170   # 小帳篷
put  "$C" lib-3-yard-05 232 "$GROUND" 76    # 樹樁
put  "$C" lib-3-yard-02 478 "$GROUND" 112   # 木椅
put  "$C" lib-2-yard-01 572 "$GROUND" 96    # 花圃
put  "$C" lib-3-yard-04 390 "$GROUND" 56    # 水盆
save "$C" garden

# ---- 海邊 ----
# 天空、海、沙三層：海是地板線上方一條，沙是地板。
base "$C" "#8fd4f0" "#dcf1f8" "#f2dcab"
convert "$C" -fill "#5bb6dd" -draw "rectangle 0,$(( GROUND - 58 )) $W,$GROUND" \
             -fill "#8fcfe8" -draw "rectangle 0,$(( GROUND - 58 )) $W,$(( GROUND - 48 ))" "$C"
put  "$C" lib-3-beach-10 80  "$GROUND" 212   # 椰子樹
put  "$C" lib-3-beach-01 244 "$GROUND" 158   # 遮陽傘
put  "$C" lib-3-beach-02 338 "$GROUND" 92    # 躺椅
put  "$C" lib-3-beach-03 516 "$GROUND" 124   # 沙堡
put  "$C" lib-3-beach-11 584 "$GROUND" 58    # 沙灘球
save "$C" beach

# ---- 太空艙 ----
base "$C" "#141833" "#272d5c" "#3a4070"
convert "$C" -fill white \
  -draw "circle 80,70 80,72"     -draw "circle 190,46 190,48" \
  -draw "circle 300,92 300,94"   -draw "circle 418,58 418,60" \
  -draw "circle 540,104 540,106" -draw "circle 606,62 606,64" \
  -draw "circle 128,140 128,141" -draw "circle 352,150 352,151" \
  -draw "circle 470,128 470,129" -draw "circle 240,176 240,177" "$C"
hang "$C" lib-3-space-07 344 118 142    # 觀景窗
put  "$C" lib-3-space-02 92  "$GROUND" 150   # 控制台
put  "$C" lib-3-space-01 230 "$GROUND" 106   # 太空床
put  "$C" lib-3-space-05 500 "$GROUND" 104   # 星球盆栽
# 小機器人（space-04）不能用：那張的自動去背失敗，只剩一圈灰色描邊。
put  "$C" lib-3-space-12 586 "$GROUND" 100   # 太空獎盃
save "$C" space

# ---- 健身房 ----
base "$C" "#f3f6f9" "#dde6ee" "#c3b2a0"
convert "$C" -fill "#00000012" -draw "rectangle 0,$(( GROUND + 32 )) $W,$(( GROUND + 36 ))" "$C"
put  "$C" lib-3-gym-01 100 "$GROUND" 172    # 跑步機
put  "$C" lib-3-gym-10 296 "$GROUND" 186    # 單槓
put  "$C" lib-3-gym-11 492 "$GROUND" 132    # 獎盃架
put  "$C" lib-3-gym-12 580 "$GROUND" 120    # 植物
put  "$C" lib-3-gym-02 398 "$GROUND" 46     # 啞鈴
save "$C" gym

echo ""
echo "完成：$OUT（五張 ${W}x${H}，地板線 $GROUND）"
