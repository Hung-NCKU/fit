export const workoutVolume=workout=>workout.set_details?.length
  ? workout.set_details.reduce((sum,set)=>sum+set.weight_kg*set.reps,0)
  : workout.sets*workout.reps*workout.weight_kg;
export function workoutLabel(workout) {
  if(workout.set_details?.length) {
    const reps=workout.set_details.reduce((sum,set)=>sum+set.reps,0);
    const seconds=workout.set_details.reduce((sum,set)=>sum+set.duration_s,0);
    return `${workout.set_details.length} 組`+(reps ? ` · ${reps} 下` : '')+(seconds ? ` · ${seconds} 秒` : '');
  }
  return [workout.sets ? `${workout.sets}×${workout.reps}` : '',workout.weight_kg ? `@${workout.weight_kg}kg` : '',workout.duration_min ? `${workout.duration_min} 分` : '',workout.rpe ? `RPE ${workout.rpe}` : ''].filter(Boolean).join(' · ');
}
