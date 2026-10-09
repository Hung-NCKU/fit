#!/bin/sh
# 容器啟動前的兩件事：植入資料種子、修好 volume 權限。
set -e

DATA="${FIT_DATA_DIR:-/data}"
mkdir -p "$DATA"

# 只有在 /data 還沒有任何資料庫時才植入，之後重啟不會覆蓋使用者的紀錄。
# 用 ls 判斷而不是 [ -f ]，因為檔名取決於 users.js 裡有哪些人。
if [ -z "$(ls -A "$DATA"/*.db 2>/dev/null)" ] && [ -n "$(ls -A /seed/*.db 2>/dev/null)" ]; then
  echo "[entrypoint] /data 是空的，從 /seed 植入初始資料庫："
  for f in /seed/*.db; do
    cp "$f" "$DATA/"
    echo "             $(basename "$f")  $(wc -c < "$f") bytes"
  done
fi

# volume 可能是 root 建的（named volume）或宿主機某個 uid 的（bind mount），
# 先修好擁有者再降權，否則 node 使用者寫不進去。
chown -R node:node "$DATA" 2>/dev/null || \
  echo "[entrypoint] 提醒：無法變更 $DATA 的擁有者，若啟動時出現寫入錯誤，請檢查掛載目錄的權限。"

echo "[entrypoint] TZ=$TZ  現在時間 $(date '+%F %T')"

exec su-exec node "$@"
