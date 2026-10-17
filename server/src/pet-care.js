import {getDb} from './db.js';
import {dailySummary,today} from './records.js';
import {petByKey,exerciseRewardProgress} from './pet.js';
import {playPeriod} from '../../shared/pet-play-period.js';

export function petCare(userId,petKey,now=new Date()) {
  petByKey(userId,petKey);
  const day=today(), summary=dailySummary(userId,day), exercise=exerciseRewardProgress(userId,day),period=playPeriod(now);
  const db=getDb(userId),slots=db.prepare('SELECT slot,amount FROM pet_care_play_slots WHERE pet_key=? AND date=?').all(petKey,period.day);
  // Preserve already granted legacy mood; never retroactively deduct it or grant a new +10 on upgrade.
  const legacy=db.prepare('SELECT count FROM pet_care_interactions WHERE pet_key=? AND date=?').get(petKey,period.day);
  const legacyMood=Math.min(5,legacy?.count || 0)*2;
  const interactionMood=Math.min(10,legacyMood+slots.reduce((sum,s)=>sum+s.amount,0));
  const periodDone=slots.some(s=>s.slot===period.slot),canInteract=!periodDone && interactionMood<10;
  const fullness=Math.min(100,Math.max(0,Math.round(summary.nutrition.kcal/Math.max(1,summary.targets.kcal)*100)));
  const exerciseMood=Math.min(50,exercise.strengthSets*3+Math.floor(exercise.cardioMinutes/5)*2);
  return {date:day,petKey,fullness,hunger:100-fullness,mood:Math.min(100,40+exerciseMood+interactionMood),exerciseMood,exerciseMoodLimit:50,interactionMood,interactionMoodLimit:10,interactions:slots.length,interactionLimit:3,playDate:period.day,playPeriod:period.slot,playPeriodLabel:period.label,periodDone,canInteract,nextPeriodAt:period.nextPeriodAt,cooldownSeconds:canInteract?0:Math.max(0,Math.ceil((Date.parse(period.nextPeriodAt)-now.getTime())/1000))};
}

export function interactPet(userId,petKey) {
  petByKey(userId,petKey);
  const db=getDb(userId);db.exec('BEGIN IMMEDIATE');
  try {
    const now=new Date(),period=playPeriod(now),before=petCare(userId,petKey,now);
    const amount=before.canInteract?Math.min(period.amount,10-before.interactionMood):0;
    const credited=amount>0;
    if(credited)db.prepare('INSERT INTO pet_care_play_slots(pet_key,date,slot,amount) VALUES (?,?,?,?)').run(petKey,period.day,period.slot,amount);
    const care=petCare(userId,petKey,now);db.exec('COMMIT');
    return {care,credited,message:credited?`${period.label}陪玩，心情 +${amount}！`:before.interactionMood>=10?'今日陪玩加成已滿 +10；仍可互動，其他心情加成需透過運動取得。':`${period.label}時段已陪玩；下個餐期再來，現在仍可點選或拎起寵物互動。`};
  } catch(error) {db.exec('ROLLBACK');throw error;}
}
