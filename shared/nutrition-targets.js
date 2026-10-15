const invalid=message=>Object.assign(new Error(message),{status:400});
const number=(value,label,min,max)=>{const n=Number(value);if(value==='' || value==null || !Number.isFinite(n) || n<min || n>max)throw invalid(`${label}需介於 ${min}–${max}`);return n;};
const optional=(value,label,min,max)=>value==='' || value==null ? null : number(value,label,min,max);
export function nutritionTargets(input) {
 const sex=input.sex;if(!['male','female'].includes(sex))throw invalid('請選擇計算公式使用的生理性別');
 const age=number(input.age,'年齡',18,100),height_cm=number(input.height_cm,'身高',100,230),weight_kg=number(input.weight_kg,'體重',25,250),activity=number(input.activity,'活動係數',1.2,1.9);
 const goal=input.goal;if(!['fat_loss','maintain','muscle_gain'].includes(goal))throw invalid('請選擇目標體態');
 const body_fat_pct=optional(input.body_fat_pct,'目前體脂',3,65),goal_body_fat_pct=optional(input.goal_body_fat_pct,'目標體脂',sex==='male'?10:18,50);
 let goal_weight_kg=optional(input.goal_weight_kg,'目標體重',25,250),derivedWeight=false;
 if(goal_weight_kg===null && goal_body_fat_pct!==null) {
  if(body_fat_pct===null)throw invalid('只填目標體脂時，請補目前體脂，才能估算參考體重');
  goal_weight_kg=Math.round(weight_kg*(1-body_fat_pct/100)/(1-goal_body_fat_pct/100)*10)/10;derivedWeight=true;
 }
 if(goal_weight_kg===null)goal_weight_kg=weight_kg;
 goal_weight_kg=number(goal_weight_kg,'推估目標體重',25,250);
 const bmi=weight_kg/(height_cm/100)**2,targetBmi=goal_weight_kg/(height_cm/100)**2;
 if(goal==='fat_loss' && (bmi<18.5 || targetBmi<18.5))throw invalid('目前或目標體重偏低，請改選維持／增肌，或與營養師討論個別目標');
 if(goal==='fat_loss' && goal_weight_kg>weight_kg+.1)throw invalid('目標體重高於目前體重，請改選增肌或維持');
 if(goal==='muscle_gain' && goal_weight_kg<weight_kg-.1)throw invalid('目標體重低於目前體重，請改選減脂或維持／體態重組');
 const bmr=10*weight_kg+6.25*height_cm-5*age+(sex==='male'?5:-161),tdee=bmr*activity;
 const adjustment=goal==='fat_loss'?-Math.min(300,tdee*.1):goal==='muscle_gain'?200:0;
 const target_kcal=Math.round(Math.max(tdee+adjustment,bmr,sex==='male'?1500:1200)/10)*10;
 const proteinFactor=goal==='fat_loss'?2:goal==='muscle_gain'?1.8:1.6;
 const target_protein_g=Math.round(Math.min(Math.min(weight_kg,goal_weight_kg)*proteinFactor,target_kcal*.35/4));
 const target_fat_g=Math.round(target_kcal*.25/9),target_carb_g=Math.max(0,Math.round((target_kcal-target_protein_g*4-target_fat_g*9)/4));
 return {profile:{sex,age,height_cm,weight_kg,activity,goal,goal_weight_kg,body_fat_pct,goal_body_fat_pct},bmr:Math.round(bmr),tdee:Math.round(tdee),adjustment:Math.round(target_kcal-tdee),derivedWeight,bmi:Math.round(bmi*10)/10,target_kcal,target_protein_g,target_carb_g,target_fat_g,version:1};
}
