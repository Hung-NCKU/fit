import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
vi.mock('../server/node_modules/web-push/src/index.js',()=>({default:{setVapidDetails:vi.fn(),sendNotification:vi.fn()}}));
const require=createRequire(new URL('../server/package.json',import.meta.url)),webpush=require('web-push'),Fastify=require('fastify');
let push,app,records,db,send;
const sub=endpoint=>({endpoint,keys:{auth:'test-auth',p256dh:'test-key'}});
beforeAll(async()=>{
 vi.stubEnv('FIT_DATA_DIR',mkdtempSync(join(tmpdir(),'fit-push-diagnostics-')));
 const keys=webpush.generateVAPIDKeys();vi.stubEnv('VAPID_PUBLIC_KEY',keys.publicKey);vi.stubEnv('VAPID_PRIVATE_KEY',keys.privateKey);vi.stubEnv('VAPID_SUBJECT','https://fit.example.com');
 send=(await import('../server/node_modules/web-push/src/index.js')).default.sendNotification;vi.spyOn(console,'warn').mockImplementation(()=>{});
 push=await import('../server/src/push.js');records=await import('../server/src/records.js');db=await import('../server/src/db.js');
 app=Fastify();app.addHook('onRequest',async req=>{req.userId='eli';});app.setErrorHandler((err,req,reply)=>reply.code(err.status || 500).send({error:err.message}));await app.register((await import('../server/src/routes/push.js')).default);await app.register((await import('../server/src/routes/api.js')).default);
});
beforeEach(()=>{send.mockReset();db.getDb('eli').exec('DELETE FROM push_subscriptions;DELETE FROM meals;');db.getDb('martina').exec('DELETE FROM push_subscriptions;DELETE FROM meals;');});
afterAll(async()=>{await app.close();vi.restoreAllMocks();vi.unstubAllEnvs();});
it('通知測試只送本帳號目前裝置，不會向另一台或別人的裝置發送',async()=>{
 push.saveSubscription('eli',sub('https://push.example/phone'));push.saveSubscription('eli',sub('https://push.example/desktop'));push.saveSubscription('martina',sub('https://push.example/other'));
 send.mockResolvedValue({statusCode:201});const r=await app.inject({method:'POST',url:'/push/test',payload:{endpoint:'https://push.example/phone'}});expect(r.json()).toMatchObject({sent:1,failed:0,matched:1});expect(send).toHaveBeenCalledTimes(1);expect(send.mock.calls[0][0].endpoint).toBe('https://push.example/phone');
 send.mockClear();const other=await app.inject({method:'POST',url:'/push/test',payload:{endpoint:'https://push.example/other'}});expect(other.json()).toMatchObject({sent:0,matched:0});expect(send).not.toHaveBeenCalled();
 expect((await app.inject({method:'POST',url:'/push/test',payload:{}})).statusCode).toBe(400);
});
it('Apple拒絕會回傳403與安全錯誤代碼，失效訂閱會移除',async()=>{
 const endpoint='https://push.example/phone';push.saveSubscription('eli',sub(endpoint));send.mockRejectedValue({statusCode:403,body:'{"reason":"BadJwtToken"}'});
 expect(await push.sendToUser('eli',{title:'test'},{endpoint})).toMatchObject({sent:0,failed:1,errors:[{status:403,code:'BadJwtToken'}]});expect(push.countSubscriptions('eli')).toBe(1);
 send.mockRejectedValue({statusCode:410,body:'bad secret response'});expect(await push.sendToUser('eli',{}, {endpoint})).toMatchObject({removed:1,failed:1,errors:[{status:410,code:'PushServiceError'}]});expect(push.countSubscriptions('eli')).toBe(0);
});
it('飲食頁單次載入日期與餐點，保留最近紀錄預設及跨帳號唯讀',async()=>{
 records.addMeal('eli',{date:'2026-10-14',name:'我的餐點',kcal:200});records.addMeal('martina',{date:'2026-10-13',name:'對方餐點',kcal:300});
 const own=(await app.inject('/meals/page?date=2026-10-15')).json();expect(own.date).toBe('2026-10-14');expect(own.rows[0].name).toBe('我的餐點');expect(own.dates).toHaveLength(1);
 const other=(await app.inject('/meals/page?date=2026-10-15&user=martina')).json();expect(other.rows[0].name).toBe('對方餐點');expect(other.date).toBe('2026-10-13');
 expect((await app.inject('/meals/page?user=missing')).statusCode).toBe(404);
});
