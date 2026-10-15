<script setup>
import {ref,computed,watch} from 'vue';
import {api} from '../api.js';
import {nutritionTargets} from '../../../shared/nutrition-targets.js';
const open=ref(false),loading=ref(false),saving=ref(false),error=ref(''),success=ref(''),form=ref(null),result=ref(null);
const goals={fat_loss:'減脂・線條更明顯',maintain:'維持／體態重組',muscle_gain:'增肌・增加肌肉量'};
const activities=[{value:1.2,label:'久坐，少運動'},{value:1.375,label:'輕度活動，每週約 1–3 天'},{value:1.55,label:'中度活動，每週約 3–5 天'},{value:1.725,label:'高度活動，每週約 6–7 天'},{value:1.9,label:'高勞動量＋高訓練量'}];
watch(open,async value=>{
 if(!value || form.value || loading.value)return;
 loading.value=true;error.value='';
 try {const p=await api.getProfile();form.value={sex:p.sex,age:p.age,height_cm:p.height_cm,weight_kg:p.weight_kg,activity:p.activity,goal:p.goal,goal_weight_kg:p.goal_weight_kg,body_fat_pct:p.body_fat_pct ?? '',goal_body_fat_pct:p.goal_body_fat_pct ?? ''};}
 catch(e){error.value=e.message;}finally{loading.value=false;}
});
watch(form,()=>{result.value=null;success.value='';},{deep:true});
const numbers=computed(()=>result.value?[['每日熱量',result.value.target_kcal,'kcal'],['蛋白質',result.value.target_protein_g,'g'],['碳水化合物',result.value.target_carb_g,'g'],['脂肪',result.value.target_fat_g,'g']]:[]);
function calculate(){error.value='';success.value='';try {result.value=nutritionTargets(form.value);}catch(e){result.value=null;error.value=e.message;}}
async function apply(){if(!result.value || saving.value)return;saving.value=true;error.value='';try{const saved=await api.saveNutritionTargets(form.value);result.value=saved.calculation;success.value='已套用至個人檔案與每日飲食目標，教練與小屋也會使用新目標。';}catch(e){error.value=e.message;}finally{saving.value=false;}}
</script>
<template>
 <section class="card stack nutrition-calculator">
  <div class="spread"><div><span class="eyebrow">目標規劃</span><h2>熱量與營養目標計算</h2><p class="small muted">依身體資料、目標體態／體重／體脂，估算每天該吃多少。</p></div><button :disabled="saving" :aria-expanded="open" @click="open=!open">{{ open?'收起計算':'設定我的目標' }}</button></div>
  <p v-if="loading" class="small" role="status">讀取身體資料中…</p>
  <form v-if="open && form" class="stack" @submit.prevent="calculate">
   <fieldset class="calculator-fields" :disabled="saving">
    <label>公式使用的生理性別<select v-model="form.sex" aria-label="公式使用的生理性別"><option value="male">男性</option><option value="female">女性</option></select></label>
    <label>年齡<input v-model="form.age" type="number" min="18" max="100" required /></label>
    <label>身高（cm）<input v-model="form.height_cm" type="number" min="100" max="230" step="0.1" required /></label>
    <label>目前體重（kg）<input v-model="form.weight_kg" type="number" min="25" max="250" step="0.1" required /></label>
    <label>目前體脂（%，選填）<input v-model="form.body_fat_pct" type="number" min="3" max="65" step="0.1" placeholder="不知道可留空" /></label>
    <label>日常活動量<select v-model="form.activity" aria-label="日常活動量"><option v-for="a in activities" :key="a.value" :value="a.value">{{ a.label }}</option></select></label>
    <label>目標體態<select v-model="form.goal" aria-label="目標體態"><option v-for="(label,key) in goals" :key="key" :value="key">{{ label }}</option></select></label>
    <label>目標體重（kg，選填）<input v-model="form.goal_weight_kg" type="number" min="25" max="250" step="0.1" placeholder="留空可依體脂估算" /></label>
    <label>目標體脂（%，選填）<input v-model="form.goal_body_fat_pct" type="number" :min="form.sex==='male'?10:18" max="50" step="0.1" placeholder="留空也可計算" /></label>
   </fieldset>
   <p class="small muted">活動量已包含平常訓練，不再把訓練頁的消耗熱量全部加回。此計算器供成人使用；懷孕、哺乳或需治療性飲食者，請使用醫療團隊訂定的目標。</p>
   <button class="primary" type="submit" :disabled="saving">計算營養目標</button>
  </form>
  <p v-if="open && error" class="error" role="alert">{{ error }}</p>
  <div v-if="open && result" class="stack nutrition-result" aria-label="營養目標估算結果">
   <div class="target-grid"><div v-for="[label,value,unit] in numbers" :key="label"><span class="small muted">{{ label }}</span><b>{{ value }} <small>{{ unit }}</small></b></div></div>
   <p class="small">靜息代謝約 {{ result.bmr }} kcal · 維持熱量約 {{ result.tdee }} kcal。{{ goals[result.profile.goal] }}：較維持量 {{ result.adjustment>=0?'增加':'減少' }} {{ Math.abs(result.adjustment) }} kcal。</p>
   <p class="small">參考目標體重 {{ result.profile.goal_weight_kg }} kg<template v-if="result.profile.goal_body_fat_pct!==null"> · 目標體脂 {{ result.profile.goal_body_fat_pct }}%</template>。</p>
   <p v-if="result.derivedWeight" class="small muted">參考體重由目前瘦體重不變估算；實際增肌或流失肌肉時會不同。</p>
   <p class="small muted">這是起始估算，不保證外觀或達成日期；建議觀察 2–4 週的體重趨勢與訓練表現後再調整。體脂目標用於追蹤，不代表可局部減脂。</p>
   <details class="small"><summary>計算依據</summary><p>使用 Mifflin–St Jeor 靜息代謝 × 活動係數；減脂先採約 10% 缺口（最多 300 kcal），增肌 +200 kcal，維持不加減。蛋白質依較低的目前／目標體重，每公斤約 1.6–2.0 g；脂肪約 25%，其餘分配碳水。這些是本 App 的起始設定。</p><a href="https://pubmed.ncbi.nlm.nih.gov/2305711/" target="_blank" rel="noopener noreferrer">代謝公式來源 ↗</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/" target="_blank" rel="noopener noreferrer">運動蛋白質參考 ↗</a></details>
   <button class="primary" :disabled="saving" @click="apply">{{ saving?'套用中…':'套用到每日飲食目標' }}</button>
  </div>
  <p v-if="open && success" class="nutrition-success small" role="status">{{ success }}</p>
 </section>
</template>
<style scoped>
.nutrition-calculator h2{font-size:1.1rem;margin:.2rem 0}.nutrition-calculator p{margin:.25rem 0;line-height:1.7}.calculator-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem;border:0;padding:0;margin:0;min-width:0}.calculator-fields input,.calculator-fields select{width:100%;min-width:0}.nutrition-result{padding:1rem;background:var(--accent-soft);border-radius:14px}.target-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem}.target-grid b{display:block;font-size:1.4rem;color:var(--accent)}.target-grid small{font-size:.75rem}.nutrition-success{color:var(--accent)}@media(max-width:380px){.calculator-fields{grid-template-columns:1fr}.nutrition-calculator>.spread{align-items:flex-start}.nutrition-calculator>.spread button{flex-shrink:0;padding:.5rem}}
</style>
