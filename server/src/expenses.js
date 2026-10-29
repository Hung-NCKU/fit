import { getDb } from './db.js';
import { today } from './records.js';
import {
  budgetStatus, byCategory, isValidDate, monthOf, monthRange,
  normalizeAmount, normalizeCategory, normalizeKind, normalizePay, summarize,
} from '../../shared/expenses.js';

/**
 * 記帳。
 *
 * 寫入全部走 clean()：畫面、AI 草稿、批次寫入三條路都會經過同一道正規化，
 * 不然分類或收支的組合（薪水記成支出之類）只會在其中一條路上被擋下來。
 */

const invalid = (message) => Object.assign(new Error(message), { status: 400 });

const MAX_ITEM = 60;
const MAX_NOTE = 200;

/** 把一筆輸入整理成可以直接寫進資料庫的樣子，順便擋掉壞資料 */
export function clean(input = {}, fallbackDate = today()) {
  const date = isValidDate(input.date) ? input.date : fallbackDate;
  const kind = normalizeKind(input.kind);
  const amount = normalizeAmount(input.amount);
  if (amount === null) throw invalid('金額要是大於 0 的數字');
  const item = String(input.item ?? '').trim();
  if (!item) throw invalid('請填項目名稱');
  if (item.length > MAX_ITEM) throw invalid(`項目名稱最多 ${MAX_ITEM} 個字`);
  const note = String(input.note ?? '').trim().slice(0, MAX_NOTE);
  return { date, kind, category: normalizeCategory(input.category, kind), item, amount, pay: normalizePay(input.pay), note };
}

export function addExpense(userId, input, source = 'manual') {
  const row = clean(input);
  const r = getDb(userId).prepare(`
    INSERT INTO expenses (date, kind, category, item, amount, pay, source, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.date, row.kind, row.category, row.item, row.amount, row.pay, source, row.note);
  return getExpense(userId, Number(r.lastInsertRowid));
}

/** AI 草稿確認後一次寫入。整批包在一個交易裡：要嘛全記、要嘛都不記 */
export function addExpenses(userId, rows, source = 'ai') {
  if (!Array.isArray(rows) || !rows.length) throw invalid('沒有要記的帳');
  if (rows.length > 20) throw invalid('一次最多記 20 筆');
  const cleaned = rows.map(r => clean(r));
  const db = getDb(userId);
  const insert = db.prepare(`
    INSERT INTO expenses (date, kind, category, item, amount, pay, source, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.exec('BEGIN IMMEDIATE');
  try {
    const ids = cleaned.map(row =>
      Number(insert.run(row.date, row.kind, row.category, row.item, row.amount, row.pay, source, row.note).lastInsertRowid));
    db.exec('COMMIT');
    return ids.map(id => getExpense(userId, id));
  } catch (err) { db.exec('ROLLBACK'); throw err; }
}

export const getExpense = (userId, id) =>
  getDb(userId).prepare('SELECT * FROM expenses WHERE id = ?').get(id);

export function listExpenses(userId, { date, from, to, limit = 500 } = {}) {
  const db = getDb(userId);
  if (date) return db.prepare('SELECT * FROM expenses WHERE date = ? ORDER BY id DESC').all(date);
  if (from && to) return db.prepare('SELECT * FROM expenses WHERE date BETWEEN ? AND ? ORDER BY date DESC, id DESC').all(from, to);
  return db.prepare('SELECT * FROM expenses ORDER BY date DESC, id DESC LIMIT ?').all(Number(limit) || 500);
}

/**
 * 有紀錄的日期（新到舊），附當天收支。
 * 日期導覽用它跳到「上一個有記帳的日子」，不會卡在一堆空日期上；
 * 量很小（一天一列純數字），可以一次拿完。
 */
export const listExpenseDates = userId => getDb(userId).prepare(`
  SELECT date, COUNT(*) items,
         ROUND(COALESCE(SUM(CASE WHEN kind='expense' THEN amount END),0), 2) expense,
         ROUND(COALESCE(SUM(CASE WHEN kind='income'  THEN amount END),0), 2) income
  FROM expenses GROUP BY date ORDER BY date DESC
`).all();

export function updateExpense(userId, id, patch) {
  const cur = getExpense(userId, id);
  if (!cur) return null;
  const row = clean({ ...cur, ...patch }, cur.date);
  getDb(userId).prepare(`
    UPDATE expenses SET date=?, kind=?, category=?, item=?, amount=?, pay=?, note=? WHERE id=?
  `).run(row.date, row.kind, row.category, row.item, row.amount, row.pay, row.note, id);
  return getExpense(userId, id);
}

export const deleteExpense = (userId, id) =>
  getDb(userId).prepare('DELETE FROM expenses WHERE id = ?').run(id).changes > 0;

/* ---------------- 設定（月預算） ---------------- */

export const defaultSettings = () => ({ budget: 0 });

export function getSettings(userId) {
  const row = getDb(userId).prepare('SELECT settings FROM expense_settings WHERE id = 1').get();
  let saved = {};
  try { saved = JSON.parse(row?.settings || '{}'); } catch { saved = {}; }
  return { ...defaultSettings(), ...saved };
}

export function updateSettings(userId, patch = {}) {
  const next = { ...getSettings(userId) };
  if (patch.budget !== undefined) {
    const n = Number(patch.budget);
    if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw invalid('月預算要在 0–10,000,000 之間');
    next.budget = Math.round(n);   // 預算抓整數就夠，不必算到角分
  }
  getDb(userId).prepare(`
    INSERT INTO expense_settings (id, settings, updated_at) VALUES (1, ?, datetime('now','localtime'))
    ON CONFLICT(id) DO UPDATE SET settings = excluded.settings, updated_at = excluded.updated_at
  `).run(JSON.stringify(next));
  return next;
}

/* ---------------- 常用項目 ---------------- */

/**
 * 最近兩個月記最多次的項目，點一下就帶進表單。
 *
 * 記帳會不會持續下去，差別幾乎全在「記一筆要幾秒」——而日常的帳有一大半
 * 是重複的（早餐、捷運、手搖）。金額取最近一次而不是平均：同一家早餐店
 * 平均出來會是沒人付過的數字。
 */
export const frequentItems = (userId, limit = 8) => getDb(userId).prepare(`
  SELECT item, kind, category, pay, COUNT(*) n,
         (SELECT amount FROM expenses b
          WHERE b.item = a.item AND b.kind = a.kind ORDER BY b.date DESC, b.id DESC LIMIT 1) amount
  FROM expenses a
  WHERE date >= date('now','localtime','-60 days')
  GROUP BY item, kind HAVING n >= 2
  ORDER BY n DESC, MAX(date) DESC LIMIT ?
`).all(Number(limit) || 8);

/* ---------------- 畫面要的一整包 ---------------- */

/**
 * 一次給畫面它需要的全部：那一天的明細、那個月的統計、日期導覽、常用項目。
 * 分成好幾個端點的話，切一次日期就要發四個請求，手機上會看到數字一格一格跳出來。
 */
export function pageView(userId, requested) {
  const dates = listExpenseDates(userId);
  const date = isValidDate(requested) ? requested : today();
  const month = monthOf(date);
  const { from, to } = monthRange(month);
  const monthRows = listExpenses(userId, { from, to });
  const day = dates.find(d => d.date === date) || { date, items: 0, expense: 0, income: 0 };
  const totals = summarize(monthRows);
  const settings = getSettings(userId);

  return {
    date, month, dates,
    rows: listExpenses(userId, { date }),
    day: { date, expense: day.expense, income: day.income, items: day.items },
    monthTotals: { ...totals, days: new Set(monthRows.map(r => r.date)).size },
    byCategory: byCategory(monthRows),
    budget: budgetStatus(settings.budget, totals.expense, month, today()),
    settings,
    frequent: frequentItems(userId),
    isToday: date === today(),
  };
}
