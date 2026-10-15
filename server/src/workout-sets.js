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
export const decodeWorkout=row=>row ? {...row,set_details:JSON.parse(row.set_details || '[]')} : row;
export const workoutVolumeSql="CASE WHEN json_array_length(set_details)>0 THEN (SELECT COALESCE(SUM(json_extract(value,'$.weight_kg')*json_extract(value,'$.reps')),0) FROM json_each(workouts.set_details)) ELSE sets*reps*weight_kg END";
