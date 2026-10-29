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
 * 三種輸入都走這裡：打字、錄音、截圖。
 *   打字／錄音 → 自己唸出今天花了什麼
 *   截圖       → LINE Pay／Apple Pay 的交易明細、銀行刷卡通知、電子發票、收據
 *
 * 截圖這條是「讀刷卡紀錄」唯一做得到的方式：Apple Pay 的消費明細只存在
 * Wallet 裡，沒有給第三方讀取的 API（PassKit 是給商家收款用的）；LINE Pay
 * 的 API 同樣是商家端的收款 API，沒有「查我的消費紀錄」。真正能自動入帳的
 * 是財政部電子發票載具 API，但那要另外去財政部平台申請 AppID。
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

// 截圖已經在瀏覽器縮過（長邊 1280 的 JPEG，約 150KB）；錄音是 16kHz 單聲道
// WAV，一分鐘約 1.9MB。上限抓寬一點擋住異常的東西就好。
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
// WAV 是前端轉好的：各家瀏覽器錄出來的容器不一樣（Chrome 是 webm/opus、
// iOS 是 mp4/aac），Gemini 不保證都吃，統一轉成 WAV 最省事
const AUDIO_TYPES = ['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/flac'];

const invalid = (message) => Object.assign(new Error(message), { status: 400 });

/**
 * data URL → Gemini 要的 inlineData。
 *
 * 跟餐點照片不一樣，這裡不存檔：交易截圖上有卡號末四碼、交易序號、
 * 有時還有餘額，解析完就該消失，沒有留在資料庫裡的理由。
 */
function decodeMedia(dataUrl, allowed, maxBytes, label) {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i.exec(String(dataUrl).trim());
  if (!m) throw invalid(`${label}格式無法辨識`);
  const mimeType = m[1].toLowerCase();
  if (!allowed.includes(mimeType)) throw invalid(`不支援的${label}格式：${mimeType}`);
  const bytes = Buffer.from(m[2], 'base64');
  if (!bytes.length) throw invalid(`${label}是空的`);
  if (bytes.length > maxBytes) {
    throw invalid(`${label}太大（${(bytes.length / 1024 / 1024).toFixed(1)}MB），上限 ${maxBytes / 1024 / 1024}MB`);
  }
  return { mimeType, data: bytes.toString('base64') };
}

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

export function expenseSystemPrompt(userId, date = today(), { hasImage = false, hasAudio = false } = {}) {
  const lines = [
    '你是記帳 App 的輸入助手。使用者會告訴你他花了什麼，你要把它拆成一筆一筆的帳。',
    `今天是 ${date}。使用者沒講日期就用今天；講「昨天」「前天」「上週五」要自己換算成 YYYY-MM-DD。`,
    '每一筆都呼叫一次 record_expense。只記使用者真的提到的東西，金額看不出來就不要猜，那一項直接略過。',
    '台灣的用語與物價：「全家」「7-11」是超商、「手搖」是飲料、「悠遊卡加值」算交通。',
    '呼叫完工具後，用一句繁體中文簡短說明你記了什麼；如果有哪一項因為沒金額而略過，也在這句話裡講。',
  ];

  if (hasAudio) {
    lines.push('這次的輸入是一段錄音，使用者用講的（可能是台灣國語或台語）。'
      + '聽不清楚的字就依上下文與金額判斷，整段都聽不出金額就不要記。');
  }

  if (hasImage) {
    lines.push(
      '這次的輸入是一張截圖，可能是 LINE Pay／Apple Pay／街口的交易明細、銀行的刷卡通知、電子發票或紙本收據。',
      '畫面上有幾筆交易就記幾筆；明細裡的單品（例如收據上的每一項商品）合併成一筆，用店家名稱當項目。',
      '付款方式：LINE Pay、Apple Pay、街口、悠遊付這類記成 mobile；銀行信用卡通知記成 card；ATM 或轉帳記成 transfer。',
      '截圖上有日期就用截圖上的日期，只寫月日沒有年份就當作今年。',
      '不要把卡號末四碼、交易序號、授權碼、帳戶餘額寫進項目或備註——記帳只需要金額、店家與分類。',
      '退款、退貨、回饋金是收入（kind=income，分類用 refund），不要記成支出。',
    );
  }

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

export async function parseExpenses(userId, { text, image, audio, date, model = null } = {}, opts = {}) {
  const said = String(text ?? '').trim();
  if (said.length > MAX_TEXT) throw invalid(`一次最多 ${MAX_TEXT} 個字`);
  const picture = image ? decodeMedia(image, IMAGE_TYPES, MAX_IMAGE_BYTES, '截圖') : null;
  const voice = audio ? decodeMedia(audio, AUDIO_TYPES, MAX_AUDIO_BYTES, '錄音') : null;
  if (!said && !picture && !voice) throw invalid('請先說你花了什麼');
  const fallbackDate = isValidDate(date) ? date : today();

  // 圖片／聲音放在文字前面：Gemini 對「先看素材再讀指令」的理解比較穩（同教練頁）
  const parts = [];
  if (picture) parts.push({ inlineData: picture });
  if (voice) parts.push({ inlineData: voice });
  parts.push({ text: said || (picture ? '把這張截圖裡的消費記成帳。' : '把這段錄音裡的消費記成帳。') });

  const result = await generateContent({
    contents: [{ role: 'user', parts }],
    systemInstruction: expenseSystemPrompt(userId, fallbackDate, { hasImage: !!picture, hasAudio: !!voice }),
    tools: [expenseTool],
    preferModel: model,
    // 比教練短：這是一句話的解析，等太久不如自己打
    deadline: Date.now() + Number(process.env.EXPENSE_TIMEOUT_MS ?? 45_000),
    signal: opts.signal,
  });

  const answer = result.candidate.content?.parts || [];
  const calls = partsToCalls(answer).filter(c => c.name === expenseTool.name);
  const rows = [];
  let skipped = 0;
  for (const call of calls.slice(0, MAX_ROWS)) {
    const row = draftRow(call.args || {}, fallbackDate);
    if (row) rows.push(row); else skipped++;
  }

  return { rows, skipped, note: partsToText(answer), model: result.model };
}
