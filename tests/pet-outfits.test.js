import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {ALL_OUTFITS} from '../server/src/pet-outfits.js';
import {ALL_WEAR} from '../server/src/pet-wardrobe.js';
let pet,db;
beforeAll(async()=>{vi.stubEnv('FIT_DATA_DIR',mkdtempSync(join(tmpdir(),'fit-outfits-')));pet=await import('../server/src/pet.js');db=(await import('../server/src/db.js')).getDb('eli');pet.adoptPet('eli','cat','橘豆');});
beforeEach(()=>{db.exec("DELETE FROM pet_items WHERE item_id!='bg_room'; UPDATE pet SET coins=3000,equipped='{\"bg\":\"bg_room\"}'");});
afterAll(()=>vi.unstubAllEnvs());
it('十種各三套，所有舊單品都有唯一對應套裝，商城只出售完整套裝',()=>{
  expect(ALL_OUTFITS).toHaveLength(30);
  for(const old of ALL_WEAR) expect(ALL_OUTFITS.filter(set=>set.legacy.includes(old.id))).toHaveLength(1);
  for(const species of new Set(ALL_WEAR.map(i=>i.species))) {
    const shop=pet.shopFor(species);
    expect(shop.filter(i=>i.slot==='outfit')).toHaveLength(3);
    expect(shop.some(i=>['hat','cloth','acc'].includes(i.slot))).toBe(false);
  }
});
it('舊單品保留購買紀錄並免費解鎖、舊穿著自動顯示套裝，不改餘額',()=>{
  db.prepare('INSERT INTO pet_items(item_id) VALUES (?)').run('wear-cat-8');
  db.exec("UPDATE pet SET equipped='{\"bg\":\"bg_room\",\"cloth\":\"wear-cat-8\"}'");
  expect(pet.ownedItems('eli')).toEqual(expect.arrayContaining(['wear-cat-8','outfit-cat-1']));
  expect(pet.getPet('eli').equipped).toEqual({bg:'bg_room',outfit:'outfit-cat-1'});
  pet.equipItem('eli','outfit-cat-1');
  expect(pet.getPet('eli').coins).toBe(3000);
  expect(db.prepare("SELECT item_id FROM pet_items WHERE item_id='wear-cat-8'").get()).toBeTruthy();
  expect(()=>pet.buyItem('eli','outfit-cat-1')).toThrow('已經買過了');
  pet.unequipSlot('eli','outfit');
  expect(pet.getPet('eli').equipped.outfit).toBeUndefined();
});
it('套裝按價格扣款一次、重送不重扣，錯誤物種與舊單品不新增購買',()=>{
  const set=ALL_OUTFITS.find(i=>i.id==='outfit-cat-2');
  pet.buyItem('eli',set.id);
  expect(pet.getPet('eli').coins).toBe(3000-set.price);
  expect(pet.getPet('eli').equipped.outfit).toBe(set.id);
  expect(()=>pet.buyItem('eli',set.id)).toThrow();
  expect(()=>pet.buyItem('eli','outfit-dog-1')).toThrow();
  expect(()=>pet.buyItem('eli','wear-cat-1')).toThrow();
  expect(pet.getPet('eli').coins).toBe(3000-set.price);
});
it('餘額不足不新增套裝也不扣款',()=>{
  const set=ALL_OUTFITS.find(i=>i.id==='outfit-cat-3');
  db.prepare('UPDATE pet SET coins=?').run(set.price-1);
  expect(()=>pet.buyItem('eli',set.id)).toThrow('代幣不足');
  expect(pet.getPet('eli').coins).toBe(set.price-1);
  expect(pet.ownedItems('eli')).not.toContain(set.id);
});
it('寵物 API 回傳完整套裝給每隻角色與商城，舊商品转换後可經 API 正常換裝',async()=>{
  db.prepare('INSERT INTO pet_items(item_id) VALUES (?)').run('wear-cat-8');
  db.exec("UPDATE pet SET equipped='{\"bg\":\"bg_room\",\"cloth\":\"wear-cat-8\"}'");
  const routes=new Map();
  const app=Object.fromEntries(['get','post','patch','put'].map(method=>[method,(path,fn)=>routes.set(`${method} ${path}`,fn)]));
  await (await import('../server/src/routes/pet.js')).default(app);
  const response=await routes.get('get /pet')({userId:'eli',query:{}});
  expect(response.roster[0].worn.map(i=>i.id)).toEqual(['outfit-cat-1']);
  expect(response.shop.filter(i=>i.slot==='outfit')).toHaveLength(3);
  expect(response.petsForSale.every(i=>i.price===1000)).toBe(true);
  await routes.get('post /pet/buy')({userId:'eli',body:{item:'outfit-cat-2'}});
  const updated=await routes.get('get /pet')({userId:'eli',query:{}});
  expect(updated.roster[0].worn.map(i=>i.id)).toEqual(['outfit-cat-2']);
  expect(updated.owned).toEqual(expect.arrayContaining(['wear-cat-8','outfit-cat-1','outfit-cat-2']));
});
