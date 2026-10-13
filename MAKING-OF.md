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
11. [身分驗證的生、死、與復活](#11-身分驗證的生死與復活)
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

## 11. 身分驗證的生、死、與復活

這段值得完整記錄，因為它展示了一個功能從**加上**、**完整移除**、再**被要求復原**的全程。最後一步（§11.4）最有教學價值：它暴露了前面那些決定的真正代價。

> **目前狀態**：密碼登入**已復原**，Martina 也回來了。§11.1–§11.3 是歷史記錄。

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

### 11.4 復活：四天後全部要回來

2026-10-09，需求變成「把 Martina 的資料復原，並且改回需要密碼登入」。

**Martina 那半邊幾乎免費。** 因為 §3.1 的「一人一個資料庫檔」，她的資料從來沒被動過——
把 `USERS` 裡註解掉的那段放回去，`fit-martina.db` 就自己接上了。37 筆飲食、68 則對話、
22 張照片一筆沒少。§11.2 做的 WAL checkpoint 讓那個檔案是自我完整的，四天沒人碰也不會壞。

> 這是 §3.1 那個架構決定的第二次回報。如果當初是「一張表加 `user_id` 欄位」，
> 停用時得 `DELETE FROM ... WHERE user_id='martina'`（資料就沒了），或是留著一堆孤兒列；
> 復原則要反向操作。檔案隔離讓「停用」和「復原」都變成零風險的操作。

**密碼那半邊付了真正的代價。** §11.3 把 `auth.js` 和 `LoginView.vue` **整檔刪除**，
而那時專案**還沒有 git**——第一個 commit 是 2026-10-07，已經是刪除後的狀態。
所以這兩個檔案在任何版本歷史裡都不存在。

最後是從 Claude Code 的 session transcript（`~/.claude/projects/.../*.jsonl`）挖回來的：

- `auth.js` 容易。診斷過程中整支檔案被印出來過，內容完整留在對話裡。
- `LoginView.vue` 麻煩。transcript 裡只有**單人版時代**的完整檔案（footer 還寫著舊的
  `APP_PASSWORD` 環境變數名），以及後來把它改成多使用者版的那一次 `Edit`
  （`old_string` / `new_string` 一組）。重建方式是「拿舊檔案 + 重放那次 edit」，
  再把 footer 的過期文案改掉。

這能成功純屬運氣。如果當時是用整檔覆寫而不是 `Edit`，或 transcript 已被輪替掉，
就只能憑記憶重寫。同一件事在 `start.sh` 上更驚險：§11.3 拔守門員時 `fi` 的比對抓錯層，
**連帶刪掉整個通道啟動區塊**，同樣是靠 transcript 才撈回原文。

> **教學點（這份文件裡最實際的一條）**
>
> 1. **先 `git init`，再開始改。** 這個專案在沒有版本控制的狀態下活了兩週多，
>    期間刪過檔案、刪過使用者資料（§12.4）、重寫過腳本。每一次都靠運氣。
> 2. **刪檔案和改檔案不是同一級的風險。** 改壞了還看得到現場；整檔刪除之後，
>    沒有版本控制就等於沒有來源。要移除一個功能時，至少先 commit 一次當前狀態。
> 3. 「把入口縮成一行」（§11.3）讓**復原**也變簡單。恢復驗證時，各路由的 `req.userId`、
>    `viewUser`、`readOnlyGuard` 一行都不用動，只是把 `req.userId = ME` 換回原本的 hook。
>    解耦在兩個方向上都有回報。

復原後的實測：未登入 `/api/meals` 回 401、密碼錯誤回 401、`Martina` 與 `Eli` 各自登入
得到正確身分、Eli 用 `?user=martina` 讀得到 37 筆、想寫入回 403、登出後回 401。

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

**密碼登入已復原**（§11.4）。未登入時 `/api/*` 與 `/uploads/*` 一律 401，密碼比對用
`timingSafeEqual`，嘗試 10 分鐘內 8 次就鎖住，跨帳號只能讀不能寫。
沒有任何帳號設密碼時，`tunnel.sh` 會拒絕開外網通道。

要注意的是密碼存在 `server/.env` 的明文裡（該檔已在 `.gitignore`），而且整套設計是
「密碼即身分」，沒有帳號欄位。對兩人自用夠了，但不適合更多使用者或更高的安全要求。

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

**影像與素材**
- §16.2：用連通區域分析把一張插畫切成一百個物件；洪水填充去背為什麼比色鍵安全
- §16.4：純 CSS 的 3D Carousel，以及「角度要累加不能取模」

**遊戲與動畫**
- §17.1：把「生活習性」這種文字敘述拆成可執行的作息曲線
- §18.1：38 MB 的引擎怎麼放進一個 170 KB 的 App 的第一頁
- §18.3：權重式的行為狀態機，以及「遊戲不該知道業務規則」
- §18.4：四個把畫面弄壞的坑（id、display:none、畫布尺寸、格子留白）
- §19.1：補圖補不乾淨的時候，改成用乾淨的素材自己組
- §19.4：原生 confirm() 其實是「兩次同位置的點擊」，不該拿來守不可復原的動作
- §20.1：怎麼把一個已經整合進去的引擎乾淨地拔掉
- §20.3：不可復原的操作，確認要做在伺服器——前端的確認擋不住舊版的自己
- §21.2：黏在一起的物件怎麼分家（連通區域做不到的時候，改看覆蓋率的谷底）
- §21.3：set -e 加上 read 讀到 EOF，會讓整個腳本安靜地中止
- §21.5：擋不住就不要擋：把不可復原的操作改成可復原的
- §22.2：一個救不了所有情況的啟發式，不如不要
- §23.1：一個「正確的理由」套到不適用的地方，就變成 bug
- §23.3：寫完測試要先把 bug 裝回去，確認它真的會失敗
- §24.1：「改密碼就登出所有人」是功能，「新增帳號就登出所有人」是 bug

**除錯方法論**
- §12.6：一個 bug 有三個互相掩蓋的原因；以及「先確認測試方法本身是對的」
- §12.1：curl 測過不等於瀏覽器會過
- §8.2：在 localhost 上剛好不會重現的時序 bug

---

## 16. 寵物：把飲食紀錄變成一隻會動的小動物

靈感是 Neko Atsume（貓咪收集），但有一個關鍵差別：**牠吃的跟你一樣**。
寵物沒有自己的一套數值，心情與體態完全由飼主的飲食紀錄推算出來。

### 16.1 代幣只能靠達標賺

```js
const COIN_LOGGED  = 2;   // 有記錄就好
const COIN_KCAL    = 8;   // 熱量落在目標 ±10%
const COIN_PROTEIN = 8;   // 蛋白質達到目標九成
```

一天最多 18 枚。沒有看廣告、沒有課金、沒有簽到——想買東西就得好好吃飯，
這是整個功能唯一的設計目的。

結算用 `settled_to` 記住算到哪一天：

```js
const yesterday = daysAgo(1);
if (pet.settled_to >= yesterday) return { earned: 0, days: 0 };
```

只結算**已經過完**的日子。今天還沒過完就結算，使用者下午吃了東西會發現
代幣沒變多，然後以為壞了。補算也上限三十天，不然第一次開頁面會掃完整個
資料庫。

### 16.2 從一張插畫切出全部素材

素材是使用者自己畫的三張 PNG：十隻角色卡、一張概念圖（五個場景＋貓的
八種動作）、十張商品系列圖。前端要的是個別的 WebP。

角色卡與場景是規則格線，直接算座標裁就好。**商品圖不是**——十張的排版都
不一樣（商品 1 是 5+5，商品 10 是 4+3+2），所以改用連通區域分析：

```bash
BOXES=$(convert "$SRC" -alpha extract -threshold 20% \
          -morphology Dilate Disk:4 \
          -define connected-components:verbose=true \
          -define connected-components:area-threshold=3000 \
          -connected-components 8 /dev/null 2>&1 \
        | grep 'gray(255)' | awk '{print $2}')
```

三個細節：

- **先膨脹再偵測**。像「石子路」這種由幾顆不相連的石頭組成的物件，不先把
  鄰近碎塊黏起來就會被當成好幾樣商品。膨脹只用來找範圍，裁切仍用原圖。
  半徑 9 會把相鄰的兩樣商品黏成一樣，4 剛好。
- **`area-threshold` 濾掉陰影碎片**，不然每個物件下面的陰影會變成獨立商品。
- **排序要先分列再比 x**。`sort` 直接照 y 排會因為同一列物件高度不同而亂掉，
  所以先用中心的 y 除以 120 取整當「列號」。

去背用洪水填充而不是色鍵：

```bash
convert "$1" -alpha set -bordercolor "#FDF6E4" -border 1 \
  -fuzz 14% -fill none -draw 'matte 0,0 floodfill' \
  -shave 1x1 \
  -channel alpha -morphology Erode Octagon:1 +channel "$1"
```

- 先鑲一圈底色邊框，四邊的背景才會連成一片，從 `0,0` 填一次就夠。
- 色鍵會把貓肚子那塊同樣接近白色的區域一起吃掉，洪水填充只拿掉**與邊界
  相連**的背景，所以安全。
- 這台是 ImageMagick 6，透明度的繪圖原語叫 `matte`，IM7 才改叫 `alpha`。
- 填完邊緣會留一圈半透明的米白，看起來像白邊，把 alpha 往內縮一個像素就乾淨了。
- `cwebp` 一定要加 `-exact`，否則它會更動透明區域的顏色，疊到深色背景上會浮出雜邊。

最後 33 + 99 個 WebP，全部加起來還不到 2 MB。

### 16.3 104 件商品不用手寫 104 個物件

商城是用壓縮表展開的：

```js
const GROUPS = [
  [1, 'decor', '小房間擺飾', 40, 8,
    '書架', '床鋪', '飯碗', '毛線球', '地毯', '小桌子', '盆栽', '玩具箱', '抓抓板', '小夜燈'],
  // ...
];

export const SHOP = [
  ...SCENES.map(...),
  ...GROUPS.flatMap(([sheet, slot, group, base, step, ...names]) =>
    names.map((name, i) => ({
      id: `item-${sheet}-${i + 1}`,
      slot, group, name,
      price: base + i * step,
      img: `/pets/item-${sheet}-${i + 1}.webp`,
    }))),
];
```

`[起價, 每項遞增]` 讓每一區的價格自動成等差數列，同一區越後面的越貴。
名稱的順序必須跟 `slice-items.sh` 的編號一致（先上後下、先左後右）——
這是整段唯一需要人工對齊的地方，所以兩邊的註解都寫了同一句話。

### 16.4 選寵物用 CSS 3D Carousel

十隻排在一個圓柱上，容器給 `perspective`，內層 `preserve-3d` 之後整個繞
Y 軸轉，轉到正面的那張就是選中的。不用任何輪播函式庫。

半徑不能亂填，要讓相鄰卡片剛好不重疊：

```js
const radius = computed(() => {
  const half = (Math.PI / props.items.length);
  return Math.round((CARD_W / 2) / Math.tan(half)) + 10;
});
```

每張卡的位置就是「先轉到自己的角度，再往外推一個半徑」：

```js
transform: `rotateY(${i * step}deg) translateZ(${radius}px)`
```

轉盤本身則是 `translateZ(-radius) rotateY(angle)`，把圓心推回原處。

**角度要累加，不能取模**。如果直接用 `index * step`，從第 10 隻切到第 1 隻
會倒著轉一大圈：

```js
let diff = ((i - index.value) % n + n) % n;   // 0..n-1
if (diff > n / 2) diff -= n;                  // 選比較近的方向
angle.value -= diff * step.value;
```

背面那幾張要壓暗（`filter: brightness(.45)`），不然整圈一樣亮會完全看不出前後。

### 16.5 換寵物：一個會被無限刷的漏洞

「換一隻」要清掉舊紀錄並歸零代幣。第一版是這樣寫的：

```js
db.exec('DELETE FROM pet_items');
db.exec('DELETE FROM pet');
return adoptPet(userId, species, name);
```

看起來沒問題，但 `adoptPet` 會把 `settled_to` 設成八天前，讓新使用者一開頁面
就有最近七天的代幣可以領。於是：**換一隻寵物 → 領七天 → 再換一隻 → 再領七天**。
實測從 6 枚刷到 126 枚。

修法是領養與換養分開看待：

```js
const fresh = adoptPet(userId, species, name);
// 領養會認列最近七天…但換寵物不該再給一次 —— 否則反覆換寵物就能無限刷代幣
db.prepare('UPDATE pet SET coins = 0, settled_to = ? WHERE id = 1').run(daysAgo(1));
```

### 16.6 這一段踩到的坑

**`GET /api/pet` 只在「還沒養」的時候回傳物種清單。**

```js
if (!pet) return { pet: null, species: SPECIES, mine };
return { mine, pet: {...}, state, owned, shop, settled };  // ← 少了 species
```

第一次領養看得到十隻，但「換一隻」的 carousel 是空的——有箭頭、有一個點、
沒有卡片。因為換寵物也要挑，所以不管有沒有養都得把清單帶出去。

**`const busy = ref('')` 會讓按鈕永遠是停用的。** Vue 對布林屬性的規則是
「空字串視為存在」，所以 `:disabled="busy"` 在 `busy === ''` 時會變成
`disabled=""`，也就是停用。改成 `ref(null)`。

**新寵物拿到 0 枚代幣。** `settled_to` 設成 `daysAgo(1)` 時，結算函式第一句
`if (pet.settled_to >= yesterday) return` 就直接返回了。要設成 `daysAgo(8)`
才會把過去七天算進來。

**測試不小心把真的寵物換掉了。** 用 adb 點手機模擬器驗證 carousel 時，座標
算錯點到了「確認換成這隻」，而且當天的自動備份早於寵物功能上線，備份裡
根本沒有 `pet` 表。這類破壞性操作之後一律要先確認畫面上那個按鈕的位置，
或是改用 `FIT_DATA_DIR` 開一個拋棄式資料庫測。

---

## 17. 把「動物特性」變成可以執行的資料

寵物功能上線時只有貓有作息，另外九種不管幾點都是同一張靜態圖。
使用者補了一份 `pet/動物特性.txt`：

```
動物	生活習性	可以設計的專屬動作
貓咪	全天分段睡眠，晨昏較活躍	舔毛、抓抓板、曬太陽
倉鼠	夜行性傾向	夜晚跑滾輪、藏食物
陸龜	以白天活動為主	曬太陽、慢走、吃菜
...
```

這份表格就是 `server/src/pet-behavior.js` 的規格。重點是把「生活習性」
這種文字敘述拆成兩個**程式能執行**的東西。

### 17.1 作息曲線

六種節律，每種就是二十四個數字，index 就是小時：

```js
const RHYTHMS = {
  // 晨昏型：清晨與黃昏兩個高峰，中午最懶
  crepuscular: [
    0.30, 0.20, 0.15, 0.15, 0.30, 0.70, 1.00, 0.90, 0.60, 0.40, 0.30, 0.25,
    0.20, 0.20, 0.25, 0.35, 0.50, 0.80, 1.00, 0.90, 0.60, 0.45, 0.40, 0.35,
  ],
  nocturnal:   [ /* 日夜顛倒 */ ],
  owner:       [ /* 狗：跟著主人的上班與回家時間 */ ],
  longsleep:   [ /* 雪貂：平常趴著，偶爾爆發 */ ],
  // ...
};
```

直接列二十四個數字，比用三角函數湊好讀也好調——這是美術手感的東西，
不是物理模擬。取值時整點之間線性內插，活躍度才不會每小時跳一下：

```js
const i = Math.floor(h), t = h - i;
return curve[i] * (1 - t) + curve[(i + 1) % 24] * t;
```

這樣「貓早上六點比中午活潑」就不是寫在某個 `if (hour === 6)` 裡，
而是因為貓被標成晨昏型動物。

### 17.2 體型比例

同一個房間裡倉鼠不能跟狗一樣大，不然場景完全沒有尺度感。所以每種動物
多一個 `size`，意思是「站著時該佔場景高度的幾成」：

```js
cat: 0.30,  dog: 0.34,  rabbit: 0.27,  hamster: 0.13,
guinea: 0.19, hedgehog: 0.16, ferret: 0.23, parrot: 0.20,
tortoise: 0.17, chinchilla: 0.22,
```

繪圖端拿到原圖高度之後自己算縮放，跟素材本身多大無關。

### 17.3 用真正的素材庫取代自動切圖

使用者後來給了 `pet/素材/`：兩本圖鑑拆好的 233 個透明 PNG，照分類放在
資料夾裡，還附一份 `素材索引.csv` 標了來源、分類、**真實名稱**。

這直接取代了 §16.2 那套連通區域分析。那套技術本身沒問題（腳本留著），
但它只能切出位置，名稱得我對著圖猜——「星球盆栽」「文件架」都是猜的。
有了索引就沒必要猜：

```bash
while IFS=, read -r book cat name png rest; do
  info=$(map "$cat")          # 分類 -> 代號|部位|分區|起價|遞增
  [ -z "$info" ] && continue
  convert "$SRC/$png" -trim +repage -resize 160x160 "$OUT/$id.png"
  cwebp -quiet -q 82 -exact "$OUT/$id.png" -o "$OUT/$id.webp"
done < <(tail -n +2 "$CSV" | tr -d '\r')
```

產出 213 件商品（共 1.6 MB）與一份 `server/src/pet-catalog.json`。
目錄是產生出來的，但**進版控**——伺服器啟動時不該依賴 ImageMagick。

商城因此從 104 件變成 218 件，分區也從猜的變成圖鑑原本的分類
（玩具、食物餐具、植物、收藏獎勵、節慶裝飾…）。

### 17.4 這一段踩到的坑

**檔名前綴的編號會歸零重來。** 圖鑑 2 的健身房資料夾長這樣：

```
01_跑步機  02_啞鈴  03_瑜珈墊  04_沙包  05_獎盃架
01_計時器  02_水壺  03_毛巾架  04_運動地墊
```

顯然是兩批合併的。用檔名的數字當 id 會撞號，後切的四張把先切的蓋掉——
症狀是「CSV 有 213 筆，資料夾只有 209 個檔」。改成每一區自己的流水號。

**`tail | while read` 的迴圈在子 shell 裡。** 要在迴圈裡累計流水號就必須
用程序替代，不然 `declare -A seq` 出了迴圈就沒了：

```bash
done < <(tail -n +2 "$CSV" | tr -d '\r')     # ✅ 跟腳本同一個 shell
```

**舊商品的 id 直接失效。** 新目錄用 `lib-2-room-01` 這種 id，跟舊的
`item-1-5` 完全不同。所幸當時只有免費的 `bg_room` 被擁有過，
`itemOf()` 找不到會回 `null`，前端的 `v-if` 就不顯示，不會壞掉——
但如果使用者已經買了東西，這裡就需要一張 id 對照表來搬移。

---

## 18. 用 Godot 4 讓寵物真的動起來

> **現況：這一節描述的 Godot 版本目前沒有啟用。**
> 專案原始碼仍留在 `game/pet/`，匯出腳本也還在，但網頁已經不載入引擎了。
> 原因與改回去的做法見 §20。這一節保留下來，因為裡面那幾個坑
> （canvas 的 id、`display:none` 與 IntersectionObserver、三種
> `canvasResizePolicy` 各自的壞法）跟 Godot 沒什麼關係，換成別的
> wasm 引擎一樣會遇到。


§17 把動物特性變成資料之後，動畫本身還是 CSS keyframes——上下晃、左右傾，
而且只有貓有八張動作圖。使用者給了第三批素材與一句規格：

> 使用 Godot 4 + 2D Sprite 動畫 + 行為狀態機（FSM）去讓寵物行動

### 18.1 先說代價

Godot 的網頁匯出，`index.wasm` 有 **38 MB**（gzip 後 8.9 MB）。寵物是開啟
App 的第一頁，而整個前端打包起來才 170 KB——引擎比整個 App 大兩百倍。

所以做法是「靜態的先上，引擎慢慢來」：

1. 先畫原本純 CSS 的靜態場景，第一次繪製不受影響
2. 等這塊真的捲進畫面、而且閒置了一下，才去抓引擎
3. 引擎跑起來才換成 canvas；抓不到或跑不動就一直留在靜態版

`web/public/petgame/` 因此**不進版控**——那是建置產物，而且會把這個教學用的
repo 撐大一個量級。沒有匯出也不會壞。

伺服器這邊開了 `preCompressed`，`build-petgame.sh` 會一併產生 `.gz`：

```js
await app.register(fastifyStatic, { root: WEB_DIST, preCompressed: true });
```

### 18.2 逐格動畫

第三批素材是十隻動物各一張 4 欄 × 5 列、每格 96×96 的 sprite sheet，
五個動作一列一個，還附了幀數與 fps。在 Godot 裡切成 `AtlasTexture`
餵給 `SpriteFrames`：

```gdscript
for i in int(a.get("frames", 1)):
    var at := AtlasTexture.new()
    at.atlas = sheet
    at.region = Rect2(i * _frame.x, row * _frame.y, _frame.x, _frame.y)
    sf.add_frame(name, at)
```

`frames` 要照 meta 給的數字取：`play` 只有三幀，第四格是空的，
取四格會每個循環閃一下白。

**專屬動作有二十幾種，但只有五列動畫。** 舔毛、跑滾輪、沙浴不可能每種都畫。
所以每個專屬動作挑一列當底，再疊上自己的程序動作：

```gdscript
"wheel":    {"motion": "wheel",  "pose": "play", "secs": 8.0},
"dustbath": {"motion": "rub",    "pose": "groom"},
"plod":     {"motion": "travel", "pose": "walk", "speed": 11.0},
```

「跑滾輪」就是 play 的循環加上快速小跳，看起來就對了。

### 18.3 狀態機

轉移不是寫死的圖，是「時間到了依權重重抽」。權重來自兩件事：作息曲線
（§17.1）與主人的飲食：

```gdscript
match mood:
    "hungry", "thin": a *= 0.55      # 餓著或沒力就懶
    "happy":          a = minf(1.0, a * 1.15)
    "round":          a *= 0.85      # 圓滾滾的時候也懶

if a < 0.25:     w = {"sleep": 70.0, "doze": 25.0, "idle": 5.0}
elif a < 0.5:    w = {"doze": 32.0, "idle": 34.0, "walk": 22.0, "act": 12.0}
elif a < 0.75:   w = {"idle": 18.0, "walk": 34.0, "act": 38.0, "doze": 10.0}
else:            w = {"idle": 8.0, "walk": 28.0, "act": 54.0, "doze": 2.0}
```

再加一條：剛剛那個狀態的權重乘 0.35，否則連抽兩次同一個會像卡住。

遊戲**不知道任何業務規則**，牠不知道什麼是蛋白質。網頁把「現在幾點、
這種動物的作息曲線、心情、穿了什麼」放進 `window.__petConfig`，遊戲輪詢
`rev` 的變化。後端改規則不必重新匯出遊戲。

用輪詢而不是 `JavaScriptBridge.create_callback()`，是因為 callback 要自己管
生命週期，漏掉一個就整頁洩漏。

### 18.4 四個把畫面弄壞的坑

**`'#' is not a valid selector`。** 引擎起不來，錯誤來自 Emscripten 的
`findEventTarget`。Godot 把畫布的 **id** 當成事件目標的選擇器（`'#' + canvas.id`），
我們的 `<canvas>` 沒有 id，於是變成 `querySelector('#')`。加個 id 就好。

**IntersectionObserver 永遠不觸發。** 我觀察的是 canvas，但 canvas 包在
`v-show="running"` 裡——引擎還沒跑起來時它是 `display:none`，沒有大小，
永遠不會「進入畫面」。改成觀察外框。

**背景被放大五倍。** `canvasResizePolicy: 2`（adaptive）會把畫布設成
CSS 尺寸 × 像素密度，手機上 `get_viewport_rect()` 回來的是兩三千，
所有按比例算的版面全部爆掉。但改成 `1`（project）又會連 CSS 寬高一起寫死成
640px，卡片明明有 800px 寬畫面卻只佔左邊一塊。最後用 `0`：Godot 完全不碰
畫布尺寸，HTML 上寫死 `width="640" height="400"`，CSS 用 `width:100%` 放大。

**每隻都比該有的小，而且小動物縮得更兇。** 動物特性表的 `size` 說的是
「這隻站著時該佔場景高度的幾成」，但縮放的是整個 96×96 的格子，而格子四周
留白——貓只佔 50/96，天竺鼠只佔 43/96。`build-anim.sh` 把這個比例量出來
存進 `pet-anim.json`，繪圖端除掉它，`size` 的意思才名副其實：

```bash
fill=$(convert "$sheet" -crop "${fw}x${fh}+0+0" +repage -trim info: \
       | awk -v h="$fh" '{split($3,a,"x"); printf "%.3f", a[2]/h}')
```

順帶一提，遊戲畫面裡**一個字都不寫**：Godot 內建字型沒有中日韓字，
中文會變成一排豆腐。「現在在做什麼」送回 `window.__petDoing`，由網頁顯示。

### 18.5 商城改成先試穿再買

一頂帽子在商品圖上好看，戴到自己那隻身上不一定好看；而且代幣得靠好好
吃飯賺，買錯沒有退款。所以點商品是**試穿**，不是買：

```js
const shown = computed(() => (
  trying.value ? { ...equipped.value, [trying.value.slot]: trying.value.id } : equipped.value
));
```

場景的所有顯示都改讀 `shown`，實際的 `equipped` 只用在「使用中」標記上。
確認列用 `position: sticky` 釘在底部——商品有兩百多件，捲到一半才決定要買，
不該還得捲回上面。

---

## 19. 場景裡有兩隻動物

遊戲跑起來之後，畫面上有兩隻貓：一隻是會動的寵物，另一隻是**畫在背景裡的**。

五張場景是從圖鑑插畫上裁下來的，而每一張插畫本來就畫了一隻動物在裡面
（貓躺在床上、狗坐在草地上、兔子趴在健身房地墊上）。這些動物是**趴在家具上**
畫的，去背會把床一起挖掉，用周圍的像素補也補不乾淨——那不是平坦的草地，
是有木紋、有陰影、有被子褶皺的地方。

### 19.1 不要修圖，改成自己組

素材庫裡本來就有每個場景的家具：十二件小房間擺飾、十二件庭院擺飾……
全部是乾淨的單件去背 PNG。所以改成牆面與地板自己畫，家具擺上去：

```bash
base() {   # 上半是牆（漸層），下半是地板（純色＋一條踢腳線）
  convert -size "${W}x${GROUND}" "gradient:$2-$3" "$TMP/wall.png"
  convert -size "${W}x$(( H - GROUND ))" "xc:$4" "$TMP/floor.png"
  convert "$TMP/wall.png" "$TMP/floor.png" -append \
          -fill "#0000001e" -draw "rectangle 0,$GROUND $W,$(( GROUND + 4 ))" "$1"
}

put() {    # 座標是「底部中心」，所以不管素材多高都站得穩
  convert "$TMP/raw.png" -resize "x$ht" "$TMP/i.png"
  convert "$canvas" "$TMP/i.png" -geometry "+$(( cx - w / 2 ))+$(( by - h ))" \
          -composite "$canvas"
}
```

一隻動物也沒有，而且**地板線由我們決定**——`GROUND=312`，正好是遊戲裡
`PetBody.GROUND = 0.78` 乘上畫布高度 400。寵物、家具、擺飾站在同一條線上，
看起來才是同一個空間。

家具刻意靠兩側擺，中間留一段空地，寵物才有地方走來走去。

### 19.2 半空中那根藍色橫槓

海邊場景組好之後，遮陽傘上方浮著一根藍色橫槓。

圖鑑素材是用像素色差自動分離的，作者在使用說明裡也提醒過「少數淺色外緣
可能需要手動修邊」。遮陽傘那張剛好黏了一截顏色接近的海平線——在原圖上
看不出來，放到別的背景上就現形了。

修法是只留最大的那一塊連通區域：

```bash
box=$(convert "$1" -alpha extract -threshold 20% \
        -define connected-components:verbose=true \
        -connected-components 8 null: 2>&1 \
      | grep 'gray(255)' | sort -k4 -n -r | head -1 | awk '{print $2}')
convert "$1" -crop "$box" +repage "$2"
```

單件家具本來就只有一塊，取最大的再裁一次就乾淨了。順帶抓出另一個壞掉的
素材：太空艙的「小機器人」自動去背失敗，只剩一圈灰色描邊，換成太空獎盃。

### 19.3 擺飾要放在合理的地方

買來的擺飾原本固定放在左下角，結果跟背景的書架疊在一起。改成放在地板帶
中間偏右的空地：

```gdscript
var ground: float = view.y * PetBody.GROUND
var front: float = ground + (view.y - ground) * 0.45
_decor.position = Vector2(view.x * 0.62, front - dh * 0.5)
```

比地板線再低一點，看起來就是「放在房間前方的地上」。擺飾比寵物早加入場景，
所以寵物走過去時會在擺飾前面——前後關係也對。

### 19.4 不可復原的動作不要用原生 confirm()

測試期間寵物被換掉了**兩次**，連同代幣與買過的東西一起歸零，而且當天的
自動備份早於寵物功能上線，備份裡根本沒有 `pet` 表。

原因是「確認換成這隻」按完會跳系統的 `confirm()`，而系統對話框的「確定」
就在手指剛剛按的位置附近——誤觸一次按鈕、再誤觸一次確定，寵物就沒了。
原生對話框看起來很安全，其實是**兩次同位置的點擊**。

改成頁面內的勾選框：

```html
<label class="row agree small">
  <input v-model="agreed" type="checkbox" />
  <span>我知道這會刪掉「{{ pet.name }}」的紀錄，而且無法復原</span>
</label>
<button class="primary" :disabled="!picked || !agreed || busy" @click="confirmChange">
```

兩次操作在畫面上的位置差很遠，不可能連續誤觸；離開面板會自動取消，
不會留著一個「已確認」的狀態等人踩。

順帶一提，這也是為什麼自動備份要**在功能上線時就跑一次**，而不是等排程——
`pet` 表是當天建立的，當天凌晨三點的備份裡自然沒有它。

---

## 20. 把 Godot 收回來

Godot 版跑起來之後，整個路徑是通的：逐格動畫、行為狀態機、換場景即時生效。
但使用者看過之後決定先拿掉引擎與逐格動畫，只留狀態機。

這一節記的是**怎麼把一個已經整合進去的東西乾淨地拔掉**，而且不把它一起帶走的
東西也拔掉。

### 20.1 分清楚哪些是 Godot 的、哪些不是

那次改動其實混了四件事，只有前兩件要退掉：

| | 去留 |
|---|---|
| Godot 引擎與網頁匯出 | 退掉 |
| sprite sheet 的逐格動畫 | 退掉 |
| 行為狀態機 | **留著**，改用 JS 跑 |
| 動物特性（作息曲線、體型、專屬動作） | **留著**，本來就是後端資料 |

狀態機的規則本身跟 Godot 無關——它只是「依權重抽下一個狀態」。所以
`game/pet/fsm/state_machine.gd` 那套權重原封不動搬到 `web/src/pet-fsm.js`：

```js
if (a < 0.25) w = { sleep: 70, doze: 25, idle: 5 };
else if (a < 0.5) w = { doze: 32, idle: 34, walk: 22, act: 12 };
else if (a < 0.75) w = { idle: 18, walk: 34, act: 38, doze: 10 };
else w = { idle: 8, walk: 28, act: 54, doze: 2 };
```

二十幾個專屬動作改成對應 CSS 類別與貓的動作圖，而不是對應程序動畫的配方：

```js
const RECIPES = {
  dustbath: { css: 'groom', pose: 'groom' },
  wheel:    { css: 'play',  pose: 'play' },
  plod:     { css: 'walk',  pose: 'walk' },
  // ...
};
```

結果是十隻動物**還是各有各的作息**——倉鼠半夜活躍、陸龜白天慢走——
只是表現方式從 96×96 的逐格動畫變回一張圖加 CSS 動畫。

`game/pet/` 整個留在版控裡，匯出腳本也留著。要再開回來是兩行的事。

### 20.2 退掉之後才冒出來的比例問題

Godot 版是照 `size`（動物特性表裡「站著時佔場景高度的幾成」）縮放的；
靜態版本來寫死 `height: 148px`，在 230px 高的場景裡等於**六成四**，
而且陸龜跟小鸚鵡一樣大。

退回靜態版之後這個問題就回來了，所以把同一個 `size` 套到 CSS：

```js
const petHeight = computed(() => {
  const size = behavior.value?.size ?? 0.3;
  const lying = current.value?.css === 'sleep';
  return `${Math.round(SCENE_H * size * (lying ? 1.15 : 1))}px`;
});
```

用 px 而不是百分比，是因為場景是 grid item 且 `align-items` 不是 `stretch`，
百分比高度在這個情況下不會解析，圖會用自然大小撐破場景。

順便修掉一個疊圖：貓的 `act-sleep.webp` 本身就畫了 Z，程式又疊了一個 💤，
畫面上出現兩組 Z。道具改成只在「沒有動作圖」的物種才疊。

### 20.3 第三次把寵物弄丟，以及正確的修法

§19.4 把原生 `confirm()` 換成頁面內的勾選框之後，寵物**又**被換掉了一次
（變成龍貓，代幣歸零）。這次沒有證據：伺服器重啟時把日誌蓋掉了，
只知道 `created_at` 是整點 `03:00:00`，而且 `pet` 表只有兩個 HTTP 路由寫得到。

最可能的解釋是 service worker 還端著改版前的前端——**舊的程式碼還在跑**，
而舊的程式碼用的是 `confirm()`。

這也說明前端的確認有個結構性的問題：**它擋不住舊版的自己**。所以把確認
移到伺服器，要求呼叫端把「目前這隻的名字」原樣帶回來：

```js
export function replacePet(userId, species, name, confirmName) {
  const current = getPet(userId);
  if (current && String(confirmName ?? '').trim() !== current.name) {
    throw Object.assign(new Error('換寵物要把目前這隻的名字帶回來確認'), { status: 400 });
  }
  ...
}
```

舊版前端不會送這個欄位，所以會拿到 400 而不是把寵物換掉；任何誤觸也不可能
湊出正確的名字。

教訓很一般化：**不可復原的操作，確認要做在伺服器**。前端的確認是體驗，
不是防線——快取、舊分頁、離線的 service worker 都會讓舊的前端繼續活著。

---

## 21. 十種動物各自的動作圖

§20 把逐格動畫退掉之後，動作圖又只剩貓有（八張，從概念圖裡切的），
另外九種不管在做什麼都是同一張靜態本體。使用者補了第四批素材：
一張十隻動物 × 五個動作（待機／行走／進食／睡覺／玩耍）的精靈圖鑑。

這次刻意只取**每一列的其中一隻**，不做逐格動畫——會動的部分交給 CSS。

### 21.1 為什麼不能用格線切

版面看起來很規則，但其實兩個地方都不規則：

- **面板不等寬**。量出來最左邊 335px、中間只有 288px。照等分切會切到隔壁。
- **每一列的隻數與位置都不一樣**。有的三隻、有的四隻，間距也不固定。

面板邊界是用「白色間隙」的投影找出來的：把整張圖壓成一列像素，
找出連續偏白的區段就是欄間隙。

```bash
convert sheet.png -colorspace gray -resize 1536x1! txt:- \
  | awk -F'[,:(]' '{print $1, $4}'
```

列的位置則發現是等距的（間距 86.5px），所以列用算的、欄用找的。

### 21.2 黏在一起的動物

每一列要取最左邊那一隻。最直覺的做法是去背之後取最大的連通區域——
對貓、狗、倉鼠都成立，但**兔子、雪貂、龍貓整列會被當成同一塊**，
因為牠們在原圖上是肩併肩甚至交纏在一起的。先侵蝕再分家也沒用，
牠們是真的重疊。

改成看每一欄被塗到的高度：就算黏在一起，兩隻中間還是會「瘦一截」。
從左邊第一個波峰往右找到覆蓋率掉下來的谷底，那就是分界：

```js
for (; i <= b; i++) {
  if (cov[i] > peak) peak = cov[i];
  if (peak > 0.25 && cov[i] < peak * 0.45) break;   // 掉到波峰的四成五＝谷底
}
```

完全分開的情況谷底剛好是 0，同一套邏輯兩種都涵蓋。

橫向只剩一隻之後，再取最大的連通區域就能把上下列夾進來的一角濾掉——
兩個方法各自解決一半的問題。

### 21.3 三個讓腳本安靜壞掉的小地方

**ImageMagick 的 `txt:` 會印小數。** 縮成一列高之後每一欄是平均值，
`(2.71206,2.71206,2.71206)`，而且分母不一定是 65535。我原本用
`\((\d+)` 去抓括號裡的數字，抓到 `2` 再除以 65535，覆蓋率全部變成 0。
改讀十六進位那欄 `#030303`，永遠是整數。

**`read` 讀到沒有換行的 EOF 會回非零。** 輔助程式用
`process.stdout.write('10 79')` 沒加換行，`read -r sx sw < <(...)` 拿到了值
卻回傳 1，而腳本開著 `set -e` ——整個腳本安靜地中止，一個檔案都沒產生，
也沒有任何錯誤訊息。加上 `\n` 就好。

**第一列的帶子會吃到標題列。** 標題是一塊深色圓角矩形，去背去不掉，
還會被當成主體。把帶子的上緣夾在內容區開始的地方。

### 21.4 順手拆掉一顆地雷

`slice-pets.sh` 原本也會產生場景與貓的動作圖，但那兩樣都已經被
`build-scenes.sh` 與 `slice-actions.sh` 取代了。留著不只是死碼——
**跑一次就會把組好的乾淨場景蓋回有動物的版本**（§19）。直接移除那兩節。

### 21.5 第四次把寵物弄丟，以及不再靠確認

§20.3 把確認移到伺服器之後，寵物**又**被換掉了一次（變成龍貓、代幣歸零）。
這次的請求一定帶了正確的確認值，否則過不了伺服器那關；但日誌又被重啟蓋掉，
查不出來源。

四次之後我放棄「把確認做得更嚴」這條路——每多一道關卡都只是降低機率，
而且每一道都讓正常使用者更麻煩。改成讓這個操作**不再具有破壞性**：

```sql
CREATE TABLE IF NOT EXISTS pet_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  species TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
  coins INTEGER NOT NULL DEFAULT 0, equipped TEXT NOT NULL DEFAULT '{}',
  settled_to TEXT NOT NULL DEFAULT '',
  items TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT '',
  replaced_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
```

換掉之前先把舊的那一隻連同代幣與買過的東西整隻存進去。
「無法復原」是設計上的選擇，不是技術上的必然——留一份存根的成本幾乎是零。

另外在路由上用 `warn` 記一筆，連 user-agent 與來源 IP 一起留下來，
下次再發生就查得到。

---

## 22. 商城改賣「這隻自己的衣服」

第五批素材是 `pet/穿搭/`：**每隻動物一張自己的衣櫃圖**。重點是配色跟著物種走——
天竺鼠是草綠米白、小狗是天藍、貓是橘白、刺蝟是楓葉棕。同一頂草帽在不同動物
身上是不同顏色的。

這件事改變了商城的結構：清單不再是一份固定的 `SHOP`，而是
`shopFor(species)` ＝ 五個環境 ＋ 這隻的衣櫃。

```js
const SCENE_ITEMS = SCENES.map(...);                        // 共用
export const shopFor = (species) => [...SCENE_ITEMS, ...wardrobeOf(species)];

// 查商品要涵蓋所有物種：換寵物之後舊的穿戴紀錄還在 pet_history 裡
const EVERYTHING = [...SCENE_ITEMS, ...ALL_WEAR];
export const itemOf = (id) => EVERYTHING.find(i => i.id === id) || null;
```

商城從 218 件變成 15 件（5 個環境 ＋ 10 件衣服），而且每一件都看得出是為這隻畫的。
先前那份兩百多件的圖鑑素材沒有刪掉——它現在的用途是給 `build-scenes.sh`
組場景背景（§19）。

部位也跟著縮：素材只有帽子、衣服、配件，沒有鞋襪；擺飾退場，因為場景背景
本來就把家具畫進去了。

### 22.1 切圖：這次反而單純

衣櫃圖本來就是透明背景，所以不必去背，直接做連通區域分析。唯一要處理的是
**正中間那一塊是動物本體，不是商品**：

```bash
if (x <= cx && cx <= x + w && y <= cy && cy <= y + h) next;   # 動物本體
```

用「框有沒有蓋到圖片中心」判斷，比用面積可靠——有些物種的雨衣畫得比動物還大。

### 22.2 一個切不開、也不該硬切的格子

小狗那張的帽 T 跟雨衣是疊在一起畫的。侵蝕咬不斷，而「寬高比」也分不出來：

| | 寬高比 |
|---|---|
| 小狗的帽 T ＋ 雨衣（兩件） | 1.71 |
| 鸚鵡的圍巾（一件） | 1.95 |

門檻設 1.55 會把圍巾、蝴蝶結、花邊領全部切成兩半（98 件變 113 件）；
設 1.9 又切不到小狗那格。**沒有一個寬高比能把兩者分開**，所以不自動切，
那一格當成「雨天兩件組」賣——跟畫面上看到的一致。

這裡的判斷是：一個救不了所有情況的啟發式，不如不要。留著只會在別的素材
進來時安靜地切錯。

### 22.3 穿戴位置只能是折衷

配件槽裡同時有頭圈、圍巾、蝴蝶結、側背包，一個固定位置不可能都剛好。
目前的數字是試出來的折衷：

```css
.worn.hat   { top: -5%; width: 40%; }
.worn.cloth { top: 38%; width: 52%; }
.worn.acc   { top: 24%; width: 32%; }
```

帽子原本是 `top: -14%`，那是配合舊素材訂的；新的動作圖是去邊裁出來的，
動物本身就貼著上緣，-14% 會讓整頂帽子浮在頭頂上方。

---

## 23. 吃飽了，寵物還在討食

使用者回報：Martina 今天熱量明明夠了，寵物卻一直討食。

資料擺出來就看得很清楚：

| 日期 | 品項 | 熱量 |
|---|---|---|
| **10-13（今天）** | **18** | **3770 / 2010** |
| 10-12 | 0 | — |
| 10-11 | 0 | — |
| 10-10 | 0 | — |

`petState()` 算「連續幾天沒記錄」的迴圈是這樣寫的：

```js
let silent = 0;
for (let i = 1; i <= WINDOW; i++) {       // ← 從「昨天」開始數
  if (dailySummary(userId, daysAgo(i)).nutrition.items) break;
  silent++;
}
```

`i` 從 1 起跳，所以**今天記了什麼完全不看**。於是今天吃了十八筆，寵物還是
回報 `silent = 3`、心情 `hungry`、說「3 天沒看到你記錄了，牠在等你」。

### 23.1 為什麼當初會這樣寫

不是手滑。整個 `petState()` 都刻意跳過今天，理由跟代幣結算一樣：
**今天還沒過完，拿半天的量去評斷不公平**。早上吃完早餐就把今天算進平均，
平均反而往下掉——剛吃完東西寵物卻變瘦，這說不過去。

問題是這個理由只適用於「平均」，不適用於「幾天沒記錄」。
有沒有記錄是個事實，不需要等一天過完才知道。

### 23.2 分開處理

兩個迴圈的語意本來就不同，所以分開：

```js
// 連續幾天沒記錄了。**要從今天開始數**
for (let i = 0; i <= WINDOW; i++) { ... }
```

平均則保留原本的用意，但補上一個單向的例外：

```js
// 今天只在「已經吃到目標」或「天都快黑了」的時候才算進平均。
// 這個偏袒是單向的——今天只會讓結果變好，不會無端變差。
const todayRow = ratios(today());
if (todayRow && (todayRow.kcalRatio >= 1 || new Date().getHours() >= 20)) {
  days.push(todayRow);
}
```

三種情況都說得通：

- 下午吃到 187%：算進來，寵物馬上開心
- 早上剛吃 25%：不算，寵物不會因為你剛吃完而變瘦
- 晚上九點只吃到 70%：算進來，這天確實吃不夠

修好之後 Martina 的寵物：`silent 0`、`happy`、「熱量跟蛋白質都在範圍內，牠心情很好」。

### 23.3 這一支值得寫測試

`tests/pet-state.test.js` 是整個專案唯一會碰 SQLite 的測試。用假資料繞過
資料庫就驗不到真正出錯的地方——要驗的東西**就是「哪幾天算進來」**。
`FIT_DATA_DIR` 指到拋棄式目錄，不會動到正式紀錄。

寫完一定要確認它真的抓得到這個 bug：把 `i = 0` 改回 `i = 1`，測試要失敗。

```
× 今天有記錄就不該說「幾天沒看到你記錄」
Tests  1 failed | 18 passed
```

一個不會因為 bug 回來而失敗的測試，只是讓數字好看而已。

---

## 24. 主頁的「新增訪客」按鈕

§23 之後要再加一個人，流程是：改 `users.js`、填 `server/.env`、重啟服務。
要讓朋友臨時試用一下，這個流程太重了。所以訪客改成**執行時建立**：
主頁按一下就多一個獨立帳號（自己的資料庫、自己的寵物），密碼當場產生。

### 24.1 按鈕不能把按的人登出

原本的簽章金鑰是這樣算的：

```js
createHash('sha256')
  .update('fit-session:' + USERS.map(u => `${u.id}=${passwordOf(u)}`).join('|'))
```

從密碼推導是刻意的——改了密碼，舊的登入自動失效，不必另外做撤銷機制。
但如果訪客也算進去，**每按一次「新增訪客」就等於換了一把鑰匙**，
按鈕的第一個效果是把自己踢出去。

所以金鑰只看固定帳號：

```js
.update('fit-session:' + USERS
  .filter(u => !u.guest)
  .map(u => `${u.id}=${passwordOf(u)}`)
  .join('|'))
```

「改密碼就登出所有人」是功能，「新增帳號就登出所有人」是 bug，
兩者差在金鑰該不該跟著那一類變動走。

### 24.2 USERS 要就地改，不能整個換掉

七個模組都是 `import { USERS } from './users.js'`，拿到的是同一個陣列參照。
新增訪客時如果寫成 `USERS = [...]`，那些模組會繼續看著舊的陣列，
新帳號在別的地方就不存在——登入查得到、`getDb()` 卻說「未知的使用者」。

```js
export const USERS = [...BUILTIN, ...loadGuests()];

export function addGuest() {
  const g = createGuest();
  USERS.push(g);          // ← 就地加，不要重新指派
  return g;
}
```

密碼來源也跟著分兩種：

```js
export const passwordOf = (user) =>
  String(user?.password ?? process.env[user?.envKey] ?? '');
```

固定帳號在 `.env`（改了要重啟），訪客跟著帳號本身走（存在 JSON 裡，立即生效）。

### 24.3 幾個刻意的決定

**要先登入才能建。** 這個服務是對外開放的（Tailscale Funnel），
`/api/guests` 不在公開路徑清單裡，沒登入是 401——不然任何人都能自己開帳號進來。

**id 不重複使用。** `guests.json` 存了一個 `nextId`，只會往上加。
刪掉訪客 2 之後下一個是訪客 3，不是再一個訪客 2。

**刪帳號不刪資料庫。** `fit-guest-2.db` 會留著。萬一按錯，紀錄還在；
而且 id 不會被下一個訪客撿到，留著也不會混到別人的資料。

**密碼只顯示一次。** 建立的回應裡有明碼，之後只存在
`server/data/guests.json`（跟資料庫放一起，本來就不進版控）。
存明碼跟 `.env` 那幾組一致——這個專案的威脅模型從頭到尾就是
「一台自己的機器、只有認識的人連得到」，不在這裡假裝更嚴格。

---

*這份文件描述的是一個真實在用的個人專案，不是教學樣板。程式碼裡的註解刻意保留了「為什麼這樣寫」與「這裡踩過什麼坑」，建議搭配原始碼一起讀。*
