import webpush from 'web-push';
import { getDb } from './db.js';
import { USERS } from './users.js';
import { dailySummary, today } from './records.js';

export const pushEnabled = () =>
  Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

export const publicKey = () => process.env.VAPID_PUBLIC_KEY || '';

if (pushEnabled()) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:fit@localhost',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

/* ---------------- 訂閱管理（每位使用者存在自己的資料庫） ---------------- */

export function saveSubscription(userId, sub, ua = '') {
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    throw Object.assign(new Error('訂閱資料不完整'), { status: 400 });
  }
  getDb(userId).prepare(`
    INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh,
                                        auth   = excluded.auth,
                                        user_agent = excluded.user_agent
  `).run(sub.endpoint, sub.keys.p256dh, sub.keys.auth, String(ua).slice(0, 200));
  return countSubscriptions(userId);
}

export const removeSubscription = (userId, endpoint) =>
  getDb(userId).prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint).changes > 0;

export const listSubscriptions = (userId) =>
  getDb(userId).prepare('SELECT * FROM push_subscriptions').all();

export const countSubscriptions = (userId) =>
  getDb(userId).prepare('SELECT COUNT(*) c FROM push_subscriptions').get().c;

/* ---------------- 發送 ---------------- */

export async function sendToUser(userId, payload) {
  if (!pushEnabled()) return { sent: 0, removed: 0, reason: '沒有設定 VAPID 金鑰' };
  const subs = listSubscriptions(userId);
  let sent = 0, removed = 0;

  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 3 * 60 * 60 },   // 3 小時內沒送達就算了，過期的提醒沒意義
      );
      sent++;
    } catch (err) {
      // 404/410＝這個訂閱已經失效（App 被移除、瀏覽器資料被清掉），直接刪掉不要再試
      if (err.statusCode === 404 || err.statusCode === 410) {
        removeSubscription(userId, s.endpoint);
        removed++;
      } else {
        console.warn(`[push] ${userId} 發送失敗 ${err.statusCode || ''}: ${err.message}`);
      }
    }
  }
  return { sent, removed };
}

/* ---------------- 熱量進度判斷 ---------------- */

/**
 * 每個檢查點「應該吃到的比例」。不是平均分配 —— 12 點時通常只吃了早餐＋午餐，
 * 到晚上 9 點才該接近全天目標。
 */
const PACE = { 12: 0.35, 15: 0.55, 18: 0.75, 21: 1.0 };

/** 超出或落後多少才提醒（佔全天目標的比例） */
const BAND = 0.12;

export function checkProgress(userId, hour = new Date().getHours()) {
  const s = dailySummary(userId, today());
  const target = s.targets.kcal || 0;
  const eaten = Math.round(s.nutrition.kcal);
  const protein = Math.round(s.nutrition.protein_g);
  const ratio = PACE[hour] ?? 1;
  const expected = Math.round(target * ratio);
  const band = Math.round(target * BAND);
  const diff = eaten - expected;

  let status = 'ok';
  if (diff < -band) status = 'low';
  else if (diff > band) status = 'high';

  return { hour, status, eaten, expected, target, protein, diff, band,
           remaining: s.remaining, targetProtein: s.targets.protein_g };
}

export function buildMessage(name, p) {
  const when = `${p.hour}:00`;
  const base = `${p.eaten} / ${p.target} kcal・蛋白質 ${p.protein}/${p.targetProtein}g`;

  if (p.status === 'low') {
    const short = Math.abs(p.diff);
    return {
      title: `${when} 熱量落後 ${short} kcal`,
      body: `${base}\n${p.hour >= 21 ? '今天快結束了，睡前補一杯全脂奶或花生醬吐司' : `這個時間建議吃到 ${p.expected} kcal，加個點心補上`}`,
      tag: 'fit-low',
    };
  }
  if (p.status === 'high') {
    return {
      title: `${when} 已超出 ${p.diff} kcal`,
      body: `${base}\n${p.hour >= 21 ? '今天超標了，明天調整一下就好' : '接下來的幾餐清淡一點，蛋白質照吃'}`,
      tag: 'fit-high',
    };
  }
  return {
    title: `${when} 進度正常`,
    body: `${base}\n距離今日目標還差 ${p.remaining.kcal} kcal、蛋白質 ${p.remaining.protein_g}g`,
    tag: 'fit-ok',
  };
}

/** 對一位使用者做一次檢查並推播；回傳這次的判斷結果 */
export async function notifyUser(userId, name, hour) {
  const p = checkProgress(userId, hour);
  const onTrackQuiet = p.status === 'ok' && process.env.NOTIFY_ON_TRACK === 'false';
  if (onTrackQuiet) return { ...p, skipped: true };

  const msg = buildMessage(name, p);
  const result = await sendToUser(userId, { ...msg, url: '/today', hour });
  return { ...p, ...result };
}

export const notifyHours = () =>
  (process.env.NOTIFY_HOURS || '12,15,18,21')
    .split(',')
    .map(h => Number(h.trim()))
    .filter(h => Number.isInteger(h) && h >= 0 && h <= 23)
    .sort((a, b) => a - b);

export const allUsers = () => USERS.map(u => ({ id: u.id, name: u.name }));
