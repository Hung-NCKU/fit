export function careReminder(care) {
  if(!care)return '';
  const messages=[];
  if(care.fullness<40)messages.push('主人，該吃飯了，記得記錄喔！');
  if(care.mood<70)messages.push(care.interactions>=care.interactionLimit || care.interactionMood>=care.interactionMoodLimit
    ? '陪玩加成滿了，一起去運動吧！'
    : care.periodDone ? '這個餐期已陪玩，一起去運動吧！' : '陪我玩或一起去運動吧！');
  return messages.join(' ');
}
