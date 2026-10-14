import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
const Fastify=createRequire(new URL('../server/package.json',import.meta.url))('fastify');
const {chatMock}=vi.hoisted(()=>({chatMock:vi.fn()}));
vi.mock('../server/src/coach.js',async importOriginal=>({...await importOriginal(),chat:chatMock}));
let app,db,requests,records;
const body={message:'我吃了午餐',model:'auto',requestId:'receipt-test-0001'};
beforeAll(async()=>{
  vi.stubEnv('FIT_DATA_DIR',mkdtempSync(join(tmpdir(),'fit-chat-receipt-')));
  db=(await import('../server/src/db.js')).getDb('eli');
  records=await import('../server/src/records.js');
  requests=await import('../server/src/chat-requests.js');
  app=Fastify();
  app.addHook('onRequest',async req=>{req.userId=req.headers['x-test-user'] || 'eli';});
  app.setErrorHandler((err,req,reply)=>reply.code(err.status || 500).send({error:err.message}));
  await app.register((await import('../server/src/routes/chat.js')).default);
});
beforeEach(()=>{db.exec('DELETE FROM chat_requests; DELETE FROM chat_messages; DELETE FROM meals');chatMock.mockReset();});
afterAll(async()=>{await app.close();vi.unstubAllEnvs();});
it('完成收據重送只回原結果，不再呼叫模型、不多寫一餐',async()=>{
  chatMock.mockImplementation(async(user,text,history,image,model,options)=>{
    const saved=records.addMeal(user,{name:'午餐',kcal:100});
    const actions=[{tool:'log_meal',result:{ok:true,saved}}];options.onActions(actions);
    return {reply:'記好了',actions,model:'test'};
  });
  const first=await app.inject({method:'POST',url:'/chat',payload:body});
  const again=await app.inject({method:'POST',url:'/chat',payload:body});
  expect(first.statusCode).toBe(200);expect(again.json()).toEqual(first.json());
  expect(chatMock).toHaveBeenCalledTimes(1);expect(records.listMeals('eli')).toHaveLength(1);
  expect(db.prepare('SELECT * FROM chat_messages').all()).toHaveLength(2);
  expect((await app.inject(`/chat/requests/${body.requestId}`)).json().state).toBe('done');
});
it('處理中重送回202；取消中止模型且不重送、不產生工具紀錄',async()=>{
  let entered;const ready=new Promise(resolve=>{entered=resolve;});
  chatMock.mockImplementation((u,t,h,i,m,options)=>new Promise((resolve,reject)=>{
    options.onProgress('等待測試模型');entered();options.signal.addEventListener('abort',()=>reject(options.signal.reason));
  }));
  const running=app.inject({method:'POST',url:'/chat',payload:body});
  await ready;
  const duplicate=await app.inject({method:'POST',url:'/chat',payload:body});
  expect(duplicate.statusCode).toBe(202);expect(duplicate.json().phase).toBe('等待測試模型');
  await app.inject({method:'POST',url:`/chat/requests/${body.requestId}/cancel`});
  expect((await running).statusCode).toBe(499);
  expect(requests.requestStatus('eli',body.requestId)).toMatchObject({state:'cancelled',canRetry:false});
  expect(chatMock).toHaveBeenCalledTimes(1);
});
it('工具已寫入但最後回答失敗，保留實際動作並拒絕重試',async()=>{
  chatMock.mockImplementation(async(u,t,h,i,m,options)=>{
    const saved=records.addMeal(u,{name:'已寫入',kcal:100});
    options.onActions([{tool:'log_meal',result:{ok:true,saved}}]);
    throw Object.assign(new Error('模型逾時'),{status:504});
  });
  expect((await app.inject({method:'POST',url:'/chat',payload:body})).statusCode).toBe(504);
  const status=requests.requestStatus('eli',body.requestId);
  expect(status.canRetry).toBe(false);expect(status.actions).toHaveLength(1);
  expect((await app.inject({method:'POST',url:'/chat',payload:{...body,retry:true}})).statusCode).toBe(409);
  expect(records.listMeals('eli')).toHaveLength(1);expect(chatMock).toHaveBeenCalledTimes(1);
  expect(JSON.parse(db.prepare("SELECT actions FROM chat_messages WHERE role='assistant'").get().actions)).toHaveLength(1);
});
it('沒有工具寫入的失敗可以重試同一收據，不多存使用者訊息',async()=>{
  chatMock.mockRejectedValueOnce(Object.assign(new Error('模型暫時忙碌'),{status:503}));
  await app.inject({method:'POST',url:'/chat',payload:body});
  expect(requests.requestStatus('eli',body.requestId).canRetry).toBe(true);
  chatMock.mockResolvedValueOnce({reply:'完成',actions:[],model:'test'});
  expect((await app.inject({method:'POST',url:'/chat',payload:{...body,retry:true}})).statusCode).toBe(200);
  expect(db.prepare("SELECT COUNT(*) AS n FROM chat_messages WHERE role='user'").get().n).toBe(1);
});
it('識別碼換內容、其他訊息同時寫入及跨使用者讀取都被阻擋',async()=>{
  requests.beginRequest('eli',body.requestId,body);
  expect((await app.inject({method:'POST',url:'/chat',payload:{...body,message:'偷換'}})).statusCode).toBe(409);
  expect((await app.inject({method:'POST',url:'/chat',payload:{...body,requestId:'receipt-test-0002'}})).statusCode).toBe(409);
  expect((await app.inject({url:`/chat/requests/${body.requestId}`,headers:{'x-test-user':'martina'}})).statusCode).toBe(404);
  requests.finishRequest('eli',body.requestId,'cancelled',null);
});
it('服務重啟的未完成收據標示中斷，不重新執行可能已完成的工具',()=>{
  db.prepare('INSERT INTO chat_requests(request_id,fingerprint,state) VALUES (?,?,?)').run('receipt-test-stale','test','running');
  expect(requests.requestStatus('eli','receipt-test-stale')).toMatchObject({state:'interrupted',canRetry:false});
});
