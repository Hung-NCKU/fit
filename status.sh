#!/usr/bin/env bash
# 看服務現在的狀況：有沒有在跑、連不連得到、下次提醒什麼時候、有幾台手機訂閱。
#   ./status.sh
cd "$(dirname "$0")"
export PATH="$PWD/.tools/node/bin:$PATH"
PORT="${PORT:-3000}"

# 注意：pgrep 的 pattern 要用 [] 包住一個字元，否則會連「正在執行這支腳本的 shell」
# 本身也比對進去（它的命令列裡含有同樣的字串）。
find_pids() { pgrep -f "$1" 2>/dev/null | tr '\n' ' '; }

STARTER=$(find_pids 'bash .*start[.]sh')
SERVER=$(find_pids '^node src/server[.]js')
TUNNEL=$(find_pids '^[.]tools/(cloudflared|ngrok)')

age() { [ -n "$1" ] && ps -o etime= -p "${1%% *}" 2>/dev/null | tr -d ' '; }

echo "═══ 增肌教練 ═══"
printf '  %-10s %s\n' "啟動器" "$([ -n "$STARTER" ] && echo "執行中 (PID $STARTER・已 $(age "$STARTER"))" || echo '未執行')"
printf '  %-10s %s\n' "後端"   "$([ -n "$SERVER" ]  && echo "執行中 (PID $SERVER・已 $(age "$SERVER"))"   || echo '未執行')"
printf '  %-10s %s\n' "外網通道" "$([ -n "$TUNNEL" ] && echo "執行中 (PID $TUNNEL・已 $(age "$TUNNEL"))"   || echo '未執行')"

echo
LOCAL=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/session" 2>/dev/null)
printf '  %-10s %s\n' "本機" "$([ "$LOCAL" = 200 ] && echo "✅ http://localhost:${PORT}" || echo "❌ 連不到 (HTTP ${LOCAL:-000})")"

URL=$(grep -E '^NGROK_DOMAIN=.+' server/.env 2>/dev/null | cut -d= -f2- | tr -d '\r')
[ -n "$URL" ] && URL="https://$URL"
[ -z "$URL" ] && URL=$(grep -oE 'https://[a-z0-9]+(-[a-z0-9]+)+\.trycloudflare\.com' .logs/tunnel.log 2>/dev/null | tail -1)
if [ -n "$URL" ]; then
  EXT=$(curl -s -m 20 -o /dev/null -w '%{http_code}' "$URL/api/session" 2>/dev/null)
  printf '  %-10s %s\n' "外網" "$([ "$EXT" = 200 ] && echo "✅ $URL" || echo "❌ $URL (HTTP ${EXT:-000})")"
fi

echo
NEXT=$(grep -o '下一次提醒：[^（]*（[^）]*）' .logs/server.log 2>/dev/null | tail -1)
printf '  %-10s %s\n' "定時提醒" "${NEXT:-（沒有排程紀錄）}"

for u in martina eli; do
  [ -f "server/data/fit-$u.db" ] || continue
  N=$(node -e "
const {DatabaseSync}=require('node:sqlite');
try{const d=new DatabaseSync('server/data/fit-$u.db');
console.log(d.prepare('SELECT COUNT(*) c FROM push_subscriptions').get().c)}catch{console.log('?')}" 2>/dev/null)
  printf '  %-10s %s\n' "$u 訂閱" "${N:-0} 台裝置"
done

echo
echo "  停止：./stop.sh        重新啟動：./start.sh"
echo "  紀錄：.logs/server.log  .logs/tunnel.log  .logs/autostart.log"
