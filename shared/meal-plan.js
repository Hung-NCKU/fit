import { recipes } from './recipes.js';

/**
 * 一週晚餐規劃。從「好好煮 Chef」搬過來，但換掉了挑菜的依據。
 *
 * 原本是**按預算**挑：先濾出符合飲食需求與設備的食譜，再從單價撐得住一週預算的
 * 池子裡輪流取七道。問題是這個 App 本來就算得出你每天該吃多少——
 * 拿預算當主要條件，等於把現成的熱量與蛋白質目標丟著不用。
 *
 * 所以改成**按當日目標**挑：晚餐抓一天熱量的 DINNER_SHARE，跟目標差越少分數越好，
 * 蛋白質不足扣分更重（增肌的人缺的通常是蛋白質，不是熱量）。預算降為次要條件——
 * 超過就扣分，但不會因此挑不出菜。
 */

/** 晚餐大約佔一天熱量的比例。早餐午餐點心分掉其餘。 */
export const DINNER_SHARE = 0.4;

export const DIETS = ['素食', '魚素', '高蛋白', '無麩質', '無乳製品'];
export const EQUIPMENT = ['平底鍋', '烤箱', '氣炸鍋'];
export const STORES = ['全聯', '家樂福', 'Costco', '美廉社', '傳統市場'];

export const defaultSettings = () => ({
  people: 2,
  budget: 2000,
  diets: [],
  equipment: [...EQUIPMENT],
  stores: ['全聯'],
  saved: [],
  checked: [],
  plan: [],
  day: 0,
});

export const recipeById = (id) => recipes.find(r => r.id === id) || null;

/** 飲食需求要全部滿足，設備要有一樣對得上 */
export function eligible(settings) {
  const equipment = settings.equipment?.length ? settings.equipment : EQUIPMENT;
  return recipes.filter(r =>
    (settings.diets || []).every(d => r.tags.includes(d))
    && equipment.includes(r.equipment));
}

/**
 * 一道菜跟今天目標的差距，越小越好。
 *
 * 熱量用相對誤差；蛋白質只罰「不夠」，吃多了不扣分。權重 1:1.5 是刻意的——
 * 熱量差個 10% 影響不大，蛋白質差 10% 比較要緊。
 */
export function scoreRecipe(recipe, targets, settings) {
  const wantKcal = (targets?.kcal || 0) * DINNER_SHARE;
  const wantProtein = (targets?.protein_g || 0) * DINNER_SHARE;
  if (!wantKcal) return 0;                      // 沒有目標就不排序，維持原本的輪流取法

  const kcalGap = Math.abs(recipe.kcal - wantKcal) / wantKcal;
  const proteinGap = wantProtein ? Math.max(0, wantProtein - recipe.protein) / wantProtein : 0;

  // 預算只當次要條件：超了才扣，而且扣得比營養差距輕
  const weekCost = recipe.cost * (settings.people || 1) * 7;
  const over = settings.budget ? Math.max(0, weekCost - settings.budget) / settings.budget : 0;

  return kcalGap + proteinGap * 1.5 + over * 0.5;
}

/**
 * 排出七天。
 *
 * 食譜只有六道，所以一定會重複；排序後輪流取，讓最貼近目標的那幾道多出現，
 * 又不會七天全是同一道。offset 讓每次重新產生的結果不同。
 */
export function planFor(settings, targets) {
  const pool = eligible(settings);
  if (!pool.length) return null;
  const ranked = [...pool].sort((a, b) => scoreRecipe(a, targets, settings) - scoreRecipe(b, targets, settings));
  const offset = Math.floor(Math.random() * ranked.length);
  return Array.from({ length: 7 }, (_, i) => ranked[(offset + i) % ranked.length].id);
}

/** 換掉某一天：從符合條件的食譜裡挑一道「不是現在這道」的 */
export function swapDay(settings, targets, day) {
  const pool = eligible(settings);
  if (!pool.length) return settings.plan;
  const current = settings.plan[day];
  const others = pool.filter(r => r.id !== current);
  const ranked = (others.length ? others : pool)
    .sort((a, b) => scoreRecipe(a, targets, settings) - scoreRecipe(b, targets, settings));
  const pick = ranked[Math.floor(Math.random() * Math.min(3, ranked.length))];
  return settings.plan.map((id, i) => (i === day ? pick.id : id));
}

/** 七天的食材依人數放大後合併同名項目 */
export function shoppingFor(settings) {
  const map = new Map();
  for (const id of settings.plan || []) {
    const r = recipeById(id);
    if (!r) continue;
    for (const [name, qty, unit] of r.ingredients) {
      const row = map.get(name) || { name, qty: 0, unit };
      row.qty += qty * (settings.people || 1);
      map.set(name, row);
    }
  }
  // 數量可能是 0.5 顆這種，留一位小數就好
  return [...map.values()].map(r => ({ ...r, qty: Math.round(r.qty * 10) / 10 }));
}

/** 這份菜單一週大約多少錢 */
export const weekCost = (settings) =>
  (settings.plan || []).reduce((sum, id) => sum + (recipeById(id)?.cost || 0), 0) * (settings.people || 1);
