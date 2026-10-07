#!/usr/bin/env bash
# 查看資料庫內容（唯讀）
#   ./db.sh                    全部總覽
#   ./db.sh meals              只看飲食
#   ./db.sh chat               只看對話紀錄
#   ./db.sh "SELECT * FROM meals WHERE date = '2026-09-22'"
cd "$(dirname "$0")"
export PATH="$PWD/.tools/node/bin:$PATH"
exec node server/tools/query.mjs "$@"
