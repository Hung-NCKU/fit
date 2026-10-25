import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

/**
 * 賣回商店與「商城照養了哪幾隻上架套裝」。
 *
 * 用 FIT_DATA_DIR 開拋棄式資料庫，不會動到正式紀錄。
 */
let pet, db;
beforeAll(async () => {
  vi.stubEnv('FIT_DATA_DIR', mkdtempSync(join(tmpdir(), 'fit-sell-')));
  pet = await import('../server/src/pet.js');
  db = await import('../server/src/db.js');
  pet.adoptPet('eli', 'dog', 'Money');
});
afterAll(() => { vi.unstubAllEnvs(); });

const coins = () => pet.getPet('eli').coins;
const setCoins = (n) => db.getDb('eli').prepare('UPDATE pet SET coins = ? WHERE id = 1').run(n);
beforeEach(() => { setCoins(5000); });

it('賣回商店退半價，東西也從身上脫下來', () => {
  const item = pet.shopFor('dog').find(i => i.slot === 'outfit');
  pet.buyItem('eli', item.id, 'main');
  expect(pet.ownedItems('eli')).toContain(item.id);
  expect(pet.getPet('eli').equipped.outfit).toBe(item.id);

  const before = coins();
  const res = pet.sellItem('eli', item.id);

  expect(res.refund).toBe(Math.floor(item.price / 2));
  expect(coins()).toBe(before + Math.floor(item.price / 2));
  expect(pet.ownedItems('eli')).not.toContain(item.id);
  // 賣掉之後不該還穿在身上
  expect(pet.getPet('eli').equipped.outfit).toBeUndefined();
});

it('賣掉再買回來一定是虧的，不能靠買賣刷代幣', () => {
  const item = pet.shopFor('dog').find(i => i.slot === 'outfit');
  const start = coins();
  pet.buyItem('eli', item.id, 'main');
  pet.sellItem('eli', item.id);
  expect(coins()).toBeLessThan(start);
});

it('沒買過的、免費的都不能賣', () => {
  const outfit = pet.shopFor('dog').find(i => i.slot === 'outfit');
  expect(() => pet.sellItem('eli', outfit.id)).toThrow(/還沒有這個東西/);
  // 預設小房間是 0 元，賣了只會變成憑空刪東西
  expect(() => pet.sellItem('eli', 'bg_room')).toThrow(/不能賣/);
});

it('正在使用的環境不能賣', () => {
  const garden = pet.shopFor('dog').find(i => i.id === 'bg_garden');
  pet.buyItem('eli', garden.id, 'main');
  expect(pet.getPet('eli').equipped.bg).toBe('bg_garden');
  expect(() => pet.sellItem('eli', 'bg_garden')).toThrow(/不能賣/);
});

it('商城照養了哪幾隻上架套裝，每套都標明是給誰的', () => {
  const roster = [
    { petKey: 'main', species: 'dog', name: 'Money' },
    { petKey: 'companion-1', species: 'rabbit', name: '兔兔' },
  ];
  const sets = pet.shopFor(roster).filter(i => i.slot === 'outfit');

  expect(sets.some(s => s.species === 'dog')).toBe(true);
  expect(sets.some(s => s.species === 'rabbit')).toBe(true);
  // 每一套都要帶著「這是誰的」，前端買的時候要靠它指名寵物
  for (const s of sets) expect(s.petKey).toBeTruthy();
  expect(sets.find(s => s.species === 'rabbit').petName).toBe('兔兔');

  // 只給一個物種字串的舊用法還要能動
  expect(pet.shopFor('dog').filter(i => i.slot === 'outfit').every(s => s.species === 'dog')).toBe(true);
});
