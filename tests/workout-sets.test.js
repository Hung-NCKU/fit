import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {workoutLabel,workoutVolume} from '../web/src/workout-metrics.js';
import catalog from '../shared/workout-catalog.json';
const Fastify=createRequire(new URL('../server/package.json',import.meta.url))('fastify');
let records,db,app;
const details=[{weight_kg:20,reps:10,rpe:6},{weight_kg:25,reps:8,rpe:7},{weight_kg:30,reps:6,rpe:8}];
const payload=()=>({date:'2026-10-15',exercise:'槓鈴臥推',category:'chest',set_details:details,requestId:'workout-set-test-001'});
beforeAll(async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-15T12:00:00'));
  vi.stubEnv('FIT_DATA_DIR',mkdtempSync(join(tmpdir(),'fit-set-records-')));
  records=await import('../server/src/records.js');db=(await import('../server/src/db.js')).getDb('eli');
  app=Fastify();app.addHook('onRequest',async req=>{req.userId='eli';});
  app.setErrorHandler((err,req,reply)=>reply.code(err.status || 500).send({error:err.message}));
  await app.register((await import('../server/src/routes/api.js')).default);
});
beforeEach(()=>db.exec('DELETE FROM workouts;DELETE FROM workout_save_requests'));
afterAll(async()=>{await app.close();vi.unstubAllEnvs();vi.useRealTimers();});
it('細分部位與影片都有對應，教學與來源完整',()=>{
  expect(catalog.muscles).toHaveLength(10);expect(catalog.exercises).toHaveLength(43);
  expect(new Set(catalog.exercises.map(e=>e.id)).size).toBe(catalog.exercises.length);
  for(const region of catalog.muscles)expect(catalog.exercises.some(e=>e.muscles.includes(region.id))).toBe(true);
  for(const focus of catalog.focuses) {expect(catalog.muscles.some(m=>m.id===focus.parent)).toBe(true);expect(catalog.exercises.some(e=>e.focuses.includes(focus.id))).toBe(true);}
  for(const e of catalog.exercises) {expect(e.steps.length).toBeGreaterThanOrEqual(3);expect(e.mistakes.length).toBeGreaterThanOrEqual(2);}
  expect(catalog.exercises.find(e=>e.id==='dumbbell-external-rotation').focuses).toEqual(['teres-minor']);
  expect(catalog.exercises.find(e=>e.id==='lat-pulldown').focuses).not.toContain('teres-minor');
  for(const e of catalog.exercises){expect(e.videoId).toMatch(/^[\w-]{11}$/);expect(e.channel).toBeTruthy();expect(e.videoTitle).toBeTruthy();}
});
it('每組不同重量與次數完整保存，今日與區間總量皆正確',()=>{
  const row=records.addWorkout('eli',payload());
  expect(row.sets).toBe(3);expect(row.set_details[2]).toMatchObject({weight_kg:30,reps:6,rpe:8});
  expect(workoutVolume(row)).toBe(580);expect(workoutLabel(row)).toBe('3 組 · 24 下');
  expect(records.dailySummary('eli',row.date).workout.volume_kg).toBe(580);
  expect(records.rangeSummary('eli',row.date,row.date).training[0].volume_kg).toBe(580);
  expect(records.recentContext('eli',100)).toContain('第3組 30kg×6下');
});
it('徒手計時紀錄保留秒數；舊紀錄與新紀錄可以一起統計',()=>{
  const held=records.addWorkout('eli',{date:'2026-10-15',exercise:'棒式',category:'core',set_details:[{duration_s:30},{duration_s:45}]});
  expect(held.duration_min).toBe(1.25);expect(workoutLabel(held)).toBe('2 組 · 75 秒');
  const old=records.addWorkout('eli',{date:'2026-10-15',exercise:'深蹲',sets:4,reps:5,weight_kg:50});
  expect(old.set_details).toEqual([]);expect(workoutVolume(old)).toBe(1000);
  const summary=records.dailySummary('eli','2026-10-15').workout;
  expect(summary).toMatchObject({items:2,volume_kg:1000,duration_min:1.25});
});
it('同一儲存識別碼重送不重複寫；改內容及刪除後重送皆拒絕',()=>{
  const first=records.addWorkout('eli',payload());
  expect(records.addWorkout('eli',payload()).id).toBe(first.id);expect(records.listWorkouts('eli')).toHaveLength(1);
  expect(()=>records.addWorkout('eli',{...payload(),note:'更換內容'})).toThrow('不可更換');
  records.deleteWorkout('eli',first.id);
  expect(()=>records.addWorkout('eli',payload())).toThrow('已被刪除');expect(records.listWorkouts('eli')).toHaveLength(0);
});
it('逐組編輯會更新總量；只改備註保留組數；舊版摘要更改可以取代明細',()=>{
  const row=records.addWorkout('eli',payload());
  records.updateWorkout('eli',row.id,{note:'改備註'});expect(records.getWorkout('eli',row.id).set_details).toHaveLength(3);
  records.updateWorkout('eli',row.id,{set_details:[{weight_kg:40,reps:8}]});
  expect(records.dailySummary('eli',row.date).workout.volume_kg).toBe(320);
  records.updateWorkout('eli',row.id,{sets:2,reps:5,weight_kg:20});
  expect(records.getWorkout('eli',row.id).set_details).toEqual([]);expect(records.dailySummary('eli',row.date).workout.volume_kg).toBe(200);
  records.updateWorkout('eli',row.id,{set_details:[],note:'舊表單可正常存'});
});
it('非法組數、重量、次數、日期與 RPE 不會留下半筆資料',()=>{
  for(const set_details of [[],Array.from({length:51},()=>({reps:10})),[{reps:0}],[{weight_kg:-1,reps:10}],[{reps:2.5}],[{reps:Infinity}],[{reps:10,rpe:11}],[{reps:10,duration_s:30}]])expect(()=>records.addWorkout('eli',{...payload(),set_details})).toThrow();
  for(const date of ['2026-99-01','2026-02-30','not-a-date'])expect(()=>records.addWorkout('eli',{...payload(),date})).toThrow();
  expect(records.listWorkouts('eli')).toHaveLength(0);
  expect(db.prepare('SELECT * FROM workout_save_requests').all()).toHaveLength(0);
});
it('收據寫入失敗時連訓練紀錄一起回滾',()=>{
  db.exec("CREATE TEMP TRIGGER reject_workout_receipt BEFORE INSERT ON workout_save_requests BEGIN SELECT RAISE(ABORT,'test reject');END");
  try {expect(()=>records.addWorkout('eli',payload())).toThrow('test reject');expect(records.listWorkouts('eli')).toHaveLength(0);}
  finally {db.exec('DROP TRIGGER reject_workout_receipt');}
});
it('API 支援逐組記錄與重送，跨帳號寫入保持唯讀',async()=>{
  const first=await app.inject({method:'POST',url:'/workouts',payload:payload()});
  expect(first.statusCode).toBe(201);expect(first.json().set_details).toHaveLength(3);
  expect((await app.inject({method:'POST',url:'/workouts',payload:payload()})).json().id).toBe(first.json().id);
  expect((await app.inject({method:'POST',url:'/workouts?user=martina',payload:payload()})).statusCode).toBe(403);
  const patch=await app.inject({method:'PATCH',url:`/workouts/${first.json().id}`,payload:{set_details:[{weight_kg:10,reps:12}]}});
  expect(patch.statusCode).toBe(200);expect(patch.json().set_details[0].reps).toBe(12);
});
it('舊資料庫升級補上明細欄位，保留既有重量、組數與紀錄 ID',async()=>{
  const dbModule=await import('../server/src/db.js');
  const old=new DatabaseSync(dbModule.dbPath('martina'));
  old.exec("CREATE TABLE workouts(id INTEGER PRIMARY KEY AUTOINCREMENT,date TEXT NOT NULL,exercise TEXT NOT NULL,category TEXT DEFAULT 'legs',sets INTEGER DEFAULT 0,reps INTEGER DEFAULT 0,weight_kg REAL DEFAULT 0,duration_min REAL DEFAULT 0,rpe REAL DEFAULT 0,source TEXT DEFAULT 'manual',note TEXT DEFAULT '',created_at TEXT DEFAULT '');INSERT INTO workouts(date,exercise,sets,reps,weight_kg) VALUES ('2026-10-15','舊深蹲',3,8,20)");
  old.close();
  const row=records.listWorkouts('martina')[0];
  expect(row).toMatchObject({id:1,exercise:'舊深蹲',sets:3,reps:8,weight_kg:20,set_details:[]});
  expect(records.dailySummary('martina','2026-10-15').workout.volume_kg).toBe(480);
});
