import {getDb} from './db.js';
import {taipeiClock,previousCoachDate} from './coach-plan.js';
import {pushEnabled,listSubscriptions,sendToUser} from './push.js';

// Receipts are per device: a failed phone never causes successful devices to be notified twice.
export async function sendCoachNotifications(userId,now=new Date(),{send=sendToUser,enabled=pushEnabled()}={}) {
  if(!enabled)return;
  const db=getDb(userId),{date,hour}=taipeiClock(now),time=now.getTime();
  const candidates=[['daily_review',previousCoachDate(date)],...(hour>=8?[['daily',date]]:[])];
  for(const [kind,key] of candidates) {
    if(!db.prepare('SELECT 1 FROM coach_deliveries WHERE kind=? AND delivery_key=?').get(kind,key))continue;
    for(const sub of listSubscriptions(userId)) {
      // Atomic claim also covers a scheduler restart / concurrent call. Failed attempts retry after 5 min, at most 3 times.
      const claim=db.prepare(`INSERT INTO coach_push_deliveries(kind,delivery_key,endpoint,status,last_attempt) VALUES (?,?,?,'sending',?)
        ON CONFLICT(kind,delivery_key,endpoint) DO UPDATE SET status='sending',attempts=attempts+1,last_attempt=excluded.last_attempt
        WHERE coach_push_deliveries.status IN ('failed','sending') AND coach_push_deliveries.attempts<3 AND coach_push_deliveries.last_attempt<=?`)
        .run(kind,key,sub.endpoint,time,time-300000);
      if(!claim.changes)continue;
      const morning=kind==='daily';
      try {
        const result=await send(userId,{
          title:morning?'教練早安｜今日安排已送達':'教練午夜回顧已送達',
          body:morning?`${key} 的飲食與運動安排已放在教練對話，點此查看。`:`${key} 的飲食、運動與有紀錄的體態回顧已整理，點此查看。`,
          tag:`coach-${kind}-${key}`,url:'/chat',
        },{endpoint:sub.endpoint});
        const status=result.sent>0?'sent':result.removed>0?'expired':'failed';
        db.prepare('UPDATE coach_push_deliveries SET status=? WHERE kind=? AND delivery_key=? AND endpoint=?').run(status,kind,key,sub.endpoint);
        if(status==='failed')console.warn(`[coach-push] ${userId} ${kind} ${key} failed; retry pending`);
      }catch {
        db.prepare("UPDATE coach_push_deliveries SET status='failed' WHERE kind=? AND delivery_key=? AND endpoint=?").run(kind,key,sub.endpoint);
        console.warn(`[coach-push] ${userId} ${kind} ${key} failed; retry pending`);
      }
    }
  }
}
