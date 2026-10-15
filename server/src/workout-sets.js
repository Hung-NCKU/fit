const invalid=message=>Object.assign(new Error(message),{status:400});
export function normalizeSets(details) {
  if(!Array.isArray(details) || !details.length || details.length>50) throw invalid('請記錄 1 至 50 組訓練');
  return details.map((set,index)=>{
    const read=(key,max,integer=false)=>{
      const value=Number(set?.[key] ?? 0);
      if(!Number.isFinite(value) || value<0 || value>max || integer && !Number.isInteger(value)) throw invalid(`第 ${index+1} 組的數值無效`);
      return value;
    };
    const row={weight_kg:read('weight_kg',1000),reps:read('reps',1000,true),duration_s:read('duration_s',86400),rpe:read('rpe',10)};
    if((row.reps>0)===(row.duration_s>0)) throw invalid(`第 ${index+1} 組請填次數或時間其中一項`);
    return row;
  });
}
export const decodeWorkout=row=>row ? {...row,set_details:JSON.parse(row.set_details || '[]'),calorie_meta:JSON.parse(row.calorie_meta || '{}')} : row;
export const workoutVolumeSql="CASE WHEN category='cardio' THEN 0 WHEN json_array_length(set_details)>0 THEN (SELECT COALESCE(SUM(json_extract(value,'$.weight_kg')*json_extract(value,'$.reps')),0) FROM json_each(workouts.set_details)) ELSE sets*reps*weight_kg END";

export function normalizeCardio(input,details) {
  if(input.category!=='cardio') return input;
  const minutes=details.length ? details.reduce((sum,s)=>sum+s.duration_s,0)/60 : Number(input.duration_min);
  if(!Number.isFinite(minutes) || minutes<=0 || minutes>1440 || details.some(s=>s.reps>0 || s.weight_kg>0)) throw invalid('有氧請記錄大於 0 且不超過 1440 分鐘的實際時間，不填負重與次數');
  return {...input,sets:details.length,reps:0,weight_kg:0,duration_min:minutes};
}
