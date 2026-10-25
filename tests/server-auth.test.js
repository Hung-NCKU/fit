import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  authRequired, clearAttempts, cookieOptions, currentUser,
  isPublicPath, rateLimit, resolveUser, sessionSecret,
} from '../server/src/auth.js';
import { USERS, activeUsers } from '../server/src/users.js';

const setPasswords = (first = '', second = '') => {
  vi.stubEnv(USERS[0].envKey, first);
  vi.stubEnv(USERS[1].envKey, second);
};

/**
 * 這一支測的是「兩個可用帳號之間」的行為，跟哪一位被停用無關。
 * Martina 目前在 users.js 裡標成 disabled，所以這裡先暫時打開，測完還原——
 * 不然每次停用／啟用某個帳號，這些跨帳號的測試就會跟著紅。
 */
const martina = USERS.find(u => u.id === 'martina');
const wasDisabled = martina?.disabled;

/**
 * USERS 會把 server/data/guests.json 裡的訪客一起載進來，而訪客的密碼是存在那個
 * 檔案裡的（不是環境變數），所以只要線上還有一個試用中的訪客，setPasswords() 清掉
 * 環境變數也沒用，authRequired() 仍然是 true，這支就會莫名其妙紅。
 * 這裡測的是兩個內建帳號的邏輯，跟當下有沒有人在試用無關，所以先拿掉再還原。
 */
const guests = USERS.filter(u => u.guest);
beforeAll(() => {
  if (martina) delete martina.disabled;
  for (const g of guests) USERS.splice(USERS.indexOf(g), 1);
});
afterAll(() => {
  if (martina && wasDisabled) martina.disabled = true;
  USERS.push(...guests);
});

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('既有後端驗證邏輯', () => {
  it('沒有任何密碼時才關閉驗證', () => {
    setPasswords();
    expect(authRequired()).toBe(false);
    expect(currentUser({})).toBe(USERS[0].id);
    setPasswords('fake-first-password');
    expect(authRequired()).toBe(true);
    expect(currentUser({})).toBeNull();
  });

  it('假密碼只對應到正確的測試帳號', () => {
    setPasswords('fake-first-password', 'fake-second-password');
    expect(resolveUser('fake-first-password')?.id).toBe(USERS[0].id);
    expect(resolveUser('fake-second-password')?.id).toBe(USERS[1].id);
    expect(resolveUser('wrong-password')).toBeNull();
    expect(resolveUser(null)).toBeNull();
  });

  it('改密碼會更換 cookie 簽章金鑰', () => {
    setPasswords('fake-first-password');
    const before = sessionSecret();
    expect(sessionSecret()).toBe(before);
    setPasswords('fake-new-password');
    expect(sessionSecret()).not.toBe(before);
  });

  it('session/login/logout 是公開路徑，資料與照片不是', () => {
    for (const path of ['/api/session?test=1', '/api/login', '/api/logout', '/', '/assets/app.js']) {
      expect(isPublicPath(path)).toBe(true);
    }
    for (const path of ['/api/meals', '/api/profile?user=test', '/uploads/example.jpg']) {
      expect(isPublicPath(path)).toBe(false);
    }
  });

  it('HTTPS cookie 使用 secure，HTTP 本機連線不使用', () => {
    expect(cookieOptions({ headers: {}, protocol: 'http' })).toMatchObject({
      httpOnly: true, signed: true, sameSite: 'lax', secure: false,
    });
    expect(cookieOptions({ headers: { 'x-forwarded-proto': 'https' }, protocol: 'http' }).secure).toBe(true);
  });

  it('拒絕無效簽章或未知使用者的 cookie', () => {
    setPasswords('fake-first-password');
    expect(currentUser({ cookies: { fit_auth: 'fake-cookie' },
      unsignCookie: () => ({ valid: false, value: USERS[0].id }) })).toBeNull();
    expect(currentUser({ cookies: { fit_auth: 'fake-cookie' },
      unsignCookie: () => ({ valid: true, value: 'unknown-test-user' }) })).toBeNull();
    expect(currentUser({ cookies: { fit_auth: 'fake-cookie' },
      unsignCookie: () => ({ valid: true, value: USERS[1].id }) })).toBe(USERS[1].id);
  });

  it('同一 IP 第九次嘗試被限制，清除後恢復', () => {
    const ip = 'test-limit';
    clearAttempts(ip);
    try {
      for (let i = 0; i < 8; i++) expect(rateLimit(ip).allowed).toBe(true);
      expect(rateLimit(ip)).toMatchObject({ allowed: false });
      clearAttempts(ip);
      expect(rateLimit(ip).allowed).toBe(true);
    } finally { clearAttempts(ip); }
  });

  it('限制視窗過期後可重新嘗試', () => {
    const ip = 'test-expiry';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    clearAttempts(ip);
    try {
      for (let i = 0; i < 9; i++) rateLimit(ip);
      vi.setSystemTime(new Date('2026-01-01T00:10:01Z'));
      expect(rateLimit(ip).allowed).toBe(true);
    } finally { clearAttempts(ip); }
  });
});

describe('停用的帳號', () => {
  it('密碼再對也不能登入，也不會出現在清單裡', () => {
    const target = USERS.find(u => u.id === 'martina');
    // setPasswords 的第一組對應 USERS[0]，也就是 Martina
    setPasswords('fake-first-password', 'fake-second-password');
    // 先確認沒停用時是認得的
    delete target.disabled;
    expect(resolveUser('fake-first-password')?.id).toBe('martina');

    target.disabled = true;
    expect(resolveUser('fake-first-password')).toBeNull();
    expect(activeUsers().some(u => u.id === 'martina')).toBe(false);
    // 停用之後舊的 cookie 也要失效
    expect(currentUser({ cookies: { fit_auth: 'x' },
      unsignCookie: () => ({ valid: true, value: 'martina' }) })).toBeNull();

    delete target.disabled;
  });
});
