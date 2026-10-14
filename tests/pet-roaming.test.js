import { expect,it } from 'vitest';
import {roamingBounds,roamingTarget,roamingDuration,roamingFacing} from '../web/src/pet-roaming.js';
it('不同手機寬度的遊蕩範圍保留身體邊界，目的地限制在地板',()=>{
  for(const width of [240,320,390,740]) {
    const bounds=roamingBounds(width,230,100);
    expect(bounds.left*width/100).toBeGreaterThanOrEqual(60);
    expect((100-bounds.right)*width/100).toBeGreaterThanOrEqual(60);
    for(const random of [()=>0,()=>1,()=>.5]) {
      const target=roamingTarget({x:50,y:88},bounds,random);
      expect(target.x).toBeGreaterThanOrEqual(bounds.left);
      expect(target.x).toBeLessThanOrEqual(bounds.right);
      expect(target.y).toBeGreaterThanOrEqual(64);
      expect(target.y).toBeLessThanOrEqual(90);
    }
  }
});
it('左右朝向與路線一致，手機上的小狗依身體大小放慢，避免垂直倒退感',()=>{
  const from={x:50,y:80};
  expect(roamingFacing(from,{x:20,y:75})).toBe(-1);
  expect(roamingFacing(from,{x:80,y:75})).toBe(1);
  expect(roamingDuration(from,{x:80,y:75},390,220,'dog',80)).toBeGreaterThan(roamingDuration(from,{x:80,y:75},390,220,'dog',160));
  expect(Math.abs(roamingTarget(from,roamingBounds(390,220,80),()=>0).y-from.y)).toBeLessThanOrEqual(8);
});
it('同一路線陸龜比狗慢，較長路線需要更多行走時間',()=>{
  const a={x:20,y:80},b={x:80,y:65};
  expect(roamingDuration(a,b,740,400,'tortoise')).toBeGreaterThan(roamingDuration(a,b,740,400,'dog')*3);
  expect(roamingDuration(a,b,740,400,'dog')).toBeGreaterThan(roamingDuration(a,{x:30,y:80},740,400,'dog'));
});
