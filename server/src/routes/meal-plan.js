import { planView, updateSettings, regenerate, swap, cook } from '../meal-plan.js';
import { askCook } from '../cook-chat.js';
import { getUser } from '../users.js';

/**
 * 一週晚餐規劃。
 *
 * 跟飲食、訓練一樣：看別人的是唯讀，寫入一律進自己的資料庫。
 */
export default async function mealPlanRoutes(app) {
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
      throw Object.assign(new Error('只能看對方的菜單，不能修改'), { status: 403 });
    }
  };

  app.get('/meal-plan', async (req) => planView(viewUser(req)));

  app.patch('/meal-plan', async (req) => {
    writeGuard(req);
    updateSettings(req.userId, req.body || {});
    return planView(req.userId);
  });

  app.post('/meal-plan/generate', async (req) => {
    writeGuard(req);
    regenerate(req.userId);
    return planView(req.userId);
  });

  app.post('/meal-plan/swap', async (req) => {
    writeGuard(req);
    swap(req.userId, req.body?.day);
    return planView(req.userId);
  });

  // 煮完一道 → 直接記成飲食紀錄，不用再手動輸入熱量
  app.post('/meal-plan/cook', async (req, reply) => {
    writeGuard(req);
    const meal = cook(req.userId, req.body?.recipeId, {
      date: req.body?.date, meal_type: req.body?.meal_type,
    });
    return reply.code(201).send(meal);
  });

  // 料理小幫手。問答不存檔，所以看別人的菜單時也可以問——問的是菜，不是對方的紀錄
  app.post('/meal-plan/ask', async (req) => askCook(req.userId, req.body || {}));
}
