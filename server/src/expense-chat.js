import { generateContent, partsToCalls, partsToText } from './gemini.js';
import { frequentItems } from './expenses.js';
import { today } from './records.js';
import {
  CATEGORIES, PAY_METHODS, categoryById, isValidDate,
  normalizeAmount, normalizeCategory, normalizeKind, normalizePay,
} from '../../shared/expenses.js';

/**
 * 用講的記帳：「早餐 60 咖啡 85 中午便當 120」一句話拆成三筆。
 *
 * 刻意只解析、不寫入。帳跟飲食紀錄不一樣：金額記錯一位數，月底的統計
 * 就整個歪掉，而使用者未必會回頭核對。所以模型吐出來的是「草稿」，
 * 畫面上列出來、可以改、按下確認才進資料庫——這也是市面上有語音記帳的
 * App 的做法。
 *
 * 模型一次只填一筆（record_expense 呼叫多次），不用巢狀陣列的參數：
 * 教練頁那邊已經驗證過這種形狀最穩，陣列參數常常少填欄位。
 */

const S = 'STRING', N = 'NUMBER', O = 'OBJECT';

const MAX_TEXT = 300;
const MAX_ROWS = 20;

const invalid = (message) => Object.assign(new Error(message), { status: 400 });

export const expenseTool = {
  name: 'record_expense',
  description: '把使用者說的一筆帳整理出來。一句話提到好幾項消費時，一項呼叫一次，'
    + '不要合併成一筆，也不要自己加上使用者沒提到的項目。',
  parameters: {
    type: O,
    properties: {
      date: { type: S, description: '日期 YYYY-MM-DD。沒提到就留空代表今天；「昨天」「上週五」要換算成實際日期' },
      kind: { type: S, enum: ['expense', 'income'], description: '支出或收入。預設支出' },
      category: {
        type: S,
        enum: CATEGORIES.map(c => c.id),
        description: CATEGORIES.map(c => `${c.id}=${c.name}`).join('、'),
      },
      item: { type: S, description: '項目名稱，照使用者的說法，例如「排骨飯」「捷運」「全聯」' },
      amount: { type: N, description: '金額（新台幣），正數。使用者說「一百五」要換成 150' },
      pay: {
        type: S,
        enum: PAY_METHODS.map(p => p.id),
        description: PAY_METHODS.map(p => `${p.id}=${p.name}`).join('、') + '。沒提到就留空',
      },
      note: { type: S, description: '備註，只在使用者真的多講了什麼時填' },
    },
    required: ['item', 'amount'],
  },
};

export function expenseSystemPrompt(userId, date = today()) {
  const lines = [
    '你是記帳 App 的輸入助手。使用者會用一句話講出今天花了什麼，你要把它拆成一筆一筆的帳。',
    `今天是 ${date}。使用者沒講日期就用今天；講「昨天」「前天」「上週五」要自己換算成 YYYY-MM-DD。`,
    '每一筆都呼叫一次 record_expense。只記使用者真的講到的東西，金額沒講就不要猜，那一項直接略過。',
    '台灣的用語與物價：「全家」「7-11」是超商、「手搖」是飲料、「悠遊卡加值」算交通。',
    '呼叫完工具後，用一句繁體中文簡短說明你記了什麼；如果有哪一項因為沒金額而略過，也在這句話裡講。',
  ];

  // 把這個人常記的項目附上去：同樣是「早餐」，分類才會跟他上次記的一致
  const frequent = frequentItems(userId, 10);
  if (frequent.length) {
    lines.push('這個人常記的項目（照著用同樣的分類，金額仍以這次講的為準）：');
    lines.push(frequent.map(f =>
      `  ${f.item} → ${categoryById(f.category)?.name ?? f.category}`).join('\n'));
  }
  return lines.join('\n');
}

/**
 * 一筆草稿。這裡不丟錯——模型偶爾會吐出缺金額的半筆，
 * 為了一筆壞的把其他四筆正確的一起退掉並不划算，略過並回報就好。
 */
function draftRow(args, fallbackDate) {
  const amount = normalizeAmount(args.amount);
  const item = String(args.item ?? '').trim().slice(0, 60);
  if (amount === null || !item) return null;
  const kind = normalizeKind(args.kind);
  return {
    date: isValidDate(args.date) ? args.date : fallbackDate,
    kind,
    category: normalizeCategory(args.category, kind),
    item,
    amount,
    pay: normalizePay(args.pay),
    note: String(args.note ?? '').trim().slice(0, 200),
  };
}

export async function parseExpenses(userId, { text, date, model = null } = {}, opts = {}) {
  const said = String(text ?? '').trim();
  if (!said) throw invalid('請先說你花了什麼');
  if (said.length > MAX_TEXT) throw invalid(`一次最多 ${MAX_TEXT} 個字`);
  const fallbackDate = isValidDate(date) ? date : today();

  const result = await generateContent({
    contents: [{ role: 'user', parts: [{ text: said }] }],
    systemInstruction: expenseSystemPrompt(userId, fallbackDate),
    tools: [expenseTool],
    preferModel: model,
    // 比教練短：這是一句話的解析，等太久不如自己打
    deadline: Date.now() + Number(process.env.EXPENSE_TIMEOUT_MS ?? 45_000),
    signal: opts.signal,
  });

  const parts = result.candidate.content?.parts || [];
  const calls = partsToCalls(parts).filter(c => c.name === expenseTool.name);
  const rows = [];
  let skipped = 0;
  for (const call of calls.slice(0, MAX_ROWS)) {
    const row = draftRow(call.args || {}, fallbackDate);
    if (row) rows.push(row); else skipped++;
  }

  return { rows, skipped, note: partsToText(parts), model: result.model };
}
