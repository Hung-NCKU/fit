import {sendCoachNotifications} from './coach-notifications.js';
import { ensureCoachMessages } from './coach-plan.js';
import { USERS, passwordOf } from './users.js';
import { notifyHours, notifyUser, allUsers, pushEnabled } from './push.js';

/**
 * 每天在指定的幾個時間點檢查熱量進度並推播。
 *
 * 用「算出下一個時間點，setTimeout 過去」而不是每分鐘輪詢：
 * 筆電闔上再打開、或夏令時間之類的狀況，下次醒來會重新計算，不會整天算錯。
 * 注意：這台電腦沒開、或服務沒在跑的時候不會有通知。
 */
let timer = null;
let coachTimer = null;
export async function runCoachReminders(now = new Date()) {
  for (const u of USERS.filter(u=>!u.temp && passwordOf(u))) {
    try { ensureCoachMessages(u.id,now); await sendCoachNotifications(u.id,now); }
    catch(err) {console.warn('[coach-reminder] '+u.id+': '+err.message);}
  }
}
async function scheduleCoach() {
  clearTimeout(coachTimer);
  await runCoachReminders();
  coachTimer = setTimeout(scheduleCoach,60_000-Date.now()%60_000);
  coachTimer.unref?.();
}

function nextRun(from = new Date()) {
  const hours = notifyHours();
  if (!hours.length) return null;

  for (const h of hours) {
    const t = new Date(from);
    t.setHours(h, 0, 0, 0);
    if (t > from) return t;
  }
  // 今天的都過了 → 明天第一個
  const t = new Date(from);
  t.setDate(t.getDate() + 1);
  t.setHours(hours[0], 0, 0, 0);
  return t;
}

async function fire(hour) {
  for (const u of allUsers()) {
    try {
      const r = await notifyUser(u.id, u.name, hour);
      const state = { low: '不足', high: '過多', ok: '正常' }[r.status] ?? r.status;
      console.log(`[notify] ${hour}:00 ${u.name} ${state} ${r.eaten}/${r.target} kcal`
        + (r.skipped ? '（進度正常，略過）' : ` → 送出 ${r.sent ?? 0} 台裝置`));
    } catch (err) {
      console.warn(`[notify] ${u.name} 失敗：${err.message}`);
    }
  }
}

function schedule() {
  clearTimeout(timer);
  const next = nextRun();
  if (!next) return;

  const ms = next - Date.now();
  timer = setTimeout(async () => {
    await fire(next.getHours());
    schedule();   // 排下一個
  }, ms);
  timer.unref?.();

  const mins = Math.round(ms / 60000);
  console.log(`[notify] 下一次提醒：${next.toLocaleString('zh-TW', { hour12: false })}`
    + `（${mins >= 60 ? `${Math.floor(mins / 60)} 小時 ${mins % 60} 分後` : `${mins} 分後`}）`);
}

export function startScheduler() {
  scheduleCoach();
  console.log("[coach-reminder] 每日 08:00 安排、00:00 前日回顧 Asia/Taipei，寫入私人教練對話；已開啟提醒的裝置另發通知");
  if (!pushEnabled()) {
    console.warn('[notify] 沒有設定 VAPID 金鑰，熱量推播不會啟動；教練對話提醒照常');
    return;
  }
  console.log(`[notify] 每日提醒時間：${notifyHours().map(h => `${h}:00`).join('、')}`);
  schedule();
}

/** 給 /api/push/test 用：立刻跑一次某個時間點的檢查 */
export const runNow = (hour) => fire(hour ?? new Date().getHours());
