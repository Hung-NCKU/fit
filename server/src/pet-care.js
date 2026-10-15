import {getDb} from './db.js';
import {dailySummary,today} from './records.js';
import {petByKey,exerciseRewardProgress} from './pet.js';

export function petCare(userId,petKey) {
  petByKey(userId,petKey);
  const day=today(), summary=dailySummary(userId,day), exercise=exerciseRewardProgress(userId,day);
  const row=getDb(userId).prepare('SELECT count,last_at FROM pet_care_interactions WHERE pet_key=? AND date=?').get(petKey,day);
  const fullness=Math.min(100,Math.max(0,Math.round(summary.nutrition.kcal/Math.max(1,summary.targets.kcal)*100)));
  const exerciseMood=Math.min(50,exercise.strengthSets*3+Math.floor(exercise.cardioMinutes/5)*2);
  const interactions=row?.count || 0;
  const cooldownSeconds=Math.max(0,Math.ceil(((row?.last_at || 0)+30000-Date.now())/1000));
  return {date:day,petKey,fullness,hunger:100-fullness,mood:Math.min(100,40+exerciseMood+Math.min(5,interactions)*2),exerciseMood,exerciseMoodLimit:50,interactionMood:Math.min(5,interactions)*2,interactionMoodLimit:10,interactions,interactionLimit:5,cooldownSeconds};
}

export function interactPet(userId,petKey) {
  petByKey(userId,petKey);
  const db=getDb(userId);
  db.exec('BEGIN IMMEDIATE');
  try {
    const before=petCare(userId,petKey);
    const credited=before.interactions<5 && !before.cooldownSeconds;
    if(credited)db.prepare(`INSERT INTO pet_care_interactions(pet_key,date,count,last_at) VALUES(?,?,1,?)
      ON CONFLICT(pet_key,date) DO UPDATE SET count=count+1,last_at=excluded.last_at`).run(petKey,today(),Date.now());
    const care=petCare(userId,petKey);
    db.exec('COMMIT');
    return {care,credited,message:credited?'陪牠玩耍，心情 +2！':before.interactions>=5?'今天陪玩已達 +10 上限，繼續記錄運動才能提高心情！':`再等 ${before.cooldownSeconds} 秒就能增加心情。`};
  } catch(error) {db.exec('ROLLBACK');throw error;}
}
