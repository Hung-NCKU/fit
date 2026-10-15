import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {estimateEnergy} from '../shared/exercise-energy.js';
import {workoutEnergy} from '../server/src/workout-energy.js';
import {workoutVolume,workoutLabel,workoutEnergyLabel} from '../web/src/workout-metrics.js';
let records,db,pet;
const details=[{weight_kg:8,reps:12},{weight_kg:12,reps:8},{weight_kg:12,reps:6}];
const strength=()=>({date:'2026-10-15',exercise:'自訂臥推',category:'chest',set_details:details,requestId:'energy-strength-001'});
beforeAll(async()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-15T12:00:00+08:00'));
 vi.stubEnv('FIT_DATA_DIR',mkdtempSync(join(tmpdir(),'fit-energy-')));
 db=await import('../server/src/db.js');records=await import('../server/src/records.js');pet=await import('../server/src/pet.js');pet.adoptPet('eli','cat','測試');
});
beforeEach(()=>{db.getDb('eli').exec('DELETE FROM workouts;DELETE FROM workout_save_requests;DELETE FROM pet_reward_ledger;UPDATE pet SET coins=0');db.updateProfile('eli',{weight_kg:77});});
afterAll(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
it('three strength sets use an explicit average; kg volume is never converted directly to calories',()=>{
 const row=records.addWorkout('eli',strength());
 expect(workoutVolume(row)).toBe(264);expect(row.calories_kcal).toBe(42.4);expect(row.duration_min).toBe(0);
 expect(row.calorie_meta).toMatchObject({source:'estimated',duration_source:'average_sets',minutes:9,met:3.5,weight_kg:77});
 expect(workoutEnergyLabel(row)).toBe('42 kcal（估算）');expect(row.set_details.map(s=>s.reps)).toEqual([12,8,6]);
});
it('duration or reported device calories can override the simple average',()=>{
 expect(estimateEnergy(3.5,77,20)).toBe(94.3);
 expect(workoutEnergy({duration_min:20,category:'chest'},77).calories_kcal).toBe(94.3);
 expect(workoutEnergy({duration_min:20,calories_kcal:180},77)).toEqual({calories_kcal:180,calorie_meta:{source:'reported'}});
 expect(workoutEnergy({duration_min:0,category:'other'},77).calories_kcal).toBeNull();
 expect(()=>workoutEnergy({duration_min:-1},77)).toThrow();
 expect(()=>workoutEnergy({calories_kcal:-1},77)).toThrow();
});
it('snapshot and request identity survive body-weight changes and notes-only edits',()=>{
 const first=records.addWorkout('eli',strength());db.updateProfile('eli',{weight_kg:90});
 const retry=records.addWorkout('eli',strength());expect(retry.id).toBe(first.id);expect(retry.calories_kcal).toBe(42.4);
 const edited=records.updateWorkout('eli',first.id,{note:'只改備註'});expect(edited.calories_kcal).toBe(42.4);
 const changed=records.updateWorkout('eli',first.id,{set_details:[...details,{weight_kg:8,reps:10}],calories_kcal:null});
 expect(changed.calorie_meta.weight_kg).toBe(77);expect(changed.calorie_meta.minutes).toBe(12);expect(changed.set_details).toHaveLength(4);
});
it('cardio records use time and calories, with separate daily and range minutes',()=>{
 records.addWorkout('eli',strength());
 const row=records.addWorkout('eli',{date:'2026-10-15',exercise:'快走',category:'cardio',set_details:[{duration_s:1800}],requestId:'energy-cardio-001'});
 expect(workoutVolume(row)).toBe(0);expect(row.calories_kcal).toBe(194);expect(workoutLabel(row)).toBe('有氧 30 分鐘');
 expect(records.dailySummary('eli','2026-10-15').workout).toMatchObject({volume_kg:264,cardio_min:30,calories_kcal:236.4,calories_missing:0});
 expect(records.rangeSummary('eli','2026-10-15','2026-10-15').training[0]).toMatchObject({cardio_min:30,calories_kcal:236.4});
 expect(()=>records.addWorkout('eli',{category:'cardio',duration_min:0})).toThrow();
 expect(()=>records.addWorkout('eli',{category:'cardio',set_details:[{weight_kg:10,reps:5}]})).toThrow();
 const updated=records.updateWorkout('eli',row.id,{duration_min:20});expect(updated.duration_min).toBe(20);expect(updated.calories_kcal).toBe(129.4);
});
it('exercise rewards are once daily per type and deletion / editing cannot reset the cap',()=>{
 const first=records.addWorkout('eli',strength());expect(pet.rewardWorkoutSaved('eli',first.date)).toBe(8);
 records.updateWorkout('eli',first.id,{note:'修改'});expect(pet.rewardWorkoutSaved('eli',first.date)).toBe(0);
 const a=records.addWorkout('eli',{date:first.date,exercise:'快走',category:'cardio',duration_min:7});expect(pet.rewardWorkoutSaved('eli',a.date)).toBe(0);
 const b=records.addWorkout('eli',{date:first.date,exercise:'快走',category:'cardio',duration_min:8});expect(pet.rewardWorkoutSaved('eli',b.date)).toBe(6);
 records.deleteWorkout('eli',first.id);records.deleteWorkout('eli',a.id);records.deleteWorkout('eli',b.id);
 records.addWorkout('eli',{...strength(),requestId:'energy-strength-002'});expect(pet.rewardWorkoutSaved('eli',first.date)).toBe(0);
 expect(pet.getPet('eli').coins).toBe(14);expect(pet.rewardOverview('eli')).toMatchObject({exerciseEarned:14,instantEarned:14,instantRemaining:14});
 expect(pet.rewardWorkoutSaved('eli','2026-10-14')).toBe(0);
});
it('legacy schema migration adds an average estimate without changing original sets and weights',()=>{
 const old=new DatabaseSync(db.dbPath('martina'));
 old.exec("CREATE TABLE workouts(id INTEGER PRIMARY KEY,date TEXT,exercise TEXT,category TEXT,sets INTEGER,reps INTEGER,weight_kg REAL,duration_min REAL,rpe REAL,source TEXT,note TEXT,created_at TEXT);INSERT INTO workouts VALUES(1,'2026-10-15','舊深蹲','legs',3,12,8,0,7,'manual','保留','2026-10-15');");old.close();
 const row=db.getDb('martina').prepare('SELECT * FROM workouts WHERE id=1').get();
 expect(row).toMatchObject({exercise:'舊深蹲',sets:3,reps:12,weight_kg:8,duration_min:0,note:'保留'});expect(row.calories_kcal).toBeGreaterThan(0);
 expect(JSON.parse(row.calorie_meta).duration_source).toBe('average_sets');
});

it('changing cardio activity replaces the old MET with the new activity average',()=>{
 const row=records.addWorkout('eli',{date:'2026-10-15',exercise:'快走',category:'cardio',duration_min:20});
 const updated=records.updateWorkout('eli',row.id,{exercise:'跑步'});expect(updated.calorie_meta.met).toBe(7.5);expect(updated.calories_kcal).toBe(202.1);
});
