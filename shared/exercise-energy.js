// 2024 Adult Compendium of Physical Activities: https://pacompendium.com/
export const CARDIO_METS={
  '快走':{met:4.8,label:'平地快走，約 5.6–6.3 km/h'},
  '跑步':{met:7.5,label:'一般慢跑、自選配速'},
  '騎腳踏車':{met:4,label:'休閒騎車，低於約 16 km/h'},
  '室內飛輪':{met:6.8,label:'一般固定式腳踏車'},
  '橢圓機':{met:5,label:'中等強度橢圓機'},
  '跳繩':{met:11,label:'一般跳繩'},
  '游泳':{met:5.8,label:'慢速休閒自由式'},
  '登階／樓梯':{met:6.8,label:'一般爬樓梯'},
};
export const defaultMet=workout=>workout.category==='cardio' ? CARDIO_METS[workout.exercise]?.met || 4 : 3.5;
export function estimateEnergy(met,weight,minutes) {
  if(![met,weight,minutes].every(n=>Number.isFinite(Number(n)) && Number(n)>0)) return null;
  return Math.round(Number(met)*3.5*Number(weight)/200*Number(minutes)*10)/10;
}
