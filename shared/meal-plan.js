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
/**
 * 一般家庭廚房會有的器具。每一項至少要有一道對得上的食譜（tests 會檢查），
 * 不然使用者勾了只會得到「排不出菜」。
 */
export const EQUIPMENT = [
  '平底鍋', '炒鍋', '湯鍋', '電鍋', '電子鍋',
  '烤箱', '小烤箱', '氣炸鍋', '微波爐', '果汁機', '壓力鍋',
];
export const STORES = ['全聯', '家樂福', 'Costco', '美廉社', '傳統市場'];

export const defaultSettings = () => ({
  people: 2,
  budget: 2000,
  diets: [],
  equipment: [...EQUIPMENT],
  stores: ['全聯'],
  saved: [],
  checked: [],
  extras: [],
  plan: [],
  day: 0,
});

export const recipeById = (id) => recipes.find(r => r.id === id) || null;

/**
 * 一份不夠就吃一份半。
 *
 * 食譜的營養都是「一人份」，落在 365–540 kcal；增肌的人晚餐目標動輒 800 kcal 以上，
 * 每一道都偏小，光靠挑菜永遠補不到目標，排序也會退化成「照份量大小排」。
 * 所以讓份量可以放大，只用 1 / 1.5 / 2 這三種好抓的份量——
 * 再細的倍數（1.37 份）煮的時候根本沒辦法量。
 */
export const PORTIONS = [1, 1.5, 2];

export function portionFor(recipe, targets) {
  const want = (targets?.kcal || 0) * DINNER_SHARE;
  if (!want || !recipe?.kcal) return 1;
  return PORTIONS.reduce((best, p) => (
    Math.abs(recipe.kcal * p - want) < Math.abs(recipe.kcal * best - want) ? p : best
  ), 1);
}

/** 食譜加上「實際要吃幾份」之後的熱量、蛋白質與花費。原本的一人份數值保留不動 */
export function servedRecipe(recipe, targets) {
  const portion = portionFor(recipe, targets);
  return {
    ...recipe,
    portion,
    servedKcal: Math.round(recipe.kcal * portion),
    servedProtein: Math.round(recipe.protein * portion),
    servedCost: Math.round(recipe.cost * portion),
  };
}

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

  // 用「實際會吃幾份」來比，不然一道份量小但蛋白質密度高的菜會被低估
  const served = servedRecipe(recipe, targets);
  const kcalGap = Math.abs(served.servedKcal - wantKcal) / wantKcal;
  const proteinGap = wantProtein ? Math.max(0, wantProtein - served.servedProtein) / wantProtein : 0;

  // 預算只當次要條件：超了才扣，而且扣得比營養差距輕
  const weekCost = served.servedCost * (settings.people || 1) * 7;
  const over = settings.budget ? Math.max(0, weekCost - settings.budget) / settings.budget : 0;

  return kcalGap + proteinGap * 1.5 + over * 0.5;
}

const rank = (pool, targets, settings) => [...pool]
  .sort((a, b) => scoreRecipe(a, targets, settings) - scoreRecipe(b, targets, settings))
  .map((recipe, i) => ({ recipe, weight: 1 / (i + 1) }));   // 名次越前面越重

/**
 * 從袋子裡依權重抽一道出來（抽走，不放回）。
 *
 * 用名次的倒數當權重：第一名被抽中的機會是第五名的五倍，但不是「永遠就那幾道」，
 * 按一次「重新排菜」還是會換一批。
 */
function takeWeighted(bag, rng) {
  const total = bag.reduce((sum, b) => sum + b.weight, 0);
  let point = rng() * total;
  for (let i = 0; i < bag.length; i++) {
    point -= bag[i].weight;
    if (point <= 0) return bag.splice(i, 1)[0].recipe;
  }
  return bag.pop().recipe;    // 浮點數誤差時的保險
}

/**
 * 排出七天。
 *
 * 原本是「排序後隨機取一段連續七道」。食譜只有六道時沒差（七天一定繞一圈，
 * 全部都排得到），但食譜變成十五道之後，起點落在後半就整週都是最不合目標的菜
 * ——實測第一名進菜單的機率 46%、最後一名 47%，等於排序白做。
 *
 * 改成依名次加權抽樣：好的常出現，差的偶爾出現，每次重排仍然不一樣。
 * rng 可以換掉，測試才有辦法固定結果。
 */
export function planFor(settings, targets, rng = Math.random) {
  const pool = eligible(settings);
  if (!pool.length) return null;
  const ranked = rank(pool, targets, settings);

  const picks = [];
  let bag = [];
  while (picks.length < 7) {
    if (!bag.length) bag = ranked.map(b => ({ ...b }));   // 不到七道就再來一輪
    picks.push(takeWeighted(bag, rng).id);
  }
  return picks;
}

/** 換掉某一天：從符合條件、而且不是現在這道的食譜裡，一樣依名次加權抽一道 */
export function swapDay(settings, targets, day, rng = Math.random) {
  const pool = eligible(settings);
  if (!pool.length) return settings.plan;
  const current = settings.plan[day];
  const others = pool.filter(r => r.id !== current);
  const pick = takeWeighted(rank(others.length ? others : pool, targets, settings), rng);
  return settings.plan.map((id, i) => (i === day ? pick.id : id));
}

/**
 * 七天的食材依人數放大後合併同名項目，後面接上自己手動加的項目。
 *
 * 手動項目是純文字（「牛奶 2 瓶」這種），不去猜數量也不跟食材合併——
 * 猜錯的代價是買錯東西，照著打的字顯示最不會出事。
 *
 * key 是勾選狀態的鍵：手動項目加上前綴，才不會跟同名的食材互相連動。
 */
export function shoppingFor(settings, targets) {
  const map = new Map();
  for (const id of settings.plan || []) {
    const r = recipeById(id);
    if (!r) continue;
    // 要吃一份半就得買一份半的量，不然照著清單買會不夠
    const portion = portionFor(r, targets);
    for (const [name, qty, unit] of r.ingredients) {
      const row = map.get(name) || { name, qty: 0, unit };
      row.qty += qty * (settings.people || 1) * portion;
      map.set(name, row);
    }
  }
  // 數量可能是 0.5 顆這種，留一位小數就好
  const rows = [...map.values()].map((r) => {
    const qty = Math.round(r.qty * 10) / 10;
    return { ...r, qty, key: r.name, label: `${r.name} ${qty}${r.unit}`, manual: false };
  });
  for (const text of settings.extras || []) {
    rows.push({ name: text, qty: '', unit: '', key: `+${text}`, label: text, manual: true });
  }
  return rows;
}

/** 這份菜單一週大約多少錢（含放大的份量） */
export const weekCost = (settings, targets) =>
  (settings.plan || []).reduce((sum, id) => {
    const r = recipeById(id);
    return sum + (r ? servedRecipe(r, targets).servedCost : 0);
  }, 0) * (settings.people || 1);
