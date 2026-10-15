import { destroyDb, getProfile, updateProfile } from '../db.js';
import { quotaStatus } from '../gemini.js';
import { rewardMealSaved, rewardWorkoutSaved } from '../pet.js';
import { lastBackup } from '../autobackup.js';
import { addGuest, getUser, isTempGuest, promote, removeGuest, USERS } from '../users.js';
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

  /**
   * 建立正式帳號。
   *
   * 兩種情況共用同一張表單：
   *   還在試用的訪客  → 把目前這個帳號升級，試用期間記的東西都留著
   *   已經是正式使用者 → 另外開一個新帳號，回傳新密碼
   *
   * 身體數據在這裡就要填齊——每日熱量與三大營養素是從它們算出來的，
   * 留著預設值等於給錯目標。
   */
  app.post('/account', async (req, reply) => {
    const b = req.body || {};
    const name = String(b.name ?? '').trim();
    if (!name) throw Object.assign(new Error('請填名稱'), { status: 400 });

    const num = (v, label, min, max) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < min || n > max) {
        throw Object.assign(new Error(`${label}要在 ${min}~${max} 之間`), { status: 400 });
      }
      return n;
    };

    const profile = {
      name,
      sex: b.sex === 'male' ? 'male' : 'female',
      age: num(b.age, '年齡', 10, 100),
      height_cm: num(b.height_cm, '身高', 100, 230),
      weight_kg: num(b.weight_kg, '體重', 25, 250),
      goal_weight_kg: num(b.goal_weight_kg, '目標體重', 25, 250),
      activity: num(b.activity, '活動量', 1.2, 1.725),
      goal: ['muscle_gain', 'maintain', 'fat_loss'].includes(b.goal) ? b.goal : 'maintain',
    };

    // 試用中就升級自己，否則開一個新的
    const upgrading = isTempGuest(req.userId);
    const target = upgrading ? getUser(req.userId) : addGuest();
    const promoted = promote(target.id, name);
    if (!promoted) throw Object.assign(new Error('建立失敗'), { status: 500 });

    // updateProfile 會順手把資料庫建起來（第一次存取時）並重算目標
    updateProfile(target.id, profile, { recalc: true });
    req.log.warn({ by: req.userId, account: target.id, upgrading }, '建立帳號');

    return reply.code(201).send({
      ok: true,
      user: target.id,
      name: promoted.name,
      // 試用不顯示密碼；建立正式帳號時才提供登入密碼
      password: target.password,
      upgrading,
    });
  });

  /**
   * 刪除「自己」的帳號（header 的刪除鈕）。
   * 只有後台建立的帳號（試用訪客、新增的使用者）能刪；固定帳號寫在 users.js，
   * 不能從這裡刪。資料庫檔案會一起刪，無法復原。
   */
  app.delete('/account', async (req, reply) => {
    const u = getUser(req.userId);
    if (!u || !u.guest) {
      throw Object.assign(new Error('固定帳號不能從這裡刪除'), { status: 403 });
    }
    if (!removeGuest(u.id)) {
      throw Object.assign(new Error('刪除失敗'), { status: 500 });
    }
    destroyDb(u.id);
    req.log.warn({ account: u.id }, '使用者刪除了自己的帳號');
    reply.clearCookie('fit_auth', { path: '/' });
    return { ok: true };
  });

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
    const meal = addMeal(req.userId, req.body);
    rewardMealSaved(req.userId, meal.date, { isNew: true, mealId: meal.id });
    return reply.code(201).send(meal);
  });
  app.patch('/meals/:id', async (req, reply) => {
    readOnlyGuard(req);
    const row = updateMeal(req.userId, Number(req.params.id), req.body);
    if (row) rewardMealSaved(req.userId, row.date);
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
    const row=addWorkout(req.userId, req.body);
    rewardWorkoutSaved(req.userId,row.date);
    return reply.code(201).send(row);
  });
  app.patch('/workouts/:id', async (req, reply) => {
    readOnlyGuard(req);
    const row = updateWorkout(req.userId, Number(req.params.id), req.body);
    if(row)rewardWorkoutSaved(req.userId,row.date);
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
