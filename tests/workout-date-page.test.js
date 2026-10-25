import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
let app,records,db;
beforeAll(async()=>{
 vi.stubEnv('FIT_DATA_DIR',mkdtempSync(join(tmpdir(),'fit-workout-dates-')));
 records=await import('../server/src/records.js');db=await import('../server/src/db.js');
 const Fastify=createRequire(new URL('../server/package.json',import.meta.url))('fastify');app=Fastify();
 app.addHook('onRequest',async req=>{req.userId='eli';});app.setErrorHandler((e,req,reply)=>reply.code(e.status || 500).send({error:e.message}));
 await app.register((await import('../server/src/routes/api.js')).default);
});
beforeEach(()=>{for(const user of ['eli','martina'])db.getDb(user).exec('DELETE FROM workouts;DELETE FROM workout_save_requests;');});
afterAll(async()=>{await app.close();vi.unstubAllEnvs();});
const add=(date,name='測試訓練',user='eli')=>records.addWorkout(user,{date,exercise:name,category:'chest',sets:3,reps:10,weight_kg:10});
it('日期索引包含完整歷史，單日紀錄不被舊的300筆上限截斷',async()=>{
 add('2025-01-01','最早的訓練');for(let i=0;i<305;i++)add('2026-10-26');
 const r=await app.inject('/workouts/page?date=2026-10-26');expect(r.statusCode).toBe(200);expect(r.json().rows).toHaveLength(305);expect(r.json().dates).toEqual([{date:'2026-10-26',items:305},{date:'2025-01-01',items:1}]);
 expect((await app.inject('/workouts/page?date=2025-01-01')).json().rows.map(w=>w.exercise)).toEqual(['最早的訓練']);
});
it('空白日期保持選取，移動日期與刪除後索引立即反映',async()=>{
 const row=add('2026-10-20');const empty=(await app.inject('/workouts/page?date=2026-10-21')).json();expect(empty.date).toBe('2026-10-21');expect(empty.rows).toEqual([]);
 records.updateWorkout('eli',row.id,{date:'2026-10-22'});expect((await app.inject('/workouts/page?date=2026-10-22')).json().dates).toEqual([{date:'2026-10-22',items:1}]);
 records.deleteWorkout('eli',row.id);expect((await app.inject('/workouts/page?date=2026-10-22')).json()).toEqual({date:'2026-10-22',dates:[],rows:[]});
});
it('查看帳號時日期與紀錄一起隔離，拒絕無效日期',async()=>{
 add('2026-10-20','Eli訓練');add('2026-10-21','Martina訓練','martina');
 const other=(await app.inject('/workouts/page?date=2026-10-21&user=martina')).json();expect(other.dates).toEqual([{date:'2026-10-21',items:1}]);expect(other.rows.map(w=>w.exercise)).toEqual(['Martina訓練']);
 expect((await app.inject('/workouts/page?date=2026-02-30')).statusCode).toBe(400);expect((await app.inject('/workouts/page?date=nope')).statusCode).toBe(400);
});
