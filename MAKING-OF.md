# 這個 App 是怎麼做出來的

一份給教學與研究用的完整製作紀錄。

這是一個**真正在用的**個人增肌教練 App：跟 LLM 用中文聊天就能記錄飲食與訓練，拍一張便當照片就能估熱量寫進資料庫，手機上是獨立 App，到了吃飯時間會主動推播提醒你今天還差多少熱量。它跑在一台 Windows 筆電的 WSL 裡，透過通道讓外網的手機連得到。

下面不只寫「做了什麼」，更著重**為什麼這樣做**，以及**做錯過什麼**。對讀這份文件的人來說，後者通常更有用——每一段「踩過的坑」都是實際發生過、有具體症狀與具體修法的。

---

## 目錄

1. [系統全貌](#1-系統全貌)
2. [環境決策：為什麼長這樣](#2-環境決策為什麼長這樣)
3. [資料層](#3-資料層)
4. [LLM 層：function calling 的完整機制](#4-llm-層function-calling-的完整機制)
5. [免費額度工程](#5-免費額度工程)
6. [照片 → 熱量的管線](#6-照片--熱量的管線)
7. [定時推播](#7-定時推播)
8. [PWA：讓網頁變成手機 App](#8-pwa讓網頁變成手機-app)
9. [讓外網的手機連得到](#9-讓外網的手機連得到)
10. [開機自動啟動與營運腳本](#10-開機自動啟動與營運腳本)
11. [身分驗證的生與死](#11-身分驗證的生與死)
12. [踩過的坑](#12-踩過的坑)
13. [從零重現](#13-從零重現)
14. [安全性與已知限制](#14-安全性與已知限制)
15. [可以拿這個專案教什麼](#15-可以拿這個專案教什麼)

---

## 1. 系統全貌

```
手機 / 瀏覽器
   │  PWA（Vue 3 + Vite，打包成靜態檔）
   │
   ├── HTTPS ──→ ngrok / Cloudflare 通道 ──┐
   │                                       │
   └── HTTP ─────────── 區網 ─────────────→ Fastify :3000（WSL Ubuntu）
                                           │
                        ┌──────────────────┼──────────────────┐
                        │                  │                  │
                   REST /api/*        靜態檔（web/dist）   /uploads/:id
                        │                                  （照片 BLOB）
          ┌─────────────┼─────────────┐
          │             │             │
    node:sqlite    Gemini API    web-push
    （每人一個檔）  （function     （VAPID）
                     calling）
```

**技術選擇一覽**

| 層 | 選擇 | 關鍵理由 |
|---|---|---|
| 前端 | Vue 3 + Vite + vue-router | 單檔元件好讀，Vite 打包快，產物是純靜態檔 |
| 後端 | Fastify 5（ESM） | 輕、schema 友善、`addContentTypeParser` 容易改 |
| 資料庫 | Node 內建 `node:sqlite` | **不需編譯原生模組**（見 §2） |
| LLM | Gemini REST `generateContent` | 免費方案可用、支援 function calling 與圖片輸入 |
| 推播 | Web Push + VAPID | 不需 FCM 專案，手機裝成 PWA 後可收系統通知 |
| 對外 | ngrok 固定網域 | 免費帳號就有永久網址，不必動路由器 |

檔案地圖：

```
server/src/
  server.js      Fastify 進入點，正式模式兼靜態檔伺服器
  users.js       使用者清單（身分的唯一來源）
  db.js          schema、欄位遷移、營養目標公式、連線池
  records.js     飲食／訓練／體重的新增查詢統計
  gemini.js      模型候補鏈、配額偵測、重試
  coach.js       系統提示、8 個工具定義、function calling 迴圈
  uploads.js     照片解析與存取
  push.js        VAPID、訂閱管理、熱量進度判斷
  scheduler.js   定時提醒排程
  routes/        api.js（REST）／chat.js（對話）／push.js（訂閱）
web/src/
  App.vue        外框、分頁、安裝按鈕
  views/         ChatView／TodayView／WorkoutsView／MealsView
  components/    TrendChart／MacroMeter／PhotoViewer／ModelPicker／NotifyToggle
start.sh  tunnel.sh  status.sh  stop.sh  backup.sh  db.sh  dev.sh
```

---

## 2. 環境決策：為什麼長這樣

### 2.1 全部裝在專案資料夾裡，不用 sudo

這台機器是 Windows + WSL Ubuntu。需求是「環境皆安裝在此資料夾」，所以：

- Node 24 以 **可攜版**解壓到 `.tools/node/`，由 `start.sh` 把它加進 `PATH`：
  ```bash
  export PATH="$PWD/.tools/node/bin:$PATH"
  ```
- `ngrok` / `cloudflared` 也下載到 `.tools/`，第一次用才抓（`tunnel.sh` 的 `fetch_bin`）。
- 整個 `.tools/` 約 4GB（含後來為了測 PWA 裝的 Android SDK），**不進版控**。

好處是這台機器的系統環境完全沒被動過，整個專案刪掉就乾淨了。壞處是每個腳本都要記得設 `PATH`。

### 2.2 為什麼用 `node:sqlite` 而不是 `better-sqlite3`

這是整個專案最省事的一個決定。

`better-sqlite3` 是 native addon，`npm install` 時要編譯，在 WSL 上要先有 `build-essential`、`python3`，而那需要 `sudo apt install`。Node 22 之後內建了 `node:sqlite`，API 幾乎一樣：

```js
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('fit-eli.db');
db.prepare('SELECT * FROM meals WHERE date = ?').all('2026-10-07');
```

**零編譯、零依賴**。對「不想碰系統」的需求是決定性的優勢。

> 教學點：選依賴時，「要不要編譯」往往比「API 好不好用」影響更大，尤其在受限環境（無 sudo、CI、容器、Windows）。

---

## 3. 資料層

### 3.1 一人一個資料庫檔

```js
export const dbPath = (userId) => join(DATA_DIR, `fit-${userId}.db`);
```

不是在一張表裡加 `user_id` 欄位，而是**整個檔案分開**。原因：

- 需求是「資料庫分開來存」，而且兩人只需互看彼此的飲食與訓練——跨使用者讀取的場景很窄。
- 不用在每條 SQL 上掛 `WHERE user_id = ?`，**不可能寫漏**。權限錯誤的代價是看到別人的健康紀錄，這種錯誤值得用架構排除而不是靠紀律。
- 備份、搬移、停用一個人，都是檔案層級的操作（後來真的用上了，見 §11）。

代價：跨使用者彙總要開多個連線。這個 App 不需要，所以不是問題。

連線用 Map 快取，第一次取用時建檔、建 schema、塞入初始 profile：

```js
const connections = new Map();
export function getDb(userId) {
  if (connections.has(userId)) return connections.get(userId);
  const db = new DatabaseSync(dbPath(userId));
  createSchema(db);
  seedProfile(db, user);
  connections.set(userId, db);
  return db;
}
```

### 3.2 Schema

七張表：`profile`（固定一列，`CHECK (id = 1)`）、`meals`、`workouts`、`weights`、`photos`、`push_subscriptions`、`chat_messages`。

兩個值得一提的設計：

**`profile` 只有一列。** 用 `CHECK (id = 1)` 把它鎖成單列表，讀寫都不必帶條件，也不可能意外插入第二份個人檔案。

**`chat_messages.actions` 存 JSON。** 每則教練回覆連帶存下「這一輪實際呼叫了哪些工具、參數是什麼、結果是什麼」：

```sql
CREATE TABLE chat_messages (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  role    TEXT NOT NULL,
  content TEXT NOT NULL,
  actions TEXT NOT NULL DEFAULT '[]',   -- JSON
  ...
);
```

這不只是為了顯示。`undo_last_meal`（「反悔」）就是靠讀回這個欄位才知道「上一次記了哪幾筆」——詳見 §4.8。

### 3.3 欄位遷移

`CREATE TABLE IF NOT EXISTS` 對已存在的表不會加欄位，所以需求長出新欄位時要自己補：

```js
const addColumn = (table, column, definition) => {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.some(c => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
};
addColumn('meals', 'photo', "TEXT NOT NULL DEFAULT ''");
addColumn('chat_messages', 'image', "TEXT NOT NULL DEFAULT ''");
addColumn('chat_messages', 'model', "TEXT NOT NULL DEFAULT ''");
```

小專案不需要 migration 框架，但需要**冪等**：每次啟動都跑，已經有的就跳過。

### 3.4 照片存進資料庫

一開始照片存在 `data/uploads/` 下，DB 只記檔名。後來改成存進 `photos` 表的 BLOB：

```sql
CREATE TABLE photos (
  id   TEXT PRIMARY KEY,     -- "uuid.jpg"，沿用舊檔名格式
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BLOB NOT NULL,
  ...
);
```

理由：**備份只要複製一個檔案**，不會出現「資料庫搬走了但照片留在原地」。前端壓縮後一張約 20–40KB，一天幾張，SQLite 完全吃得消；BLOB 放在獨立表，查飲食紀錄時不會掃到。

舊照片的搬移寫成啟動時的冪等步驟，而且**只撿這個資料庫真的有引用到的檔案**：

```js
const used = db.prepare(
  "SELECT photo FROM meals WHERE photo != '' UNION SELECT image FROM chat_messages WHERE image != ''"
).all().map(r => r.photo ?? r.image);
if (!used.length) return;   // 這個資料庫沒引用任何舊照片就不要撿
```

少了這個判斷，第二個使用者的資料庫會把前一個人的照片全部吸進去。

### 3.5 營養目標公式

Mifflin-St Jeor 算 BMR，乘活動係數得 TDEE，再依目標加減 350 kcal：

```js
const s = sex === 'male' ? 5 : -161;
const bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + s;
const tdee = bmr * activity;
const surplus = goal === 'muscle_gain' ? 350 : goal === 'fat_loss' ? -350 : 0;
const kcal = Math.round((tdee + surplus) / 10) * 10;

// 體重過輕時以目標體重算蛋白質，避免蛋白質目標被低體重拖低
const proteinBase = Math.max(weight_kg, goal_weight_kg || weight_kg);
const protein = Math.round(proteinBase * 2.0);
const fat  = Math.round((kcal * 0.25) / 9);
const carb = Math.round((kcal - protein * 4 - fat * 9) / 4);
```

`proteinBase` 那行是為真實情境加的：40kg 要增肌到 48kg，照現體重算蛋白質只有 80g，太低。

---

## 4. LLM 層：function calling 的完整機制

這是整個專案的核心，也最值得細看。

### 4.1 誰決定要不要呼叫工具？

**是 LLM 決定的。** 這點常被誤解，所以講清楚。

後端做的事只有兩件：

1. 在請求裡附上一份「可用工具清單」（JSON Schema 格式的宣告）。
2. 把模式設成 `AUTO`：

```js
body.tools = [{ functionDeclarations: tools }];
body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
```

後端**沒有任何關鍵字判斷**。使用者說「我剛吃了一顆水煮蛋」，程式碼裡沒有一行寫著「看到『吃』就呼叫 log_meal」。是模型讀了工具的 `description`，自己決定要呼叫 `log_meal`，自己填好參數（包括**自己估算的熱量與營養素**）。

模型回來的不是文字，而是結構化的 `functionCall`：

```json
{ "functionCall": { "name": "log_meal",
    "args": { "meal_type": "breakfast", "name": "水煮蛋",
              "portion": "1 顆", "kcal": 78,
              "protein_g": 6, "carb_g": 0.6, "fat_g": 5 } } }
```

所以工具的 `description` 就是程式的一部分——它是寫給模型看的規格書。這也是為什麼 `log_meal` 的描述裡要寫到這種程度：

```
'把使用者吃過的一項食物寫進飲食紀錄。使用者只要提到「我吃了…」「剛才喝了…」就要呼叫。'
+ '若使用者沒給熱量與營養素，請依常見食物份量自行估算並填入（不要填 0）。一餐有多項食物時，一項呼叫一次。'
```

「不要填 0」和「一項呼叫一次」都是實測後補上的——不寫，模型就會填 0 或把整個便當記成一筆。

### 4.2 一次對話的完整封包往返

記一餐**至少要兩次 API 請求**。這點對免費額度的影響很大（§5）。

```
第 1 次請求 ──→ Gemini
  contents: [ ...歷史, {role:'user', parts:[{text:'我剛吃了一顆水煮蛋'}]} ]
  tools:    [ 8 個工具宣告 ]
                ↓
            回傳 parts: [ {functionCall:{name:'log_meal', args:{...}}} ]
            （注意：此時沒有任何文字回覆）

伺服器端執行 runTool() → 真的 INSERT 進 SQLite
                ↓
第 2 次請求 ──→ Gemini
  contents: [ ...,
              {role:'model', parts:[{functionCall:...}]},        ← 把模型的呼叫放回去
              {role:'user',  parts:[{functionResponse:{          ← 工具結果
                 name:'log_meal',
                 response:{ result:{ ok:true, saved:{...},
                                     今日累計:'78kcal / 蛋白質 6g',
                                     還差:'2312kcal、蛋白質 158g' } } }}]} ]
                ↓
            回傳 parts: [ {text:'記下來了，水煮蛋 78 kcal。今天還差 2312 kcal…'} ]
```

三個容易踩錯的細節：

**(a) 工具結果的 role 是 `'user'`，不是 `'function'` 或 `'tool'`。** Gemini 的格式就是這樣：
```js
contents.push({ role: 'user', parts: responseParts });
```

**(b) 模型的 `functionCall` 必須原封不動放回 `contents`。** 少了這一步，第二次請求的對話歷史不連貫，模型不知道自己剛做了什麼。

**(c) 回傳 `functionCall` 的那一輪不會同時有文字。** 實測確認過：模型要嘛呼叫工具，要嘛講話，不會兩者兼具。所以「記一餐並回覆一句話」必然是兩次請求。

工具結果裡刻意塞進 `今日累計` 和 `還差`，模型才有材料在回覆裡講出「今天還差 2312 kcal」——**不必再查一次資料庫**。

### 4.3 八個工具

| 工具 | 用途 | 設計要點 |
|---|---|---|
| `log_meal` | 記一項食物 | 一項一次呼叫；營養素必填，逼模型估算 |
| `log_workout` | 記一個動作 | 有氧填 `duration_min`，重訓填 `sets/reps/weight_kg` |
| `log_weight` | 記體重 | `date` 有 UNIQUE 約束，同一天覆寫 |
| `edit_meal` | 改一筆飲食 | 只填要改的欄位；份量改了要重估營養素 |
| `delete_meal` | 刪指定筆 | `ids` 是陣列，可一次多筆 |
| `undo_last_meal` | 撤銷上一批 | **無參數**（見 §4.5 的地雷三） |
| `update_goal` | 改目標並重算 | 見 §4.6 |
| `get_records` | 查歷史 | 避免模型憑空編數字 |

`edit_meal` / `delete_meal` 需要知道 id。做法是把最近 7 天的紀錄連同 `#編號` 直接塞進系統提示的【目前資料庫狀況】區塊，模型自然就有 id 可用，不必多一輪 `get_records`——**又省一次請求**。

### 4.4 多輪迴圈

一句話可能同時交代好幾件事（「吻仔魚應該 3-5g 而已，再附上蕨餅」＝改一筆 ＋ 加一筆）。模型可以在同一輪回傳多個 `functionCall`，但也可能要分輪做。所以是迴圈：

```js
const MAX_TOOL_ROUNDS = 3;   // 每輪都是一次 API 請求，免費額度以「每天幾次」計

async function runRounds(maxRounds) {
  let text = '';
  for (let round = 0; round < maxRounds; round++) {
    const { candidate, model } = await generateContent({ contents, systemInstruction, tools, preferModel: usedModel });
    usedModel = model;                       // 同一輪對話固定用同一個模型
    const parts = candidate.content?.parts || [];
    const calls = partsToCalls(parts);
    const t = partsToText(parts);
    if (t) text = t;

    if (!calls.length) break;                // 不再呼叫工具 → 結束

    contents.push({ role: 'model', parts });
    const responseParts = [];
    for (const call of calls) {
      let result;
      try { result = runTool(userId, call.name, call.args || {}, image?.file || ''); }
      catch (err) { result = { error: String(err.message || err) }; }
      actions.push({ tool: call.name, args: call.args || {}, result });
      responseParts.push({ functionResponse: { name: call.name, response: { result } } });
    }
    contents.push({ role: 'user', parts: responseParts });
  }
  return text;
}
```

`MAX_TOOL_ROUNDS = 3` 是額度與能力的折衷：3 輪足夠處理「改＋加＋回覆」，又不會一句話燒掉十次請求。

### 4.5 Gemini schema 的三個地雷

都是實際撞到 400 才發現的：

**地雷一：`NUMBER` 型別不接受 `enum`。**
活動係數只能是 1.2 / 1.375 / 1.55 / 1.725，自然想寫 `enum: [1.2, 1.375, ...]` ——Gemini 回 400。改成在 `description` 裡講清楚，再於程式端**吸附到最近的合法值**：

```js
if (patch.activity != null) {
  const levels = [1.2, 1.375, 1.55, 1.725];
  patch.activity = levels.reduce((a, b) =>
    Math.abs(b - patch.activity) < Math.abs(a - patch.activity) ? b : a);
}
```

> 通用原則：**永遠不要信任模型會遵守 schema 以外的約束**，在伺服器端收斂。

**地雷二：`STRING` 的 `enum` 可以用。** `meal_type`、`category`、`goal` 都用 `enum` 限制，這個沒問題。

**地雷三：`OBJECT` 不能有空的 `properties`。**
`undo_last_meal` 不需要參數，寫 `parameters: { type: 'OBJECT', properties: {} }` 會被拒。正解是**整個 `parameters` 不要給**：

```js
{
  name: 'undo_last_meal',
  description: '撤銷「上一次」記錄的飲食…',
  // 沒有參數：Gemini 不接受 properties 為空的 OBJECT，所以整個不給 parameters
}
```

### 4.6 LLM 改目標時，今日數字要跟著變

需求是：「透過 LLM 更改訓練目標時，也要一起更新今日的目標數值」。

關鍵在 `updateProfile` 的設計——**身體數據變了就重算四個營養目標，但使用者明確指定的數字優先**：

```js
const p = { ...before, ...clean };
const targets = recalc ? calcTargets(p) : {};
for (const k of TARGET_KEYS) {              // target_kcal / protein / carb / fat
  if (clean[k] !== undefined) targets[k] = Math.round(Number(clean[k]));   // 明確指定的優先
  else if (!recalc) targets[k] = p[k];
}
```

所以：

- 「目標體重改成 50 公斤」→ `goal_weight_kg` 變 → 四個目標全部重算
- 「蛋白質目標改成 120g」→ `target_protein_g` 直接用 120，其餘重算
- 今日頁面讀的就是 `profile` 的那四個欄位，所以**資料庫一改，畫面重新整理就同步**，不需要另外的同步機制

`update_goal` 的回傳還刻意帶上「修改前 / 修改後」對照，模型才講得出「熱量目標從 2010 升到 2190」。

### 4.7 防幻覺：核對「說了」與「做了」

**實際發生過的 bug。** 使用者說：

> 吻仔魚應該 3-5g 而已，再附上蕨餅

模型只呼叫了 `log_meal`（蕨餅），卻在回覆裡寫「吻仔魚的份量我幫妳微調一下」。飲食表單沒變，但使用者以為改了。這是最糟的一種失敗——**沉默的資料不一致**。

兩道防線：

**第一道，提示強化**（寫在系統提示裡）：
```
嚴禁在沒有呼叫工具的情況下說「已修改」「已調整」「已刪除」「已記錄」。沒做就不要說做了。
一句話裡可能同時有好幾件事，例如「吻仔魚應該 3-5g 而已，再附上蕨餅」＝ edit_meal（吻仔魚）＋ log_meal（蕨餅），
每一件都要各自呼叫工具，可以在同一輪一起呼叫。
```

**第二道，伺服器端事後核對。** 提示只能降低機率，不能保證。所以比對「回覆的文字宣稱做了什麼」與「`actions` 裡實際呼叫了什麼」：

```js
export function claimedButNotDone(userText, reply, actions) {
  const used = new Set(actions.map(a => a.tool));

  // 先確認使用者真的有「更正」的意思，否則模型只是在給建議
  //（「可以調整一下份量」）也會被誤判
  const userCorrects = /(應該|其實|不是|只有|而已|改|記錯|太多|太少|份量|分量|刪|不算|反悔|取消|沒吃|撤)/.test(userText);
  if (!userCorrects) return null;

  const claimsEdit = /(微調|修改|改成|改為|修正|更正|調整|改一下|幫妳改|幫你改)/.test(reply)
    && !used.has('edit_meal');
  const claimsDelete = /(刪除|刪掉|撤銷|撤回|移除|拿掉)/.test(reply)
    && !used.has('delete_meal') && !used.has('undo_last_meal');
  if (!claimsEdit && !claimsDelete) return null;

  return '（系統檢查，不是使用者說的話）你剛才的回覆說已經修改了飲食紀錄，'
    + '但這一輪並沒有呼叫 edit_meal，資料庫實際上沒有變。'
    + '如果使用者確實要求更正，現在就呼叫對應工具…做完後重新給一則完整回覆。';
}
```

偵測到落差就**把這段話當成一則使用者訊息送回去**，要模型補做，然後用新的回覆取代舊的：

```js
const gap = claimedButNotDone(userText, reply, actions);
if (gap) {
  contents.push({ role: 'model', parts: [{ text: reply }] });
  contents.push({ role: 'user',  parts: [{ text: gap }] });
  const fixed = await runRounds(MAX_TOOL_ROUNDS);
  if (fixed) reply = fixed;
}
```

兩個設計細節：

- **雙邊都要檢查。** 只看回覆的措辭會誤判（模型說「你可以調整一下份量」是建議，不是宣稱）。加上 `userCorrects` 這個前提後誤判大幅下降。
- **代價是多一次請求**，所以只在偵測到落差時才付。

> 教學點：LLM agent 的「驗證層」應該**檢查副作用是否發生**，而不是檢查文字是否合理。前者可程式化，後者不能。

### 4.8 「反悔」的語意設計

需求：「並在輸入反悔等字眼時刪除飲食之數據」。

這個需求藏著一個問題：「反悔」要刪**哪一筆**？

拍一張便當照片，模型會辨識出 5 樣食物，呼叫 5 次 `log_meal`。使用者說「反悔」，要刪的是**那 5 筆一起**，不是最後一筆。

所以不能用 `created_at DESC LIMIT 1`。改成讀對話紀錄：

```js
function lastLoggedMealIds(userId) {
  const row = getDb(userId)
    .prepare("SELECT actions FROM chat_messages WHERE role = 'assistant' AND actions LIKE '%log_meal%' ORDER BY id DESC LIMIT 1")
    .get();
  if (!row) return [];
  let actions = [];
  try { actions = JSON.parse(row.actions); } catch { return []; }

  // 只撤銷最近這一批；已經刪過就回空，不往前找更早的一批——
  // 不小心連說兩次「反悔」時，寧可什麼都不做，也不要刪到更早的正確紀錄
  return actions
    .filter(a => a.tool === 'log_meal' && a.result?.saved?.id)
    .map(a => a.result.saved.id)
    .filter(id => getMeal(userId, id));
}
```

`LIMIT 1` 是**故意的**，而且註解寫清楚了為什麼。連說兩次「反悔」時：

- 這樣寫 → 第二次回「上一次記錄的飲食已經被刪除過了」，什麼都不做
- 若往前找 → 第二次會刪掉**更早的、正確的**那一批

破壞性操作在語意不明時，**什麼都不做比猜錯好**。

---

## 5. 免費額度工程

Gemini 免費方案的限制比想像中嚴，而且**錯誤訊息會誤導你**。

### 5.1 一次誤診

使用者只輸入「9/22 早餐吃一顆水煮蛋」就撞到上限。錯誤裡寫著：

```
limit: 20, model: gemini-3.8-flash, retryDelay: 2s
```

`retryDelay: 2s` 看起來像「等 2 秒就好」，於是重試邏輯照著等 2 秒再送——結果**每次重試又消耗一次額度**，越重試越糟。

把完整錯誤 JSON 印出來才看到真相：

```json
{ "violations": [{ "quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
                   "quotaValue": "20" }] }
```

`PerDay`。每天 20 次，不是每分鐘。`retryDelay` 在這個情境下毫無意義。

### 5.2 修法：區分 PerDay 與 PerMinute

```js
function parseQuota(json) {
  const details = json?.error?.details || [];
  const violation = details.find(d => d.violations)?.violations?.[0] || {};
  const retryRaw = details.find(d => d.retryDelay)?.retryDelay || '';
  const seconds = Number(String(retryRaw).replace('s', '')) || 0;
  const id = violation.quotaId || '';
  return {
    perDay: /PerDay/i.test(id),          // ← 關鍵
    limit: violation.quotaValue,
    retryMs: Math.min(seconds * 1000 + 500, 30_000),
  };
}
```

```js
if (res.status === 429) {
  const q = parseQuota(json);
  if (q.perDay) {
    markExhaustedForToday(model);         // 記到今天結束，不要再試
    throw Object.assign(new GeminiError(msg, 429), { moveToNextModel: true, quotaPerDay: true });
  }
  if (attempt < MAX_ATTEMPTS) {           // PerMinute 才值得等
    await sleep(q.retryMs || backoff(attempt));
    continue;
  }
  ...
}
```

「記到今天結束」就是算到隔天凌晨：

```js
function markExhaustedForToday(model) {
  const t = new Date();
  t.setHours(24, 0, 5, 0);    // 明天 00:00:05
  exhaustedUntil.set(model, t.getTime());
}
```

> 教學點：遇到 rate limit，**先把完整錯誤物件印出來**。`retryDelay` 這類欄位在不同配額類型下含義完全不同，照著重試可能讓情況更糟。

### 5.3 模型候補鏈

既然每個模型每天各有額度，就排成鏈，用完換下一個：

```js
const DEFAULT_CHAIN = [
  'gemini-flash-lite-latest',   // 額度最寬、約 1 秒
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',           // 照片辨識最準
  'gemini-3.5-flash',           // 最後備援
];
```

排序依據是**在這個 App 的實際任務上量出來的**，不是看官方 benchmark：

- 同一句「雞腿便當＋豆漿＋兩顆茶葉蛋」比較估算結果
- 同一張照片比較辨識完整度
- 一句話同時要「改」又要「加」，看會不會漏做

量出來的結論：`flash-lite-latest` 的估算跟 `flash` 幾乎一樣（1010 vs 1100 kcal）但快 5 倍，所以排第一。`gemini-3.5-flash-lite` 會漏記食物項目，**不放進鏈裡**。

另外還記了三件事在記憶體裡，避免把額度浪費在已知打不通的路上：

```js
const exhaustedUntil = new Map();   // model -> 恢復時間
const noThinking = new Set(['gemini-flash-lite-latest']);   // 不吃 thinkingConfig 的模型
const usedToday = new Map();        // model -> 今天送出幾次
```

`noThinking` 這組：某些模型收到 `thinkingConfig` 會回 400。寫死已知的，清單外的若回 400 就**自動偵測並加入，然後立刻重來且不算一次重試**：

```js
if (res.status === 400 && !noThinking.has(model)) {
  noThinking.add(model);
  continue;
}
```

### 5.4 同一輪對話固定用同一個模型

因為一次對話要跑多輪，如果每輪都重新試探候補鏈，額度會爆掉。所以第一輪成功的模型會被記住，後續輪次優先用它：

```js
const ordered = preferModel && selectableModels().includes(preferModel)
  ? [preferModel, ...chain.filter(m => m !== preferModel)]
  : chain;
```

`preferModel` 同時也是使用者在前端選單指定的模型——指定的排第一，額度用完才照鏈往下。

### 5.5 讓使用者自己選模型

後來加了 `ModelPicker` 元件（放在送出按鈕左邊），每個選項附上「適合什麼任務」的備註。備註內容就是 §5.3 量測的結果：

```js
'gemini-flash-lite-latest': {
  label: 'Flash-Lite', speed: '最快・約 1 秒',
  note: '日常記錄飲食、訓練、體重，簡單問答。額度最寬鬆，平常用它就好。'
      + '一句話同時要「改」又要「加」時偶爾會漏做一件。',
},
'gemini-3.6-flash': {
  label: '3.6 Flash', speed: '中等・約 5 秒',
  note: '照片辨識、複雜的一餐、一句話交代好幾件事、排課表、每週檢討。估算最細、最不容易漏。',
},
```

`/api/models` 還會回報每個模型**今天用了幾次、現在還能不能用**，讓使用者自己判斷。

---

## 6. 照片 → 熱量的管線

```
手機拍照（4000px / 5MB）
   │
   ├─ 前端 canvas 縮到長邊 1280、JPEG 0.82 → 約 20–40KB
   │   （compressImage()；Gemini 不需要更高解析度就能辨識食物）
   │
   ├─ 以 data URL 夾在 JSON 裡 POST /api/chat
   │   （Fastify bodyLimit 設 12MB）
   │
   ├─ 後端 saveDataUrl()：驗 MIME、驗大小、存進 photos 表的 BLOB
   │
   ├─ 送給 Gemini：inlineData 放在 text 之前
   │   （實測「先看圖再讀指令」理解比較穩）
   │
   ├─ 模型對畫面上每一樣食物各呼叫一次 log_meal
   │   runTool 把 photo id 一併寫進 meals.photo
   │
   └─ 飲食頁面顯示縮圖，點擊由 PhotoViewer 彈窗放大
```

前端壓縮那段：

```js
export function compressImage(file, maxSide = 1280, quality = 0.82) {
  // ... FileReader → Image → canvas.drawImage → canvas.toDataURL('image/jpeg', quality)
}
```

系統提示裡針對照片寫了專門一節，重點是**逼模型一定要動作**：

```
1. 辨識出畫面上「每一樣」食物，分別呼叫一次 log_meal，不要合併成一筆「便當」。
2. 用餐具、碗盤、手、飲料杯當比例尺推估份量，並把推估寫進 portion，例如「約 1 碗 (200g)」。
3. 台灣常見餐點要抓準：雞腿便當約 800-900 kcal、滷肉飯一碗約 500 kcal、鹹酥雞一份約 600 kcal…
4. 看不出來的就選最接近的常見品項並估算，只在回覆裡說明你的假設；絕對不要因為不確定就不呼叫工具。
5. 如果照片裡根本沒有食物（例如是體重計、課表、健身房器材），不要呼叫 log_meal…
   看到體重計數字就呼叫 log_weight。
```

第 3 點（在地化的參考熱量）和第 4 點（不確定也要動作）是實測後補的。少了第 4 點，模型會回「我無法確定份量，請你告訴我」——完全失去自動化的意義。第 5 點是因為真的有人拍了體重計。

照片取用路徑是 `GET /uploads/:id`，加上路徑穿越防護：

```js
export function readPhoto(userId, id) {
  if (!id || id.includes('/') || id.includes('\\') || id.includes('..')) return null;
  const row = getPhoto(userId, id);
  return row ? { mime: row.mime, buf: Buffer.from(row.data) } : null;
}
```

---

## 7. 定時推播

需求：中午 12 點、下午 3 點、6 點、9 點都計算熱量，不足或過多都用手機通知提醒。

### 7.1 進度門檻不是平均分配

這是這個功能最有意思的一點。12 點的時候，你通常只吃了早餐＋午餐，不該被要求吃到全天的 50%：

```js
/**
 * 每個檢查點「應該吃到的比例」。不是平均分配 —— 12 點時通常只吃了早餐＋午餐，
 * 到晚上 9 點才該接近全天目標。
 */
const PACE = { 12: 0.35, 15: 0.55, 18: 0.75, 21: 1.0 };

/** 超出或落後多少才提醒（佔全天目標的比例） */
const BAND = 0.12;
```

判斷邏輯：

```js
const ratio    = PACE[hour] ?? 1;
const expected = Math.round(target * ratio);
const band     = Math.round(target * BAND);
const diff     = eaten - expected;

let status = 'ok';
if (diff < -band) status = 'low';
else if (diff > band) status = 'high';
```

`BAND = 0.12` 是容許誤差。沒有這個緩衝，每個檢查點都會因為差幾十大卡就跳通知，很快就會被使用者關掉。

通知文案也依時間調整——21 點的建議跟 12 點不該一樣：

```js
body: `${base}\n${p.hour >= 21 ? '今天快結束了，睡前補一杯全脂奶或花生醬吐司'
                               : `這個時間建議吃到 ${p.expected} kcal，加個點心補上`}`
```

### 7.2 排程用 setTimeout 而不是輪詢

```js
/**
 * 用「算出下一個時間點，setTimeout 過去」而不是每分鐘輪詢：
 * 筆電闔上再打開、或夏令時間之類的狀況，下次醒來會重新計算，不會整天算錯。
 */
function schedule() {
  clearTimeout(timer);
  const next = nextRun();
  if (!next) return;
  timer = setTimeout(async () => {
    await fire(next.getHours());
    schedule();          // 每次觸發後重新排下一個
  }, next - Date.now());
  timer.unref?.();
}
```

每次觸發後**重新計算**下一次，所以筆電睡醒、時間跳動都能自我修正。

### 7.3 失效訂閱自動清除

手機移除 App 或清掉瀏覽器資料後，推播端點會回 404/410。不處理的話會一直重試失敗的端點：

```js
if (err.statusCode === 404 || err.statusCode === 410) {
  removeSubscription(userId, s.endpoint);
  removed++;
}
```

`TTL: 3 * 60 * 60`——3 小時內沒送達就算了，過期的熱量提醒沒意義。

### 7.4 一個誠實的限制

**電腦沒開或沒連網的時候不會有通知，而且不會補發。** 這是「服務跑在自己筆電上」的必然代價。曾經發生過 18:00 的提醒沒收到，一查是服務根本沒在跑（見 §12.7）。

---

## 8. PWA：讓網頁變成手機 App

三個檔案就能裝起來：`manifest.webmanifest`、`sw.js`、一組 icon（含 `maskable`）。

### 8.1 Service worker 的快取策略

```js
const NEVER_CACHE = (url) =>
  url.pathname.startsWith('/api') || url.pathname.startsWith('/uploads');
```

- `/api` 與 `/uploads`：**完全不進快取**，一律走網路。個人資料隨時在變，快取只會讀到舊的。
- 換頁（`navigate`）：network-first，離線時退回快取的殼。
- 靜態資源：cache-first + 背景更新（Vite 檔名帶 hash，內容不會變）。

結論是這個 App **不能離線使用**——沒網路時開得起來，但看不到資料。這是刻意的取捨。

### 8.2 安裝按鈕消失之謎

症狀：`localhost:3000` 上方有「安裝」，換成 ngrok 網址就沒有。

走過的錯誤假設：以為是 ngrok 的警告頁、以為 service worker 在 https 下註冊失敗。

真正原因：**`beforeinstallprompt` 在 Vue 掛載之前就觸發了**。這個事件只觸發一次，瀏覽器在頁面早期就發，而 Vue 的 `onMounted` 裡才掛監聽器——來不及。在 localhost 上剛好因為時序不同而接到了。

修法是把監聽器移到 `index.html` 的行內 `<script>`，在任何 bundle 載入前就接住：

```html
<script>
  // beforeinstallprompt 可能在 JS bundle 載入前就觸發（例如 service worker 已註冊過的回訪），
  // 那時 Vue 還沒掛載、監聽器來不及掛上，安裝按鈕就永遠不會出現。
  // 所以在這裡先接住並存起來，App 再去讀。
  window.__installPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.__installPrompt = e;
    window.dispatchEvent(new Event('installprompt-ready'));
  });
</script>
```

Vue 端只負責讀，並且用自訂事件補上「晚一點才觸發」的情況：

```js
const installPrompt = ref(window.__installPrompt || null);
window.addEventListener('installprompt-ready', () => {
  installPrompt.value = window.__installPrompt;
});
```

另外加了保險：只要不是獨立視窗模式就**一直顯示按鈕**，按下去若沒有原生提示就給手動安裝步驟。因為 `beforeinstallprompt` 不觸發的原因太多（已安裝、瀏覽器不支援、Chrome 的互動門檻），不該讓功能完全消失。

> 教學點：一次性的瀏覽器事件要在**文件最早的時機**接住，不能等框架掛載。這類時序 bug 在 localhost 上常常剛好不會重現。

### 8.3 iOS 的版面偏上

需求是「只針對 iOS 做版面下調」。實際上這不是 iOS 專屬問題，而是**瀏覽器 UI 遮住了內容**。正解是 safe area：

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

```css
.topbar {
  /* 上方多留狀態列的高度，並讓 topbar 的底色一路填到螢幕頂端，
     不然 iPhone 上時間與訊號會直接壓在「增肌教練」上面 */
  padding: calc(.75rem + var(--safe-top)) calc(1rem + var(--safe-right)) .75rem calc(1rem + var(--safe-left));
}
```

`--safe-*` 由 `env(safe-area-inset-*)` 餵進來，高度用 `100dvh`（動態視窗高度，會隨瀏覽器工具列伸縮調整）。這樣寫不需要偵測 iOS——在沒有 safe area 的平台上 `env()` 就是 0。

---

## 9. 讓外網的手機連得到

`tunnel.sh` 支援三種，差別在**網址會不會變**：

| 方式 | 網址 | 需要什麼 |
|---|---|---|
| `quick` | 每次都變 | 什麼都不用 |
| `ngrok` | **永久固定** | 免費帳號 + authtoken |
| `cloudflare` | 自訂 | 自有網域 |

最後選 ngrok，因為免費帳號就配一個永久固定網址（像 `abc-123-xyz.ngrok-free.dev`），裝成 PWA 之後網址不能變——變了就是另一個 App、推播訂閱也失效。

通道的二進位檔由 `fetch_bin` 在第一次使用時下載到 `.tools/`。`start.sh` 會等網址真的通得了才宣告成功：

```bash
if [ -n "$PUBLIC" ]; then
  for i in $(seq 1 30); do
    CODE=$(curl -s -m 8 -o /dev/null -w '%{http_code}' "$PUBLIC/api/session" 2>/dev/null || true)
    [ -n "$CODE" ] && [ "$CODE" != "000" ] && break
    sleep 2
  done
fi
```

通道生效有時慢個幾秒，不等就會印出一個還連不上的網址。

---

## 10. 開機自動啟動與營運腳本

### 10.1 腳本分工

| 腳本 | 做什麼 |
|---|---|
| `start.sh` | 收掉舊服務 → 打包前端 → 起後端 → 起通道。`--local` 不開通道、`--keep` 掛掉自動重啟 |
| `tunnel.sh` | 只開通道（後端已在跑時用） |
| `status.sh` | 有沒有在跑、連不連得到、下次提醒何時、幾台裝置訂閱 |
| `stop.sh` | 有序關閉 |
| `backup.sh` | `VACUUM INTO` 備份 |
| `db.sh` | 唯讀 SQL 檢視器 |
| `dev.sh` | 開發模式（Vite dev server + 後端） |

### 10.2 `stop.sh` 的順序很重要

```bash
# 順序很重要：要先停「啟動器」再停後端。
# start.sh --keep 會在後端掛掉時自動重啟，先砍後端的話它又會被拉回來。
kill_all 'bash .*start[.]sh' && echo "  · 啟動器已停止（自動重啟也一併關掉）"
sleep 2
kill_all '^node src/server[.]js'      && echo "  · 後端已停止"
kill_all '^[.]tools/(cloudflared|ngrok)' && echo "  · 外網通道已停止"
```

驗證方式是停掉之後**等 15 秒再確認仍然是停的**——否則看不出 watchdog 有沒有偷偷把它拉回來。

### 10.3 Windows 開機自動啟動

放一個 `.vbs` 到「啟動」資料夾（`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`）。

為什麼用 VBScript 而不是 `.bat`：**`.bat` 會閃一個黑色視窗**，`WScript.Shell.Run` 的第二個參數給 0 就完全背景執行。

```vbs
Option Explicit
Dim shell, cmd
Set shell = CreateObject("WScript.Shell")

' 開機後 WSL 常常還沒起來，先用一個不做事的指令把它叫醒，
' 再跑真正的服務，避免第一次呼叫就卡在啟動畫面
shell.Run "wsl.exe -d Ubuntu-24.04 -e true", 0, True

cmd = "wsl.exe -d Ubuntu-24.04 -e bash -lc " _
    & """cd /mnt/d/claude/fit && exec ./start.sh --keep >> .logs/autostart.log 2>&1"""
shell.Run cmd, 0, True
```

兩個參數都有講究：

- 第二個參數 `0` = 完全隱藏視窗
- 第三個參數 `True` = 等到結束。**給 False 的話 `wscript` 會立刻結束，Windows 跟著把整個程序樹收掉**，服務在打包前端打到一半就被砍。改成 True 之後 `wscript` 會在背景待著，代價是工作管理員裡多一個閒置程序。

這個檔案的**編碼是個陷阱**，見 §12.6。

---

## 11. 身分驗證的生與死

這段值得完整記錄，因為它展示了一個功能從**加上**到**完整移除**的全程。

### 11.1 加：密碼即身分

需求是「密碼為 Martina 時登入者為 Martina，密碼為 Eli 時登入者為 Eli，功能分開使用但可以看對方的紀錄，資料庫分開存」。

不是「帳號 + 密碼」，而是**密碼直接決定身分**。實作上：

```js
export function resolveUser(input) {
  let matched = null;
  for (const u of USERS) {
    const pw = passwordOf(u);
    if (pw && safeEqual(input ?? '', pw)) matched = u;
  }
  return matched;   // 所有帳號都比對過一輪才回傳，不讓回應時間洩漏「哪個帳號存在」
}
```

幾個細節：

- `timingSafeEqual` 做定時比較
- **不提前 return**，所有使用者都比對完才回傳，避免回應時間洩漏資訊
- cookie 簽章金鑰由所有密碼推導，所以**改任何一個密碼＝所有裝置自動登出**，也省去另外管理一組 secret：
  ```js
  export const sessionSecret = () =>
    createHash('sha256').update('fit-session:' + USERS.map(u => `${u.id}=${passwordOf(u)}`).join('|')).digest('hex');
  ```
- 登入失敗 10 分鐘內 8 次就鎖住

跨使用者讀取用 `?user=<id>`，並且**只能讀不能寫**：

```js
const readOnlyGuard = (req) => {
  if (req.query?.user && req.query.user !== req.userId) {
    throw Object.assign(new Error('只能查看對方的紀錄，不能修改'), { status: 403 });
  }
};
```

### 11.2 減：移除一個使用者但保留資料庫

後來 Martina 停用。需求是「刪掉 Martina 的使用但資料庫依舊保存」。

因為架構是一人一檔，這件事幾乎不用寫程式——**把她從 `USERS` 移除，檔案就自然留在原地不再被開啟**。只做了四件事：

1. `USERS` 裡那段改成註解（保留著，要回來就取消註解）
2. `initAllDatabases()` 因此不再碰 `fit-martina.db`
3. `query.mjs` 的 `KNOWN` 改成 `['eli', 'martina']`，預設查 eli 但**舊資料仍可用 `./db.sh martina` 查**
4. 把她那個 3.4MB 的 WAL **checkpoint 進主檔**

第 4 點不在需求裡但很重要：WAL 模式下，資料散在 `.db` 和 `.db-wal` 兩個檔案。既然不再有程序開啟它，WAL 永遠不會被 checkpoint——少掉任何一個檔就毀了。所以手動合併：

```js
const d = new DatabaseSync('server/data/fit-martina.db');
d.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
d.close();
```

主檔從 241KB 變成 2.5MB，`-wal` / `-shm` 消失，**單一檔案自己就完整**。37 筆飲食、68 則對話、22 張照片一筆沒少。

### 11.3 歸零：整個移除密碼機制

最後需求是「不用登入密碼了」。

第一步只是把 `.env` 的密碼留空（`anyPasswordSet()` 回 false → 不驗證）。但接著要求的是「**取消密碼的設計**」——不是留空，是把機制拆掉：

| 刪掉的 | 說明 |
|---|---|
| `server/src/auth.js` | 整支刪除（cookie 簽章、`timingSafeEqual`、次數限制、`isPublicPath`） |
| `web/src/views/LoginView.vue` | 整支刪除，前端沒有登入畫面也沒有登出按鈕 |
| `/api/login`、`/api/logout` | 路由不存在，打過去 404 |
| `@fastify/cookie` | 不再註冊，也從 `package.json` 移除 |
| `PASSWORD_*` | 從 `.env` 與 `.env.example` 移除欄位本身 |

取代它的是一行：

```js
// 沒有登入機制：所有請求都是同一個人。
// 路由裡的 req.userId 仍然全部沒動，以後要加回識別只要改這裡。
app.decorateRequest('userId', null);
app.addHook('onRequest', async (req) => { req.userId = ME; });
```

**關鍵是各路由的 `req.userId` 完全沒動。** 所有授權邏輯（`viewUser`、`readOnlyGuard`）照原樣留著，身分來源被縮成單一一行。要加回識別只要改那一行——這是把「身分從哪來」和「拿身分做什麼」解耦的好處。

`/api/session` 因為前端要拿名字、`status.sh` / `stop.sh` 拿它當健康檢查，所以搬進 `routes/api.js` 保留下來。

> 教學點：「關掉一個功能」和「移除一個功能」是不同的工作。前者留著可被誤開的開關，後者要連帶處理依賴、文件、設定檔與測試。移除時**把入口縮成一行**，比散落各處的 `if (authEnabled)` 好維護得多。

---

## 12. 踩過的坑

每一條都真的發生過。這一節大概是整份文件最有用的部分。

### 12.1 所有 DELETE 都回 400

症狀：刪除飲食欄位、清空對話、登出，全部回 `FST_ERR_CTP_EMPTY_JSON_BODY`。

原因：前端的 `request()` 無論有沒有 body 都送 `content-type: application/json`。Fastify 看到這個 header 就要求有 JSON body，沒有就 400。

兩邊都修。後端把空 body 當成沒有 body：

```js
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  if (!body || !body.trim()) return done(null, undefined);
  try { done(null, JSON.parse(body)); }
  catch { done(Object.assign(new Error('JSON 格式錯誤'), { statusCode: 400 })); }
});
```

前端只在真的有 body 時才宣告：

```js
headers: {
  ...(hasBody ? { 'content-type': 'application/json' } : {}),
  ...options.headers,
},
```

**為什麼沒早點發現：** 我用 `curl -X DELETE` 測都正常——因為 curl 沒有 body 時不會送那個 header。瀏覽器的 fetch 會。

> 教學點：用 curl 測過不等於瀏覽器會過。header 的差異足以造成完全不同的結果。

### 12.2 `pkill -f` 殺掉自己

`pgrep -f 'start.sh'` 會連「**正在執行這支腳本的 shell**」一起匹配到，因為它的命令列裡就含有那個字串。結果是腳本殺掉自己。

修法是錨定或用中括號包住一個字元，讓 pattern 不匹配自己：

```bash
pgrep -f '^node src/server[.]js'          # ^ 錨定
pgrep -f 'bash .*start[.]sh'              # [.] 讓 pattern 字串本身不等於被匹配的字串
pkill -f '^\.tools/(cloudflared|ngrok)'
```

### 12.3 改到正在執行的 `start.sh`

編輯正在跑的 bash 腳本，會得到莫名其妙的 `unexpected EOF`。因為 **bash 是邊讀邊執行**的，檔案位移在中途被改掉。不是真的語法錯誤——停掉再改就好。

### 12.4 我刪掉了使用者的 14 則真實對話

最嚴重的一次。我跑了一支 `test-delete.mjs` 來驗證「清空對話」的修復，它呼叫 `DELETE /api/chat/history`——**打在正式資料庫上**。14 則真實對話全沒了。

而且我事前的「備份」沒用：我只複製了 `fit.db`，**沒複製 `-wal`**。WAL 模式下，大部分資料還在 `-wal` 裡。

最後是靠解析 SQLite 的 free page 把 14 列全部撈回來，復原後補上兩個機制：

```bash
# backup.sh：用 VACUUM INTO，產出單一完整檔案，不會有 WAL 漏抄的問題
VACUUM INTO 'backups/<timestamp>/fit-eli.db'
```

```js
// db.js：測試可以指到別的資料目錄
export const DATA_DIR = process.env.FIT_DATA_DIR || join(__dirname, '..', 'data');
```

有了 `FIT_DATA_DIR`，所有破壞性測試都在拋棄式資料庫上跑：

```bash
TMPD=$(mktemp -d)
FIT_DATA_DIR="$TMPD" PORT=3399 node src/server.js &
# ... 測新增、刪除 ...
rm -rf "$TMPD"
```

> 三個教學點：
> 1. **複製 SQLite 檔案不等於備份。** WAL 模式下必須連 `-wal` 一起，或用 `VACUUM INTO` / `.backup`。
> 2. 破壞性測試需要**架構上的隔離**（環境變數切換資料目錄），不是靠「記得改連線字串」。
> 3. 這個隔離機制應該在寫第一個測試**之前**就建好。

### 12.5 往正式資料庫塞了示範資料

兩次。修法是按 timestamp 精準移除那幾列，真實資料未受影響。根因與 §12.4 相同，`FIT_DATA_DIR` 一併解決了。

### 12.6 VBS 自動啟動失敗（三個不同的原因）

這個 bug 找了很久，因為它有**三個互相掩蓋的原因**：

**原因一：`Run(..., False)`。** `wscript` 立刻結束，Windows 把整個程序樹收掉，服務在打包前端打到一半被砍。改成 `True`。

**原因二：我自己的測試腳本有 bug。** 我用 PowerShell 測的時候，路徑含空格（`Start Menu`）卻沒加引號，`wscript` 靜默失敗。這一輪的「失敗」是我的測試方法錯，不是腳本錯——**浪費了一輪診斷**。

**原因三（真正的根因）：檔案編碼。** 腳本存成 UTF-8。Windows Script Host 用系統預設編碼（這台機器是 Big5）去讀，中文註解被解析成亂碼，吃掉了一個行尾，於是：

```
Expected statement, line 18
```

修法：**存成 UTF-16 LE + BOM**。這是 WSH 唯一可靠能吃中文的編碼。

> 教學點：`.vbs`、`.bat`、`.ps1` 這類由系統直接執行的腳本，若含非 ASCII 字元，編碼必須配合宿主程式。症狀會偽裝成語法錯誤。另外——**懷疑受測對象之前，先確認自己的測試方法是對的**。

### 12.7 14 小時沒有通知

症狀：一整天四個檢查點都沒收到提醒。

查 log：WSL 在 08:38 開機，服務在 22:34 才啟動。原因不是推播壞了，是**服務在重開機後沒有自動啟動**（§10.3 是後來才加的）。

附帶發現：「啟動」資料夾裡原本有一個 `增肌教練.lnk`，那是 Edge 的 PWA 捷徑——它會在登入時**打開 App**，但不會**啟動伺服器**。所以畫面一開就是錯誤訊息。兩者長得很像，很容易誤判成「服務有跑但壞了」。

### 12.8 其他

| 症狀 | 原因 | 修法 |
|---|---|---|
| `gemini-2.5-flash` 回 404 | 「不再對新使用者開放」 | 換新模型，後來做成候補鏈 |
| `.logs` 跑到 `web/.logs` | `LOG_DIR` 用相對路徑，而底下有 `(cd web && …)` 子 shell | 改成 `LOG_DIR="$PWD/.logs"` |
| topbar 右側元件擠在一起 | 有兩個 `margin-left: auto` 在競爭空間 | 只留 `.bell-spacer` 一個 |
| 修好了但行為沒變 | 舊的 node 程序還佔著 port，跑的還是舊程式 | `start.sh` 開頭先收掉舊服務 |
| 唯讀連線讀到過時資料 | WAL 模式下，唯讀連線在沒有其他程序持有 `-shm` 時讀不到未 checkpoint 的 WAL | `query.mjs` 改用一般連線，「不會改到資料」由只允許 SELECT 保證 |

---

## 13. 從零重現

```bash
git clone https://github.com/Hung-NCKU/fit
cd fit

# 1. 設定
cp server/.env.example server/.env
#    填 GEMINI_API_KEY（免費申請：https://aistudio.google.com/apikey）

# 2. 啟動（第一次會自動 npm install、打包前端）
./start.sh --local          # 只跑本機
./start.sh                  # 本機 + 外網通道

# 3. 看狀態 / 停止
./status.sh
./stop.sh
```

需要 Node 22 以上（`node:sqlite` 從 22 開始內建）。本專案用的是解壓在 `.tools/node/` 的可攜版 24.21.0。

推播是選用的：`VAPID_*` 留空時後端會自動產生一組並印出來，貼回 `.env` 即可。

查資料庫：

```bash
./db.sh                     # 全部總覽
./db.sh meals               # 只看飲食
./db.sh photos              # 照片清單（不含 BLOB 本體）
./db.sh "SELECT date, ROUND(SUM(kcal)) FROM meals GROUP BY date ORDER BY date DESC"
```

備份：

```bash
./backup.sh                 # VACUUM INTO backups/<timestamp>/
```

---

## 14. 安全性與已知限制

**這個服務目前沒有身分驗證。** 詳見 §11.3。外網通道的網址是唯一的門檻，網址外流等於資料外流（紀錄可讀可改、Gemini 額度可被用光）。後端每次啟動會在 log 印一行警告。

如果你要拿這份程式去跑自己的版本，**請把登入加回去**，或只用 `./start.sh --local`。

其他限制：

- **電腦沒開、睡眠、或沒連網時沒有服務**，通知也不會補發。這是「跑在自己筆電上」的代價。
- **不能離線使用。** service worker 只快取靜態殼，`/api` 一律走網路。
- **Gemini 免費額度有限**，而且是「每個模型每天幾次」。候補鏈能撐一陣子，用完就要等隔天。
- **營養估算是 LLM 估的**，不是查食品資料庫。對趨勢追蹤足夠，不適合需要精確數字的場合。
- **不是醫療建議。** 系統提示裡有要求模型在出現疑似飲食失調徵兆時提醒就醫。

本 repo **不包含**任何真實的健康紀錄：`server/data/`、`backups/`、`server/.env` 都在 `.gitignore` 裡。

---

## 15. 可以拿這個專案教什麼

幾個適合當作教材或練習的切入點：

**LLM 應用架構**
- §4.1–4.2：function calling 的完整往返，以及「決策權在模型」這件事
- §4.7：為什麼 agent 需要驗證副作用，而不是驗證文字
- 練習：拿掉 `claimedButNotDone`，用「某項其實只有 3g，再加一項」這種句子測，觀察失敗率

**提示工程**
- §4.3 與 §6：工具 `description` 就是規格書；「不要填 0」「不確定也要動作」這類指令的必要性
- 練習：把 `log_meal` 的 description 簡化成一句話，比較模型行為的差異

**在受限環境下的工程**
- §2：無 sudo 的可攜工具鏈；選依賴時「要不要編譯」的重要性
- §5：外部 API 的配額是**設計約束**，不是事後才處理的錯誤

**資料工程**
- §3.1：用檔案隔離取代 `WHERE user_id = ?`，以及這個決定在 §11.2 停用使用者時的回報
- §12.4：SQLite WAL 的備份陷阱；測試隔離為什麼要做在架構層

**除錯方法論**
- §12.6：一個 bug 有三個互相掩蓋的原因；以及「先確認測試方法本身是對的」
- §12.1：curl 測過不等於瀏覽器會過
- §8.2：在 localhost 上剛好不會重現的時序 bug

---

*這份文件描述的是一個真實在用的個人專案，不是教學樣板。程式碼裡的註解刻意保留了「為什麼這樣寫」與「這裡踩過什麼坑」，建議搭配原始碼一起讀。*
