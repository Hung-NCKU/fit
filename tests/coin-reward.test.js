import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/** 記錄飲食當下自動入帳：每次 +2，當天熱量第一次達標再 +8（每天一次）。 */
let records;
let pet;
let db;

beforeAll(async () => {
  vi.stubEnv('FIT_DATA_DIR', mkdtempSync(join(tmpdir(), 'fit-coin-')));
  records = await import('../server/src/records.js');
  pet = await import('../server/src/pet.js');
  db = await import('../server/src/db.js');
  pet.adoptPet('eli', 'cat', 'c');
});
afterAll(() => { vi.unstubAllEnvs(); });

const coins = () => pet.getPet('eli').coins;
const D = '2026-11-01';

describe('記餐入帳', () => {
  it('每次 +2，沒達標沒有加成', () => {
    const before = coins();
    const m = records.addMeal('eli', { date: D, name: 'a', kcal: 100 });
    expect(pet.rewardMealSaved('eli', m.date)).toBe(2);
    expect(coins()).toBe(before + 2);
  });

  it('熱量第一次達標 +8，同一天只發一次', () => {
    const target = records.dailySummary('eli', D).targets.kcal;
    const need = target - records.dailySummary('eli', D).nutrition.kcal;
    const m = records.addMeal('eli', { date: D, name: 'b', kcal: need });
    expect(pet.rewardMealSaved('eli', m.date)).toBe(10);
    expect(pet.rewardMealSaved('eli', m.date)).toBe(2);
  });

  it('沒有寵物就不發', () => {
    expect(pet.rewardMealSaved('martina', D)).toBe(0);
  });
});
