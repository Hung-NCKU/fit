# 增肌教練

一個跑在自己電腦上的增肌管理 App：跟 AI 教練聊訓練與飲食，對話中提到「吃了什麼、練了什麼」會自動寫進資料庫，再從網頁看紀錄與趨勢。

預設對象：27 歲女性 / 155cm / 40kg / 目標增肌。

> **想知道這個 App 是怎麼做出來的？** 看 [MAKING-OF.md](MAKING-OF.md)：
> 從 function calling 的完整往返、免費額度的應對、防幻覺驗證，
> 到每一個踩過的坑（含我自己把使用者資料刪掉的那一次）。供教學與研究用。

## 技術

| 層 | 技術 |
|---|---|
| 前端 | Vue 3 + Vite + vue-router |
| 後端 | Node.js 24 + Fastify 5 |
| 資料庫 | SQLite（Node 內建 `node:sqlite`，免安裝、免編譯） |
| LLM | Google Gemini（免費方案，多模型候補鏈自動切換） |
| 執行環境 | WSL Ubuntu-24.04；Node 以免 sudo 的方式裝在 `.tools/node` |

## 第一次使用

1. **申請免費 Gemini API key**：https://aistudio.google.com/apikey
2. 填進設定檔：

   ```bash
   cd /mnt/d/claude/fit
   cp -n server/.env.example server/.env
   nano server/.env        # GEMINI_API_KEY= 填 key
   ```

   密碼設在 `PASSWORD_MARTINA` / `PASSWORD_ELI`。**輸入誰的密碼就以誰的身分登入**，
   兩人各自獨立使用，但可以互看對方的訓練與飲食紀錄（唯讀）。
   兩個都留空代表不需登入——只在自己電腦上用還好，但**開到外網前一定要設**。

3. 啟動：

   ```bash
   ./start.sh
   ```

   後端與外網通道會**一起啟動**，畫面上會印出本機與外網兩個網址。
   Ctrl+C 一次把兩個都停掉。

從 Windows 這邊也可以直接啟動：

```powershell
wsl -d Ubuntu-24.04 -e bash -lc "/mnt/d/claude/fit/start.sh"
```

## 查看狀態與停止

```bash
cd /mnt/d/claude/fit
./status.sh     # 現在有沒有在跑、連不連得到、下次提醒、幾台手機訂閱
./stop.sh       # 停止服務與通道
./start.sh      # 重新啟動
```

`status.sh` 輸出範例：

```
═══ 增肌教練 ═══
  啟動器  執行中 (PID 3761・已 00:30)
  後端    執行中 (PID 3813・已 00:23)
  外網通道 執行中 (PID 3854・已 00:16)

  本機    ✅ http://localhost:3000
  外網    ✅ https://xxx.ngrok-free.dev

  定時提醒 下一次提醒：2026/9/29 18:00:00（2 小時 46 分後）
  martina 訂閱 1 台裝置
  eli     訂閱 1 台裝置
```

`stop.sh` 會**先停啟動器再停服務**——順序相反的話 `--keep` 會立刻把後端拉回來。

從 Windows 這邊看的話，工作管理員裡的 `wscript.exe`（啟動器的錨點）和 `wsl.exe` 就是這個服務；
結束 `wscript.exe` 等同於停掉整組。

## 開機自動啟動

已經設定好了：Windows 登入後會自動在背景把服務與通道拉起來，不需要手動跑 `./start.sh`。

| 項目 | 位置 |
|---|---|
| 啟動器 | `autostart/fit-autostart.vbs`（副本放在「啟動」資料夾） |
| 啟動資料夾 | `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup` |
| 紀錄 | `.logs/autostart.log`（開機時沒有視窗，沒起來就看這個） |

實測 Windows 登入後約 **20 秒**服務就緒。

搭配 `./start.sh --keep`：後端或通道任何一個掛掉，**10 秒後自動重啟**（實測砍掉後端後 24 秒內自行復原）。

### 停用

把「啟動」資料夾裡的 `fit-autostart.vbs` 刪掉即可（專案裡那份留著沒關係）。

### 做這個檔案時踩到的兩個坑

- **`.vbs` 必須存成 UTF-16 LE + BOM。** 存成 UTF-8 的話，Windows 指令碼主機會用系統 ANSI（繁中是 Big5）去讀，中文註解被誤讀後會吃掉行尾，讓註解和下一行黏在一起，出現 `Expected statement` 編譯錯誤。
- **`shell.Run` 的第三個參數要 `True`（等待）。** 用 `False` 的話 wscript 立刻結束，它啟動的 `wsl.exe` 會被系統一起終止——實測會在前端打包到一半時斷掉。改成 `True` 讓 wscript 常駐當錨點。

### 仍然的限制

電腦**關機或睡眠**時沒有服務，也不會有定時提醒——這個自動啟動只解決「忘記手動開」。要 24 小時都在，得把後端放到一台一直開著的機器上。

## 開發模式

```bash
./dev.sh
```

- 前端 <http://localhost:5173>（熱更新，`/api` 自動代理到後端）
- 後端 <http://localhost:3000>（存檔自動重啟）

> 專案放在 Windows 磁碟 `/mnt/d`，WSL 收不到檔案變更事件，所以 Vite 已設定輪詢（`usePolling`）才有熱更新。

## 功能

### 教練（`/`）
用中文問訓練、問吃什麼。使用者提到紀錄時，AI 會呼叫工具直接寫進資料庫：

| 工具 | 觸發範例 |
|---|---|
| `log_meal` | 「我剛吃了兩顆蛋跟一碗飯」→ 自動估算熱量與三大營養素後寫入 |
| `log_workout` | 「深蹲做了 4 組 8 下 25 公斤」→ 寫入訓練紀錄 |
| `log_weight` | 「今天量 40.5 公斤」→ 寫入體重並同步個人檔案 |
| `get_records` | 「幫我檢討這週」→ 查資料庫後才回答，不會憑空編數字 |
| `edit_meal` | 「珍奶其實是大杯全糖，改成 650 大卡」→ 修改那一筆，份量變了會一併重估營養素 |
| `delete_meal` | 「把早餐的豆漿刪掉」→ 刪除指定的那一筆 |
| `undo_last_meal` | 「反悔」「剛剛那個不算」「記錯了」「我沒吃」→ 撤銷上一次記的飲食（整批） |
| `update_goal` | 「我想改成減脂，目標體重 72」「我現在一週練 5 天」→ 更新目標並重算每日營養目標，今日頁的數字跟著變 |

AI 看得到今天與昨天每一筆飲食的編號，所以可以直接說「剛剛那個」「早餐那筆」。

「反悔」只撤銷**最近一批**：連說兩次不會往前刪到更早的紀錄；
閒聊時說「好後悔上週吃了鹹酥雞」這種不算要刪除，不會觸發。

寫入的項目會在氣泡下方以綠色條列顯示，訓練／飲食頁面也會標上 `AI` 標籤。

### 拍照記錄熱量
按輸入框左邊的 📷 選一張餐點照片（手機會直接叫出相機），可以不打任何字就送出。

流程是：瀏覽器先把照片縮到長邊 1280、轉 JPEG（手機原圖動輒 5MB，縮完只剩幾百 KB）
→ 後端存進 `server/data/uploads/` → 連同問題一起送給 Gemini
→ Gemini 辨識出畫面上每一樣食物，**分別**呼叫一次 `log_meal` 寫進資料庫。

照片本體存在資料庫的 `photos` 表（BLOB），`meals.photo` 與 `chat_messages.image` 只存照片 id。
飲食頁的縮圖與對話裡的照片，點一下會跳出大圖視窗（附食物名稱與熱量），點背景、✕ 或按 Esc 關閉。
照片裡沒有食物時（例如桌布、課表）它不會亂記；看到體重計數字則會改呼叫 `log_weight`。

### 今日（`/today`）
- 熱量、蛋白質、碳水、脂肪四個進度條（對比每日目標）
- 當日訓練與飲食明細
- 近 14 天熱量長條圖（含目標參考線）、訓練總量、體重趨勢折線圖

### 訓練 / 飲食（`/workouts`、`/meals`）
手動新增、編輯、刪除；依日期分組並顯示當日小計。

### 營養目標怎麼算的
網頁上沒有設定頁，目標是後端依身體數據自動算的（`server/src/db.js` 的 `calcTargets`）：

- BMR 用 Mifflin-St Jeor 公式
- TDEE = BMR × 活動係數
- 增肌加 350 kcal 熱量盈餘
- 蛋白質以「目前體重與目標體重取大者」× 2.0 g/kg 計算（避免體重過輕時蛋白質目標被拉低）
- 脂肪佔總熱量 25%，其餘給碳水

27 歲 / 155cm / 40kg / 目標 48kg 算出來是 **2010 kcal、蛋白質 96g、碳水 281g、脂肪 56g**。

最簡單的改法是直接跟教練說（「我想改成減脂，目標體重 72」），它會呼叫 `update_goal`
重算四個營養目標，今日頁面的數字立刻跟著變。也可以用 API 直接改：

```bash
curl -X PUT http://localhost:3000/api/profile \
  -H "content-type: application/json" -b cookie.txt \
  -d '{"weight_kg":42,"goal_weight_kg":48,"recalc":true,"notes":"乳糖不耐，只能在家徒手訓練"}'
```

`recalc: true` 會依身體數據重算營養目標；省略則沿用現有目標。
`notes` 會直接放進 AI 的系統提示。體重也可以直接跟教練說「今天量 40.5 公斤」，它會自動更新。

## 模型與免費額度

**免費方案是「每個模型每天幾次請求」，不是每分鐘。** 實測 `gemini-3.8-flash` 與
`gemini-flash-latest` 都只有 **20 次／天**，用完之後當天等再久都不會恢復
（API 回的 `retryDelay: 2s` 是誤導）。新模型給的額度特別少。

所以預設把額度寬鬆、速度快的 **lite 排在最前面**，flash 留作備援：

```bash
# server/.env
GEMINI_MODELS=gemini-flash-lite-latest,gemini-3.1-flash-lite,gemini-3.6-flash,gemini-3.5-flash
```

前面的模型當天額度用完會自動換下一個，使用者無感。

### 為什麼選 flash-lite

同一句「午餐吃了一個雞腿便當、一杯無糖豆漿，還有兩顆茶葉蛋」的實測：

| 模型 | 速度 | 辨識項數 | 估算合計 |
|---|---|---|---|
| `gemini-3.6-flash` | 5.0s | 3 項 | 1100 kcal / P66g |
| `gemini-3.5-flash` | 16.4s | 3 項 | 1090 kcal / P62g |
| **`gemini-flash-lite-latest`** | **1.0s** | **3 項** | **1010 kcal / P60g** |
| `gemini-3.1-flash-lite` | 1.2s | 3 項 | 990 kcal / P52g |
| ~~`gemini-3.5-flash-lite`~~ | 0.7s | **1 項（漏記兩樣）** | 750 kcal / P35g |

`flash-lite-latest` 的估算跟 flash 幾乎一樣但快 5 倍，所以排第一。
`gemini-3.5-flash-lite` 會漏記食物項目，**刻意不放進候補鏈**。

### 一則訊息會用掉幾次

| 情境 | 請求數 |
|---|---|
| 純提問（「深蹲要注意什麼」） | 1 |
| 要寫入紀錄（「我吃了…」） | 2 |
| 照片辨識 | 2（token 較多，但請求數一樣） |

寫入要 2 次是因為 Gemini **不會**在呼叫工具的同一則回應裡附帶文字（已實測驗證），
必須把工具結果送回去才拿得到教練的回覆。這省不掉。

### 查目前用量

```bash
curl -s -b cookie.txt http://localhost:3000/api/health | python3 -m json.tool
```

```json
{ "model": "gemini-flash-lite-latest",
  "models": [
    { "model": "gemini-flash-lite-latest", "available": true,  "usedToday": 3, "resetsAt": null },
    { "model": "gemini-3.6-flash",         "available": false, "usedToday": 20,
      "resetsAt": "2026-09-23T00:00:05.000Z" } ] }
```

`usedToday` 是後端自己算的（重試也計入），伺服器重啟會歸零，跨日自動清空。

### 其他行為

- 429 且配額類型是 `PerDay` → 標記「今天別再試」，**立刻**換下一個，不浪費時間空等
- 429 且是 `PerMinute` → 照 API 給的 `retryDelay` 等待後重試
- 503（模型排隊中）→ 指數退避重試，仍失敗就換下一個
- `gemini-flash-lite-latest` 不支援 `thinkingConfig`，這點已寫死在程式裡，
  避免每次重啟都浪費一次請求去試探；清單外的模型若回 400 仍會自動偵測
- 同一則訊息的多輪工具呼叫固定用同一個模型
- `MAX_TOOL_ROUNDS` 設成 3，單則訊息最多 3 次請求

> `gemini-2.5-*` 系列已對新帳號停用，會回 404。查可用模型：
> ```bash
> curl -s -H "x-goog-api-key: $GEMINI_API_KEY" >   "https://generativelanguage.googleapis.com/v1beta/models" | grep '"name"'
> ```

`GEMINI_THINKING_BUDGET` 預設 0（關閉思考、最快最省）。
覺得估算不夠準可以設 `512`，但會更快吃完額度。

## 讓區網外的手機也能用

`./start.sh` 已經包含通道，不需要另外開一個終端機：

```bash
./start.sh            # 後端 + 通道（方式看 .env 的 TUNNEL_PROVIDER）
./start.sh --local    # 只跑後端，不開外網
./start.sh ngrok      # 這次改用指定方式（quick / ngrok / cloudflare）
```

輸出長這樣：

```
─────────────────────────────────────────────
  本機      http://localhost:3000
  外網      https://xxx.ngrok-free.dev

  紀錄檔    .logs/server.log、.logs/tunnel.log
  Ctrl+C    一起停止
─────────────────────────────────────────────
```

兩個程序的輸出都寫進 `.logs/`，畫面只留重點。任一個掛掉會立刻提示。
沒有任何帳號設密碼時會自動**不開**外網通道，只跑本機。

`tunnel.sh` 仍然可以單獨執行（後端已經在跑、只想重開通道時用）。

支援三種方式，差別在**網址會不會變**：

| 方式 | 網址 | 需要什麼 | 限制 |
|---|---|---|---|
| `quick`（預設） | 每次重開都變 | 什麼都不用 | — |
| **`ngrok`** | **固定，永久不變** | 免費帳號的 authtoken | 每月 1GB 流量 / 2 萬次請求 |
| `cloudflare` | 固定，用自己的網域 | 一個已加入 Cloudflare 的網域 | 無流量上限 |

### 固定網址：ngrok（推薦，不需要自己的網域）

ngrok 免費帳號會配發一個**永久固定**的網址（像 `abc-123-xyz.ngrok-free.dev`），
不會過期也不會變。設定約 3 分鐘：

1. 到 <https://dashboard.ngrok.com/signup> 註冊
2. 複製 <https://dashboard.ngrok.com/get-started/your-authtoken> 的 authtoken
3. 在 <https://dashboard.ngrok.com/domains> 看你被配發的網址
4. 填進 `server/.env`：

   ```bash
   TUNNEL_PROVIDER=ngrok
   NGROK_AUTHTOKEN=你的token
   NGROK_DOMAIN=abc-123-xyz.ngrok-free.dev
   ```

5. `./tunnel.sh`

之後手機書籤存那個網址就好，不用每次重新要網址。
免費額度每月 1GB／2 萬次請求，以這個 App 的用量（一張壓縮照片約 30KB）非常夠。

### 固定網址：Cloudflare 具名通道（需要自己的網域）

沒有流量上限，但前提是你有一個網域且已加入 Cloudflare。

```bash
./.tools/cloudflared tunnel login                        # 瀏覽器授權，選你的網域
./.tools/cloudflared tunnel create fit
./.tools/cloudflared tunnel route dns fit fit.你的網域.com
```

然後在 `server/.env` 設定：

```bash
TUNNEL_PROVIDER=cloudflare
TUNNEL_NAME=fit
TUNNEL_HOSTNAME=fit.你的網域.com
```

### 還有一個選擇：Tailscale Funnel

固定網址（`裝置名.你的tailnet.ts.net`）、免費、對方也**不用**裝 Tailscale。
沒有做進 `tunnel.sh` 是因為它要在 WSL 裡安裝 daemon（需要 sudo，
且要用 `--tun=userspace-networking` 才跑得起來），比前兩種麻煩。
想試的話看 <https://tailscale.com/kb/1223/funnel>。

### 安全性

沒有任何帳號設密碼時 `tunnel.sh` 會拒絕開通道。密碼設在 `server/.env` 的 `PASSWORD_MARTINA` / `PASSWORD_ELI`，
改完重啟後端即可（改密碼會讓所有裝置自動登出，因為 cookie 簽章金鑰由密碼推導）。

- 未登入時所有 `/api/*` 與 `/uploads/*` 一律 401，只有前端靜態檔放行（登入畫面要載得起來）
- 密碼比對用 `timingSafeEqual`，避免用回應時間猜密碼
- 所有帳號都比對過一輪才回傳，不讓回應時間洩漏「哪個帳號存在」
- 登入失敗 10 分鐘內 8 次就鎖住
- 走 https 時 cookie 自動帶上 `Secure` 旗標（看 `x-forwarded-proto`），登入效期 30 天
- 跨帳號只能讀不能寫：`?user=<id>` 可查對方紀錄，想改會回 403

## 定時熱量提醒（手機推播）

每天 **12:00、15:00、18:00、21:00** 自動計算當天吃了多少，落後或超標就推播到手機。

### 怎麼開啟

每台裝置都要各自打開一次（訂閱是綁裝置的）：

1. 手機打開 App → 右上角 **🔔** → **開啟提醒** → 允許通知
2. 可以按「立刻測試一次」確認收得到

> iPhone 必須先用 Safari 的「分享 → 加入主畫面」把 App 裝起來，
> 從主畫面開啟後才收得到推播（Safari 的限制，瀏覽器分頁裡不行）。

### 判斷標準

不是把目標平均分配 —— 12 點通常只吃了早餐加午餐，到晚上才該接近全天目標：

| 時間 | 應該吃到 | Martina（2010 kcal）|
|---|---|---|
| 12:00 | 35% | 約 700 kcal |
| 15:00 | 55% | 約 1100 kcal |
| 18:00 | 75% | 約 1500 kcal |
| 21:00 | 100% | 2010 kcal |

超出或落後全天目標的 **12%** 才會提醒「不足」或「過多」，避免一點點誤差就一直跳通知。
通知內容會寫目前熱量、蛋白質、以及接下來該怎麼補。

要改時間就編輯 `server/.env` 的 `NOTIFY_HOURS`（24 小時制，逗號分隔），重啟後端生效。
進度正常時不想收到通知的話，加一行 `NOTIFY_ON_TRACK=false`。

### 限制

- **電腦上的服務要開著**才會發通知（`./start.sh` 有在跑）。關機、睡眠期間不會補送
- 通知是 Web Push，Android 走 Google 的推播服務，手機要有網路
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` 一旦更換，所有裝置都要重新訂閱

## 用 Docker 跑在別台主機

單一容器就包含後端、打包好的前端與 SQLite。**不需要** WSL、不需要那套 `.tools/`
可攜工具鏈，只要有 Docker 的機器都能跑。

### 快速啟動

```bash
cp docker/env.example docker/env    # 填 GEMINI_API_KEY 與兩組密碼
docker compose up -d
```

開 <http://localhost:3000>。資料存在名為 `fit-data` 的 volume，重建容器不會掉。

不想用 compose 也可以：

```bash
docker build -t fit .
docker run -d -p 3000:3000 -v fit-data:/data --env-file docker/env --name fit fit
```

### 帶著現有紀錄一起搬

預設建出來的映像是**空的**，第一次啟動會自動建立空白資料庫。
要把目前的飲食、訓練、對話、照片一起帶走：

```bash
./docker-export.sh          # 匯出到 docker/seed/
docker build -t fit .       # 種子會被打進映像
```

容器啟動時若 `/data` 是空的，就從 `/seed` 植入；已經有資料則**不會**覆蓋，
所以重啟、升級映像都不會動到使用者後來記的東西。

`docker-export.sh` 用的是 `VACUUM INTO` 而不是 `cp`。WAL 模式下直接複製 `.db`
會漏掉還沒寫回主檔的資料，產出的種子看起來正常、實際上少了最近的紀錄。

想改回空白映像：`./docker-export.sh --clear`

### 搬到另一台主機

映像裡有真實的健康紀錄，**不要推到公開的 registry**。用檔案搬：

```bash
docker save fit:latest | gzip > fit.tar.gz     # 約 290MB（資料佔 10MB 左右）
# 複製到目標主機後
gunzip -c fit.tar.gz | docker load
docker run -d -p 3000:3000 -v fit-data:/data --env-file env fit
```

或推到自己的**私有** registry。

### 時區一定要設

`TZ`（預設 `Asia/Taipei`）不是裝飾用的。SQLite 的 `datetime('now','localtime')`、
每日彙總的日期切分、定時提醒的觸發時間全都看它。不設的話容器是 UTC，
台灣會差 8 小時 —— 晚上 8 點後記的那一餐會被算到隔天。
映像裡有裝 `tzdata`，所以 `TZ` 設了就會生效。

### 映像裡有什麼、沒有什麼

| | |
|---|---|
| 有 | Node 24（內建 `node:sqlite`，沒有原生模組要編譯）、後端、打包好的前端、`tzdata` |
| 沒有 | API key、密碼、VAPID 金鑰 —— 全部執行時由環境變數給 |
| 沒有 | 外網通道。`start.sh` / `tunnel.sh` 只在宿主機上用，容器只負責聽 :3000 |

要讓外網連得到，在目標主機前面擺你自己的反向代理（Caddy、Nginx、Cloudflare Tunnel），
或照 [讓區網外的手機也能用](#讓區網外的手機也能用) 的做法在宿主機上開通道指向 `:3000`。

容器以非 root 的 `node` 使用者執行；entrypoint 會先修好 `/data` 的擁有者再降權，
所以 bind mount 一個宿主機目錄（`-v ./data:/data`）也不會有權限問題。

## 裝成手機 App（PWA）

這個網站本身就是 PWA，Android 可以直接「安裝」成獨立 App：有自己的圖示、全螢幕、
沒有瀏覽器網址列，從桌面點開就用，跟原生 App 幾乎沒差別。

### 怎麼裝

1. 先確定用的是 **https 網址**（`./tunnel.sh` 開出來的那個）。
   PWA 規定必須是安全來源，`http://192.168.x.x:3000` 這種區網位址裝不起來。
2. 手機 Chrome 打開網址、登入
3. 右上角會出現「📲 安裝」按鈕，按下去即可
   （沒出現的話用 Chrome 選單 →「安裝應用程式」／「加到主畫面」）

> **搭配固定網址使用**。用 `quick` 通道的話網址每次都會變，裝好的 App 下次就打不開了。
> 先照上面設定 ngrok 拿固定網址再安裝。

### 組成

| 檔案 | 用途 |
|---|---|
| `web/public/manifest.webmanifest` | App 名稱、圖示、啟動網址、`display: standalone` |
| `web/public/sw.js` | Service worker：快取程式本體，讓開啟變快 |
| `web/public/icon-*.png` | 圖示，用 `npm run icons` 產生（程式畫的，不需繪圖軟體） |

換圖示的話改 `web/tools/make-icons.mjs` 裡的顏色或形狀，再跑：

```bash
cd web && npm run icons && npm run build
```

### Service worker 只快取公開靜態檔

`/api/*` 與 `/uploads/*` 完全不進快取，一律走網路。
那些是登入後才拿得到的個人資料（飲食紀錄、餐點照片），
快取起來會變成登出後或換人用時還讀得到。

所以這個 App **不能離線使用**——沒網路時能開起來，但看不到資料。
資料本來就在你電腦的資料庫，手機只是前端。

### 想要真正的 .apk？

PWA 已經能滿足絕大部分需求。真的需要 apk（例如要上架 Play Store）可以用
[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) 把 PWA 包成 TWA：

```bash
npx @bubblewrap/cli init --manifest https://你的固定網址/manifest.webmanifest
npx @bubblewrap/cli build
```

需要 JDK 與 Android SDK，而且網域要放一份 `assetlinks.json` 做驗證，
否則 App 裡會出現網址列。

## 目錄結構

```
fit/
├── .tools/node/          # 給 WSL 用的可攜式 Node 24（不需 sudo）
├── .tools/cloudflared    # 外網通道（第一次跑 tunnel.sh 時自動下載）
├── .tools/ngrok          # 固定網址用（同上）
├── server/
│   ├── src/
│   │   ├── server.js     # Fastify 進入點，正式模式兼任靜態檔伺服器
│   │   ├── db.js         # SQLite schema、欄位遷移、營養目標公式
│   │   ├── records.js    # 訓練／飲食／體重的新增查詢統計
│   │   ├── auth.js       # 密碼登入、cookie、嘗試次數限制
│   │   ├── uploads.js    # 照片存檔與格式／大小檢查
│   │   ├── gemini.js     # Gemini 客戶端：模型候補鏈、配額偵測、重試
│   │   ├── coach.js      # 系統提示、工具定義、function calling 迴圈
│   │   └── routes/
│   │       ├── api.js    # REST API
│   │       └── chat.js   # 對話 API
│   ├── tools/query.mjs   # 資料庫查詢工具（db.sh 呼叫它）
│   ├── data/fit.db       # 資料庫（自動建立）
│   ├── data/uploads/     # 餐點照片
│   └── .env              # API key 與密碼（不進版控）
├── web/                  # Vue 前端
├── Dockerfile            # 後端+前端+資料的單一容器
├── docker-compose.yml
├── docker-export.sh      # 把現有資料庫匯出成映像種子
├── docker/
│   ├── entrypoint.sh     # 植入種子、修 volume 權限、降權
│   ├── env.example
│   └── seed/             # 匯出的 .db（不進版控）
├── start.sh              # 正式模式
├── dev.sh                # 開發模式
├── db.sh                 # 查看資料庫
├── backup.sh             # 備份（WAL-safe）
└── tunnel.sh             # 開放到外網
```

## API

```
GET    /api/session              目前是否需要登入、是否已登入
POST   /api/login                { "password": "..." }
POST   /api/logout
GET    /api/health
GET    /api/profile              PUT /api/profile
GET    /api/meals                POST /api/meals     PATCH/DELETE /api/meals/:id
GET    /api/workouts             POST /api/workouts  PATCH/DELETE /api/workouts/:id
GET    /api/weights              POST /api/weights   DELETE /api/weights/:id
GET    /api/summary/daily?date=YYYY-MM-DD
GET    /api/summary/range?days=14
POST   /api/chat                 { "message": "...", "image": "data:image/jpeg;base64,..." }
GET    /api/chat/history         DELETE /api/chat/history
GET    /uploads/<檔名>            餐點照片（需登入）
```

除了 `/api/session`、`/api/login`、`/api/logout` 之外，全部需要登入 cookie。

## 查看資料庫

所有紀錄都存在 SQLite：`server/data/fit.db`。

| 資料表 | 內容 |
|---|---|
| `meals` | 飲食紀錄（含 `photo` 照片檔名、`source` 來源：manual / ai / photo） |
| `workouts` | 訓練紀錄 |
| `weights` | 體重紀錄 |
| `chat_messages` | 對話紀錄（含 `actions` 該則訊息觸發的工具呼叫、`image` 照片 id） |
| `photos` | 照片本體（BLOB）。獨立一張表，所以查飲食紀錄時不會掃到 BLOB 頁面 |
| `profile` | 個人檔案與營養目標 |

### 方法一：網頁

「訓練」「飲食」分頁就是紀錄列表，「今日」有當日明細與 14 天趨勢圖，
對話紀錄在「教練」分頁往上捲。

### 方法二：`./db.sh`（WSL 裡沒有 `sqlite3` 指令，這支用 Node 內建的 `node:sqlite` 代勞）

```bash
./db.sh                # 全部總覽：每日彙總 + 四張表
./db.sh meals          # 只看飲食
./db.sh workouts       # 只看訓練
./db.sh weights        # 只看體重
./db.sh chat           # 只看對話紀錄
./db.sh profile        # 個人檔案
./db.sh days           # 每日彙總（熱量／蛋白質／訓練量／體重）
./db.sh photos         # 照片清單（大小、關聯到幾筆紀錄，不含 BLOB 本體）
```

也可以直接寫 SQL（**唯讀**，只接受 `SELECT`，打錯不會弄壞資料）：

```bash
./db.sh "SELECT date, ROUND(SUM(kcal)) 熱量 FROM meals GROUP BY date ORDER BY date DESC"
./db.sh "SELECT * FROM meals WHERE source = 'photo'"
./db.sh "SELECT exercise, MAX(weight_kg) FROM workouts GROUP BY exercise"
```

第一個參數給使用者名稱就能切換資料庫：

```bash
./db.sh martina            # 她的全部總覽
./db.sh martina meals      # 只看飲食
./db.sh martina photos     # 照片清單
```

輸出範例：

```
── 飲食紀錄（meals）
  日期        餐別       食物      份量  熱量  蛋白質  碳水  脂肪  來源   照片
  ──────────  ─────────  ────────  ────  ────  ──────  ────  ────  ─────  ────
  2026-09-22  lunch      雞腿便當  1個   800   38      95    28    photo  有
  2026-09-22  breakfast  水煮蛋    2顆   140   13      1     10    ai
```

### 方法三：API

```bash
# 先登入拿 cookie
curl -s -c cookie.txt -X POST http://localhost:3000/api/login \
  -H "content-type: application/json" -d '{"password":"你的密碼"}'

curl -s -b cookie.txt http://localhost:3000/api/meals
curl -s -b cookie.txt http://localhost:3000/api/chat/history
```

### 方法四：GUI 工具

`server/data/fit.db` 是標準 SQLite 檔案，用 Windows 上的
[DB Browser for SQLite](https://sqlitebrowser.org/) 打開 `D:\claudeit\server\datait.db` 即可。

> 打開前先停掉後端，或至少不要在 GUI 裡寫入——資料庫開著 WAL 模式，同時寫入可能衝突。

## 照片怎麼存的

**全部存在資料庫裡**（`photos` 表的 BLOB 欄位），不是檔案。

這樣做的理由：備份只要複製 `fit.db` 一個檔，不會有「紀錄刪了、照片還留在資料夾」的孤兒檔，
資料庫搬到別台機器照片也跟著走。照片經前端壓縮後一張約 20–40KB，一天幾張的用量
SQLite 完全吃得消（BLOB 放在獨立資料表，查飲食紀錄時不會掃到）。

取用路徑是 `GET /uploads/<照片id>`，由後端從資料庫讀出來吐給瀏覽器，一樣需要登入。

### 從舊版（存檔案）升級

啟動時會自動把 `data/uploads/` 裡還沒進資料庫的照片搬進去，並印出：

```
[db] 已將 5 張照片從檔案搬進資料庫（原始檔案保留在 data/uploads/）
```

**原始檔案刻意保留不刪**。確認網頁上照片都正常顯示之後，可以自己清掉：

```bash
./db.sh photos          # 先確認照片都在資料庫裡
rm -rf server/data/uploads/*
```

### 找出沒人用的照片

```bash
./db.sh "SELECT id, ROUND(size/1024.0) KB, created_at FROM photos
         WHERE id NOT IN (SELECT photo FROM meals WHERE photo != '')
           AND id NOT IN (SELECT image FROM chat_messages WHERE image != '')"
```

刪掉紀錄不會自動刪照片（保守作法，避免同一張照片被多筆紀錄共用時誤刪）。

## 備份

```bash
./backup.sh                      # 存到 backups/fit-YYYYMMDD-HHMMSS.db
./backup.sh ~/我的備份.db         # 或自己指定路徑
```

產出的是**單一完整檔案**，飲食、訓練、對話、照片全都在裡面。

**不要用 `cp server/data/fit.db`**：資料庫開著 WAL 模式，最近的寫入可能還在
`fit.db-wal` 裡沒進主檔，直接複製會得到一個看起來正常、實際上缺資料的檔案。
`backup.sh` 用 SQLite 的 `VACUUM INTO`，會把 WAL 內容一併寫進去，後端執行中也能安全備份。

還原：停掉後端 → 把備份檔複製回 `server/data/fit.db` → 刪掉 `fit.db-wal` 與 `fit.db-shm` → 重新啟動。

## 開發／測試注意

測試時用 `FIT_DB` 指到拋棄式資料庫，不要打正式資料：

```bash
FIT_DB=/tmp/test.db node src/server.js
```

`DELETE /api/chat/history` 會清空全部對話紀錄，對著正式資料庫跑測試腳本很容易誤刪。

## 提醒

AI 教練的建議僅供參考，不是醫療建議。BMI 偏低時若出現長期吃不下、經期異常、體重持續下降等狀況，請找醫師或註冊營養師。
