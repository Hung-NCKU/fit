import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest';
let pet, db, item;
beforeAll(async()=>{
  vi.stubEnv('FIT_DATA_DIR',mkdtempSync(join(tmpdir(),'fit-room-')));
  pet=await import('../server/src/pet.js');
  db=(await import('../server/src/db.js')).getDb('eli');
  pet.adoptPet('eli','cat','test');
  item=pet.shopFor('cat').find(i=>i.slot==='decor');
});
beforeEach(()=>db.exec("DELETE FROM pet_room_decor; DELETE FROM pet_room_positions; DELETE FROM pet_items WHERE item_id!='bg_room'; UPDATE pet SET coins=1000,equipped='{\"bg\":\"bg_room\"}'"));
afterAll(()=>vi.unstubAllEnvs());
it('購買扣款並放置；拖移、縮放、收起、再次放入不扣款',()=>{
  pet.buyItem('eli',item.id);
  const balance=1000-item.price;
  expect(pet.getPet('eli').coins).toBe(balance);
  pet.arrangeDecor('eli',item.id,{x:30,y:75,scale:1.2});
  expect(pet.roomDecor('eli')[0]).toMatchObject({id:item.id,x:30,y:75,scale:1.2});
  pet.arrangeDecor('eli',item.id,null);
  expect(pet.roomDecor('eli')).toEqual([]);
  expect(pet.ownedItems('eli')).toContain(item.id);
  pet.equipItem('eli',item.id);
  expect(pet.roomDecor('eli')).toHaveLength(1);
  expect(pet.getPet('eli').coins).toBe(balance);
});
it('不能放未購買商品、非法座標；不同環境分別保存',()=>{
  expect(()=>pet.arrangeDecor('eli',item.id,{x:50,y:80,scale:1})).toThrow();
  pet.buyItem('eli',item.id);
  for(const position of [{x:NaN,y:80,scale:1},{x:150,y:80,scale:1},{x:50,y:80,scale:9}]) expect(()=>pet.arrangeDecor('eli',item.id,position)).toThrow();
  pet.buyItem('eli','bg_garden');
  expect(pet.roomDecor('eli')).toEqual([]);
  pet.equipItem('eli',item.id);
  pet.arrangeDecor('eli',item.id,{x:25,y:90,scale:.8});
  pet.equipItem('eli','bg_room');
  expect(pet.roomDecor('eli')[0]).toMatchObject({x:70,y:85,scale:1});
  pet.equipItem('eli','bg_garden');
  expect(pet.roomDecor('eli')[0]).toMatchObject({x:25,y:90,scale:.8});
});
it('全部裝飾有真實素材、不足代幣不新增或留下布置',()=>{
  const catalog=pet.shopFor('cat').filter(i=>i.slot==='decor');
  expect(catalog).toHaveLength(141);
  for(const decor of catalog) expect(existsSync(new URL(`../web/public${decor.img}`,import.meta.url))).toBe(true);
  db.exec('UPDATE pet SET coins=0');
  expect(()=>pet.buyItem('eli',item.id)).toThrow();
  expect(pet.roomDecor('eli')).toEqual([]);
  expect(pet.ownedItems('eli')).not.toContain(item.id);
});
it('141 件新版裝飾都有完整的獨立透明圖範圍與已部署圖檔',()=>{
  const layouts=JSON.parse(readFileSync(new URL('../web/src/decor-art-layout.json',import.meta.url),'utf8'));
  const catalog=pet.shopFor('cat').filter(i=>i.slot==='decor');
  expect(Object.keys(layouts).sort()).toEqual(catalog.map(i=>i.id).sort());
  for(const item of catalog) {
    const layout=layouts[item.id];
    const {x,y,width,height}=layout.bounds;
    expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0);
    expect(width).toBeGreaterThan(20); expect(height).toBeGreaterThan(20);
    expect(x+width).toBeLessThanOrEqual(layout.width);
    expect(y+height).toBeLessThanOrEqual(layout.height);
    expect(existsSync(new URL(`../web/public/pets/decor-v2/${layout.sheet}.webp`,import.meta.url))).toBe(true);
  }
});
it('寵物拖移位置依環境保存，非法位置與不存在的寵物不接受',()=>{
  pet.movePet('eli','main',{x:25,y:80});
  expect(pet.petRoomPosition('eli','main')).toMatchObject({x:25,y:80});
  expect(()=>pet.movePet('eli','main',{x:25,y:20})).toThrow();
  expect(()=>pet.movePet('eli','companion-999',{x:25,y:80})).toThrow();
  pet.buyItem('eli','bg_garden');
  expect(pet.petRoomPosition('eli','main')).toBeNull();
  pet.movePet('eli','main',{x:70,y:75});
  pet.equipItem('eli','bg_room');
  expect(pet.petRoomPosition('eli','main')).toMatchObject({x:25,y:80});
});
it('鎖定擋拖移；解鎖、層級與整屋撤銷保存且不扣款',()=>{
  pet.buyItem('eli',item.id);
  const before=pet.roomDecor('eli'), coins=pet.getPet('eli').coins;
  pet.arrangeDecor('eli',item.id,{x:70,y:85,scale:1,locked:true,layer:2});
  expect(()=>pet.arrangeDecor('eli',item.id,{x:30,y:85,scale:1})).toThrow('解鎖');
  const locked=pet.roomDecor('eli');
  pet.arrangeDecor('eli',item.id,{x:30,y:75,scale:1,locked:false,layer:2});
  pet.restoreRoom('eli',locked,pet.roomDecor('eli'));
  expect(pet.roomDecor('eli')[0]).toMatchObject({x:70,y:85,locked:1,layer:2});
  pet.restoreRoom('eli',before,pet.roomDecor('eli'));
  expect(pet.roomDecor('eli')[0]).toMatchObject({x:70,y:85,locked:0,layer:0});
  expect(pet.getPet('eli').coins).toBe(coins);
});
it('整屋還原拒絕未購買物件、非法層級與過期版本，失敗原子回滾',()=>{
  pet.buyItem('eli',item.id);
  const before=pet.roomDecor('eli');
  expect(()=>pet.restoreRoom('eli',[{...before[0],layer:999}],before)).toThrow();
  expect(pet.roomDecor('eli')).toEqual(before);
  const another=pet.shopFor('cat').find(i=>i.slot==='decor' && i.id!==item.id);
  expect(()=>pet.restoreRoom('eli',[{...before[0],id:another.id}],before)).toThrow();
  expect(pet.roomDecor('eli')).toEqual(before);
  pet.arrangeDecor('eli',item.id,{x:30,y:85,scale:1});
  expect(()=>pet.restoreRoom('eli',before,before)).toThrow('另一個畫面');
  expect(pet.roomDecor('eli')[0].x).toBe(30);
});

it('rotation persists through moves and undo; locked and stale edits are rejected',()=>{
 pet.buyItem('eli',item.id);const before=pet.roomDecor('eli');
 pet.arrangeDecor('eli',item.id,{x:40,y:80,scale:1,rotation:45},before);
 const rotated=pet.roomDecor('eli');expect(rotated[0].rotation).toBe(45);
 pet.arrangeDecor('eli',item.id,{x:42,y:80,scale:1});expect(pet.roomDecor('eli')[0].rotation).toBe(45);
 pet.restoreRoom('eli',before,pet.roomDecor('eli'));expect(pet.roomDecor('eli')[0].rotation).toBe(0);
 pet.restoreRoom('eli',rotated,pet.roomDecor('eli'));expect(pet.roomDecor('eli')[0].rotation).toBe(45);
 expect(()=>pet.arrangeDecor('eli',item.id,{x:40,y:80,scale:1,rotation:90},before)).toThrow('另一個畫面');
 pet.arrangeDecor('eli',item.id,{x:40,y:80,scale:1,locked:true});
 expect(()=>pet.arrangeDecor('eli',item.id,{x:40,y:80,scale:1,rotation:90})).toThrow('解鎖');
 for(const rotation of [181,-181,'45',NaN,Infinity])expect(()=>pet.arrangeDecor('eli',item.id,{x:40,y:80,scale:1,rotation})).toThrow();
});
