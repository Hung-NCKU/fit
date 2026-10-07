import { getDb, getProfile, updateProfile, GOAL_LABEL } from './db.js';
import { generateContent, partsToText, partsToCalls } from './gemini.js';
import {
  addMeal, getMeal, updateMeal, deleteMeal,
  addWorkout, addWeight, listMeals, listWorkouts, listWeights,
  dailySummary, rangeSummary, recentContext, today, daysAgo,
} from './records.js';

const S = 'STRING', N = 'NUMBER', I = 'INTEGER', O = 'OBJECT';

/* ------------------------- 工具定義 ------------------------- */

export const toolDeclarations = [
  {
    name: 'log_meal',
    description: '把使用者吃過的一項食物寫進飲食紀錄。使用者只要提到「我吃了…」「剛才喝了…」就要呼叫。'
      + '若使用者沒給熱量與營養素，請依常見食物份量自行估算並填入（不要填 0）。一餐有多項食物時，一項呼叫一次。',
    parameters: {
      type: O,
      properties: {
        date: { type: S, description: '日期 YYYY-MM-DD，未指定就留空代表今天' },
        meal_type: { type: S, enum: ['breakfast', 'lunch', 'dinner', 'snack'], description: '餐別' },
        name: { type: S, description: '食物名稱，例如「雞胸肉」「燕麥牛奶」' },
        portion: { type: S, description: '份量描述，例如「150g」「一碗」「500ml」' },
        kcal: { type: N, description: '熱量（大卡），估算值' },
        protein_g: { type: N, description: '蛋白質克數' },
        carb_g: { type: N, description: '碳水化合物克數' },
        fat_g: { type: N, description: '脂肪克數' },
        note: { type: S, description: '備註' },
      },
      required: ['name', 'kcal', 'protein_g', 'carb_g', 'fat_g'],
    },
  },
  {
    name: 'log_workout',
    description: '把使用者做過的一個訓練動作寫進訓練紀錄。使用者提到「我今天練了…」「做了幾組幾下」就要呼叫。'
      + '多個動作要分別呼叫。有氧或伸展請填 duration_min。',
    parameters: {
      type: O,
      properties: {
        date: { type: S, description: '日期 YYYY-MM-DD，未指定就留空代表今天' },
        exercise: { type: S, description: '動作名稱，例如「槓鈴深蹲」「啞鈴臥推」' },
        category: { type: S, enum: ['legs', 'chest', 'back', 'shoulders', 'arms', 'core', 'cardio', 'other'], description: '部位分類' },
        sets: { type: I, description: '組數' },
        reps: { type: I, description: '每組次數' },
        weight_kg: { type: N, description: '每下負重（公斤），徒手填 0' },
        duration_min: { type: N, description: '時間（分鐘），重訓可填 0' },
        rpe: { type: N, description: '自覺強度 1-10' },
        note: { type: S, description: '備註' },
      },
      required: ['exercise'],
    },
  },
  {
    name: 'log_weight',
    description: '記錄體重（與體脂率）。使用者說「今天量了幾公斤」時呼叫。',
    parameters: {
      type: O,
      properties: {
        date: { type: S, description: '日期 YYYY-MM-DD，留空代表今天' },
        weight_kg: { type: N, description: '體重（公斤）' },
        body_fat_pct: { type: N, description: '體脂率（%），沒有就不填' },
        note: { type: S, description: '備註' },
      },
      required: ['weight_kg'],
    },
  },
  {
    name: 'edit_meal',
    description: '修改一筆已存在的飲食紀錄。使用者說「剛剛那個雞胸肉其實是 200g」「把早餐的蛋白質改成 20g」'
      + '「那碗飯熱量太高了改 250」時呼叫。id 從【目前資料庫狀況】的飲食明細（#編號）或 get_records 取得。'
      + '只填要改的欄位；份量改了的話要一併重新估算熱量與三大營養素。',
    parameters: {
      type: O,
      properties: {
        id: { type: I, description: '要修改的飲食紀錄編號' },
        name: { type: S, description: '食物名稱' },
        portion: { type: S, description: '份量描述' },
        meal_type: { type: S, enum: ['breakfast', 'lunch', 'dinner', 'snack'], description: '餐別' },
        date: { type: S, description: '日期 YYYY-MM-DD' },
        kcal: { type: N, description: '熱量（大卡）' },
        protein_g: { type: N, description: '蛋白質克數' },
        carb_g: { type: N, description: '碳水克數' },
        fat_g: { type: N, description: '脂肪克數' },
        note: { type: S, description: '備註' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_meal',
    description: '刪除指定的飲食紀錄。使用者明確指出要刪哪一筆（「把昨天的鹹酥雞刪掉」「早餐那筆不要了」）時呼叫。'
      + 'id 從【目前資料庫狀況】的飲食明細（#編號）或 get_records 取得。',
    parameters: {
      type: O,
      properties: {
        ids: { type: 'ARRAY', items: { type: I }, description: '要刪除的飲食紀錄編號，可一次多筆' },
      },
      required: ['ids'],
    },
  },
  {
    name: 'undo_last_meal',
    description: '撤銷「上一次」記錄的飲食（上一則對話裡記下的所有品項一起刪掉）。'
      + '使用者說「反悔」「取消」「剛剛那個不算」「記錯了」「我沒吃」「撤回」「算了不要記」等，'
      + '且沒有指明是哪一筆時呼叫。不需要編號。',
    // 沒有參數：Gemini 不接受 properties 為空的 OBJECT，所以整個不給 parameters
  },
  {
    name: 'update_goal',
    description: '修改使用者的目標或身體數據，並自動重算每日熱量與三大營養素目標（今日頁面的目標數字會跟著變）。'
      + '使用者說「我想改成減脂」「目標體重改 50 公斤」「我現在一週練 5 天」「蛋白質目標改成 120g」時呼叫。'
      + '只填使用者有提到的欄位，其他留空。只是問建議、沒有要改的話不要呼叫。',
    parameters: {
      type: O,
      properties: {
        goal: { type: S, enum: ['muscle_gain', 'maintain', 'fat_loss'], description: '目標：增肌 / 維持 / 減脂' },
        goal_weight_kg: { type: N, description: '目標體重（公斤）' },
        weight_kg: { type: N, description: '目前體重（公斤）' },
        height_cm: { type: N, description: '身高（公分）' },
        age: { type: I, description: '年齡' },
        activity: {
          type: N,
          description: '活動係數，只能是 1.2（幾乎不動）/ 1.375（每週運動 1-3 天）/ 1.55（每週 3-5 天）/ 1.725（每週 6-7 天）',
        },
        target_kcal: { type: I, description: '直接指定每日熱量目標（大卡），使用者明確說了數字才填' },
        target_protein_g: { type: I, description: '直接指定每日蛋白質目標（克），使用者明確說了數字才填' },
        target_carb_g: { type: I, description: '直接指定每日碳水目標（克），使用者明確說了數字才填' },
        target_fat_g: { type: I, description: '直接指定每日脂肪目標（克），使用者明確說了數字才填' },
        notes: { type: S, description: '給教練的長期備註，例如「乳糖不耐」「只能在家徒手訓練」。會取代原本的備註' },
      },
    },
  },
  {
    name: 'get_records',
    description: '查詢資料庫裡的歷史紀錄。需要回顧某段期間吃了什麼、練了什麼、體重變化，或要做每週檢討時呼叫。',
    parameters: {
      type: O,
      properties: {
        type: { type: S, enum: ['meals', 'workouts', 'weights', 'daily_summary', 'range_summary'], description: '要查的資料種類' },
        date: { type: S, description: '單日查詢用 YYYY-MM-DD' },
        from: { type: S, description: '起始日期 YYYY-MM-DD' },
        to: { type: S, description: '結束日期 YYYY-MM-DD' },
        days: { type: I, description: '往前查幾天（會覆寫 from/to），例如 7 代表最近一週' },
      },
      required: ['type'],
    },
  },
];

/* ------------------------- 工具執行 ------------------------- */

/** 改完或刪完之後，讓模型知道今天變成多少，好在回覆裡告訴使用者 */
function todayTotals(userId, date = today()) {
  const s = dailySummary(userId, date);
  return {
    今日累計: `${Math.round(s.nutrition.kcal)}kcal / 蛋白質 ${Math.round(s.nutrition.protein_g)}g`,
    還差: `${s.remaining.kcal}kcal、蛋白質 ${s.remaining.protein_g}g`,
  };
}

/**
 * 「上一次記錄的飲食」＝最近一則有 log_meal 動作的教練回覆裡存下的那幾筆。
 * 用對話紀錄而不是 created_at 判斷，照片一次辨識出好幾樣食物時才能整批撤銷。
 */
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

function runTool(userId, name, args = {}, photo = '') {
  switch (name) {
    case 'log_meal': {
      // 這一輪是照片辨識的話，把照片一起存進紀錄，之後回頭看得到吃了什麼
      const row = addMeal(userId, { ...args, photo }, photo ? 'photo' : 'ai');
      const sum = dailySummary(userId, row.date);
      return {
        ok: true, saved: row,
        今日累計: `${Math.round(sum.nutrition.kcal)}kcal / 蛋白質 ${Math.round(sum.nutrition.protein_g)}g`,
        還差: `${sum.remaining.kcal}kcal、蛋白質 ${sum.remaining.protein_g}g`,
      };
    }
    case 'log_workout':
      return { ok: true, saved: addWorkout(userId, args, 'ai') };
    case 'log_weight':
      return { ok: true, saved: addWeight(userId, args) };
    case 'edit_meal': {
      const id = Number(args.id);
      const before = getMeal(userId, id);
      if (!before) return { ok: false, error: `找不到編號 #${id} 的飲食紀錄` };
      const { id: _drop, ...patch } = args;
      const after = updateMeal(userId, id, patch);
      return { ok: true, before, saved: after, ...todayTotals(userId, after.date) };
    }
    case 'delete_meal': {
      const ids = (Array.isArray(args.ids) ? args.ids : [args.ids]).map(Number).filter(Boolean);
      const removed = [];
      const missing = [];
      for (const id of ids) {
        const row = getMeal(userId, id);
        if (row && deleteMeal(userId, id)) removed.push(row);
        else missing.push(id);
      }
      return { ok: removed.length > 0, removed, missing, ...todayTotals(userId) };
    }
    case 'undo_last_meal': {
      const ids = lastLoggedMealIds(userId);
      if (!ids.length) return { ok: false, error: '最近的對話裡沒有找到可以撤銷的飲食紀錄' };
      const removed = [];
      for (const id of ids) {
        const row = getMeal(userId, id);
        if (row && deleteMeal(userId, id)) removed.push(row);
      }
      if (!removed.length) return { ok: false, error: '上一次記錄的飲食已經被刪除過了' };
      return { ok: true, removed, ...todayTotals(userId) };
    }
    case 'update_goal': {
      const patch = { ...args };
      // 活動係數只接受四個標準值，模型給了別的數字就取最接近的
      if (patch.activity != null) {
        const levels = [1.2, 1.375, 1.55, 1.725];
        patch.activity = levels.reduce((a, b) =>
          Math.abs(b - patch.activity) < Math.abs(a - patch.activity) ? b : a);
      }
      const { before, after } = updateProfile(userId, patch, { recalc: true });
      const pick = (p) => ({
        目標: GOAL_LABEL[p.goal] ?? p.goal, 目標體重: p.goal_weight_kg, 體重: p.weight_kg,
        熱量: p.target_kcal, 蛋白質: p.target_protein_g, 碳水: p.target_carb_g, 脂肪: p.target_fat_g,
      });
      return { ok: true, 修改前: pick(before), 修改後: pick(after) };
    }
    case 'get_records': {
      const to = args.to || today();
      const from = args.days ? daysAgo(args.days - 1) : args.from;
      switch (args.type) {
        case 'meals':    return { rows: listMeals(userId, { date: args.date, from, to, limit: 200 }) };
        case 'workouts': return { rows: listWorkouts(userId, { date: args.date, from, to, limit: 200 }) };
        case 'weights':  return { rows: listWeights(userId, { limit: 60 }) };
        case 'daily_summary':  return dailySummary(userId, args.date || today());
        case 'range_summary':  return rangeSummary(userId, from || daysAgo(6), to);
        default: return { error: '未知的 type' };
      }
    }
    default:
      return { error: `未知的工具 ${name}` };
  }
}

/* ------------------------- 系統提示 ------------------------- */

export function buildSystemPrompt(userId, context) {
  const p = getProfile(userId);
  const goal = GOAL_LABEL[p.goal] ?? '增肌';
  return `你是一位專業的健身教練兼營養師，服務對象是 ${p.name}，${p.age} 歲${p.sex === 'female' ? '女性' : '男性'}（身高 ${p.height_cm}cm、體重 ${p.weight_kg}kg、目標體重 ${p.goal_weight_kg}kg），目前的目標是「${goal}」。
每日營養目標：${p.target_kcal} kcal / 蛋白質 ${p.target_protein_g}g / 碳水 ${p.target_carb_g}g / 脂肪 ${p.target_fat_g}g。

【你的角色】
- 用繁體中文（台灣用語）回答，語氣像真人教練：具體、直接、鼓勵，不說空話。
- 回答要可執行：給份量、給組數次數、給替代方案，不要只講原則。
- 若對方 BMI 偏低，主要瓶頸通常是「吃不夠」而不是「練不夠」：優先確保熱量與蛋白質達標，並建議高熱量密度、好入口的食物（堅果、酪梨、全脂奶、花生醬、橄欖油、雞蛋、乳清），因為胃容量有限。
- 若 BMI 正常或偏高，熱量盈餘要控制，重點放在蛋白質足量與漸進超負荷，避免增肌同時堆太多體脂。
- 重訓以複合動作與漸進超負荷為主，一週 3-4 次全身或上下肢分化；有氧適量即可，不要抵銷熱量盈餘。
- 你不是醫師。若出現疑似厭食、經期異常、長期吃不下、體重持續下降等狀況，提醒對方就醫或找註冊營養師，但只講一次、不要說教。

【紀錄工具】
- 使用者一提到吃了什麼、練了什麼、量了體重，就立刻呼叫對應工具寫入資料庫，不要只是口頭回覆。
- 營養素未知時你要自己估算（依台灣常見食物份量），絕對不要填 0 或反問她熱量是多少。
- 寫入後，用一句話告訴她記了什麼、今天還差多少熱量與蛋白質。
- 需要回顧過去紀錄時呼叫 get_records，不要憑空編造數字。
- 修改或刪除飲食紀錄：
  - 使用者說某一筆份量、熱量、蛋白質等不對，要改 → 呼叫 edit_meal（編號看下方飲食明細的 #）。份量改了要一併重估營養素。
  - 使用者指定要刪某一筆 → 呼叫 delete_meal。
  - 使用者說「反悔」「取消」「剛剛那個不算」「記錯了」「我沒吃」「撤回」「算了」等，但沒指明哪一筆 → 呼叫 undo_last_meal。
    不要反問「要刪哪一筆」，直接撤銷上一次記的；撤銷後告訴對方刪了哪些、今天累計變成多少。
  - 只有在對方明確表達要改或要刪時才動作，閒聊中提到「後悔吃了」之類不算要刪除。
  - 一句話裡可能同時有好幾件事，例如「吻仔魚應該 3-5g 而已，再附上蕨餅」＝ edit_meal（吻仔魚）＋ log_meal（蕨餅），
    每一件都要各自呼叫工具，可以在同一輪一起呼叫。
  - 嚴禁在沒有呼叫工具的情況下說「已修改」「已調整」「已刪除」「已記錄」。沒做就不要說做了。
- 使用者要改目標（增肌／維持／減脂）、目標體重、訓練頻率、或直接指定某個營養目標數字時，呼叫 update_goal。
  改完後告訴對方新的每日熱量與蛋白質目標，並說明「今日」頁面的目標已經更新。只是問「要不要改」時先給建議，對方同意才改。
- 今天是 ${today()}。

【看照片估熱量】
使用者傳食物照片時：
1. 辨識出畫面上「每一樣」食物，分別呼叫一次 log_meal，不要合併成一筆「便當」。
2. 用餐具、碗盤、手、飲料杯當比例尺推估份量，並把推估寫進 portion，例如「約 1 碗 (200g)」。
3. 台灣常見餐點要抓準：雞腿便當約 800-900 kcal、滷肉飯一碗約 500 kcal、鹹酥雞一份約 600 kcal、
   超商雞胸肉一包約 110 kcal、無糖豆漿 400ml 約 140 kcal。
4. 看不出來的就選最接近的常見品項並估算，只在回覆裡說明你的假設；絕對不要因為不確定就不呼叫工具。
5. 如果照片裡根本沒有食物（例如是體重計、課表、健身房器材），不要呼叫 log_meal，直接針對畫面內容回答。
   看到體重計數字就呼叫 log_weight。
6. 回覆時先列出你辨識到的品項與熱量，再給一句這餐對增肌的評價與補強建議。

【目前資料庫狀況】
${context}`;
}

/* ------------------------- 對話主流程 ------------------------- */

// 每一輪都是一次 API 請求，免費額度以「每天幾次」計算，所以壓低輪數
const MAX_TOOL_ROUNDS = 3;

export async function chat(userId, userText, history, image = null, model = null) {
  const systemInstruction = buildSystemPrompt(userId, recentContext(userId, 7));

  // 圖片放在文字前面，Gemini 對「先看圖再讀指令」的理解比較穩
  const userParts = [];
  if (image) userParts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
  userParts.push({ text: userText });

  const contents = [
    ...history.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    { role: 'user', parts: userParts },
  ];

  const actions = [];
  let reply = '';
  let usedModel = model || null;   // 使用者在選單指定的模型；null＝自動（照候補鏈）

  /** 跑到模型不再呼叫工具為止，回傳最後的文字 */
  async function runRounds(maxRounds) {
    let text = '';
    for (let round = 0; round < maxRounds; round++) {
      // preferModel：同一輪對話固定用同一個模型，不要每次重新試探候補鏈
      const { candidate: cand, model } = await generateContent({
        contents, systemInstruction, tools: toolDeclarations, preferModel: usedModel,
      });
      usedModel = model;
      const parts = cand.content?.parts || [];
      const calls = partsToCalls(parts);
      const t = partsToText(parts);
      if (t) text = t;

      if (!calls.length) break;

      contents.push({ role: 'model', parts });
      const responseParts = [];
      for (const call of calls) {
        let result;
        try {
          result = runTool(userId, call.name, call.args || {}, image?.file || '');
        } catch (err) {
          result = { error: String(err.message || err) };
        }
        actions.push({ tool: call.name, args: call.args || {}, result });
        responseParts.push({ functionResponse: { name: call.name, response: { result } } });
      }
      contents.push({ role: 'user', parts: responseParts });
    }
    return text;
  }

  reply = await runRounds(MAX_TOOL_ROUNDS);

  // 事後核對：模型嘴上說改了／刪了，但這一輪根本沒呼叫對應工具 → 要它補做或更正。
  // 實際發生過：「吻仔魚應該 3-5g 而已，再附上蕨餅」→ 只記了蕨餅，卻回覆「吻仔魚微調一下份量」。
  const gap = claimedButNotDone(userText, reply, actions);
  if (gap) {
    console.warn(`[coach] ${userId}：回覆宣稱有修改／刪除但沒呼叫工具，追問模型補做`);
    contents.push({ role: 'model', parts: [{ text: reply }] });
    contents.push({ role: 'user', parts: [{ text: gap }] });
    const fixed = await runRounds(MAX_TOOL_ROUNDS);
    if (fixed) reply = fixed;
  }

  if (!reply) reply = actions.length ? '已記錄完成。' : '（沒有取得回覆，請再說一次）';
  return { reply, actions, model: usedModel };
}

/**
 * 比對「回覆宣稱做了什麼」與「實際呼叫了哪些工具」。有落差時回傳要追問模型的訊息，沒有則回 null。
 * 同時要求使用者的話裡有「更正」的意味，避免模型只是給建議（「可以調整一下份量」）也被誤判。
 */
export function claimedButNotDone(userText, reply, actions) {
  const used = new Set(actions.map(a => a.tool));
  const userCorrects = /(應該|其實|不是|只有|而已|改|記錯|太多|太少|份量|分量|刪|不算|反悔|取消|沒吃|撤)/.test(userText);
  if (!userCorrects) return null;

  const claimsEdit = /(微調|修改|改成|改為|修正|更正|調整|改一下|幫妳改|幫你改)/.test(reply)
    && !used.has('edit_meal');
  const claimsDelete = /(刪除|刪掉|撤銷|撤回|移除|拿掉)/.test(reply)
    && !used.has('delete_meal') && !used.has('undo_last_meal');
  if (!claimsEdit && !claimsDelete) return null;

  const what = claimsEdit ? '修改（edit_meal）' : '刪除（delete_meal / undo_last_meal）';
  return `（系統檢查，不是使用者說的話）你剛才的回覆說已經${claimsEdit ? '修改' : '刪除'}了飲食紀錄，`
    + `但這一輪並沒有呼叫${what}，資料庫實際上沒有變。`
    + '如果使用者確實要求更正，現在就呼叫對應工具（編號看【目前資料庫狀況】的飲食明細），'
    + '做完後重新給一則完整回覆，列出這次實際做了哪些修改與新增、以及更新後的今日累計。'
    + '如果其實不需要修改，就重新回覆，但不要宣稱有修改。';
}

/* ------------------------- 對話歷史 ------------------------- */

export function saveMessage(userId, role, content, actions = [], image = '', model = '') {
  const r = getDb(userId)
    .prepare('INSERT INTO chat_messages (role, content, actions, image, model) VALUES (?, ?, ?, ?, ?)')
    .run(role, content, JSON.stringify(actions), image, model || '');
  return Number(r.lastInsertRowid);
}

export function loadHistory(userId, limit = 30) {
  const rows = getDb(userId).prepare('SELECT * FROM chat_messages ORDER BY id DESC LIMIT ?').all(limit);
  return rows.reverse().map(r => ({ ...r, actions: JSON.parse(r.actions || '[]') }));
}

export const clearHistory = (userId) =>
  getDb(userId).prepare('DELETE FROM chat_messages').run().changes;
