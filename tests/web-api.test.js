import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, photoUrl } from '../web/src/api.js';
import { session } from '../web/src/auth.js';

const fetchMock = vi.fn();
const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  session.authed = true;
  session.authRequired = false;
  session.ready = false;
});
afterEach(() => vi.unstubAllGlobals());

describe('既有 API 客戶端', () => {
  it('GET 不附空 JSON body 或 content-type', async () => {
    fetchMock.mockResolvedValue(response({ ok: true }));
    await expect(api.health()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.objectContaining({
      credentials: 'same-origin', headers: {}, body: undefined,
    }));
  });

  it('DELETE 不附空 JSON body，避免 Fastify 400', async () => {
    fetchMock.mockResolvedValue(response({ ok: true }));
    await api.deleteMeal(7);
    expect(fetchMock).toHaveBeenCalledWith('/api/meals/7', expect.objectContaining({
      method: 'DELETE', headers: {}, body: undefined,
    }));
  });

  it('POST 序列化 body 並宣告 JSON', async () => {
    fetchMock.mockResolvedValue(response({ id: 1 }));
    await api.addMeal({ name: '測試餐點', kcal: 500 });
    expect(fetchMock).toHaveBeenCalledWith('/api/meals', expect.objectContaining({
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '測試餐點', kcal: 500 }),
    }));
  });

  it('query 正確編碼並略過空值', async () => {
    fetchMock.mockResolvedValue(response([]));
    await api.listMeals({ user: '測試 使用者', date: '', other: null });
    const url = new URL(fetchMock.mock.calls[0][0], 'http://localhost');
    expect(url.pathname).toBe('/api/meals');
    expect([...url.searchParams]).toEqual([['user', '測試 使用者']]);
  });

  it('非登入 API 回 401 時回到登入狀態', async () => {
    fetchMock.mockResolvedValue(response({}, 401));
    await expect(api.session()).rejects.toThrow('連線已過期，請重新登入');
    expect(session).toMatchObject({ authed: false, authRequired: true, ready: true });
  });

  it('密碼錯誤保留登入 API 的訊息，不誤判 session 過期', async () => {
    fetchMock.mockResolvedValue(response({ error: '密碼錯誤' }, 401));
    await expect(api.login('fake-test-password')).rejects.toThrow('密碼錯誤');
    expect(session.authed).toBe(true);
  });

  it('網路失敗回傳使用者看得懂的訊息', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.health()).rejects.toThrow('連不到伺服器');
  });

  it('照片不存在時不產生錯誤網址', () => {
    expect(photoUrl('', 'test')).toBe('');
    expect(photoUrl('example.jpg', 'test')).toBe('/uploads/example.jpg?user=test');
  });
});
