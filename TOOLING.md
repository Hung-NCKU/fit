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

## 素材與遊戲的建置

這幾個腳本都只在素材換掉時才要跑，平常開發用不到。產出的圖與 JSON 會進版控，
伺服器啟動時不依賴 ImageMagick 或 Godot。

```bash
# 需要 imagemagick 與 webp
sudo apt-get install imagemagick webp

web/tools/slice-pets.sh      # 十隻角色卡與去背本體
web/tools/slice-actions.sh   # 十隻 × 五個動作（待機/行走/進食/睡覺/玩耍）
web/tools/build-catalog.sh   # pet/素材 -> 213 件商品 + server/src/pet-catalog.json
web/tools/build-anim.sh      # 十張 sprite sheet -> server/src/pet-anim.json
web/tools/build-scenes.sh    # 用乾淨的素材組出五張沒有動物的場景背景
```

### Godot

寵物動畫是一個 Godot 4.5 專案（`game/pet/`），匯出成網頁版放在
`web/public/petgame/`。匯出結果**不進版控**：`index.wasm` 有 38 MB，
而且那是建置產物。沒有匯出也不會壞，前端會留在靜態的寵物場景。

要重新匯出的話，先放好編譯器與匯出範本（都不需要 root）：

```bash
B=https://github.com/godotengine/godot-builds/releases/download/4.5.1-stable
mkdir -p .tools/godot && cd .tools/godot
curl -L -o godot.zip      $B/Godot_v4.5.1-stable_linux.x86_64.zip
curl -L -o templates.tpz  $B/Godot_v4.5.1-stable_export_templates.tpz

python3 -c "import zipfile; zipfile.ZipFile('godot.zip').extractall('bin')"
ln -sf bin/Godot_v4.5.1-stable_linux.x86_64 godot
chmod +x bin/*

# 範本整包有 1.3 GB，但只需要 web 的那幾個
TPL=~/.local/share/godot/export_templates/4.5.1.stable
mkdir -p $TPL
python3 - <<'PY'
import zipfile, os
tpl = os.path.expanduser('~/.local/share/godot/export_templates/4.5.1.stable')
z = zipfile.ZipFile('templates.tpz')
for n in z.namelist():
    if 'web' in n.lower() or n.endswith('version.txt'):
        open(os.path.join(tpl, os.path.basename(n)), 'wb').write(z.read(n))
PY
```

然後：

```bash
web/tools/build-petgame.sh   # --import、--export-release Web，最後產生 .gz
```

匯出設定在 `game/pet/export_presets.cfg`，其中 `variant/thread_support=false`
是必要的：開執行緒的話瀏覽器會要求 COOP/COEP 兩個 header，整頁都得跟著改。
