import { expect,it } from 'vitest';
import { WARDROBE } from '../server/src/pet-wardrobe.js';
import { garmentFit,wearAnchors,pickupWearAnchors } from '../web/src/pet-wear-fit.js';
it('十種物種全部商品在一般與拎起姿勢都有完整、有限且不超出角色畫布的定位',()=>{
  expect(Object.keys(WARDROBE)).toHaveLength(10);
  for(const [species,items] of Object.entries(WARDROBE)) {
    expect(wearAnchors[species]).toBeDefined();
    expect(pickupWearAnchors[species]).toBeDefined();
    for(const item of items) for(const held of [false,true]) {
      const f=garmentFit(species,item,held);
      for(const n of [f.x,f.y,f.w,f.h]) expect(Number.isFinite(n)).toBe(true);
      expect(f.crop.w*f.crop.h).toBeGreaterThan(0);
      expect(f.x-f.w/2).toBeGreaterThanOrEqual(0);
      expect(f.x+f.w/2).toBeLessThanOrEqual(100);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.y+f.h).toBeLessThanOrEqual(100);
    }
  }
});
it('髮飾放頭上，領結小於長圍巾，背包與頸部配件分開定位',()=>{
  const cat=WARDROBE.cat;
  const bow=garmentFit('cat',cat.find(i=>i.name==='橘色領結'));
  const scarf=garmentFit('cat',cat.find(i=>i.name==='條紋圍巾'));
  const bag=garmentFit('cat',cat.find(i=>i.name==='肉球後背包'));
  expect(bow.h).toBeLessThan(scarf.h);
  expect(bag.x).toBeGreaterThan(bow.x);
  const flower=garmentFit('rabbit',WARDROBE.rabbit.find(i=>i.name==='小花頭圈'));
  expect(flower.y+flower.h).toBeLessThan(wearAnchors.rabbit.neck[1]);
});
it('狗帽T只顯示左側衣服、雪貂帽排除鄰圖、雨帽只顯示帽兜',()=>{
  const dog=garmentFit('dog',WARDROBE.dog.find(i=>i.id==='wear-dog-7'));
  expect(dog.crop.x+dog.crop.w).toBeLessThanOrEqual(103);
  expect(garmentFit('ferret',WARDROBE.ferret[2]).crop.clip).toBeTruthy();
  expect(garmentFit('tortoise',WARDROBE.tortoise[6]).crop.h).toBe(89);
});
