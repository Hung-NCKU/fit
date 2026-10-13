import { afterEach, beforeEach, expect, it, vi } from 'vitest';
let generateContent;
const ok = () => ({ ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }) });
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('GEMINI_API_KEY', 'fake-key');
  vi.stubEnv('GEMINI_MODELS', 'gemini-3.1-flash-lite,gemini-flash-lite-latest');
  ({ generateContent } = await import('../server/src/gemini.js'));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const args = { contents: [], systemInstruction: 'test' };
it('503 立即切換備援，下一輪跳過壅塞模型', async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 503, text: async () => '{"error":{"message":"busy"}}' }).mockImplementation(async () => ok());
  vi.stubGlobal('fetch', fetch);
  expect((await generateContent(args)).model).toBe('gemini-flash-lite-latest');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect((await generateContent(args)).model).toBe('gemini-flash-lite-latest');
  expect(fetch).toHaveBeenCalledTimes(3);
});
it('Gemini 3 使用 minimal thinkingLevel', async () => {
  const fetch = vi.fn(async () => ok());
  vi.stubGlobal('fetch', fetch);
  await generateContent(args);
  expect(JSON.parse(fetch.mock.calls[0][1].body).generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'minimal' });
});
it('逾時直接切换備援，不重試同一模型', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(Object.assign(new Error('timeout'), { name: 'TimeoutError' })).mockImplementation(async () => ok());
  vi.stubGlobal('fetch', fetch);
  expect((await generateContent(args)).model).toBe('gemini-flash-lite-latest');
  expect(fetch).toHaveBeenCalledTimes(2);
});
