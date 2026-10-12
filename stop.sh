#!/usr/bin/env bash
# 停止服務與外網通道。
#   ./stop.sh
#
# 順序很重要：要先停「啟動器」再停後端。
# start.sh --keep 會在後端掛掉時自動重啟，先砍後端的話它又會被拉回來。
cd "$(dirname "$0")"

# pattern 用 [] 包住一個字元，避免比對到正在執行這支腳本的 shell 自己
kill_all() {
  local pattern="$1" sig="${2:--TERM}" pids
  pids=$(pgrep -f "$pattern" 2>/dev/null)
  [ -z "$pids" ] && return 1
  for p in $pids; do kill "$sig" "$p" 2>/dev/null; done
  return 0
}

echo "停止中…"

kill_all 'bash .*start[.]sh' && echo "  · 啟動器已停止（自動重啟也一併關掉）"
sleep 2

kill_all '^node src/server[.]js'      && echo "  · 後端已停止"
{ kill_all '^[.]tools/(cloudflared|ngrok)' || kill_all '^tailscale funnel'; } && echo "  · 外網通道已停止"
sleep 2

# 還活著的就強制收掉
kill_all 'bash .*start[.]sh' -KILL > /dev/null
kill_all '^node src/server[.]js' -KILL > /dev/null
kill_all '^[.]tools/(cloudflared|ngrok)' -KILL > /dev/null
kill_all '^tailscale funnel' -KILL > /dev/null

# Funnel 用 --bg 設定，是寫進 tailscaled 的持久狀態，砍程序不會關掉它。
#
# 預設「不關」。實測重新開啟後，Tailscale 的入口節點要約 100 秒才對外生效，
# 每次開機都卡兩分鐘不划算 —— 而開機自動啟動正是這個服務的主要使用方式。
# 後端停著時外面拿到的是 502，沒有資料外洩問題（而且仍要密碼才進得去）。
#
# 真的要收掉對外曝光：./stop.sh --funnel-off
if [ "$1" = --funnel-off ] && command -v tailscale > /dev/null 2>&1; then
  tailscale funnel --https=443 off > /dev/null 2>&1 \
    && echo "  · Tailscale Funnel 已關閉（下次啟動約需 2 分鐘才對外生效）"
fi
sleep 1

LEFT=$(pgrep -f 'bash .*start[.]sh|^node src/server[.]js|^[.]tools/(cloudflared|ngrok)|^tailscale funnel' 2>/dev/null | wc -l)
CODE=$(curl -s -m 3 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT:-3000}/api/session" 2>/dev/null)

echo ""
if [ "$LEFT" = "0" ] && [ "$CODE" != "200" ]; then
  echo "✅ 全部停止了。"
else
  echo "⚠️  還有 $LEFT 個程序、API 回應 $CODE，請執行 ./status.sh 確認。"
fi
echo ""
echo "要再開：./start.sh"
echo "注意：下次 Windows 登入時還是會自動啟動。"
echo "      要永久停用，刪除「啟動」資料夾裡的 fit-autostart.vbs："
echo "      %APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"
