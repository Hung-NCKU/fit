import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRequire} from 'node:module';
import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
let db,coach,app;
beforeAll(async()=>{vi.stubEnv('FIT_DATA_DIR',mkdtempSync(join(tmpdir(),'fit-bookmarks-')));db=await import('../server/src/db.js');coach=await import('../server/src/coach.js');const Fastify=createRequire(new URL('../server/package.json',import.meta.url))('fastify');app=Fastify();app.addHook('onRequest',async req=>{req.userId='eli';});app.setErrorHandler((err,req,reply)=>reply.code(err.status || 500).send({error:err.message}));await app.register((await import('../server/src/routes/chat.js')).default);});
beforeEach(()=>{for(const user of ['eli','martina'])db.getDb(user).exec('DELETE FROM chat_messages;');});
afterAll(async()=>{await app.close();vi.unstubAllEnvs();});
it('自動索引自己的提問，分頁可找到早於近期50則歷史的問題，摘要不含助手回覆',async()=>{
 const first=coach.saveMessage('eli','user','第一個問題');coach.saveMessage('eli','assistant','第一個回答');for(let i=0;i<110;i++){coach.saveMessage('eli','user','問題'+i);coach.saveMessage('eli','assistant','回答'+i);}
 const page=(await app.inject('/chat/bookmarks')).json();expect(page.items).toHaveLength(100);expect(page.hasMore).toBe(true);expect(page.items.every(item=>item.preview.startsWith('問題'))).toBe(true);
 const older=(await app.inject('/chat/bookmarks?before='+page.nextBefore)).json();expect(older.items).toHaveLength(11);expect(older.items.at(-1)).toMatchObject({id:first,preview:'第一個問題'});expect(older.hasMore).toBe(false);
 const context=await app.inject('/chat/questions/'+first);expect(context.statusCode).toBe(200);expect(context.json().slice(0,2).map(row=>row.content)).toEqual(['第一個問題','第一個回答']);expect(context.json()[0].actions).toEqual([]);
});
it('拒絕查看別人的書籤、助手訊息與非法編號，清除對話後沒有失效書籤',async()=>{
 const other=coach.saveMessage('martina','user','私人的問題');expect((await app.inject('/chat/questions/'+other)).statusCode).toBe(404);expect((await app.inject('/chat/bookmarks?user=martina')).statusCode).toBe(403);
 const answer=coach.saveMessage('eli','assistant','助手回覆');expect((await app.inject('/chat/questions/'+answer)).statusCode).toBe(404);expect((await app.inject('/chat/questions/nope')).statusCode).toBe(400);expect((await app.inject('/chat/bookmarks?before=-1')).statusCode).toBe(400);
 coach.saveMessage('eli','user','可以清掉的提問');coach.clearHistory('eli');expect((await app.inject('/chat/bookmarks')).json().items).toEqual([]);
});
