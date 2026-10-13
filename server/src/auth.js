import { createHash, timingSafeEqual } from 'node:crypto';
import { USERS, addGuest, getUser, guestUsers, passwordOf, anyPasswordSet, removeGuest } from './users.js';
import { destroyDb } from './db.js';

export const COOKIE = 'fit_auth';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 天

/** 沒有任何帳號設密碼＝關閉驗證（只在自己電腦上用時方便，別這樣開到外網） */
export const authRequired = () => anyPasswordSet();

/**
 * Cookie 簽章金鑰由所有密碼推導，所以改任何一個密碼＝所有裝置自動登出，
 * 也省去另外管理一組 secret。
 */
/**
 * Cookie 的簽章金鑰。
 *
 * 從密碼推導出來是刻意的：改了密碼，舊的登入就自動失效，不必另外做撤銷。
 *
 * 但**只看固定帳號**（.env 那幾組）。訪客是主頁按鈕隨時新增的，
 * 如果把他們也算進去，每按一次「新增訪客」就等於換了一把鑰匙，
 * 連自己都會被登出——那個按鈕就沒人敢按了。
 */
export const sessionSecret = () =>
  createHash('sha256')
    .update('fit-session:' + USERS
      .filter(u => !u.guest)
      .map(u => `${u.id}=${passwordOf(u)}`)
      .join('|'))
    .digest('hex');

/** 定時比較，避免用回應時間猜密碼 */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * 密碼決定身分：輸入誰的密碼就以誰的身分登入。
 * 為了不讓回應時間洩漏「哪個帳號存在」，所有帳號都比對過一輪才回傳。
 */
export function resolveUser(input) {
  let matched = null;
  for (const u of USERS) {
    const pw = passwordOf(u);
    if (pw && safeEqual(input ?? '', pw)) matched = u;
  }
  return matched;
}

/* ---------------- 登入嘗試次數限制 ---------------- */

const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export function rateLimit(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now > rec.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }
  rec.count += 1;
  if (rec.count > MAX_ATTEMPTS) {
    return { allowed: false, retryInMin: Math.ceil((rec.resetAt - now) / 60000) };
  }
  return { allowed: true };
}

export const clearAttempts = (ip) => attempts.delete(ip);

setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of attempts) if (now > rec.resetAt) attempts.delete(ip);
}, WINDOW_MS).unref();

/* ---------------- 路徑與 cookie ---------------- */

const PUBLIC_API = new Set(['/api/session', '/api/login', '/api/logout', '/api/guest']);

/**
 * 最多同時存在幾個訪客。
 *
 * 「以訪客身分試用」是放在登入頁的，也就是**還沒登入就能按**。這個服務對外開放
 * （Tailscale Funnel），不設上限的話外面的人可以一直按，把磁碟塞滿一堆空資料庫。
 * 搭配 rateLimit（同一個 IP 十分鐘八次）足以擋住隨手亂按。
 */
export const MAX_GUESTS = 20;

export const isPublicPath = (url) => {
  const path = url.split('?')[0];
  if (PUBLIC_API.has(path)) return true;
  if (path.startsWith('/api/') || path.startsWith('/uploads/')) return false;
  return true; // 前端靜態檔：登入畫面需要它才顯示得出來
};

export function cookieOptions(req) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: MAX_AGE,
    // 透過通道進來時是 https，本機直連則否
    secure: (req.headers['x-forwarded-proto'] || req.protocol) === 'https',
    signed: true,
  };
}

/** @returns {string|null} 登入者的 id */
export function currentUser(req) {
  if (!authRequired()) return USERS[0].id;   // 沒設密碼就當第一位使用者
  const raw = req.cookies?.[COOKIE];
  if (!raw) return null;
  const r = req.unsignCookie(raw);
  if (!r.valid) return null;
  return getUser(r.value) ? r.value : null;
}

/* ---------------- 路由 ---------------- */

export default async function authRoutes(app) {
  app.get('/session', async (req) => {
    const id = currentUser(req);
    return {
      authRequired: authRequired(),
      authed: Boolean(id),
      user: id,
      name: id ? getUser(id).name : null,
      // 還在試用＝還沒建帳號。前端用它決定右上角要寫「建立帳號」還是「新增使用者」
      trial: Boolean(id && getUser(id)?.temp),
      guest: Boolean(id && getUser(id)?.guest),
      users: USERS.map(u => ({ id: u.id, name: u.name })),
    };
  });

  app.post('/login', async (req, reply) => {
    if (!authRequired()) return { ok: true, authRequired: false, user: USERS[0].id };

    const ip = req.ip;
    const limit = rateLimit(ip);
    if (!limit.allowed) {
      return reply.code(429).send({ error: `嘗試次數過多，請 ${limit.retryInMin} 分鐘後再試` });
    }

    const user = resolveUser(req.body?.password);
    if (!user) return reply.code(401).send({ error: '密碼錯誤' });

    clearAttempts(ip);
    reply.setCookie(COOKIE, user.id, cookieOptions(req));
    return { ok: true, user: user.id, name: user.name };
  });

  /**
   * 以訪客身分試用：當場開一個新帳號並直接登入。
   *
   * 這是整個 API 裡唯一不用登入就能寫入的端點，所以限制寫得比較緊：
   * 同一個 IP 吃登入那組頻率限制，而且訪客總數有上限。
   */
  app.post('/guest', async (req, reply) => {
    if (!authRequired()) {
      // 沒設任何密碼＝根本沒在驗證，大家都是同一個身分，開訪客沒有意義
      throw Object.assign(new Error('這台沒有啟用密碼，不需要訪客帳號'), { status: 400 });
    }

    const limit = rateLimit(req.ip);
    if (!limit.allowed) {
      return reply.code(429).send({ error: `太頻繁了，請 ${limit.retryInMin} 分鐘後再試` });
    }

    if (guestUsers().length >= MAX_GUESTS) {
      return reply.code(429).send({ error: '訪客帳號已經滿了，請稍後再試' });
    }

    const g = addGuest();
    req.log.warn({ guest: g.id, ip: req.ip }, '建立訪客帳號並登入');
    reply.setCookie(COOKIE, g.id, cookieOptions(req));
    return reply.code(201).send({ ok: true, user: g.id, name: g.name, trial: true });
  });

  app.post('/logout', async (req, reply) => {
    const id = currentUser(req);
    if (id && getUser(id)?.temp) {
      destroyDb(id);
      removeGuest(id);
    }
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });
}
