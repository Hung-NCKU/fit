import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateContent } from '../server/src/gemini.js';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Gemini 逾時', () => {
  it('模型限流等待期間也可以立即取消',async()=>{
    vi.stubEnv('GEMINI_API_KEY','fake-key');
    const controller=new AbortController();
    const fetchMock=vi.fn(async()=>new Response(JSON.stringify({error:{message:'rate limit',details:[{retryDelay:'8s'}]}}),{status:429}));
    vi.stubGlobal('fetch',fetchMock);
    const started=Date.now();
    await expect(generateContent({contents:[],systemInstruction:'x',signal:controller.signal,onProgress:phase=>{
      if(phase.includes('等待重試')) controller.abort(new Error('cancel backoff'));
    }})).rejects.toThrow('cancel backoff');
    expect(Date.now()-started).toBeLessThan(1000);expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('使用者取消會中斷 fetch，且不自動換模型',async()=>{
    vi.stubEnv('GEMINI_API_KEY','fake-key');
    const controller=new AbortController();
    const fetchMock=vi.fn((_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason))));
    vi.stubGlobal('fetch',fetchMock);
    const running=generateContent({contents:[],systemInstruction:'x',signal:controller.signal});
    controller.abort(new Error('user cancelled'));
    await expect(running).rejects.toThrow('user cancelled');expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('一直等不到回應時，在總上限內回逾時錯誤，不會轉好幾分鐘', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'fake-key');
    vi.stubEnv('GEMINI_REQUEST_TIMEOUT_MS', '300');
    // 模擬 Gemini 完全沒回應：只有被 abort 才結束
    vi.stubGlobal('fetch', (_url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })));
    }));
    const t0 = Date.now();
    await expect(generateContent({
      contents: [], systemInstruction: 'x', deadline: Date.now() + 3500,
    })).rejects.toMatchObject({ status: 504 });
    // 上限抓寬一點（預期約 3.5 秒）：這裡要證明的是「不會轉好幾分鐘」，
    // 而不是精確的耗時。機器同時在跑三十幾個測試 worker 時，偶爾會擠到超過 6 秒。
    expect(Date.now() - t0).toBeLessThan(15_000);
  });
});
