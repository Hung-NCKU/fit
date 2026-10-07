#!/usr/bin/env bash
# 開發模式：後端 :3000（存檔自動重啟）＋ 前端 :5173（熱更新）
set -e
cd "$(dirname "$0")"
export PATH="$PWD/.tools/node/bin:$PATH"

[ -f server/.env ] || cp server/.env.example server/.env
[ -d server/node_modules ] || (cd server && npm install --no-audit --no-fund)
[ -d web/node_modules ]    || (cd web    && npm install --no-audit --no-fund)

cleanup() { kill 0 2>/dev/null; }
trap cleanup EXIT INT TERM

(cd server && npm run dev) &
(cd web    && npm run dev) &

echo ""
echo "  前端（開發用）: http://localhost:5173"
echo "  後端 API      : http://localhost:3000/api/health"
echo "  Ctrl+C 停止"
echo ""
wait
