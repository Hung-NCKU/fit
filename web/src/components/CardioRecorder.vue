<script setup>
import {COIN_RULES as coins} from '../../../shared/coin-rules.js';
import {ref,watch,nextTick} from 'vue';
import {api,todayStr} from '../api.js';
import {session} from '../auth.js';
import {confirmAction} from '../confirm.js';
const emit=defineEmits(['saved']);
const activities=['快走','跑步','騎腳踏車','室內飛輪','橢圓機','跳繩','游泳','登階／樓梯'];
const empty=()=>({exercise:'快走',date:todayStr(),minutes:30,rpe:'',note:'',reported:''});
const form=ref(empty()),editingId=ref(null),requestId=ref(crypto.randomUUID());
const pending=ref(null),saving=ref(false),error=ref(''),success=ref(''),root=ref(null);
const draftKey=()=>`fit.cardio-draft.${session.user}`;
try {
  const saved=JSON.parse(sessionStorage.getItem(draftKey()) || 'null');
  if(saved?.form) {form.value={...empty(),...saved.form};editingId.value=saved.editingId || null;requestId.value=saved.requestId || crypto.randomUUID();pending.value=saved.pending || null;}
} catch {}
watch([form,editingId,requestId,pending],()=>{
  try {sessionStorage.setItem(draftKey(),JSON.stringify({form:form.value,editingId:editingId.value,requestId:requestId.value,pending:pending.value}));}catch{}
},{deep:true});
async function startEdit(workout) {
  if(pending.value || saving.value) {error.value='請先確認上一筆儲存結果，再編輯其他紀錄';return;}
  form.value={exercise:workout.exercise,date:workout.date,minutes:workout.duration_min,rpe:workout.rpe || '',note:workout.note || '',reported:workout.calorie_meta?.source==='reported' ? workout.calories_kcal : ''};
  editingId.value=workout.id;error.value='';success.value='';
  await nextTick();root.value?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});
}
defineExpose({startEdit});
async function cancelEdit() {
  if(pending.value || saving.value || !await confirmAction('放棄這次有氧紀錄編輯？')) return;
  form.value=empty();editingId.value=null;requestId.value=crypto.randomUUID();error.value='';
}
async function save() {
  if(saving.value) return;
  error.value='';success.value='';
  if(!pending.value) {
    const minutes=Number(form.value.minutes),rpe=Number(form.value.rpe || 0);
    if(!form.value.exercise.trim() || form.value.exercise.trim().length>120 || !Number.isFinite(minutes) || minutes<=0 || minutes>1440 || !Number.isFinite(rpe) || rpe<0 || rpe>10) {error.value='請填活動名稱、有效時間與 RPE（可留空）';return;}
    pending.value={date:form.value.date,exercise:form.value.exercise.trim(),category:'cardio',rpe,note:form.value.note,calories_kcal:form.value.reported==='' ? null : Number(form.value.reported),
      set_details:[{weight_kg:0,reps:0,duration_s:minutes*60,rpe}],...(!editingId.value ? {requestId:requestId.value} : {})};
  }
  saving.value=true;
  try {
    const saved=editingId.value ? await api.updateWorkout(editingId.value,pending.value) : await api.addWorkout(pending.value);
    success.value=`已記錄 ${saved.exercise} ${Math.round(saved.duration_min*10)/10} 分鐘`;
    pending.value=null;editingId.value=null;requestId.value=crypto.randomUUID();form.value={...empty(),exercise:saved.exercise};
    emit('saved',saved);
  } catch(e) {error.value=e.message;if(e.status>=400 && e.status<500)pending.value=null;}
  finally {saving.value=false;}
}
</script>
<template>
  <section ref="root" class="card stack cardio-recorder" aria-labelledby="cardio-title">
    <div><span class="small muted">依活動種類與總時間，估算消耗熱量</span><h2 id="cardio-title">{{ editingId ? '編輯有氧紀錄' : '今天做了哪些有氧？' }}</h2><p class="small muted">選擇活動，填入實際完成的總時間；其他活動也能直接輸入名稱。當天累積 15 分鐘可得 +{{ coins.cardio }} 代幣，同日限一次。</p></div>
    <p v-if="success" class="cardio-success" role="status">✓ {{ success }}</p>
    <form class="stack" @submit.prevent="save">
      <fieldset class="stack" :disabled="saving || !!pending">
        <div class="activity-options"><button v-for="activity in activities" :key="activity" type="button" :class="{selected:form.exercise===activity}" :aria-pressed="form.exercise===activity" @click="form.exercise=activity">{{ activity }}</button></div>
        <label>活動名稱<input v-model="form.exercise" required maxlength="120" placeholder="例如：跑步、健走、划船機" /></label>
        <div class="cardio-fields"><label>日期<input v-model="form.date" type="date" required /></label><label>時間（分鐘）<input v-model="form.minutes" type="number" min="0.5" max="1440" step="0.5" inputmode="decimal" required /></label></div>
        <label>手錶／器材熱量（kcal，選填）<input v-model="form.reported" type="number" min="0" max="20000" placeholder="留空自動用平均強度估算" /></label>
        <label>RPE（選填）<input v-model="form.rpe" type="number" min="0" max="10" step="0.5" inputmode="decimal" placeholder="1–10，留空表示未評分" /></label>
        <label>備註（選填）<input v-model="form.note" maxlength="1000" placeholder="例如：距離、速度、器材阻力或感受" /></label>
      </fieldset>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-if="pending && !saving" class="small muted">儲存結果尚未確認，請重試同一筆；重試不會重複新增。</p>
      <div class="row wrap"><button v-if="editingId" type="button" :disabled="saving || !!pending" @click="cancelEdit">取消編輯</button><button class="primary" type="submit" :disabled="saving">{{ saving ? '儲存中…' : pending ? '重試儲存有氧' : editingId ? '更新有氧紀錄' : '儲存已完成的有氧' }}</button></div>
    </form>
  </section>
</template>
<style scoped>
.cardio-recorder {scroll-margin-top:1rem;}.cardio-recorder h2 {font-size:1.2rem;margin:.25rem 0;}.cardio-recorder p {line-height:1.6;margin:.2rem 0;}.cardio-recorder fieldset {border:0;padding:0;margin:0;min-width:0;}.activity-options {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem;}.activity-options button {min-height:44px;}.activity-options .selected {background:var(--accent-soft);color:var(--accent);border-color:var(--accent);font-weight:650;}.cardio-fields {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.7rem;}.cardio-fields input {min-width:0;width:100%;}.cardio-success {padding:.7rem;background:var(--accent-soft);color:var(--accent);border-radius:10px;}@media(max-width:360px){.cardio-fields {grid-template-columns:1fr;}}
</style>
