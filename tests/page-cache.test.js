import {it,expect,beforeEach} from 'vitest';
import {loadCachedPage,clearPageCache,invalidatePageCache,patchCachedPage} from '../web/src/page-cache.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
beforeEach(clearPageCache);
it('切回先顯示副本，再以新資料更新，重複請求合併',async()=>{
 const key=['meals','eli','eli'];await loadCachedPage(key,async()=>({items:[1]}));const wait=deferred();let cached;
 const a=loadCachedPage(key,()=>wait.promise,value=>{cached=value;});expect(cached).toEqual({items:[1]});cached.items.push(2);
 let next;const b=loadCachedPage(key,()=>wait.promise,value=>{next=value;});expect(next).toEqual({items:[1]});wait.resolve({items:[3]});expect(await a).toEqual({items:[3]});expect(await b).toEqual({items:[3]});
});
it('異動立即作廢舊快照並背景更新，不能被舊請求覆蓋',async()=>{
 const key=['pet','eli','eli'];await loadCachedPage(key,async()=>({coins:1}));const old=deferred(),fresh=deferred();let calls=0;
 const fetcher=()=>++calls===1?old.promise:fresh.promise;const oldRead=loadCachedPage(key,fetcher);await Promise.resolve();invalidatePageCache('/workouts');await Promise.resolve();let stale=false;
 const current=loadCachedPage(key,fetcher,()=>{stale=true;});expect(stale).toBe(false);fresh.resolve({coins:20});await current;old.resolve({coins:1});await oldRead;
 let cached;await loadCachedPage(key,async()=>({coins:21}),value=>{cached=value;});expect(cached.coins).toBe(20);expect(calls).toBe(2);
});
it('清除後舊登入的在途請求不會重建快取，讀別人與自己也分開',async()=>{
 const wait=deferred(),key=['today','eli','eli'];const pending=loadCachedPage(key,()=>wait.promise);await Promise.resolve();clearPageCache();wait.resolve({name:'舊登入'});await pending;let stale=false;
 await loadCachedPage(key,async()=>({name:'新登入'}),()=>{stale=true;});expect(stale).toBe(false);
 let mixed=false;await loadCachedPage(['today','eli','martina'],async()=>({name:'Martina'}),()=>{mixed=true;});expect(mixed).toBe(false);
});

it('離開頁面可保存最後看到的內容，清除後不能復活舊帳號快照',async()=>{const key=['chat','eli'];await loadCachedPage(key,async()=>({messages:['開始']}));patchCachedPage(key,()=>({messages:['最新回覆']}));let seen;await loadCachedPage(key,async()=>({messages:['更新']}),value=>{seen=value;});expect(seen.messages).toEqual(['最新回覆']);clearPageCache();patchCachedPage(key,()=>({messages:['不可復活']}));let stale=false;await loadCachedPage(key,async()=>({messages:[]}),()=>{stale=true;});expect(stale).toBe(false);});
