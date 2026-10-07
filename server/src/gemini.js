const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

/**
 * 免費方案是「每個模型每天幾次請求」，而且新模型給得很少
 * （實測 gemini-3.8-flash / gemini-flash-latest 都只有 20 次／天）。
 *
 * 所以候補鏈把額度寬鬆的 lite 排前面，flash 留作備援：
 * 實測 flash-lite-latest 的估算結果跟 flash 幾乎一樣（1010 vs 1100 kcal），
 * 但速度快 5 倍。注意 gemini-3.5-flash-lite 會漏記食物項目，不放進鏈裡。
 */
const DEFAULT_CHAIN = [
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
];

export function modelChain() {
  const raw = process.env.GEMINI_MODELS || process.env.GEMINI_MODEL;
  const chain = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_CHAIN;
  return chain.length ? chain : DEFAULT_CHAIN;
}

/* ---------------- 狀態記憶：避免把額度浪費在已知打不通的模型上 ---------------- */

const exhaustedUntil = new Map();   // model -> 恢復時間（毫秒）
// 已知不吃 thinkingConfig 的模型先寫死，否則每次重啟都要浪費一次請求去試探；
// 清單外的模型若回 400 仍會自動偵測並加入
const noThinking = new Set(['gemini-flash-lite-latest']);
const usedToday = new Map();        // model -> 今天已送出的請求數
let usageDate = new Date().toLocaleDateString('sv-SE');

const isExhausted = (m) => (exhaustedUntil.get(m) ?? 0) > Date.now();

function countRequest(model) {
  const today = new Date().toLocaleDateString('sv-SE');
  if (today !== usageDate) { usedToday.clear(); usageDate = today; }
  usedToday.set(model, (usedToday.get(model) ?? 0) + 1);
}

/** 隔天凌晨額度才會重置，直接記到當天結束 */
function markExhaustedForToday(model) {
  const t = new Date();
  t.setHours(24, 0, 5, 0);
  exhaustedUntil.set(model, t.getTime());
}

/**
 * 給前端選單用的模型目錄。速度與表現是在這個 App 的實際任務上量出來的
 * （同一句「雞腿便當＋豆漿＋兩顆茶葉蛋」、照片辨識、一句話同時改＋加）。
 */
export const MODEL_INFO = {
  'gemini-flash-lite-latest': {
    label: 'Flash-Lite',
    speed: '最快・約 1 秒',
    note: '日常記錄飲食、訓練、體重，簡單問答。額度最寬鬆，平常用它就好。'
      + '一句話同時要「改」又要「加」時偶爾會漏做一件。',
  },
  'gemini-3.1-flash-lite': {
    label: '3.1 Flash-Lite',
    speed: '快・約 1 秒',
    note: '跟 Flash-Lite 差不多，當作備用。營養素估算稍微保守（蛋白質偏低一點）。',
  },
  'gemini-3.6-flash': {
    label: '3.6 Flash',
    speed: '中等・約 5 秒',
    note: '照片辨識、複雜的一餐、一句話交代好幾件事、排課表、每週檢討。估算最細、最不容易漏。',
  },
  'gemini-3.5-flash': {
    label: '3.5 Flash',
    speed: '慢・約 15 秒',
    note: '長篇分析或深入討論。其他模型今天額度都用完時的最後備援。',
  },
  'gemini-3.8-flash': {
    label: '3.8 Flash',
    speed: '中等',
    note: '最新、品質最好，但免費額度每天只有 20 次。留給真的需要的重要提問。',
  },
};

/** 使用者可以指定的模型：目錄裡的 ＋ .env 候補鏈裡的 */
export const selectableModels = () => [...new Set([...Object.keys(MODEL_INFO), ...modelChain()])];

export function listModels() {
  const chain = modelChain();
  return selectableModels().map(id => ({
    id,
    label: MODEL_INFO[id]?.label ?? id,
    speed: MODEL_INFO[id]?.speed ?? '',
    note: MODEL_INFO[id]?.note ?? '',
    inChain: chain.includes(id),
    available: !isExhausted(id),
    usedToday: usedToday.get(id) ?? 0,
  }));
}

export function quotaStatus() {
  return modelChain().map(m => ({
    model: m,
    available: !isExhausted(m),
    usedToday: usedToday.get(m) ?? 0,
    resetsAt: isExhausted(m) ? new Date(exhaustedUntil.get(m)).toISOString() : null,
  }));
}

/* ---------------- 工具 ---------------- */

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const backoff = (attempt) => Math.min(8000, 500 * 2 ** attempt) + Math.random() * 400;

/** 從錯誤內容解析配額資訊：是每日還是每分鐘、要等多久 */
function parseQuota(json) {
  const details = json?.error?.details || [];
  const violation = details.find(d => d.violations)?.violations?.[0] || {};
  const retryRaw = details.find(d => d.retryDelay)?.retryDelay || '';
  const seconds = Number(String(retryRaw).replace('s', '')) || 0;
  const id = violation.quotaId || '';
  return {
    perDay: /PerDay/i.test(id),
    limit: violation.quotaValue,
    retryMs: Math.min(seconds * 1000 + 500, 30_000),
  };
}

function buildBody({ contents, systemInstruction, tools, model }) {
  const body = {
    contents,
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
  };
  if (!noThinking.has(model)) {
    body.generationConfig.thinkingConfig = {
      thinkingBudget: Number(process.env.GEMINI_THINKING_BUDGET ?? 0),
    };
  }
  if (tools?.length) {
    body.tools = [{ functionDeclarations: tools }];
    body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
  }
  return body;
}

/* ---------------- 主要進入點 ---------------- */

const RETRIABLE = new Set([500, 502, 503, 504]);

/**
 * 依序嘗試候補鏈上的模型，回傳第一個成功的結果。
 * @returns {{ candidate: object, model: string }}
 */
export async function generateContent({ contents, systemInstruction, tools, preferModel }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError('尚未設定 GEMINI_API_KEY，請在 server/.env 填入免費 API key', 500);

  const chain = modelChain();
  // 同一輪對話中已經成功的模型排最前面，避免每輪都重新試探
  // 使用者指定的模型（不一定在候補鏈裡，例如 3.8 Flash）排第一；它額度用完再照候補鏈往下
  const ordered = preferModel && selectableModels().includes(preferModel)
    ? [preferModel, ...chain.filter(m => m !== preferModel)]
    : chain;

  const skipped = [];
  let lastError = null;

  for (const model of ordered) {
    if (isExhausted(model)) { skipped.push(model); continue; }

    try {
      const candidate = await callModel({ model, key, contents, systemInstruction, tools });
      return { candidate, model };
    } catch (err) {
      lastError = err;
      if (err.moveToNextModel) { skipped.push(model); continue; }
      throw err;   // 不是額度問題就不用再換模型了
    }
  }

  const detail = skipped.length ? `（${skipped.join('、')} 今日額度都已用完）` : '';
  throw new GeminiError(
    lastError?.quotaPerDay || skipped.length
      ? `今天的免費額度用完了${detail}。額度每天會重置，或到 server/.env 的 GEMINI_MODELS 加上其他模型。`
      : (lastError?.message || 'Gemini 呼叫失敗'),
    429,
  );
}

/** 對單一模型發送請求，含重試 */
async function callModel({ model, key, contents, systemInstruction, tools }) {
  const MAX_ATTEMPTS = Number(process.env.GEMINI_MAX_RETRIES ?? 3);

  for (let attempt = 1; ; attempt++) {
    let res, text;
    try {
      countRequest(model);   // 重試也算一次請求，所以在送出前就計數
      res = await fetch(`${API_BASE}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(buildBody({ contents, systemInstruction, tools, model })),
        signal: AbortSignal.timeout(90_000),
      });
      text = await res.text();
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw new GeminiError(`連線 Gemini 失敗：${err.message}`, 504);
      await sleep(backoff(attempt));
      continue;
    }

    let json = null;
    try { json = JSON.parse(text); } catch { /* 非 JSON 回應 */ }

    if (res.ok) {
      const cand = json?.candidates?.[0];
      if (!cand) {
        const blocked = json?.promptFeedback?.blockReason;
        throw new GeminiError(blocked ? `內容被安全機制擋下（${blocked}）` : 'Gemini 沒有回傳內容', 502);
      }
      return cand;
    }

    const msg = json?.error?.message || text.slice(0, 200);

    // 額度：每日用完就換模型（等待無意義），每分鐘用完才照 retryDelay 等
    if (res.status === 429) {
      const q = parseQuota(json);
      if (q.perDay) {
        markExhaustedForToday(model);
        throw Object.assign(new GeminiError(msg, 429), { moveToNextModel: true, quotaPerDay: true });
      }
      if (attempt < MAX_ATTEMPTS) {
        await sleep(q.retryMs || backoff(attempt));
        continue;
      }
      throw Object.assign(new GeminiError(msg, 429), { moveToNextModel: true });
    }

    // 這個模型不吃 thinkingConfig：記住並立刻重來，不算一次重試
    if (res.status === 400 && !noThinking.has(model)) {
      noThinking.add(model);
      continue;
    }

    // 模型不存在／已停用 → 換下一個
    if (res.status === 404) {
      markExhaustedForToday(model);
      throw Object.assign(new GeminiError(msg, 404), { moveToNextModel: true });
    }

    if (RETRIABLE.has(res.status) && attempt < MAX_ATTEMPTS) {
      await sleep(backoff(attempt));
      continue;
    }

    if (res.status === 503) {
      throw Object.assign(new GeminiError(`${model} 目前排隊中：${msg}`, 503), { moveToNextModel: true });
    }
    throw new GeminiError(`Gemini API 錯誤 ${res.status}：${msg}`, res.status);
  }
}

export const partsToText = (parts = []) =>
  parts.filter(p => typeof p.text === 'string').map(p => p.text).join('').trim();

export const partsToCalls = (parts = []) =>
  parts.filter(p => p.functionCall).map(p => p.functionCall);
