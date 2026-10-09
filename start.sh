#!/usr/bin/env bash
# 一次啟動後端與外網通道。
#
#   ./start.sh            後端 + 通道（通道方式看 server/.env 的 TUNNEL_PROVIDER）
#   ./start.sh --local    只跑後端，不開外網
#   ./start.sh ngrok      這次改用指定的通道方式（quick / ngrok / cloudflare）
#   ./start.sh --keep     其中一個程序掛掉時自動重啟（開機自動啟動用這個）
#
# Ctrl+C 會把兩個一起收掉。
set -e
cd "$(dirname "$0")"
export PATH="$PWD/.tools/node/bin:$PATH"

ENV_FILE="server/.env"
PORT="${PORT:-3000}"
# 絕對路徑：底下有 (cd web && …) 的子 shell，相對路徑會寫到 web/.logs 去
LOG_DIR="$PWD/.logs"
mkdir -p "$LOG_DIR"

get() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r'; }

# Tailscale 配發的固定主機名（<主機>.<tailnet>.ts.net），從 daemon 問而不是寫死在 .env
ts_host() {
  command -v tailscale > /dev/null 2>&1 || return
  tailscale status --json 2>/dev/null \
    | grep -o '"DNSName"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
    | cut -d'"' -f4 | sed 's/\.$//'
}

# ---- 參數（順序不拘，可以 ./start.sh ngrok --keep）----
WANT_TUNNEL=1
PROVIDER=""
KEEP=0
for arg in "$@"; do
  case "$arg" in
    --local|--no-tunnel) WANT_TUNNEL=0 ;;
    --keep) KEEP=1 ;;
    quick|ngrok|cloudflare|tailscale) PROVIDER="$arg" ;;
    *) echo "不認得的參數「$arg」。可用：--local / --keep / quick / ngrok / cloudflare / tailscale"; exit 1 ;;
  esac
done
[ -z "$PROVIDER" ] && PROVIDER="$(get TUNNEL_PROVIDER)"
PROVIDER="${PROVIDER:-quick}"

# ---- 首次執行的準備 ----
[ -f "$ENV_FILE" ] || cp server/.env.example "$ENV_FILE"
[ -d server/node_modules ] || (cd server && npm install --no-audit --no-fund)
[ -d web/node_modules ]    || (cd web    && npm install --no-audit --no-fund)

# 收掉還在跑的舊服務，否則新的綁不到 port，你以為重啟了其實跑的還是舊程式
OLD=$(pgrep -f '^node src/server.js' || true)
if [ -n "$OLD" ]; then
  echo "停止舊的服務（PID: $OLD）…"
  kill $OLD 2>/dev/null || true
  sleep 1
  kill -9 $OLD 2>/dev/null || true
fi
# 用 ^ 錨定：不加的話連「命令列裡剛好含有這串字」的其他程序都會被殺到
pkill -f '^\.tools/(cloudflared|ngrok)' 2>/dev/null || true
pkill -f '^tailscale funnel' 2>/dev/null || true

echo "打包前端…"
(cd web && npm run build > "$LOG_DIR/build.log" 2>&1) || { echo "❌ 前端打包失敗："; tail -20 "$LOG_DIR/build.log"; exit 1; }

# ---- 收尾：Ctrl+C 時兩個一起關 ----
SERVER_PID=""
TUNNEL_PID=""
stop_children() {
  # tunnel.sh 最後是 exec 掉的，所以 TUNNEL_PID 就是 ngrok／cloudflared 本身
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null || true
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
cleanup() {
  echo ""
  echo "收工，正在停止…"
  stop_children
}
trap cleanup EXIT INT TERM

# ---- 後端 ----
(cd server && exec node src/server.js) > "$LOG_DIR/server.log" 2>&1 &
SERVER_PID=$!

for i in $(seq 1 60); do
  curl -s -m 1 "http://127.0.0.1:${PORT}/api/session" > /dev/null 2>&1 && break
  kill -0 "$SERVER_PID" 2>/dev/null || { echo "❌ 後端啟動失敗："; tail -20 "$LOG_DIR/server.log"; exit 1; }
  sleep 0.5
done

PUBLIC=""
# ---- 通道 ----
if [ "$WANT_TUNNEL" = "1" ]; then
  if ! grep -qE '^PASSWORD_[A-Z]+=.+' "$ENV_FILE"; then
    echo ""
    echo "⚠️  沒有任何帳號設密碼，為了安全不開外網通道（本機仍可使用）。"
    echo "   要開外網請先在 server/.env 設定 PASSWORD_MARTINA / PASSWORD_ELI。"
    WANT_TUNNEL=0
  fi
fi

if [ "$WANT_TUNNEL" = "1" ]; then
  echo "建立外網通道（$PROVIDER）…"
  ./tunnel.sh "$PROVIDER" > "$LOG_DIR/tunnel.log" 2>&1 &
  TUNNEL_PID=$!

  # 等網址出現：ngrok 與 cloudflare 具名通道是固定的，quick 要從 log 撈
  case "$PROVIDER" in
    ngrok)      PUBLIC="https://$(get NGROK_DOMAIN)" ;;
    cloudflare) PUBLIC="https://$(get TUNNEL_HOSTNAME)" ;;
    tailscale)  PUBLIC="https://$(ts_host)" ;;
  esac
  [ "$PUBLIC" = "https://" ] && PUBLIC=""

  for i in $(seq 1 90); do
    if [ -z "$PUBLIC" ]; then
      PUBLIC=$(grep -oE 'https://[a-z0-9]+(-[a-z0-9]+)+\.trycloudflare\.com' "$LOG_DIR/tunnel.log" 2>/dev/null | head -1)
    fi
    [ -n "$PUBLIC" ] && break
    if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
      echo "⚠️  通道啟動失敗，只能在本機使用："
      sed -n '1,15p' "$LOG_DIR/tunnel.log"
      TUNNEL_PID=""
      break
    fi
    sleep 1
  done

  # 通道生效有時會慢個幾秒，等到通得了再宣告成功
  if [ -n "$PUBLIC" ]; then
    for i in $(seq 1 30); do
      CODE=$(curl -s -m 8 -o /dev/null -w '%{http_code}' "$PUBLIC/api/session" 2>/dev/null || true)
      [ -n "$CODE" ] && [ "$CODE" != "000" ] && break
      sleep 2
    done
  fi
fi

echo ""
echo "─────────────────────────────────────────────"
echo "  本機      http://localhost:${PORT}"
[ -n "$PUBLIC" ] && echo "  外網      $PUBLIC"
[ -z "$PUBLIC" ] && [ "$WANT_TUNNEL" = "1" ] && echo "  外網      （沒取得網址，看 .logs/tunnel.log）"
echo ""
echo "  紀錄檔    .logs/server.log、.logs/tunnel.log"
echo "  Ctrl+C    一起停止"
echo "─────────────────────────────────────────────"
echo ""

# 任一個掛掉就一起收（例如通道斷線時你會馬上看到）
wait -n "$SERVER_PID" ${TUNNEL_PID:+$TUNNEL_PID} 2>/dev/null || true
echo ""
echo "⚠️  其中一個程序結束了（$(date '+%F %H:%M:%S')），看 .logs/ 裡的紀錄檔。"

if [ "$KEEP" = "1" ]; then
  echo "10 秒後自動重啟…"
  stop_children
  # exec 不會觸發 EXIT trap，所以要先自己收乾淨，也要把 trap 拆掉避免重複執行
  trap - EXIT INT TERM
  sleep 10
  exec "$0" "$@"      # 重新來一次：重新打包、重新起後端與通道
fi
