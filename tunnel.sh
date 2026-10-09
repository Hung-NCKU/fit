#!/usr/bin/env bash
# 把本機的 :3000 開到外網，讓手機在任何網路下都能用。
#
#   ./tunnel.sh              依 server/.env 的 TUNNEL_PROVIDER 決定（預設 quick）
#   ./tunnel.sh quick        Cloudflare 臨時通道：免註冊，但網址每次都變
#   ./tunnel.sh ngrok        ngrok：固定網址，需要免費帳號的 authtoken
#   ./tunnel.sh cloudflare   Cloudflare 具名通道：用自己的網域，需要先登入授權
#   ./tunnel.sh tailscale    Tailscale Funnel：免費固定網址，沒有瀏覽器攔截頁
set -e
cd "$(dirname "$0")"

PORT="${PORT:-3000}"
ENV_FILE="server/.env"

get() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r'; }

PROVIDER="${1:-$(get TUNNEL_PROVIDER)}"
PROVIDER="${PROVIDER:-quick}"

# ---- 前置檢查 ----

if ! curl -s -m 2 "http://127.0.0.1:${PORT}/api/session" > /dev/null; then
  echo ""
  echo "❌ 後端沒有在 :${PORT} 執行。請先開另一個終端機跑 ./start.sh"
  exit 1
fi


if ! grep -qE '^PASSWORD_[A-Z]+=.+' "$ENV_FILE" 2>/dev/null; then
  echo ""
  echo "❌ server/.env 裡沒有任何帳號設定密碼（PASSWORD_MARTINA / PASSWORD_ELI）。"
  echo "   這個網址會公開在網際網路上，沒有密碼等於任何人都能看你們的紀錄、用你的 Gemini 額度。"
  exit 1
fi

fetch_bin() {   # fetch_bin <輸出路徑> <網址> <說明>
  [ -x "$1" ] && return
  echo "第一次使用，下載 $3…"
  curl -# -L -o "$1.tmp" "$2"
  case "$2" in
    *.tgz|*.tar.gz) tar -xzf "$1.tmp" -C "$(dirname "$1")" && rm -f "$1.tmp" ;;
    *)              mv "$1.tmp" "$1" ;;
  esac
  chmod +x "$1"
}

# ---- 各家實作 ----

case "$PROVIDER" in

  quick)
    fetch_bin .tools/cloudflared \
      https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
      cloudflared
    echo ""
    echo "Cloudflare 臨時通道。稍等幾秒會出現一個 trycloudflare.com 網址。"
    echo "⚠️  這個網址每次重開都會變。想要固定網址請改用 ./tunnel.sh ngrok"
    echo ""
    exec .tools/cloudflared tunnel --url "http://127.0.0.1:${PORT}"
    ;;

  ngrok)
    TOKEN=$(get NGROK_AUTHTOKEN)
    DOMAIN=$(get NGROK_DOMAIN)
    if [ -z "$TOKEN" ]; then
      cat <<'HELP'

❌ server/.env 裡還沒設定 NGROK_AUTHTOKEN。

設定步驟（免費，大約 3 分鐘）：
  1. 到 https://dashboard.ngrok.com/signup 註冊
  2. 複製 https://dashboard.ngrok.com/get-started/your-authtoken 的 authtoken
  3. 到 https://dashboard.ngrok.com/domains 看你被配發的固定網址
     （長得像 abc-123-xyz.ngrok-free.dev，永久屬於你的帳號，不會變）
  4. 把兩個值填進 server/.env：

       NGROK_AUTHTOKEN=你的token
       NGROK_DOMAIN=abc-123-xyz.ngrok-free.dev

  5. 再跑一次 ./tunnel.sh ngrok

HELP
      exit 1
    fi

    fetch_bin .tools/ngrok \
      https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz \
      ngrok

    .tools/ngrok config add-authtoken "$TOKEN" > /dev/null 2>&1 || true

    echo ""
    if [ -n "$DOMAIN" ]; then
      echo "  固定網址：https://${DOMAIN}"
      echo "  手機直接開這個網址、輸入密碼就能用。"
      echo ""
      exec .tools/ngrok http "${PORT}" --url "https://${DOMAIN}" --log stdout
    else
      echo "⚠️  NGROK_DOMAIN 沒設，這次會拿到隨機網址。"
      echo "   固定網址在 https://dashboard.ngrok.com/domains"
      echo ""
      exec .tools/ngrok http "${PORT}" --log stdout
    fi
    ;;

  cloudflare)
    NAME=$(get TUNNEL_NAME);      NAME="${NAME:-fit}"
    HOST=$(get TUNNEL_HOSTNAME)
    if [ -z "$HOST" ]; then
      cat <<'HELP'

❌ server/.env 裡還沒設定 TUNNEL_HOSTNAME。

這個方式需要「一個你自己的網域，且已加入 Cloudflare」。沒有網域的話請改用 ./tunnel.sh ngrok

設定步驟：
  1. ./.tools/cloudflared tunnel login          （瀏覽器授權，選你的網域）
  2. ./.tools/cloudflared tunnel create fit
  3. ./.tools/cloudflared tunnel route dns fit fit.你的網域.com
  4. 把網址填進 server/.env：

       TUNNEL_PROVIDER=cloudflare
       TUNNEL_NAME=fit
       TUNNEL_HOSTNAME=fit.你的網域.com

  5. 再跑一次 ./tunnel.sh

HELP
      exit 1
    fi

    fetch_bin .tools/cloudflared \
      https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
      cloudflared

    echo ""
    echo "  固定網址：https://${HOST}"
    echo ""
    exec .tools/cloudflared tunnel run --url "http://127.0.0.1:${PORT}" "$NAME"
    ;;

  tailscale)
    # Tailscale Funnel：免費、網址固定、而且沒有 ngrok 那個瀏覽器攔截頁。
    # 網址是 https://<主機名>.<你的tailnet>.ts.net，由 Tailscale 配發，不會變。
    #
    # 跟前面幾種不同，它不是下載一個執行檔就好，而是系統服務（tailscaled），
    # 所以第一次要先裝好並登入。沒裝的話下面會印出步驟。
    if ! command -v tailscale > /dev/null 2>&1; then
      cat <<'HELP'

❌ 還沒安裝 Tailscale。

  1. 安裝（會裝成 systemd 服務，開機自動啟動）：
       curl -fsSL https://tailscale.com/install.sh | sh

  2. 登入（會印出一個網址，用瀏覽器開啟授權）：
       sudo tailscale up --hostname=fit

  3. 到 https://login.tailscale.com/admin/dns 開啟 MagicDNS 與 HTTPS Certificates

  4. 到 https://login.tailscale.com/admin/acls 的 Access controls，
     在 policy 裡加上 funnel 屬性：

       "nodeAttrs": [
         { "target": ["autogroup:member"], "attr": ["funnel"] }
       ]

  5. 再跑一次 ./tunnel.sh tailscale

HELP
      exit 1
    fi

    if ! tailscale status > /dev/null 2>&1; then
      echo ""
      echo "❌ Tailscale 還沒登入。執行：sudo tailscale up --hostname=fit"
      echo "   它會印出一個網址，用瀏覽器開啟授權後再試一次。"
      exit 1
    fi

    TS_HOST=$(tailscale status --json 2>/dev/null \
      | grep -o '"DNSName"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
      | cut -d'"' -f4 | sed 's/\.$//')

    echo ""
    [ -n "$TS_HOST" ] && echo "  固定網址：https://${TS_HOST}"
    echo ""

    # --bg 會把設定寫進 tailscaled 並立刻返回；這裡要的是一個「活著的前景程序」，
    # 好讓 start.sh 能用 wait -n 監看、Ctrl+C 時一起收掉。
    # 所以改用前景模式：它會一直跑到被中斷為止。
    exec tailscale funnel "${PORT}"
    ;;
  *)
    echo "不認得的方式「$PROVIDER」。可用：quick / ngrok / cloudflare / tailscale"
    exit 1
    ;;
esac
