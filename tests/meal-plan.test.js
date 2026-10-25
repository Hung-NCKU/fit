import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { DINNER_SHARE, EQUIPMENT, eligible, scoreRecipe, shoppingFor } from '../shared/meal-plan.js';
import { recipes } from '../shared/recipes.js';

/**
 * 一週晚餐規劃（從「好好煮 Chef」搬過來）。
 *
 * 重點是挑菜的依據換掉了：原本按預算，現在按這個人的熱量與蛋白質目標。
 */
let plan, db, records;
beforeAll(async () => {
  vi.stubEnv('FIT_DATA_DIR', mkdtempSync(join(tmpdir(), 'fit-meal-plan-')));
  plan = await import('../server/src/meal-plan.js');
  db = await import('../server/src/db.js');
  records = await import('../server/src/records.js');
});
afterAll(() => { vi.unstubAllEnvs(); });
beforeEach(() => {
  db.getDb('eli').exec('DELETE FROM meal_plan; DELETE FROM meals');
  db.updateProfile('eli', { sex: 'male', age: 28, height_cm: 180, weight_kg: 77, goal_weight_kg: 82, activity: 1.55, goal: 'muscle_gain' });
});

it('挑菜依每日目標，不是依預算', () => {
  const targets = { kcal: 3000, protein_g: 160 };
  const settings = { people: 2, budget: 2000, diets: [], equipment: ['平底鍋', '烤箱', '氣炸鍋'] };

  // 晚餐抓一天的四成：1200 kcal / 64 g
  const best = [...recipes].sort((a, b) => scoreRecipe(a, targets, settings) - scoreRecipe(b, targets, settings))[0];
  const worst = [...recipes].sort((a, b) => scoreRecipe(b, targets, settings) - scoreRecipe(a, targets, settings))[0];
  expect(Math.abs(best.kcal - 3000 * DINNER_SHARE)).toBeLessThan(Math.abs(worst.kcal - 3000 * DINNER_SHARE));

  // 蛋白質不夠罰得比熱量重：同樣差距下，缺蛋白質的分數比較差
  const lowProtein = { kcal: 1200, protein: 20, cost: 100, tags: [], equipment: '平底鍋' };
  const enough = { kcal: 1200, protein: 64, cost: 100, tags: [], equipment: '平底鍋' };
  expect(scoreRecipe(lowProtein, targets, settings)).toBeGreaterThan(scoreRecipe(enough, targets, settings));
});

it('飲食需求與設備會把食譜濾掉，排不出來時不清空原本的菜單', () => {
  expect(eligible({ diets: ['素食'], equipment: ['平底鍋'] }).every(r => r.tags.includes('素食'))).toBe(true);
  // 設備全不勾＝不限制，不是「一道都不給」——否則使用者誤觸就進了死路
  expect(eligible({ diets: [], equipment: [] }).length).toBe(recipes.length);
  // 唯一的氣炸鍋料理不是素食，這個組合真的排不出來
  expect(eligible({ diets: ['素食'], equipment: ['氣炸鍋'] }).length).toBe(0);

  plan.updateSettings('eli', { diets: [], equipment: ['平底鍋', '烤箱', '氣炸鍋'] });
  const before = plan.regenerate('eli').plan;
  expect(before).toHaveLength(7);

  plan.updateSettings('eli', { diets: ['素食'], equipment: ['氣炸鍋'] });
  expect(() => plan.regenerate('eli')).toThrow(/沒有可用的食譜/);
  expect(plan.getPlan('eli').plan).toEqual(before);   // 原本的菜單還在
});

it('購物清單把七天食材依人數合併同名項目', () => {
  const settings = { people: 2, plan: [1, 1, 2, 2, 2, 3, 3] };
  const rows = shoppingFor(settings);
  const names = rows.map(r => r.name);
  expect(new Set(names).size).toBe(names.length);     // 沒有重複的品項

  const salmon = rows.find(r => r.name === '鮭魚');
  // 食譜 1 用 150g，排了兩天，兩人份 → 150 * 2 * 2
  expect(salmon.qty).toBe(600);
  expect(salmon.unit).toBe('g');
});

it('煮完一道直接變成飲食紀錄，熱量與蛋白質照食譜帶入', () => {
  const r = recipes[0];
  const meal = plan.cook('eli', r.id, { date: '2026-10-25' });
  expect(meal.name).toBe(r.name);
  expect(meal.kcal).toBe(r.kcal);
  expect(meal.protein_g).toBe(r.protein);
  expect(meal.meal_type).toBe('dinner');

  // 真的進了當天的飲食統計，寵物與代幣那套才看得到
  expect(records.dailySummary('eli', '2026-10-25').nutrition.items).toBe(1);
  expect(() => plan.cook('eli', 999)).toThrow(/沒有這道食譜/);
});

it('每一種設備都至少有一道菜可做', () => {
  // 設備清單上有、食譜卻做不出來的話，使用者勾了只會拿到「排不出菜」
  for (const e of EQUIPMENT) {
    expect(eligible({ diets: [], equipment: [e] }).length, `${e} 沒有對應的食譜`).toBeGreaterThan(0);
  }
});

it('每道菜都給得出教學影片的去處，有影片的欄位要完整', () => {
  for (const r of recipes) {
    expect(r.videoQuery, `${r.name} 少了搜尋字串`).toContain(r.name);
    if (!r.videoId) continue;
    // YouTube 的影片 ID 是 11 碼。長度不對就是貼錯了，會連到不存在的影片
    expect(r.videoId, `${r.name} 的影片 ID 格式不對`).toMatch(/^[\w-]{11}$/);
    expect(r.channel).toBeTruthy();
    expect(r.videoTitle).toBeTruthy();
  }
});

it('購物清單可以自己加一項，跟食材分開記勾選', () => {
  plan.updateSettings('eli', { equipment: ['平底鍋', '烤箱', '氣炸鍋'] });
  plan.regenerate('eli');
  plan.updateSettings('eli', { extras: ['  牛奶 2 瓶  ', '牛奶 2 瓶', '衛生紙'] });

  const rows = plan.planView('eli').shopping;
  const manual = rows.filter(r => r.manual);
  // 前後空白會去掉，重複的只留一筆
  expect(manual.map(r => r.name)).toEqual(['牛奶 2 瓶', '衛生紙']);
  expect(manual[0].key).toBe('+牛奶 2 瓶');
  expect(manual[0].label).toBe('牛奶 2 瓶');
  // 食材那半邊照舊帶數量
  expect(rows.find(r => !r.manual).label).toMatch(/\d/);

  // 同名的食材與手動項目不會互相連動
  const both = shoppingFor({ plan: [1], people: 1, extras: ['鮭魚'] });
  expect(new Set(both.map(r => r.key)).size).toBe(both.length);

  expect(() => plan.updateSettings('eli', { extras: ['x'.repeat(41)] })).toThrow(/40 個字/);
  expect(() => plan.updateSettings('eli', { extras: '牛奶' })).toThrow(/格式不正確/);
});

it('換菜單會清掉食材的勾選，自己加的項目留著', () => {
  plan.updateSettings('eli', { equipment: ['平底鍋', '烤箱', '氣炸鍋'] });
  plan.regenerate('eli');
  plan.updateSettings('eli', { extras: ['醬油'] });
  const ingredient = plan.planView('eli').shopping.find(r => !r.manual).key;
  plan.updateSettings('eli', { checked: [ingredient, '+醬油'] });

  const after = plan.regenerate('eli');
  expect(after.checked).toEqual(['+醬油']);
  expect(after.extras).toEqual(['醬油']);
});

it('設定只收認得的欄位與合法的值', () => {
  expect(() => plan.updateSettings('eli', { people: 99 })).toThrow(/人數/);
  expect(() => plan.updateSettings('eli', { diets: ['亂填'] })).toThrow(/飲食需求/);
  const s = plan.updateSettings('eli', { people: 4, budget: 3000, 亂塞: 1 });
  expect(s.people).toBe(4);
  expect(s.budget).toBe(3000);
  expect(s.亂塞).toBeUndefined();
});
