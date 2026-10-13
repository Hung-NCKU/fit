import { getProfile, updateProfile } from '../db.js';
import { quotaStatus } from '../gemini.js';
import { lastBackup } from '../autobackup.js';
import { getUser, removeGuest, USERS } from '../users.js';
import {
  addMeal, listMeals, listMealDates, updateMeal, deleteMeal,
  addWorkout, listWorkouts, updateWorkout, deleteWorkout,
  addWeight, listWeights, deleteWeight,
  dailySummary, rangeSummary, today, daysAgo,
} from '../records.js';

export default async function apiRoutes(app) {
  /**
   * ?user=eli 可以查看另一位使用者的紀錄，但只能「讀」。
   * 寫入一律進自己的資料庫，避免不小心改到對方的紀錄。
   */
  function viewUser(req) {
    const asked = req.query?.user;
    if (!asked || asked === req.userId) return req.userId;
    if (!getUser(asked)) {
      throw Object.assign(new Error(`沒有這個使用者：${asked}`), { status: 404 });
    }
    return asked;
  }

  const readOnlyGuard = (req) => {
    if (req.query?.user && req.query.user !== req.userId) {
      throw Object.assign(new Error('只能查看對方的紀錄，不能修改'), { status: 403 });
    }
  };

  /* ---- 使用者 ---- */

  app.get('/users', async (req) => USERS.map(u => ({
    id: u.id,
    name: u.name,
    isMe: u.id === req.userId,
    guest: Boolean(u.guest),
  })));

  // 建立訪客的端點在 auth.js（POST /api/guest）——它要發 cookie 直接登入，
  // 而且是公開的。這裡只留「刪除」，刪除一定要先登入。
  app.delete('/guests/:id', async (req) => {
    // 訪客是登入頁自助開的，誰都能開；但清理是主人的事。
    // 不擋的話，隨便一個訪客就能把其他訪客的帳號刪掉。
    if (getUser(req.userId)?.guest) {
      throw Object.assign(new Error('訪客不能刪除帳號'), { status: 403 });
    }
    if (req.params.id === req.userId) {
      throw Object.assign(new Error('不能刪掉自己正在用的帳號'), { status: 400 });
    }
    if (!removeGuest(req.params.id)) {
      throw Object.assign(new Error('沒有這個訪客帳號（固定帳號不能從這裡刪）'), { status: 404 });
    }
    req.log.warn({ by: req.userId, guest: req.params.id }, '刪除訪客帳號');
    return { ok: true };
  });

  /* ---- 個人檔案 ---- */

  app.get('/profile', async (req) => getProfile(viewUser(req)));

  app.put('/profile', async (req) => {
    readOnlyGuard(req);
    const { recalc, ...patch } = req.body || {};
    return updateProfile(req.userId, patch, { recalc: Boolean(recalc) }).after;
  });

  /* ---- 飲食 ---- */

  app.get('/meals', async (req) => listMeals(viewUser(req), req.query));
  app.get('/meals/dates', async (req) => listMealDates(viewUser(req)));
  app.post('/meals', async (req, reply) => {
    readOnlyGuard(req);
    return reply.code(201).send(addMeal(req.userId, req.body));
  });
  app.patch('/meals/:id', async (req, reply) => {
    readOnlyGuard(req);
    const row = updateMeal(req.userId, Number(req.params.id), req.body);
    return row || reply.code(404).send({ error: '找不到紀錄' });
  });
  app.delete('/meals/:id', async (req, reply) => {
    readOnlyGuard(req);
    return deleteMeal(req.userId, Number(req.params.id))
      ? { ok: true } : reply.code(404).send({ error: '找不到紀錄' });
  });

  /* ---- 訓練 ---- */

  app.get('/workouts', async (req) => listWorkouts(viewUser(req), req.query));
  app.post('/workouts', async (req, reply) => {
    readOnlyGuard(req);
    return reply.code(201).send(addWorkout(req.userId, req.body));
  });
  app.patch('/workouts/:id', async (req, reply) => {
    readOnlyGuard(req);
    const row = updateWorkout(req.userId, Number(req.params.id), req.body);
    return row || reply.code(404).send({ error: '找不到紀錄' });
  });
  app.delete('/workouts/:id', async (req, reply) => {
    readOnlyGuard(req);
    return deleteWorkout(req.userId, Number(req.params.id))
      ? { ok: true } : reply.code(404).send({ error: '找不到紀錄' });
  });

  /* ---- 體重 ---- */

  app.get('/weights', async (req) => listWeights(viewUser(req), req.query));
  app.post('/weights', async (req, reply) => {
    readOnlyGuard(req);
    return reply.code(201).send(addWeight(req.userId, req.body));
  });
  app.delete('/weights/:id', async (req, reply) => {
    readOnlyGuard(req);
    return deleteWeight(req.userId, Number(req.params.id))
      ? { ok: true } : reply.code(404).send({ error: '找不到紀錄' });
  });

  /* ---- 統計 ---- */

  app.get('/summary/daily', async (req) => dailySummary(viewUser(req), req.query.date || today()));

  app.get('/summary/range', async (req) => {
    const days = Number(req.query.days || 14);
    const from = req.query.from || daysAgo(days - 1);
    const to = req.query.to || today();
    return rangeSummary(viewUser(req), from, to);
  });

  app.get('/health', async (req) => {
    const models = quotaStatus();
    return {
      ok: true,
      date: today(),
      user: req.userId,
      gemini: Boolean(process.env.GEMINI_API_KEY),
      model: models.find(m => m.available)?.model ?? null,
      models,
      backup: lastBackup(),
    };
  });
}
