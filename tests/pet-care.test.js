import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
let db,records,pet,care;
beforeAll(async()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-15T12:00:00+08:00'));
 vi.stubEnv('FIT_DATA_DIR',mkdtempSync(join(tmpdir(),'fit-care-')));
 db=await import('../server/src/db.js');records=await import('../server/src/records.js');pet=await import('../server/src/pet.js');care=await import('../server/src/pet-care.js');pet.adoptPet('eli','cat','測試');
});
beforeEach(()=>{vi.setSystemTime(new Date('2026-10-15T12:00:00+08:00'));db.getDb('eli').exec('DELETE FROM workouts;DELETE FROM meals;DELETE FROM pet_care_interactions;');});
afterAll(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
it('飽足度按每日熱量目標計算，上限100，避免鼓勵過量',()=>{
 const key=pet.getPet('eli').petKey,target=db.getProfile('eli').target_kcal;
 expect(care.petCare('eli',key).fullness).toBe(0);
 records.addMeal('eli',{date:records.today(),name:'餐點',kcal:target/2});expect(care.petCare('eli',key).fullness).toBe(50);
 records.addMeal('eli',{date:records.today(),name:'第二餐',kcal:target});expect(care.petCare('eli',key).fullness).toBe(100);
});
it('徒手運動與有氧都提高心情，不依賴負重',()=>{
 const key=pet.getPet('eli').petKey,before=care.petCare('eli',key).mood;
 records.addWorkout('eli',{date:records.today(),exercise:'伏地挺身',category:'chest',set_details:[{reps:10},{reps:8},{reps:6}]});
 expect(care.petCare('eli',key).mood).toBe(before+9);
 records.addWorkout('eli',{date:records.today(),exercise:'快走',category:'cardio',duration_min:15});expect(care.petCare('eli',key).mood).toBe(before+15);
});
it('互動持久化、30秒冷卻、每日五次，跨日重算且不給代幣',()=>{
 const key=pet.getPet('eli').petKey,coins=pet.getPet('eli').coins;
 expect(care.interactPet('eli',key).credited).toBe(true);expect(care.petCare('eli',key).mood).toBe(42);
 expect(care.interactPet('eli',key).credited).toBe(false);
 for(let i=1;i<5;i++){vi.setSystemTime(Date.now()+30000);expect(care.interactPet('eli',key).credited).toBe(true);}
 vi.setSystemTime(Date.now()+30000);expect(care.interactPet('eli',key).credited).toBe(false);expect(care.petCare('eli',key).mood).toBe(50);
 expect(pet.getPet('eli').coins).toBe(coins);
 vi.setSystemTime(Date.now()+86400000);expect(care.petCare('eli',key).interactions).toBe(0);expect(care.interactPet('eli',key).credited).toBe(true);
 expect(()=>care.interactPet('eli','companion-99999')).toThrow();
});

it('飲食不增加心情；陪玩達上限後仍能靠運動提升至100',()=>{
 const key=pet.getPet('eli').petKey,target=db.getProfile('eli').target_kcal;
 records.addMeal('eli',{date:records.today(),name:'餐點',kcal:target});expect(care.petCare('eli',key).mood).toBe(40);
 for(let i=0;i<5;i++){care.interactPet('eli',key);vi.setSystemTime(Date.now()+30000);}
 expect(care.petCare('eli',key).mood).toBe(50);expect(care.interactPet('eli',key).message).toContain('上限');
 records.addWorkout('eli',{date:records.today(),exercise:'徒手深蹲',category:'legs',sets:3,reps:10});expect(care.petCare('eli',key).mood).toBe(59);
 records.addWorkout('eli',{date:records.today(),exercise:'快走',category:'cardio',duration_min:120});expect(care.petCare('eli',key).mood).toBe(100);
});
