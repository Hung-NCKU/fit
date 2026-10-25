import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRequire} from 'node:module';
import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {USERS} from '../server/src/users.js';
/**
 * 這一支測的是「兩個可用帳號之間」的行為，跟哪一位被停用無關。
 * Martina 目前在 users.js 裡標成 disabled，所以這裡先暫時打開，測完還原——
 * 不然每次停用／啟用某個帳號，這些跨帳號的測試就會跟著紅。
 */
const martina = USERS.find(u => u.id === 'martina');
const wasDisabled = martina?.disabled;
beforeAll(() => { if (martina) delete martina.disabled; });
afterAll(() => { if (martina && wasDisabled) martina.disabled = true; });

let pet,care,db,app;
beforeAll(async()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-16T12:00:00+08:00'));vi.stubEnv('FIT_DATA_DIR',mkdtempSync(join(tmpdir(),'fit-social-pet-')));pet=await import('../server/src/pet.js');care=await import('../server/src/pet-care.js');db=await import('../server/src/db.js');pet.adoptPet('eli','cat','Eli pet');pet.adoptPet('martina','dog','Martina pet');const Fastify=createRequire(new URL('../server/package.json',import.meta.url))('fastify');app=Fastify();app.addHook('onRequest',async req=>req.userId=req.headers['x-test-user']||'eli');app.setErrorHandler((e,r,reply)=>reply.code(e.status||500).send({error:e.message}));await app.register((await import('../server/src/routes/pet.js')).default);});
beforeEach(()=>{vi.setSystemTime(new Date('2026-10-16T12:00:00+08:00'));for(const u of ['eli','martina'])db.getDb(u).exec('DELETE FROM pet_care_interactions;DELETE FROM pet_care_play_slots');});
afterAll(async()=>{await app.close();vi.useRealTimers();vi.unstubAllEnvs();});
it('visitor interaction changes only target pet and shares owner cooldown and daily cap',async()=>{
 vi.setSystemTime(new Date('2026-10-16T08:00:00+08:00'));
 const coins=pet.getPet('martina').coins,position=pet.petRoomPosition('martina','main');
 const send=user=>app.inject({method:'POST',url:'/pet/interact?user=martina',headers:{'x-test-user':user},payload:{petKey:'main'}});
 expect((await send('eli')).json().credited).toBe(true);expect(care.petCare('martina','main').mood).toBe(43);expect(care.petCare('eli','main').interactions).toBe(0);
 expect((await send('martina')).json().credited).toBe(false);
 for(const hour of [11,17]){vi.setSystemTime(new Date('2026-10-16T'+hour+':00:00+08:00'));expect((await send('eli')).json().credited).toBe(true);expect((await send('martina')).json().credited).toBe(false);}
 vi.setSystemTime(Date.now()+30000);expect((await send('eli')).json().credited).toBe(false);expect(care.petCare('martina','main').interactionMood).toBe(10);expect(pet.getPet('martina').coins).toBe(coins);expect(pet.petRoomPosition('martina','main')).toEqual(position);
});
it('other writes stay forbidden and invalid owner/pet cannot modify data',async()=>{
 for(const [method,url,payload]of [['PATCH','/pet/position',{petKey:'main',position:{x:30,y:80}}],['PATCH','/pet/name',{name:'changed'}],['POST','/pet/select',{petKey:'main'}],['PATCH','/pet/room',{item:'x',position:null}]])expect((await app.inject({method,url:url+'?user=martina',payload})).statusCode).toBe(403);
 expect((await app.inject({method:'POST',url:'/pet/interact?user=missing',payload:{petKey:'main'}})).statusCode).toBe(404);
 expect((await app.inject({method:'POST',url:'/pet/interact?user=martina',payload:{petKey:'companion-9999'}})).statusCode).toBe(404);
 expect(care.petCare('martina','main').interactions).toBe(0);
});
