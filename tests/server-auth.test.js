import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  authRequired, clearAttempts, cookieOptions, currentUser,
  isPublicPath, rateLimit, resolveUser, sessionSecret,
} from '../server/src/auth.js';
import { USERS } from '../server/src/users.js';

const setPasswords = (first = '', second = '') => {
  vi.stubEnv(USERS[0].envKey, first);
  vi.stubEnv(USERS[1].envKey, second);
};
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
