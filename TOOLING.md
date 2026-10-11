# 開發工具與測試

既有前端已使用 Vue 3、Vite 6 與 npm，後端已使用 Fastify 與 npm。
此配置沿用原本 `web/vite.config.js`，不改應用程式碼、部署方式或子專案 lockfile。
後端直接由 Node.js 執行，不另加 bundler。

## 安裝

建議使用 Node.js 24（與既有 Dockerfile 相同）；根目錄工具要求 Node.js >=22.13。

```bash
npm ci
npm run setup
```

根目錄只安裝開發用 Vitest；`setup` 依既有 lockfile 安裝 web 與 server 相依。
沒有改成 npm workspaces，因此既有 `start.sh`、`dev.sh` 和 Docker 安裝流程保留。

## 常用指令

```bash
npm run dev          # 原本的 Vite 前端開發伺服器，port 5173
npm run dev:server   # 另一個終端執行後端，仍需自行設定 server/.env
npm run build        # 原本的 Vite 打包，輸出 web/dist
npm run preview      # 預覽打包結果，不會啟動後端
npm test             # Vitest 一次跑完，適合 CI
npm run test:watch   # 開發時持續測試
npm run check        # 測試通過後再打包前端
```

## 測試範圍

- `tests/web-api.test.js`：既有 API 客戶端的 GET/DELETE 空 body、POST JSON、query 編碼、401 登出、登入錯誤、網路失敗和照片網址。
- `tests/server-auth.test.js`：驗證開關、密碼身分對應、簽章金鑰變更、公開路徑、HTTPS cookie、cookie 驗證和登入速率限制。

測試使用 mock fetch 與假的環境變數，不讀取 `.env`、不啟動服務、不呼叫 Gemini／推播，也不碰正式健康資料或 SQLite。
這是單元回歸測試起點，不代表完整 UI、資料庫或端到端測試。

GitHub Actions 在 push 與 pull request 使用 Node.js 24，依序安裝、測試與 Vite 打包。
Vitest 5 只裝在根目錄作為測試工具；測試與 web 的 Vite 6 打包工具分開，不升級既有應用程式相依。
