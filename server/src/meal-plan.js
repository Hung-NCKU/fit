import { getDb, getProfile } from './db.js';
import { addMeal, today } from './records.js';
import {
  DIETS, EQUIPMENT, STORES, DINNER_SHARE,
  defaultSettings, eligible, planFor, recipeById, servedRecipe, shoppingFor, swapDay, weekCost,
} from '../../shared/meal-plan.js';
import { recipes } from '../../shared/recipes.js';

const invalid = (message) => Object.assign(new Error(message), { status: 400 });

/** 整份設定存成一個 JSON，讀出來時補齊缺的欄位（舊資料或新增欄位都靠這個） */
export function getPlan(userId) {
  const row = getDb(userId).prepare('SELECT settings FROM meal_plan WHERE id = 1').get();
  let saved = {};
  try { saved = JSON.parse(row?.settings || '{}'); } catch { saved = {}; }
  return { ...defaultSettings(), ...saved };
}

function save(userId, settings) {
  getDb(userId).prepare(`
    INSERT INTO meal_plan (id, settings, updated_at) VALUES (1, ?, datetime('now','localtime'))
    ON CONFLICT(id) DO UPDATE SET settings = excluded.settings, updated_at = excluded.updated_at
  `).run(JSON.stringify(settings));
  return settings;
}

/** 這個人今天的熱量與蛋白質目標，拿來當挑菜的依據 */
function targetsOf(userId) {
  const p = getProfile(userId);
  return { kcal: p?.target_kcal || 0, protein_g: p?.target_protein_g || 0 };
}

const list = (value, allowed, label) => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw invalid(`${label}格式不正確`);
  const clean = [...new Set(value.map(String))];
  for (const v of clean) if (!allowed.includes(v)) throw invalid(`不支援的${label}：${v}`);
  return clean;
};

const int = (value, label, min, max) => {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw invalid(`${label}需介於 ${min}–${max}`);
  return n;
};

/** 只收認得的欄位，其餘忽略——設定是整包覆蓋寫入的，不擋的話什麼都存得進去 */
export function updateSettings(userId, patch = {}) {
  const current = getPlan(userId);
  const next = { ...current };
  const fields = {
    people: () => int(patch.people, '人數', 1, 8),
    budget: () => int(patch.budget, '每週預算', 500, 6000),
    day: () => int(patch.day, '天數', 0, 6),
    diets: () => list(patch.diets, DIETS, '飲食需求'),
    equipment: () => list(patch.equipment, EQUIPMENT, '設備'),
    stores: () => list(patch.stores, STORES, '採買通路'),
  };
  for (const [key, read] of Object.entries(fields)) {
    const value = read();
    if (value !== undefined) next[key] = value;
  }
  if (patch.saved !== undefined) {
    if (!Array.isArray(patch.saved)) throw invalid('收藏格式不正確');
    next.saved = [...new Set(patch.saved.map(Number))].filter(id => recipeById(id));
  }
  // 自己加進購物清單的項目。純文字，去掉空白與重複，長度設上限免得被塞爆
  if (patch.extras !== undefined) {
    if (!Array.isArray(patch.extras)) throw invalid('購物清單項目格式不正確');
    const clean = patch.extras.map(v => String(v).trim()).filter(Boolean);
    if (clean.some(v => v.length > 40)) throw invalid('購物清單項目每筆最多 40 個字');
    next.extras = [...new Set(clean)].slice(0, 50);
  }
  if (patch.checked !== undefined) {
    if (!Array.isArray(patch.checked)) throw invalid('購物清單格式不正確');
    next.checked = [...new Set(patch.checked.map(String))].slice(0, 100);
  }
  return save(userId, next);
}

/** 手動項目的勾選鍵有 + 前綴（見 shoppingFor），換菜單時留著 */
const keepManualChecks = (checked = []) => checked.filter(k => String(k).startsWith('+'));

/** 重排整週。排不出來（條件太嚴）就保留原本的菜單，不要把人清空 */
export function regenerate(userId) {
  const settings = getPlan(userId);
  const plan = planFor(settings, targetsOf(userId));
  if (!plan) throw invalid('目前的飲食需求與設備組合沒有可用的食譜，放寬一項再試');
  // 換了菜單，食材那半邊的勾就不算數了；自己加的項目跟菜單無關，勾了就留著
  return save(userId, { ...settings, plan, checked: keepManualChecks(settings.checked) });
}

export function swap(userId, day) {
  const settings = getPlan(userId);
  const d = int(day, '天數', 0, 6);
  if (!settings.plan?.length) throw invalid('還沒有菜單');
  return save(userId, {
    ...settings,
    plan: swapDay(settings, targetsOf(userId), d),
    checked: keepManualChecks(settings.checked),
  });
}

/**
 * 煮完一道就記成飲食紀錄。
 *
 * 這是兩個 App 合起來的意義所在：食譜本來就標了熱量與蛋白質，
 * 不必再拍照辨識或手動輸入。份量跟著人數換算——食譜的營養是「一人份」。
 */
export function cook(userId, recipeId, { date, meal_type = 'dinner' } = {}) {
  const r = recipeById(Number(recipeId));
  if (!r) throw invalid('沒有這道食譜');
  // 記的是實際吃的份量，不是食譜的一人份——畫面上寫 1.5 份，紀錄就要是 1.5 份
  const served = servedRecipe(r, targetsOf(userId));
  return addMeal(userId, {
    date: date || today(),
    meal_type,
    name: r.name,
    portion: `${served.portion} 人份`,
    kcal: served.servedKcal,
    protein_g: served.servedProtein,
    note: `來自菜單：${r.time} 分鐘・${r.equipment}`,
  }, 'meal_plan');
}

/** 畫面要的全部：設定、菜單（含食譜內容）、購物清單、以及挑菜的依據 */
export function planView(userId) {
  const settings = getPlan(userId);
  const targets = targetsOf(userId);
  return {
    settings,
    options: { diets: DIETS, equipment: EQUIPMENT, stores: STORES },
    recipes,
    plan: (settings.plan || []).map(id => recipeById(id)).filter(Boolean)
      .map(r => servedRecipe(r, targets)),
    shopping: shoppingFor(settings, targets),
    weekCost: weekCost(settings, targets),
    eligibleCount: eligible(settings).length,
    // 讓畫面說得出「為什麼挑這幾道」
    dinnerTarget: {
      kcal: Math.round(targets.kcal * DINNER_SHARE),
      protein_g: Math.round(targets.protein_g * DINNER_SHARE),
    },
  };
}
