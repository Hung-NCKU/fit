/**
 * 記帳的共用定義：分類、付款方式、金額與日期的正規化。
 *
 * 伺服器與畫面共用同一份，分類清單才不會兩邊各長各的——那樣存進去的
 * category 會有畫面上找不到的值，統計就少一塊。
 *
 * 金額一律存正數，收入或支出看 kind；不用負數表示支出是因為
 * 「-200 的收入」跟「200 的支出」會同時存在，加總時很容易算反。
 */

export const CATEGORIES = [
  // 支出。順序就是畫面上的順序，照台灣日常的使用頻率排
  { id: 'food',      name: '餐飲',     icon: '🍜', kind: 'expense' },
  { id: 'drink',     name: '飲料點心', icon: '🧋', kind: 'expense' },
  { id: 'grocery',   name: '生活採買', icon: '🧺', kind: 'expense' },
  { id: 'transport', name: '交通',     icon: '🚌', kind: 'expense' },
  { id: 'shopping',  name: '購物',     icon: '🛍️', kind: 'expense' },
  { id: 'entertain', name: '娛樂',     icon: '🎬', kind: 'expense' },
  { id: 'home',      name: '居家水電', icon: '🏠', kind: 'expense' },
  { id: 'medical',   name: '醫療',     icon: '💊', kind: 'expense' },
  { id: 'learn',     name: '教育學習', icon: '📚', kind: 'expense' },
  { id: 'social',    name: '人情社交', icon: '🎁', kind: 'expense' },
  { id: 'fitness',   name: '運動健身', icon: '🏋️', kind: 'expense' },
  { id: 'other',     name: '其他',     icon: '📦', kind: 'expense' },
  // 收入
  { id: 'salary',       name: '薪水',     icon: '💼', kind: 'income' },
  { id: 'bonus',        name: '獎金',     icon: '🎉', kind: 'income' },
  { id: 'invest',       name: '投資',     icon: '📈', kind: 'income' },
  { id: 'refund',       name: '退款回饋', icon: '↩️', kind: 'income' },
  { id: 'other_income', name: '其他收入', icon: '💰', kind: 'income' },
];

export const PAY_METHODS = [
  { id: 'cash',     name: '現金' },
  { id: 'card',     name: '信用卡' },
  { id: 'mobile',   name: '行動支付' },
  { id: 'transfer', name: '轉帳' },
  { id: 'ticket',   name: '交通卡' },
];

export const KINDS = ['expense', 'income'];

/** 分類刪不得：舊紀錄指著它。要退場就留著 id、改名字 */
export const categoryById = id => CATEGORIES.find(c => c.id === id) || null;
export const categoriesFor = kind => CATEGORIES.filter(c => c.kind === kind);
export const payById = id => PAY_METHODS.find(p => p.id === id) || null;

/** 分類跟收支要對得上：薪水不能記成支出 */
export function normalizeCategory(id, kind) {
  const found = categoryById(id);
  if (found && found.kind === kind) return found.id;
  return kind === 'income' ? 'other_income' : 'other';
}

export const normalizeKind = kind => (kind === 'income' ? 'income' : 'expense');
export const normalizePay = id => (payById(id) ? id : 'cash');

/**
 * 金額。台幣日常都是整數，但換匯、分帳會出現小數，所以留兩位。
 * 超過一千萬當成打錯（多按了幾個 0），直接擋掉而不是默默存進去。
 */
export const MAX_AMOUNT = 10_000_000;

export function normalizeAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const rounded = Math.round(n * 100) / 100;
  return rounded > MAX_AMOUNT ? null : rounded;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export const monthOf = date => String(date).slice(0, 7);

/** 某個月的第一天與最後一天。用 Date 的「第 0 天＝上個月最後一天」算月底 */
export function monthRange(month) {
  const [y, m] = String(month).split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

const round2 = n => Math.round(n * 100) / 100;

export function summarize(rows = []) {
  let expense = 0, income = 0;
  for (const r of rows) {
    if (normalizeKind(r.kind) === 'income') income += Number(r.amount) || 0;
    else expense += Number(r.amount) || 0;
  }
  return { expense: round2(expense), income: round2(income), net: round2(income - expense) };
}

/** 本月花在哪：由多到少，附佔比，畫面直接拿來畫長條 */
export function byCategory(rows = [], kind = 'expense') {
  const sums = new Map();
  let total = 0;
  for (const r of rows) {
    if (normalizeKind(r.kind) !== kind) continue;
    const amount = Number(r.amount) || 0;
    sums.set(r.category, (sums.get(r.category) || 0) + amount);
    total += amount;
  }
  return [...sums.entries()]
    .map(([category, amount]) => ({
      category,
      name: categoryById(category)?.name ?? category,
      icon: categoryById(category)?.icon ?? '📦',
      amount: round2(amount),
      pct: total ? Math.round((amount / total) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * 預算進度。
 *
 * 「剩下的錢 ÷ 剩下的天數」是記帳 App 裡最有用的一個數字：月初就知道
 * 今天還能花多少，而不是月底才發現超支。today 不在這個月時不算日均
 * （看上個月的帳不需要「每天還能花多少」）。
 */
export function budgetStatus(budget, spent, month, today) {
  const limit = Number(budget) || 0;
  if (limit <= 0) return null;
  const left = round2(limit - spent);
  const { to } = monthRange(month);
  const inMonth = monthOf(today) === month;
  const daysLeft = inMonth
    ? Math.max(1, (new Date(`${to}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86_400_000 + 1)
    : 0;
  return {
    budget: limit,
    spent: round2(spent),
    left,
    pct: Math.min(100, Math.round((spent / limit) * 100)),
    over: left < 0,
    daysLeft,
    perDay: daysLeft ? Math.max(0, Math.floor(left / daysLeft)) : null,
  };
}

export const formatAmount = n => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
