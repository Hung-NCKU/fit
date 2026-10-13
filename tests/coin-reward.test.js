import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
let records, pet, db;
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-01T12:00:00'));
  vi.stubEnv('FIT_DATA_DIR', mkdtempSync(join(tmpdir(), 'fit-coin-')));
  records = await import('../server/src/records.js');
  pet = await import('../server/src/pet.js');
  db = await import('../server/src/db.js');
  pet.adoptPet('eli', 'cat', 'c');
});
beforeEach(() => {
  vi.setSystemTime(new Date('2026-11-01T12:00:00'));
  db.getDb('eli').exec('DELETE FROM meals; DELETE FROM pet_meal_rewards; DELETE FROM pet_daily_bonus; UPDATE pet SET coins = 0');
});
afterAll(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
const add = (kcal = 100, date = records.today()) => records.addMeal('eli', { date, name: 'test', kcal });
const reward = m => pet.rewardMealSaved('eli', m.date, { isNew: true, mealId: m.id });
it('新增立即 +2，重複發放及修改不加幣', () => {
  const m = add();
  expect(reward(m)).toBe(2);
  expect(reward(m)).toBe(0);
  records.updateMeal('eli', m.id, { kcal: 150 });
  expect(pet.rewardMealSaved('eli', m.date)).toBe(0);
  expect(pet.getPet('eli').coins).toBe(2);
});
it('每天最多三筆 +6，刪除再新增不能重置額度', () => {
  const rows = [add(), add(), add()];
  expect(rows.map(reward)).toEqual([2, 2, 2]);
  records.deleteMeal('eli', rows[0].id);
  expect(reward(add())).toBe(0);
  expect(pet.getPet('eli').coins).toBe(6);
});
it('新的一天有獨立新增額度', () => {
  [add(), add(), add()].forEach(reward);
  vi.setSystemTime(new Date('2026-11-02T12:00:00'));
  expect(reward(add())).toBe(2);
});
it('修改首次熱量達標仍 +8，同一天不重複發', () => {
  const m = add(); reward(m);
  records.updateMeal('eli', m.id, { kcal: records.dailySummary('eli').targets.kcal });
  expect(pet.rewardMealSaved('eli', m.date)).toBe(8);
  expect(pet.rewardMealSaved('eli', m.date)).toBe(0);
});
it('新增首次達標 +10', () => {
  expect(reward(add(records.dailySummary('eli').targets.kcal))).toBe(10);
});
it('補登、未來日期、零熱量、沒有寵物不發新增獎勵', () => {
  expect(reward(add(100, '2026-10-31'))).toBe(0);
  expect(reward(add(100, '2026-11-02'))).toBe(0);
  expect(reward(add(0))).toBe(0);
  expect(pet.rewardMealSaved('martina', records.today())).toBe(0);
});
it('蛋白質 +8 隔天結算，重複結算不再發放', () => {
  const protein = records.dailySummary('eli').targets.protein_g;
  records.addMeal('eli', { date: '2026-10-31', name: 'test', kcal: 100, protein_g: protein });
  db.getDb('eli').prepare("UPDATE pet SET settled_to = '2026-10-30'").run();
  expect(pet.coinsForDay('eli', '2026-10-31')).toBe(8);
  expect(pet.settleCoins('eli').earned).toBe(8);
  expect(pet.settleCoins('eli').earned).toBe(0);
});
