// 2024 Adult Compendium of Physical Activities: https://pacompendium.com/
//
// group 只影響選單怎麼分區，不影響計算；沒標的一律當有氧。
// 球類的強度跟「怎麼打」差很多（競賽 vs 休閒），這裡一律取一般／休閒強度，
// 打得比較兇就自己填手錶的熱量，會直接採用而不估算。
export const CARDIO_METS={
  '快走':{met:4.8,label:'平地快走，約 5.6–6.3 km/h'},
  '跑步':{met:7.5,label:'一般慢跑、自選配速'},
  '騎腳踏車':{met:4,label:'休閒騎車，低於約 16 km/h'},
  '室內飛輪':{met:6.8,label:'一般固定式腳踏車'},
  '橢圓機':{met:5,label:'中等強度橢圓機'},
  '跳繩':{met:11,label:'一般跳繩'},
  '游泳':{met:5.8,label:'慢速休閒自由式'},
  '登階／樓梯':{met:6.8,label:'一般爬樓梯'},

  '籃球':{met:7.5,group:'球類',label:'一般打球（2024 版碼 15055）'},
  '足球':{met:7,group:'球類',label:'休閒踢球；正式比賽約 9.5'},
  '網球':{met:6.8,group:'球類',label:'一般中等強度；單打或比賽約 8.0'},
  '羽球':{met:5.5,group:'球類',label:'休閒單打或雙打（碼 15030）'},
  '桌球':{met:4,group:'球類',label:'一般對打'},
  '排球':{met:4,group:'球類',label:'一般打球；室內競賽約 6.0、沙灘約 8.0'},
  '棒壘球':{met:5,group:'球類',label:'一般打擊與守備（碼 15620）'},
  // 2024 成人版查不到匹克球，長者版的 5.3 用的是另一套基準（2.7 mL/kg/min）
  // 不能直接拿來比。這裡取介於桌球與網球雙打之間的估計值。
  '匹克球':{met:5.5,group:'球類',label:'休閒雙打（成人版無對應條目，為估計值）'},
  '高爾夫':{met:4.5,group:'球類',label:'一般打球；自己背球具約 4.3'},
};

/** 選單的分區順序。沒標 group 的都算有氧。 */
export const ACTIVITY_GROUPS=[
  {name:'有氧',items:Object.keys(CARDIO_METS).filter(k=>!CARDIO_METS[k].group)},
  {name:'球類',items:Object.keys(CARDIO_METS).filter(k=>CARDIO_METS[k].group==='球類')},
];

export const defaultMet=workout=>workout.category==='cardio' ? CARDIO_METS[workout.exercise]?.met || 4 : 3.5;
export function estimateEnergy(met,weight,minutes) {
  if(![met,weight,minutes].every(n=>Number.isFinite(Number(n)) && Number(n)>0)) return null;
  return Math.round(Number(met)*3.5*Number(weight)/200*Number(minutes)*10)/10;
}
