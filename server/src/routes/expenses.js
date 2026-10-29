import {
  addExpense, addExpenses, deleteExpense, listExpenses, pageView, updateExpense, updateSettings,
} from '../expenses.js';
import { parseExpenses } from '../expense-chat.js';
import { getUser } from '../users.js';

/**
 * 記帳。跟飲食、訓練一樣：看別人的是唯讀，寫入一律進自己的資料庫。
 */
export default async function expenseRoutes(app) {
  function viewUser(req) {
    const asked = req.query?.user;
    if (!asked || asked === req.userId) return req.userId;
    if (!getUser(asked) || getUser(asked).disabled) {
      throw Object.assign(new Error(`沒有這個使用者：${asked}`), { status: 404 });
    }
    return asked;
  }
  const writeGuard = (req) => {
    if (req.query?.user && req.query.user !== req.userId) {
      throw Object.assign(new Error('只能查看對方的帳，不能修改'), { status: 403 });
    }
  };

  app.get('/expenses/page', async (req) => pageView(viewUser(req), req.query?.date));
  app.get('/expenses', async (req) => listExpenses(viewUser(req), req.query));

  app.post('/expenses', async (req, reply) => {
    writeGuard(req);
    addExpense(req.userId, req.body || {});
    return reply.code(201).send(pageView(req.userId, req.body?.date));
  });

  // AI 草稿確認後的批次寫入。回整頁是因為新增通常橫跨好幾天，
  // 前端自己合併容易跟月統計對不起來
  app.post('/expenses/batch', async (req, reply) => {
    writeGuard(req);
    const rows = addExpenses(req.userId, req.body?.rows);
    return reply.code(201).send({ saved: rows.length, ...pageView(req.userId, req.body?.date) });
  });

  app.patch('/expenses/:id', async (req, reply) => {
    writeGuard(req);
    const row = updateExpense(req.userId, Number(req.params.id), req.body || {});
    return row ? pageView(req.userId, row.date) : reply.code(404).send({ error: '找不到這筆帳' });
  });

  app.delete('/expenses/:id', async (req, reply) => {
    writeGuard(req);
    return deleteExpense(req.userId, Number(req.params.id))
      ? pageView(req.userId, req.query?.date) : reply.code(404).send({ error: '找不到這筆帳' });
  });

  app.put('/expenses/settings', async (req) => {
    writeGuard(req);
    updateSettings(req.userId, req.body || {});
    return pageView(req.userId, req.body?.date);
  });

  // 用講的記帳：只解析成草稿，不寫入。確認後才走 /expenses/batch
  app.post('/expenses/parse', async (req) => {
    writeGuard(req);
    return parseExpenses(req.userId, req.body || {});
  });
}
