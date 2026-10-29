import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  budgetStatus, byCategory, monthRange, normalizeAmount, normalizeCategory, summarize,
} from '../shared/expenses.js';
import { encodeWav, toBase64 } from '../web/src/audio-wav.js';

let expenses, chat, db;
beforeAll(async () => {
  vi.stubEnv('FIT_DATA_DIR', mkdtempSync(join(tmpdir(), 'fit-expenses-')));
  vi.stubEnv('GEMINI_API_KEY', 'fake-key');
  vi.stubEnv('GEMINI_MODELS', 'gemini-3.1-flash-lite');
  expenses = await import('../server/src/expenses.js');
  chat = await import('../server/src/expense-chat.js');
  db = await import('../server/src/db.js');
});
afterAll(() => { vi.unstubAllEnvs(); });
beforeEach(() => { db.getDb('eli').exec('DELETE FROM expenses; DELETE FROM expense_settings'); });
afterEach(() => { vi.unstubAllGlobals(); });

const today = () => new Date().toLocaleDateString('sv-SE');

describe('金額與分類', () => {
  it('金額要是大於 0 的數字，留到小數兩位，過大當成打錯', () => {
    expect(normalizeAmount(0)).toBeNull();
    expect(normalizeAmount(-50)).toBeNull();
    expect(normalizeAmount('abc')).toBeNull();
    expect(normalizeAmount(10_000_001)).toBeNull();
    expect(normalizeAmount('120')).toBe(120);
    expect(normalizeAmount(33.333)).toBe(33.33);
  });

  it('分類要跟收支對得上，不然退回「其他」', () => {
    expect(normalizeCategory('food', 'expense')).toBe('food');
    expect(normalizeCategory('salary', 'income')).toBe('salary');
    // 薪水記成支出、便當記成收入都是矛盾的組合，不能照著存進去
    expect(normalizeCategory('salary', 'expense')).toBe('other');
    expect(normalizeCategory('food', 'income')).toBe('other_income');
    expect(normalizeCategory('不存在的分類', 'expense')).toBe('other');
  });

  it('收支分開加總，結餘是收入減支出', () => {
    const rows = [
      { kind: 'expense', amount: 120 }, { kind: 'expense', amount: 80 }, { kind: 'income', amount: 1000 },
    ];
    expect(summarize(rows)).toEqual({ expense: 200, income: 1000, net: 800 });
  });

  it('月份範圍涵蓋到當月最後一天，含閏年與十二月', () => {
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
});

describe('本月統計', () => {
  it('分類佔比由多到少', () => {
    const rows = [
      { kind: 'expense', category: 'food', amount: 300 },
      { kind: 'expense', category: 'transport', amount: 100 },
      { kind: 'expense', category: 'food', amount: 100 },
      { kind: 'income', category: 'salary', amount: 9999 },   // 收入不算進支出佔比
    ];
    const bars = byCategory(rows);
    expect(bars.map(b => [b.category, b.amount, b.pct]))
      .toEqual([['food', 400, 80], ['transport', 100, 20]]);
  });

  it('預算會算出剩餘與「每天還能花多少」，超支時標出來', () => {
    // 10/29 還剩 29、30、31 三天
    const left = budgetStatus(20_000, 12_000, '2026-10', '2026-10-29');
    expect(left).toMatchObject({ left: 8000, over: false, daysLeft: 3, perDay: 2666 });
    expect(budgetStatus(10_000, 12_500, '2026-10', '2026-10-29'))
      .toMatchObject({ left: -2500, over: true, pct: 100 });
    // 看的是上個月的帳：「每天還能花多少」沒有意義，不要算
    expect(budgetStatus(20_000, 12_000, '2026-09', '2026-10-29').perDay).toBeNull();
    expect(budgetStatus(0, 500, '2026-10', '2026-10-29')).toBeNull();   // 沒設預算就不顯示
  });
});

describe('記一筆帳', () => {
  it('當日與當月合計分開算，上個月的帳不會混進來', () => {
    const day = today(), month = day.slice(0, 7);
    expenses.addExpense('eli', { date: day, category: 'food', item: '排骨飯', amount: 120 });
    expenses.addExpense('eli', { date: day, category: 'drink', item: '拿鐵', amount: 85 });
    expenses.addExpense('eli', { date: `${month}-01`, category: 'home', item: '房租', amount: 12000 });
    expenses.addExpense('eli', { date: '2020-01-05', category: 'food', item: '很久以前', amount: 999 });

    const page = expenses.pageView('eli', day);
    expect(page.day.expense).toBe(205);
    expect(page.day.items).toBe(2);
    // 同月的房租要算進來，2020 年那筆不能
    expect(page.monthTotals.expense).toBe(12205);
    expect(page.rows).toHaveLength(2);
    expect(page.byCategory[0]).toMatchObject({ category: 'home', amount: 12000 });
  });

  it('收入不會被當成支出扣掉預算', () => {
    const day = today();
    expenses.updateSettings('eli', { budget: 1000 });
    expenses.addExpense('eli', { date: day, kind: 'income', category: 'salary', item: '薪水', amount: 50000 });
    expenses.addExpense('eli', { date: day, category: 'food', item: '午餐', amount: 100 });
    const page = expenses.pageView('eli', day);
    expect(page.monthTotals).toMatchObject({ expense: 100, income: 50000, net: 49900 });
    expect(page.budget).toMatchObject({ spent: 100, left: 900 });
  });

  it('沒有項目或金額就不給存', () => {
    expect(() => expenses.addExpense('eli', { item: '', amount: 100 })).toThrow(/項目/);
    expect(() => expenses.addExpense('eli', { item: '便當', amount: 0 })).toThrow(/金額/);
    expect(() => expenses.addExpense('eli', { item: '便當', amount: 'abc' })).toThrow(/金額/);
  });

  it('日期清單是新到舊，附當天收支，用來跳到上一個有記帳的日子', () => {
    expenses.addExpense('eli', { date: '2026-10-20', item: 'A', amount: 100 });
    expenses.addExpense('eli', { date: '2026-10-25', item: 'B', amount: 50 });
    expenses.addExpense('eli', { date: '2026-10-25', kind: 'income', category: 'bonus', item: 'C', amount: 500 });
    const dates = expenses.listExpenseDates('eli');
    expect(dates.map(d => d.date)).toEqual(['2026-10-25', '2026-10-20']);
    expect(dates[0]).toMatchObject({ items: 2, expense: 50, income: 500 });
  });

  it('改一筆帳會重新正規化，刪掉就查不到', () => {
    const row = expenses.addExpense('eli', { date: today(), item: '飲料', amount: 50 });
    const after = expenses.updateExpense('eli', row.id, { kind: 'income', category: 'food', amount: 60 });
    // 收支改成收入，原本的餐飲分類就不合了，要換成收入的「其他」
    expect(after).toMatchObject({ kind: 'income', category: 'other_income', amount: 60 });
    expect(expenses.deleteExpense('eli', row.id)).toBe(true);
    expect(expenses.getExpense('eli', row.id)).toBeUndefined();
  });

  it('整批寫入時只要有一筆不合格就全部不寫', () => {
    const day = today();
    expect(() => expenses.addExpenses('eli', [
      { date: day, item: '早餐', amount: 60 },
      { date: day, item: '咖啡', amount: -5 },
    ])).toThrow(/金額/);
    expect(expenses.listExpenses('eli', { date: day })).toHaveLength(0);
  });

  it('常用項目要記過兩次才出現，金額取最近一次', () => {
    const day = today();
    expenses.addExpense('eli', { date: day, item: '早餐', amount: 55 });
    expenses.addExpense('eli', { date: day, item: '早餐', amount: 60 });
    expenses.addExpense('eli', { date: day, item: '只記過一次', amount: 300 });
    const frequent = expenses.frequentItems('eli');
    expect(frequent.map(f => f.item)).toEqual(['早餐']);
    // 平均會算出 57.5 這種沒人付過的金額，所以取最近一次
    expect(frequent[0].amount).toBe(60);
  });
});

describe('用講的記帳', () => {
  const call = args => ({ functionCall: { name: 'record_expense', args } });
  const reply = parts => ({
    ok: true, status: 200,
    text: async () => JSON.stringify({ candidates: [{ content: { parts } }] }),
  });

  it('一句話拆成好幾筆，缺金額的那筆略過並回報', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply([
      call({ item: '早餐', amount: 60, category: 'food' }),
      call({ item: '咖啡', amount: 85, category: 'drink', pay: 'mobile' }),
      call({ item: '沒講多少錢的東西', category: 'food' }),
      { text: '記了早餐與咖啡，第三項沒有金額所以略過。' },
    ])));
    const out = await chat.parseExpenses('eli', { text: '早餐60 咖啡85 還買了別的', date: '2026-10-29' });
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]).toMatchObject({ date: '2026-10-29', kind: 'expense', category: 'food', item: '早餐', amount: 60, pay: 'cash' });
    expect(out.rows[1].pay).toBe('mobile');
    expect(out.skipped).toBe(1);
    expect(out.note).toContain('略過');
  });

  it('草稿只是草稿，解析不會寫進資料庫', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply([call({ item: '便當', amount: 120 })])));
    await chat.parseExpenses('eli', { text: '便當 120' });
    expect(expenses.listExpenses('eli', {})).toHaveLength(0);
  });

  it('模型給的分類、付款方式、日期不合格時會被修掉，不是照單全收', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply([
      // 薪水卻標成支出、付款方式是編的、日期不是日期
      call({ item: '薪水', amount: 50000, kind: 'expense', category: 'salary', pay: '比特幣', date: '上個月' }),
    ])));
    const out = await chat.parseExpenses('eli', { text: '薪水五萬', date: '2026-10-29' });
    expect(out.rows[0]).toMatchObject({ kind: 'expense', category: 'other', pay: 'cash', date: '2026-10-29' });
  });

  it('沒說話或說太長就不送給模型', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(chat.parseExpenses('eli', { text: '  ' })).rejects.toThrow(/請先說/);
    await expect(chat.parseExpenses('eli', { text: 'x'.repeat(301) })).rejects.toThrow(/最多/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('截圖與錄音都能當輸入，素材排在文字前面送給模型', async () => {
    const fetchMock = vi.fn(async () => reply([call({ item: '全家', amount: 88, category: 'grocery', pay: 'mobile' })]));
    vi.stubGlobal('fetch', fetchMock);

    const png = 'data:image/png;base64,aGVsbG8=';
    const out = await chat.parseExpenses('eli', { image: png, date: '2026-10-29' });
    expect(out.rows[0]).toMatchObject({ item: '全家', amount: 88, pay: 'mobile' });

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.contents[0].parts[0].inlineData).toEqual({ mimeType: 'image/png', data: 'aGVsbG8=' });
    // 沒打字時也要有一句文字，不然模型不知道要做什麼
    expect(sent.contents[0].parts[1].text).toContain('截圖');
    // 看圖時才給看圖的規則，純打字不必浪費這些 token
    expect(sent.systemInstruction.parts[0].text).toContain('卡號末四碼');

    fetchMock.mockClear();
    await chat.parseExpenses('eli', { audio: 'data:audio/wav;base64,aGVsbG8=' });
    const heard = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(heard.contents[0].parts[0].inlineData.mimeType).toBe('audio/wav');
    expect(heard.systemInstruction.parts[0].text).toContain('錄音');
    expect(heard.systemInstruction.parts[0].text).not.toContain('卡號末四碼');
  });

  it('不是圖也不是聲音的東西不會被送出去', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(chat.parseExpenses('eli', { image: 'https://example.com/a.png' })).rejects.toThrow(/格式/);
    await expect(chat.parseExpenses('eli', { image: 'data:application/pdf;base64,aGk=' })).rejects.toThrow(/不支援/);
    // Chrome 錄的 webm 要前端轉成 WAV 再上來，直接送原始容器會被擋下
    await expect(chat.parseExpenses('eli', { audio: 'data:audio/webm;base64,aGk=' })).rejects.toThrow(/不支援/);
    const big = `data:image/png;base64,${'A'.repeat(9 * 1024 * 1024)}`;
    await expect(chat.parseExpenses('eli', { image: big })).rejects.toThrow(/太大/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('提示裡帶今天的日期與這個人常記的項目，分類才會跟上次一致', () => {
    expenses.addExpense('eli', { date: today(), category: 'drink', item: '手搖', amount: 60 });
    expenses.addExpense('eli', { date: today(), category: 'drink', item: '手搖', amount: 65 });
    const prompt = chat.expenseSystemPrompt('eli', '2026-10-29');
    expect(prompt).toContain('2026-10-29');
    expect(prompt).toContain('手搖 → 飲料點心');
  });
});

describe('錄音轉檔', () => {
  it('WAV 檔頭是 16-bit 單聲道 PCM，取樣率照給的值', () => {
    const samples = Float32Array.from([0, 0.5, -0.5, 1, -1]);
    const view = new DataView(encodeWav(samples, 16_000));
    const text = (at, n) => String.fromCharCode(...new Uint8Array(view.buffer, at, n));
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 4)).toBe('WAVE');
    expect(text(12, 4)).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1);        // 未壓縮 PCM
    expect(view.getUint16(22, true)).toBe(1);        // 單聲道
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint32(28, true)).toBe(32_000);   // 16kHz × 2 bytes
    expect(view.getUint16(34, true)).toBe(16);
    expect(text(36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(samples.length * 2);
    expect(view.byteLength).toBe(44 + samples.length * 2);
  });

  it('超出範圍的取樣會夾住，不會繞回去變成爆音', () => {
    const view = new DataView(encodeWav(Float32Array.from([1.8, -1.8]), 16_000));
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
  });

  it('base64 不會因為取樣點太多而爆呼叫堆疊', () => {
    const wav = encodeWav(new Float32Array(200_000), 16_000);
    expect(toBase64(wav).length).toBeGreaterThan(100_000);
  });
});
