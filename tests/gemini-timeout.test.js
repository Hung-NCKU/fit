import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateContent } from '../server/src/gemini.js';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Gemini 逾時', () => {
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
    expect(Date.now() - t0).toBeLessThan(6000);
  });
});
