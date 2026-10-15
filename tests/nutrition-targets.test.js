import {nutritionTargets} from '../shared/nutrition-targets.js';
import {it,expect,beforeAll,afterAll,vi} from 'vitest';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRequire} from 'node:module';
const base={sex:'male',age:30,height_cm:175,weight_kg:80,activity:1.55,goal:'fat_loss',goal_weight_kg:75,body_fat_pct:25,goal_body_fat_pct:20};
let app,db;
beforeAll(async()=>{vi.stubEnv('FIT_DATA_DIR',mkdtempSync(join(tmpdir(),'fit-nutrition-')));db=await import('../server/src/db.js');const Fastify=createRequire(new URL('../server/package.json',import.meta.url))('fastify');app=Fastify();app.addHook('onRequest',async req=>{req.userId='eli';});app.setErrorHandler((err,req,reply)=>reply.code(err.status || 500).send({error:err.message}));await app.register((await import('../server/src/routes/api.js')).default);});
afterAll(async()=>{await app.close();vi.unstubAllEnvs();});
it('三種體態方向依同一身體資料產生不同熱量與營養分配',()=>{
 const loss=nutritionTargets(base),maintain=nutritionTargets({...base,goal:'maintain',goal_weight_kg:80}),gain=nutritionTargets({...base,goal:'muscle_gain',goal_weight_kg:85});
 expect(loss.target_kcal).toBeLessThan(maintain.target_kcal);expect(gain.target_kcal).toBeGreaterThan(maintain.target_kcal);
 for(const r of [loss,maintain,gain]){expect(r.target_protein_g).toBeGreaterThan(0);expect(r.target_carb_g).toBeGreaterThanOrEqual(0);expect(Math.abs(r.target_protein_g*4+r.target_carb_g*4+r.target_fat_g*9-r.target_kcal)).toBeLessThanOrEqual(2);}
});
it('只填目標體脂可由瘦體重推估參考體重，未填體脂也可用體態方向計算',()=>{
 const r=nutritionTargets({...base,goal_weight_kg:''});expect(r.profile.goal_weight_kg).toBe(75);expect(r.derivedWeight).toBe(true);
 expect(nutritionTargets({...base,goal_weight_kg:'',goal_body_fat_pct:'',body_fat_pct:''}).profile.goal_weight_kg).toBe(80);
 expect(()=>nutritionTargets({...base,goal_weight_kg:'',body_fat_pct:''})).toThrow('目前體脂');
});
it('拒絕非法資料、未成年、低體重減脂及不一致目標',()=>{
 for(const patch of [{age:17},{weight_kg:NaN},{activity:0},{goal_body_fat_pct:5},{sex:'unknown'},{goal_weight_kg:40},{goal_weight_kg:90},{goal:'muscle_gain',goal_weight_kg:70}])expect(()=>nutritionTargets({...base,...patch})).toThrow();
});
it('套用由伺服器重算，持久保存體重體脂目標，保留既有飲食紀錄且不可替別人寫入',async()=>{
 const before=db.getProfile('eli');const records=await import('../server/src/records.js');records.addMeal('eli',{name:'保留餐點',kcal:100});
 const r=await app.inject({method:'PUT',url:'/profile/nutrition-targets',payload:{...base,target_kcal:1}});expect(r.statusCode).toBe(200);expect(r.json().profile).toMatchObject({goal_weight_kg:75,body_fat_pct:25,goal_body_fat_pct:20,target_kcal:nutritionTargets(base).target_kcal,name:before.name});expect(records.listMeals('eli')).toHaveLength(1);
 const snapshot=db.getProfile('eli');expect((await app.inject({method:'PUT',url:'/profile/nutrition-targets?user=martina',payload:base})).statusCode).toBe(403);expect((await app.inject({method:'PUT',url:'/profile/nutrition-targets',payload:{...base,age:1}})).statusCode).toBe(400);expect(db.getProfile('eli')).toEqual(snapshot);
 const clear=await app.inject({method:'PUT',url:'/profile/nutrition-targets',payload:{...base,body_fat_pct:'',goal_body_fat_pct:''}});expect(clear.json().profile.body_fat_pct).toBeNull();expect(clear.json().profile.goal_body_fat_pct).toBeNull();
});
