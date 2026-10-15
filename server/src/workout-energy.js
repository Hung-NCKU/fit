import {defaultMet,estimateEnergy} from '../../shared/exercise-energy.js';
const invalid=message=>Object.assign(new Error(message),{status:400});
export function workoutEnergy(input,profileWeight,previous=null) {
  const oldMeta=typeof previous?.calorie_meta==='string' ? JSON.parse(previous.calorie_meta || '{}') : previous?.calorie_meta || {};
  const changed=['duration_min','exercise','category','sets','reps'].some(k=>input[k]!==previous?.[k]) || JSON.stringify(input.set_details)!==JSON.stringify(previous?.set_details);
  if(previous && !changed && input.calories_kcal===undefined && input.met===undefined) return {calories_kcal:previous.calories_kcal,calorie_meta:oldMeta};
  let minutes=Number(input.duration_min || 0);
  let durationSource='recorded';
  if(!Number.isFinite(minutes) || minutes<0 || minutes>1440) throw invalid('運動時間需大於 0 且不超過 1440 分鐘，未知可留空');
  if(input.calories_kcal!==undefined && input.calories_kcal!==null && input.calories_kcal!=='') {
    const kcal=Number(input.calories_kcal);
    if(!Number.isFinite(kcal) || kcal<0 || kcal>20000) throw invalid('裝置熱量需在 0–20000 kcal 之間');
    return {calories_kcal:Math.round(kcal*10)/10,calorie_meta:{source:'reported'}};
  }
  if(!minutes && input.category!=='cardio') {
    const count=input.set_details?.length ? input.set_details.filter(s=>s.reps>0 || s.duration_s>0).length : Number(input.reps)>0 ? Number(input.sets)||0 : 0;
    if(count>0) {minutes=count*3;durationSource='average_sets';}
  }
  const met=Number(input.met ?? (previous && (input.exercise!==previous.exercise || input.category!==previous.category) ? defaultMet(input) : oldMeta.met ?? defaultMet(input)));
  if(!Number.isFinite(met) || met<1 || met>20) throw invalid('MET 需在 1–20 之間');
  const weight=Number(oldMeta.weight_kg || profileWeight);
  const kcal=estimateEnergy(met,weight,minutes);
  return {calories_kcal:kcal,calorie_meta:kcal===null ? {} : {source:'estimated',duration_source:durationSource,met,weight_kg:weight,minutes,formula:'MET*3.5*kg/200*min',version:1}};
}
