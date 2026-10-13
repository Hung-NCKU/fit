import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * 寵物的心情與體態。
 *
 * 這一支是唯一會碰 SQLite 的測試——因為要驗的東西就是「哪幾天算進來」，
 * 用假資料繞過資料庫就驗不到真正出錯的地方。FIT_DATA_DIR 指到拋棄式目錄，
 * 不會動到正式紀錄。
 *
 * 由來：Martina 今天記了十八筆、熱量吃到目標的 187%，寵物卻一直討食，
 * 說「3 天沒看到你記錄了」。原因是算「連續幾天沒記錄」的迴圈從**昨天**
 * 開始數，今天記了什麼完全不看。
 */
let records;
let pet;

beforeAll(async () => {
  vi.stubEnv('FIT_DATA_DIR', mkdtempSync(join(tmpdir(), 'fit-pet-')));
  records = await import('../server/src/records.js');
  pet = await import('../server/src/pet.js');
});
afterAll(() => { vi.unstubAllEnvs(); });

const U = 'eli';
const feed = (date, kcal, protein) => records.addMeal(U, {
  date, name: '測試餐', kcal, protein_g: protein, carb_g: 0, fat_g: 0,
});

describe('寵物狀態看的是哪幾天', () => {
  it('今天有記錄就不該說「幾天沒看到你記錄」', () => {
    // 前三天空白，只有今天吃
    feed(records.today(), records.dailySummary(U).targets.kcal, 200);

    const s = pet.petState(U);
    expect(s.silent).toBe(0);
    expect(s.mood).not.toBe('hungry');
    expect(s.says).not.toMatch(/沒看到你記錄/);
  });

  it('今天吃到目標就馬上算進平均，不必等到隔天', () => {
    // 上一個測試已經餵到今天的熱量目標。目標沒設定時 dailySummary 會給預設值，
    // 這裡只確認今天確實被納入——ateToday 與 days 都要反映出來。
    const s = pet.petState(U);
    expect(s.ateToday).toBe(true);
    expect(s.days).toBeGreaterThan(0);
  });

  it('從未記錄的新帳號不累計缺席天數', () => {
    const s = pet.petState('martina');   // 這個拋棄式資料庫裡沒有餵過
    expect(s.silent).toBe(0);
    expect(s.ateToday).toBe(false);
  });
});
