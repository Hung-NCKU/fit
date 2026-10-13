import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

let users, db, routes;
beforeAll(async () => {
  vi.stubEnv('FIT_DATA_DIR', mkdtempSync(join(tmpdir(), 'fit-logout-')));
  vi.stubEnv('PASSWORD_ELI', 'test-only');
  users = await import('../server/src/users.js');
  db = await import('../server/src/db.js');
  const auth = await import('../server/src/auth.js');
  routes = new Map();
  await auth.default({ get() {}, post(path, handler) { routes.set(path, handler); } });
  const api = await import('../server/src/routes/api.js');
  await api.default({ get() {}, put() {}, patch() {}, delete() {}, post(path, handler) { routes.set(path, handler); } });
});
afterAll(() => vi.unstubAllEnvs());
const request = (id) => ({ cookies: { fit_auth: id }, unsignCookie: value => ({ valid: true, value }) });
const reply = () => ({ clearCookie: vi.fn() });

it('訪客登出移除帳號及 SQLite 檔案，保留固定帳號', async () => {
  const guest = users.addGuest();
  db.getDb(guest.id);
  db.getDb('eli');
  const guestPath = db.dbPath(guest.id);
  expect(existsSync(guestPath)).toBe(true);
  await routes.get('/logout')(request(guest.id), reply());
  expect(users.getUser(guest.id)).toBeNull();
  const { loadGuests } = await import('../server/src/guests.js');
  expect(loadGuests().some(g => g.id === guest.id)).toBe(false);
  for (const suffix of ['', '-shm', '-wal']) expect(existsSync(guestPath + suffix)).toBe(false);
  expect(existsSync(db.dbPath('eli'))).toBe(true);
});

it('正式使用者登出只清除 cookie，不刪除資料庫', async () => {
  const r = reply();
  await routes.get('/logout')(request('eli'), r);
  expect(r.clearCookie).toHaveBeenCalledWith('fit_auth', { path: '/' });
  expect(users.getUser('eli')).toBeDefined();
  expect(existsSync(db.dbPath('eli'))).toBe(true);
});

it('試用升級提供密碼，登出後保留正式帳號與紀錄', async () => {
  const guest = users.addGuest();
  const r = { code: () => r, send: value => value };
  const result = await routes.get('/account')({
    userId: guest.id, log: { warn() {} },
    body: { name: '正式測試帳號', age: 30, height_cm: 170, weight_kg: 65, goal_weight_kg: 65, activity: 1.55 },
  }, r);
  expect(result.upgrading).toBe(true);
  expect(result.password).toBe(guest.password);
  expect(users.getUser(guest.id).temp).toBeUndefined();
  await routes.get('/logout')(request(guest.id), reply());
  expect(users.getUser(guest.id).name).toBe('正式測試帳號');
  expect(existsSync(db.dbPath(guest.id))).toBe(true);
});
