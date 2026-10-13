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

測試使用 mock fetch 與假的環境變數，不讀取 `.env`、不啟動服務、不呼叫 Gemini／推播，也不碰正式健康資料。

例外是 `tests/pet-state.test.js`：它要驗的就是「哪幾天算進寵物的狀態」，繞過資料庫就驗不到真正出錯的地方，所以用 `FIT_DATA_DIR` 開一個拋棄式 SQLite，不會動到正式紀錄。
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
web/tools/build-catalog.sh   # pet/素材 -> 去背小物（給 build-scenes.sh 組場景用）
web/tools/slice-wear.sh      # pet/穿搭 -> 每隻動物自己的衣櫃（商城賣的就是這些）
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

## 新增使用者

臨時試用的話不必改程式：**登入頁**有一個「以訪客身分試用」，按一下就當場建一個
獨立帳號並直接登入，密碼只顯示那一次。資料存在 `server/data/guests.json`，
不進版控，也不必重啟。

訪客是**過渡狀態**，不是會留下來的帳號：在 App 右上角按「建立帳號」填好名稱與
身體數據才會變成正式使用者。沒建就關掉的話，閒置滿一小時（`TEMP_TTL_MIN`）
會連同他的資料庫一起被清掉；掃除在開機時跑一次、之後每十分鐘一次。

右上角那顆按鈕對正式使用者則是「＋ 帳號」，用同一張表單另外開一個新帳號。

這個端點（`POST /api/guest`）是公開的——登入頁本來就還沒登入。所以它吃登入那組
頻率限制（同一 IP 十分鐘八次），而且訪客總數上限 20（`MAX_GUESTS`）。
要清理就用 `DELETE /api/guests/<id>`，那個要先用固定帳號登入，訪客不能刪。

下面是「固定帳號」的加法（像 Martina、Eli 那種長期的）。

每位使用者一個獨立的 SQLite 檔（`server/data/fit-<id>.db`），第一次有人用那個身分
登入時自動建立。所以新增一位只要兩個步驟：

1. 在 `server/src/users.js` 的 `USERS` 加一筆：

   ```js
   {
     id: 'guest',                 // 會變成 fit-guest.db
     name: '訪客',                // 顯示在分頁上
     envKey: 'PASSWORD_GUEST',    // 對應 server/.env 的欄位
     seed: { sex, age, height_cm, weight_kg, goal_weight_kg, activity, goal, notes },
   }
   ```

2. 在 `server/.env` 填 `PASSWORD_GUEST=...`，然後重新啟動。

`seed` 只在建資料庫那一次用到，而且每個欄位都必填。不確定真實數字也沒關係——
登入之後直接跟教練說「我 30 歲、170 公分、65 公斤、想增肌」，`update_goal`
會重算每日熱量與三大營養素（也可以打 `PUT /api/profile`）。

兩件事要注意：

- **新增密碼會把所有人登出。** 連線用的簽章金鑰是從「全部密碼」推導出來的
  （`sessionSecret()`），多一組密碼等於換一把金鑰，既有的 cookie 全部失效。
- 前端不必改。`UserTabs` 是照 `session.users` 跑迴圈的，`otherUsers()` 也回傳陣列；
  `USERS[0]` 只在「完全沒設密碼」時當預設身分用。
