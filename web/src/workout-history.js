// Start a new session from saved values, never from saved completion or effort ratings.
export function previousWorkoutSets(workout,mode='reps'){
 const number=(v,fallback)=>Number.isFinite(Number(v)) && Number(v)>=0 ? Number(v):fallback;
 const count=Math.max(1,Math.min(50,Number(workout.sets)||3));
 const legacySeconds=workout.calorie_meta?.duration_source!=='average_sets' && workout.duration_min>0 ? workout.duration_min*60/count:30;
 const source=workout.set_details?.length ? workout.set_details.slice(0,50) : Array.from({length:count},()=>({weight_kg:workout.weight_kg,reps:workout.reps,duration_s:mode==='time'?legacySeconds:30}));
 return source.map(s=>({weight_kg:number(s.weight_kg,0),reps:number(s.reps,10)||10,duration_s:number(s.duration_s,30)||30,rpe:'',done:false}));
}
