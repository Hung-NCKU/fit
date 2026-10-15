export const workoutVolume=workout=>workout.category==='cardio' ? 0 : workout.set_details?.length
  ? workout.set_details.reduce((sum,set)=>sum+set.weight_kg*set.reps,0)
  : workout.sets*workout.reps*workout.weight_kg;
export function workoutLabel(workout) {
  if(workout.category==='cardio') {
    const minutes=workout.set_details?.length ? workout.set_details.reduce((sum,s)=>sum+Number(s.duration_s || 0),0)/60 : Number(workout.duration_min || 0);
    return '有氧 '+Math.round(minutes*10)/10+' 分鐘'+(workout.rpe ? ' · RPE '+workout.rpe : '');
  }
  if(workout.set_details?.length) {
    const reps=workout.set_details.reduce((sum,set)=>sum+set.reps,0);
    const seconds=workout.set_details.reduce((sum,set)=>sum+set.duration_s,0);
    return `${workout.set_details.length} 組`+(reps ? ` · ${reps} 下` : '')+(seconds ? ` · ${seconds} 秒` : '');
  }
  return [workout.sets ? `${workout.sets}×${workout.reps}` : '',workout.weight_kg ? `@${workout.weight_kg}kg` : '',workout.duration_min ? `${workout.duration_min} 分` : '',workout.rpe ? `RPE ${workout.rpe}` : ''].filter(Boolean).join(' · ');
}

export function workoutEnergyLabel(w) {
  return w.calories_kcal===null || w.calories_kcal===undefined ? '尚未估算熱量' : Math.round(Number(w.calories_kcal))+' kcal'+(w.calorie_meta?.source==='reported' ? '（裝置／手動）' : '（估算）');
}
