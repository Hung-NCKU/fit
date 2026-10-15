import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
let plans,db,records,app;
const morning = new Date('2026-10-19T00:00:00Z'); // Monday, 08:00 Taipei
beforeAll(async()=>{
  vi.stubEnv('FIT_DATA_DIR',mkdtempSync(join(tmpdir(),'fit-coach-plan-')));
  db=await import('../server/src/db.js');
  plans=await import('../server/src/coach-plan.js');
  records=await import('../server/src/records.js');
  const Fastify=createRequire(new URL('../server/package.json',import.meta.url))('fastify');
  app=Fastify();app.addHook('onRequest',async req=>{req.userId='eli';});
  await app.register((await import('../server/src/routes/chat.js')).default);
});
beforeEach(()=>{
  for(const user of ['eli','martina']){
    db.getDb(user).exec('DELETE FROM coach_deliveries;DELETE FROM coach_plans;DELETE FROM chat_messages;DELETE FROM workouts;DELETE FROM meals;');
    db.updateProfile(user,{notes:'一般無特殊限制',age:28,activity:1.55,goal:'muscle_gain',weight_kg:77,height_cm:180,goal_weight_kg:82});
  }
});
afterAll(async()=>{await app.close();vi.unstubAllEnvs();});
it('Taipei 08:00 boundary and midnight are independent of server time zone',()=>{
  expect(plans.taipeiClock(new Date('2026-10-18T23:59:59Z'))).toEqual({date:'2026-10-19',hour:7});
  expect(plans.taipeiClock(morning)).toEqual({date:'2026-10-19',hour:8});
  expect(plans.taipeiClock(new Date('2026-10-19T16:00:00Z'))).toEqual({date:'2026-10-20',hour:0});
});
it('starter is immediate, morning delivery once per day, never adds food or workout records',()=>{
  expect(plans.ensureCoachMessages('eli',new Date('2026-10-18T23:59:00Z'))).toMatchObject({initial:true,daily:false});
  expect(plans.ensureCoachMessages('eli',morning)).toMatchObject({initial:false,daily:true});
  expect(plans.ensureCoachMessages('eli',morning)).toMatchObject({initial:false,daily:false});
  const messages=db.getDb('eli').prepare('SELECT * FROM chat_messages').all();
  expect(messages).toHaveLength(2);expect(messages[1].content).toContain('2026-10-19');
  expect(records.listWorkouts('eli')).toHaveLength(0);expect(records.listMeals('eli')).toHaveLength(0);
});
it('late service start catches up only today; receipt survives cleared chat',()=>{
  plans.ensureCoachMessages('eli',new Date('2026-10-19T13:00:00Z'));
  db.getDb('eli').exec('DELETE FROM chat_messages');
  expect(plans.ensureCoachMessages('eli',new Date('2026-10-19T15:59:00Z'))).toMatchObject({initial:false,daily:false});
  expect(plans.ensureCoachMessages('eli',new Date('2026-10-20T00:00:00Z'))).toMatchObject({initial:false,daily:true});
  expect(db.getDb('eli').prepare('SELECT content FROM chat_messages').all()).toHaveLength(1);
});
it('meal target allocations sum to stored personal targets, body data changes refresh starter',()=>{
  const first=plans.ensureCoachMessages('eli',morning).plan;
  expect(first.meals.reduce((s,m)=>s+m.kcal,0)).toBe(first.target.kcal);
  expect(first.meals.reduce((s,m)=>s+m.protein,0)).toBe(first.target.protein);
  db.updateProfile('eli',{weight_kg:70,goal:'fat_loss'});
  const next=plans.ensureCoachMessages('eli',morning);
  expect(next.initial).toBe(true);expect(next.daily).toBe(false);
  expect(next.plan.fingerprint).not.toBe(first.fingerprint);expect(next.plan.goal).toBe('減脂');
  expect(next.plan.basis).toContain('70 kg');expect(next.plan.target.kcal).not.toBe(first.target.kcal);
});
it('home / vegetarian notes are used and low activity starts with two days',()=>{
  db.updateProfile('eli',{notes:'只能徒手、全素',activity:1.2});
  const plan=plans.getCoachPlan('eli');
  expect(plan.days).toHaveLength(2);expect(plan.strength.map(e=>e.name).join('')).not.toMatch(/啞鈴|滑輪/);
  expect(plan.meals.map(m=>m.menu).join('')).not.toMatch(/雞肉|魚|雞蛋|牛奶/);
  expect(plan.strength[0].sets).toBe(2);
});
it('special health conditions and minors receive assessment instead of automatic prescription',()=>{
  db.updateProfile('eli',{notes:'膝蓋受傷，腎臟病'});
  const plan=plans.getCoachPlan('eli');expect(plan.needsAssessment).toBe(true);
  expect(plans.formatStarterPlan(plan)).not.toContain('組 ×');
  expect(plans.formatDailyPlan('eli',plan,'2026-10-19')).not.toContain('kcal');
  expect(plans.buildCoachPlan({...db.getProfile('eli'),notes:'',age:16}).needsAssessment).toBe(true);
});
it('recent training adjusts today to recovery; completed today is never asked to repeat',()=>{
  const plan=plans.getCoachPlan('eli');
  records.addWorkout('eli',{date:'2026-10-18',exercise:'深蹲',category:'legs',sets:3,reps:10});
  expect(plans.formatDailyPlan('eli',plan,'2026-10-19')).toContain('昨天有重量訓練紀錄');
  records.addWorkout('eli',{date:'2026-10-19',exercise:'散步',category:'cardio',duration_min:20});
  expect(plans.formatDailyPlan('eli',plan,'2026-10-19')).toContain('不再要求重做');
});
it('receipts and plans are private; query user cannot select someone else',async()=>{
  db.updateProfile('martina',{name:'Private other user'});
  const response=await app.inject({method:'GET',url:'/chat/plan?user=martina'});
  expect(response.statusCode).toBe(200);expect(response.json().name).toBe('Eli');
  expect(db.getDb('martina').prepare('SELECT COUNT(*) n FROM coach_deliveries').get().n).toBe(0);
  const history=await app.inject({method:'GET',url:'/chat/history?user=martina'});
  expect(history.json().map(m=>m.content).join('')).not.toContain('Private other user');
});
it('failed receipt write rolls back the chat message',()=>{
  const store=db.getDb('eli');
  store.exec("CREATE TRIGGER fail_coach_receipt BEFORE INSERT ON coach_deliveries BEGIN SELECT RAISE(FAIL,'receipt failure'); END;");
  try {expect(()=>plans.ensureCoachMessages('eli',morning)).toThrow('receipt failure');
    expect(store.prepare('SELECT COUNT(*) n FROM chat_messages').get().n).toBe(0);
  } finally {store.exec('DROP TRIGGER fail_coach_receipt');}
});
