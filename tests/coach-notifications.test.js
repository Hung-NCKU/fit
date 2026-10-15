import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
let db,plans,push,notify;
beforeAll(async()=>{vi.stubEnv('FIT_DATA_DIR',mkdtempSync(join(tmpdir(),'fit-coach-push-')));db=await import('../server/src/db.js');plans=await import('../server/src/coach-plan.js');push=await import('../server/src/push.js');notify=(await import('../server/src/coach-notifications.js')).sendCoachNotifications;});
beforeEach(()=>{for(const u of ['eli','martina'])db.getDb(u).exec('DELETE FROM coach_deliveries;DELETE FROM coach_push_deliveries;DELETE FROM chat_messages;DELETE FROM push_subscriptions;');});
afterAll(()=>vi.unstubAllEnvs());
const midnight=new Date('2026-10-15T16:00:00Z'),morning=new Date('2026-10-16T00:00:00Z');
const sub=endpoint=>({endpoint,keys:{p256dh:'test',auth:'test'}});
it('midnight and morning push point to chat, even if API created messages first; no repeats',async()=>{
 push.saveSubscription('eli',sub('https://push.test/a'));const send=vi.fn(async()=>({sent:1}));
 plans.ensureCoachMessages('eli',midnight);await notify('eli',midnight,{enabled:true,send});expect(send).toHaveBeenCalledTimes(1);expect(send.mock.calls[0][1]).toMatchObject({url:'/chat',tag:'coach-daily_review-2026-10-15'});
 plans.ensureCoachMessages('eli',morning);await notify('eli',morning,{enabled:true,send});await notify('eli',morning,{enabled:true,send});expect(send).toHaveBeenCalledTimes(2);expect(send.mock.calls[1][1].tag).toBe('coach-daily-2026-10-16');
 expect(db.getDb('martina').prepare('SELECT COUNT(*) n FROM coach_push_deliveries').get().n).toBe(0);
});
it('no permission/subscription or disabled push sends nothing; failed devices alone retry',async()=>{
 plans.ensureCoachMessages('eli',midnight);const send=vi.fn(async(u,p,{endpoint})=>({sent:endpoint.endsWith('/ok')?1:0}));
 await notify('eli',midnight,{enabled:true,send});expect(send).not.toHaveBeenCalled();
 push.saveSubscription('eli',sub('https://push.test/ok'));push.saveSubscription('eli',sub('https://push.test/fail'));
 await notify('eli',midnight,{enabled:false,send});expect(send).not.toHaveBeenCalled();
 await Promise.all([notify('eli',midnight,{enabled:true,send}),notify('eli',midnight,{enabled:true,send})]);expect(send).toHaveBeenCalledTimes(2);
 await notify('eli',new Date(midnight.getTime()+300000),{enabled:true,send});expect(send).toHaveBeenCalledTimes(3);expect(send.mock.calls[2][2].endpoint).toBe('https://push.test/fail');
 await notify('eli',new Date(midnight.getTime()+600000),{enabled:true,send});await notify('eli',new Date(midnight.getTime()+900000),{enabled:true,send});expect(send).toHaveBeenCalledTimes(4);
});
