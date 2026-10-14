import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest';
let pet, db;
beforeAll(async () => {
  vi.stubEnv('FIT_DATA_DIR', mkdtempSync(join(tmpdir(), 'fit-family-')));
  pet = await import('../server/src/pet.js');
  db = (await import('../server/src/db.js')).getDb('eli');
  pet.adoptPet('eli', 'cat', '原來的小貓');
});
beforeEach(() => {
  db.exec("DELETE FROM pet_companions; DELETE FROM pet_selection; DELETE FROM pet_items WHERE item_id != 'bg_room'; UPDATE pet SET coins = 30000, equipped = '{\"bg\":\"bg_room\"}', name = '原來的小貓'");
});
afterAll(() => vi.unstubAllEnvs());
it('購買保留原寵物並扣共用錢包，可重複同物種且重送不重扣', () => {
  const dog = pet.purchasePet('eli','dog','小藍','purchase-test-001');
  expect(dog.coins).toBe(29500);
  expect(pet.listPets('eli').map(p => p.name)).toEqual(['原來的小貓','小藍']);
  expect(pet.purchasePet('eli','dog','小藍','purchase-test-001').coins).toBe(29500);
  pet.purchasePet('eli','dog','小黃','purchase-test-002');
  expect(pet.listPets('eli')).toHaveLength(3);
  expect(pet.selectPet('eli','main').coins).toBe(29000);
  expect(() => pet.purchasePet('eli','cat','偷換','purchase-test-001')).toThrow();
});
it('不足代幣或無效參數不新增、不扣款', () => {
  db.exec('UPDATE pet SET coins = 499');
  for (const [species,name,token] of [['dog','小藍','purchase-test-001'],['unknown','小藍','purchase-test-002'],['dog',' ','purchase-test-003'],['dog','小藍','bad']]) {
    expect(() => pet.purchasePet('eli',species,name,token)).toThrow();
    expect(pet.listPets('eli')).toHaveLength(1);
    expect(pet.getPet('eli').coins).toBe(499);
  }
});
it('個別改名、穿搭與移除獨立保存，物種與寵物不存在時拒絕', () => {
  const cat = pet.purchasePet('eli','cat','第二隻','purchase-test-001');
  const outfit = pet.shopFor('cat').find(i => i.slot === 'outfit');
  pet.buyItem('eli',outfit.id,'main');
  expect(pet.petByKey('eli',cat.petKey).equipped.outfit).toBeUndefined();
  pet.equipItem('eli',outfit.id,cat.petKey);
  pet.unequipSlot('eli','outfit','main');
  expect(pet.petByKey('eli',cat.petKey).equipped.outfit).toBe(outfit.id);
  pet.renamePet('eli',cat.petKey,'新名字');
  expect(pet.petByKey('eli','main').name).toBe('原來的小貓');
  expect(pet.petByKey('eli',cat.petKey).name).toBe('新名字');
  const before = pet.getPet('eli').coins;
  expect(() => pet.buyItem('eli',pet.shopFor('dog').find(i=>i.slot==='outfit').id,cat.petKey)).toThrow();
  expect(pet.getPet('eli').coins).toBe(before);
  expect(() => pet.selectPet('eli','companion-999')).toThrow();
  expect(() => pet.replacePet('eli','dog','replacement','原來的小貓')).toThrow();
});
it('從第二隻換背景仍共用同一環境', () => {
  const dog = pet.purchasePet('eli','dog','小藍','purchase-test-001');
  pet.buyItem('eli','bg_garden',dog.petKey);
  expect(pet.listPets('eli').map(p=>p.equipped.bg)).toEqual(['bg_garden','bg_garden']);
});
