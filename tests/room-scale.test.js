import {it,expect} from 'vitest';
import catalog from '../server/src/pet-catalog.json';
import sizes from '../shared/decor-scale.json';
import art from '../web/src/decor-art-layout.json';
import {roomDecorWidth,petActorSize} from '../web/src/room-scale.js';
const decor=catalog.filter(i=>i.slot==='decor');
it('every purchasable decoration has an individually reviewed size and cropped artwork',()=>{
 expect(Object.keys(sizes).sort()).toEqual(decor.map(i=>i.id).sort());
 for(const i of decor){expect(sizes[i.id].name).toBe(i.name);expect(sizes[i.id].widthInPetLengths).toBeGreaterThan(0);expect(art[i.id]).toBeDefined();}
});
it('furniture can hold a pet while bowls and toys remain smaller than its visible body',()=>{
 const width=id=>roomDecorWidth({id,scale:1},200,356);
 expect(width('lib-2-room-01')).toBeGreaterThan(petActorSize(200,.34));
 expect(width('lib-2-room-02')).toBeLessThan(petActorSize(200,.34)*.4);
 expect(width('lib-2-room-06')).toBeLessThan(width('lib-2-room-02'));
 expect(width('lib-2-yard-03')).toBeGreaterThan(width('lib-2-room-01'));
});
it('room and pets scale together, retain manual size, and fit mobile/tablet scene limits',()=>{
 for(const item of decor){
   const small=roomDecorWidth({...item,scale:1},130,231),large=roomDecorWidth({...item,scale:1},260,462);
   expect(large/small).toBeCloseTo(2);
   const resized=roomDecorWidth({...item,scale:.6},130,231);expect(resized/small).toBeGreaterThanOrEqual(.6-.00001);expect(resized).toBeLessThan(small);
   for(const [h,w]of [[130,231],[220,390],[240,1000]]){
     const width=roomDecorWidth({...item,scale:1.5},h,w);expect(width).toBeLessThanOrEqual(w*.8);expect(width/art[item.id].bounds.width*art[item.id].bounds.height).toBeLessThanOrEqual(h*.85+.00001);
   }
 }
});
