# 增肌教練 —— 單一容器：Fastify 後端 ＋ 打包好的 Vue 前端 ＋ SQLite 資料
#
#   docker build -t fit .
#   docker run -d -p 3000:3000 -v fit-data:/data --env-file docker/env fit
#
# 資料放在 /data（volume），不在映像層裡。要帶著現有紀錄走，
# 先用 ./docker-export.sh 匯出到 docker/seed/，建置時會一起進來，
# 容器第一次啟動且 /data 是空的時候自動植入。

# ---------- 1. 打包前端 ----------
FROM node:24-alpine AS web

WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY web/ ./
RUN npm run build          # 產出 /build/web/dist


# ---------- 2. 後端相依 ----------
FROM node:24-alpine AS deps

WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
# node:sqlite 是 Node 內建的，沒有原生模組要編譯，所以這裡不需要 build-base
RUN npm ci --omit=dev --no-audit --no-fund


# ---------- 3. 執行階段 ----------
FROM node:24-alpine

# tzdata 不可省：SQLite 的 datetime('now','localtime')、每日彙總的日期切分、
# 還有定時提醒的時間點，全部依賴系統時區。沒裝的話容器一律是 UTC，
# 台灣會整整差 8 小時 —— 午夜前後記的那一餐會被算到前一天。
# su-exec 用來在 entrypoint 修好 volume 權限之後降權到 node 使用者。
RUN apk add --no-cache tzdata su-exec
ENV TZ=Asia/Taipei

# 目錄結構必須保持 <root>/server 與 <root>/web，
# 因為 server.js 是用 join(__dirname,'..','..','web','dist') 找前端的
WORKDIR /app/server

COPY --from=deps /build/server/node_modules ./node_modules
COPY server/package.json ./package.json
COPY server/src ./src
COPY server/tools ./tools
COPY --from=web /build/web/dist /app/web/dist

# 選用的資料種子（預設是空的，只有一個 .gitkeep）
COPY docker/seed/ /seed/
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV NODE_ENV=production \
    PORT=3000 \
    FIT_DATA_DIR=/data

VOLUME ["/data"]
EXPOSE 3000

# /api/session 是公開路徑，沒登入也會回 200，拿來探活剛好
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/session').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "src/server.js"]
