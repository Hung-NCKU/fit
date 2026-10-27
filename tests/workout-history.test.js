import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRequire} from 'node:module';
import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {previousWorkoutSets} from '../web/src/workout-history.js';
let app,r,db;
beforeAll(async()=>{vi.stubEnv('FIT_DATA_DIR',mkdtempSync(join(tmpdir(),'fit-history-')));r=await import('../server/src/records.js');db=await import('../server/src/db.js');const Fastify=createRequire(new URL('../server/package.json',import.meta.url))('fastify');app=Fastify();app.addHook('onRequest',async req=>{req.userId=req.headers['x-user'] || 'eli';});app.setErrorHandler((e,req,reply)=>reply.code(e.status||500).send({error:e.message}));await app.register((await import('../server/src/routes/api.js')).default);});
beforeEach(()=>{for(const u of ['eli','martina'])db.getDb(u).exec('DELETE FROM workouts;DELETE FROM workout_save_requests;');});
afterAll(async()=>{await app.close();vi.unstubAllEnvs();});
const add=(date,weights,user='eli',exercise='平板啞鈴臥推')=>r.addWorkout(user,{date,exercise,category:'chest',set_details:weights.map(weight_kg=>({weight_kg,reps:8,rpe:9}))});
const history=(before='2026-10-27',headers={})=>app.inject({url:'/workouts/history?exercise='+encodeURIComponent('平板啞鈴臥推')+'&category=chest&before='+before,headers});
it('上次紀錄與最高單組重量分開，依日期及同日id排序，補登不讀未來紀錄',async()=>{
 add('2026-10-20',[10,24,18]);add('2026-10-26',[12,16]);const latest=add('2026-10-26',[14,18,20]);add('2026-10-28',[50]);
 const data=(await history()).json();expect(data.workout.id).toBe(latest.id);expect(data.personalBest).toMatchObject({date:'2026-10-20',weight_kg:24,reps:8,set_number:2});expect((await history('2026-10-19')).json()).toEqual({workout:null,personalBest:null});
});
it('PR隨新增、修正與刪除更新，帳號互不混用，也支援舊版整體組數',async()=>{
 r.addWorkout('eli',{date:'2026-10-19',exercise:'平板啞鈴臥推',category:'chest',sets:3,reps:10,weight_kg:15});const high=add('2026-10-20',[10,30]);add('2026-10-25',[99],'martina');
 expect((await history()).json().personalBest.weight_kg).toBe(30);r.updateWorkout('eli',high.id,{set_details:[{weight_kg:12,reps:8}]});expect((await history()).json().personalBest.weight_kg).toBe(15);r.deleteWorkout('eli',high.id);expect((await history()).json().personalBest.weight_kg).toBe(15);
 expect((await history('2026-10-27',{'x-user':'martina'})).json().personalBest.weight_kg).toBe(99);
});
it('徒手不捏造負重PR，無效查詢回400',async()=>{add('2026-10-26',[0]);expect((await history()).json().personalBest).toBeNull();expect((await history('bad')).statusCode).toBe(400);expect((await app.inject('/workouts/history?exercise=&category=chest')).statusCode).toBe(400);});
it('帶入每組不同重量與次數，重置完成與RPE，不修改舊紀錄',()=>{
 const old={sets:2,set_details:[{weight_kg:10,reps:12,rpe:9,done:true},{weight_kg:20,reps:6,rpe:10,done:true}]};const copy=structuredClone(old);expect(previousWorkoutSets(old)).toEqual([{weight_kg:10,reps:12,duration_s:30,rpe:'',done:false},{weight_kg:20,reps:6,duration_s:30,rpe:'',done:false}]);expect(old).toEqual(copy);
 expect(previousWorkoutSets({sets:3,weight_kg:15,reps:8,set_details:[]})).toHaveLength(3);expect(previousWorkoutSets({sets:2,duration_min:2,set_details:[]},'time')[0].duration_s).toBe(60);
});
