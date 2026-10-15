<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { api, todayStr } from '../api.js';
import { session } from '../auth.js';
import { confirmAction } from '../confirm.js';
import MuscleMap from './MuscleMap.vue';
import catalog from '../../../shared/workout-catalog.json';
const emit=defineEmits(['saved']);
const muscle=ref('chest'), equipment=ref('全部'), selectedId=ref('');
const choicesEl=ref(null);
const date=ref(todayStr()), note=ref(''), sets=ref([]), playing=ref(false), saving=ref(false), error=ref(''), success=ref('');
const editingId=ref(null), requestId=ref(crypto.randomUUID()), pending=ref(null), detailEl=ref(null);
const draftKey=()=>`fit.workout-draft.${session.user}`;
const exercise=computed(()=>catalog.exercises.find(e=>e.id===selectedId.value));
const muscleName=computed(()=>catalog.muscles.find(m=>m.id===muscle.value)?.name || '');
const choices=computed(()=>catalog.exercises.filter(e=>e.muscles.includes(muscle.value) && (equipment.value==='全部' || e.equipment===equipment.value)).sort((a,b)=>Number(b.muscles[0]===muscle.value)-Number(a.muscles[0]===muscle.value)));
const completed=computed(()=>sets.value.filter(s=>s.done));
const volume=computed(()=>exercise.value?.mode==='time' ? 0 : completed.value.reduce((sum,s)=>sum+Number(s.weight_kg || 0)*Number(s.reps || 0),0));
const freshSet=previous=>({weight_kg:previous?.weight_kg ?? 0,reps:previous?.reps ?? 10,duration_s:previous?.duration_s ?? 30,rpe:previous?.rpe ?? '',done:false});
const scrollTo=el=>el?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
async function selectMuscle(id) {
  muscle.value=id;equipment.value='全部';
  if(window.matchMedia('(max-width:679px)').matches) {await nextTick();scrollTo(choicesEl.value);}
}
function persistDraft() {
  try {
    if(!selectedId.value) {sessionStorage.removeItem(draftKey());return;}
    sessionStorage.setItem(draftKey(),JSON.stringify({selectedId:selectedId.value,date:date.value,note:note.value,sets:sets.value,requestId:requestId.value,editingId:editingId.value,pending:pending.value}));
  } catch {}
}
try {
  const saved=JSON.parse(sessionStorage.getItem(draftKey()) || 'null');
  if(saved && catalog.exercises.some(e=>e.id===saved.selectedId) && Array.isArray(saved.sets) && saved.sets.length<=50) {
    selectedId.value=saved.selectedId;date.value=saved.date;note.value=saved.note;sets.value=saved.sets;
    muscle.value=catalog.exercises.find(e=>e.id===saved.selectedId).muscles[0];
    requestId.value=saved.requestId || crypto.randomUUID();editingId.value=saved.editingId || null;pending.value=saved.pending || null;
  }
} catch {}
watch([selectedId,date,note,sets,requestId,editingId,pending],persistDraft,{deep:true});
watch(muscle,()=>{equipment.value='全部';});
function rowError(set,index) {
  const w=Number(set.weight_kg), value=Number(exercise.value?.mode==='time' ? set.duration_s : set.reps), rpe=Number(set.rpe || 0);
  if(!Number.isFinite(w) || w<0 || w>1000 || !Number.isFinite(value) || value<=0 || value>(exercise.value?.mode==='time'?86400:1000) || exercise.value?.mode!=='time' && !Number.isInteger(value) || !Number.isFinite(rpe) || rpe<0 || rpe>10) return `請確認第 ${index+1} 組的重量、${exercise.value?.mode==='time'?'秒數':'次數'}與 RPE`;
  return '';
}
function markSet(set,index) {error.value=rowError(set,index);if(error.value)set.done=false;}
async function selectExercise(item) {
  if(pending.value || saving.value) return;
  if(sets.value.some(s=>s.done) && !await confirmAction('切換動作會清除這份尚未儲存的組數，要繼續嗎？')) return;
  selectedId.value=item.id;sets.value=Array.from({length:3},()=>freshSet());playing.value=false;
  editingId.value=null;requestId.value=crypto.randomUUID();note.value='';date.value=todayStr();error.value='';success.value='';
  await nextTick();scrollTo(detailEl.value);
}
async function startEdit(workout) {
  const item=catalog.exercises.find(e=>e.name===workout.exercise);
  if(!item) return false;
  if(pending.value || saving.value) {error.value='請先完成目前的儲存或重試';return false;}
  if(sets.value.some(s=>s.done) && !await confirmAction('先離開目前尚未儲存的組數，改為編輯這份紀錄？')) return false;
  selectedId.value=item.id;muscle.value=item.muscles[0];editingId.value=workout.id;
  date.value=workout.date;note.value=workout.note;sets.value=workout.set_details.map(s=>({...s,done:true}));
  playing.value=false;error.value='';success.value='';requestId.value=crypto.randomUUID();
  await nextTick();scrollTo(detailEl.value);return true;
}
defineExpose({startEdit});
function addSet() {if(sets.value.length<50)sets.value.push(freshSet(sets.value.at(-1)));}
async function discard() {
  if(saving.value || pending.value) return;
  if(sets.value.some(s=>s.done) && !await confirmAction('清除尚未儲存的組數？已存入紀錄的資料會保留。')) return;
  selectedId.value='';sets.value=[];editingId.value=null;error.value='';playing.value=false;
}
async function saveSets() {
  if(!exercise.value || saving.value) return;
  error.value='';success.value='';
  if(!pending.value) {
    if(!completed.value.length) {error.value='先勾選至少一組已完成的訓練';return;}
    for(let i=0;i<sets.value.length;i++) if(sets.value[i].done && rowError(sets.value[i],i)) {error.value=rowError(sets.value[i],i);return;}
    pending.value={date:date.value,exercise:exercise.value.name,category:exercise.value.category,note:note.value,
      set_details:completed.value.map(s=>({weight_kg:Number(s.weight_kg),reps:exercise.value.mode==='time'?0:Number(s.reps),duration_s:exercise.value.mode==='time'?Number(s.duration_s):0,rpe:Number(s.rpe || 0)})),
      ...(!editingId.value ? {requestId:requestId.value} : {})};
    persistDraft();
  }
  saving.value=true;
  try {
    const saved=editingId.value ? await api.updateWorkout(editingId.value,pending.value) : await api.addWorkout(pending.value);
    const count=pending.value.set_details.length;
    pending.value=null;sets.value=[];selectedId.value='';editingId.value=null;requestId.value=crypto.randomUUID();
    success.value=`已儲存 ${saved.exercise}，共 ${count} 組`;persistDraft();emit('saved',saved);
  } catch(e) {error.value=e.message;if(e.status>=400 && e.status<500)pending.value=null;}
  finally {saving.value=false;}
}
</script>
<template>
  <section class="workout-explorer stack">
    <div class="explore-intro"><span class="eyebrow">動作探索</span><h2>從想練的部位開始</h2><p class="small muted">選部位、看示範，完成一組就勾一組。</p></div>
    <p v-if="success" class="success" role="status">✓ {{ success }}</p>
    <div class="explore-grid">
      <div class="card"><MuscleMap :model-value="muscle" @update:model-value="selectMuscle" /></div>
      <div ref="choicesEl" class="card exercise-list stack">
        <div class="spread"><div><span class="eyebrow">選擇動作</span><h3>{{ muscleName }}</h3></div><span class="badge">{{ choices.length }} 個動作</span></div>
        <label>器材<select v-model="equipment" aria-label="器材"><option v-for="name in ['全部','徒手','啞鈴','槓鈴','滑輪']" :key="name">{{ name }}</option></select></label>
        <button v-for="item in choices" :key="item.id" class="exercise-choice" :class="{chosen:selectedId===item.id}" :disabled="saving || !!pending" @click="selectExercise(item)">
          <span class="exercise-symbol" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><g v-if="item.equipment==='徒手'"><circle cx="12" cy="4" r="2" /><path d="M12 8v7m-5-5 5 2 5-2m-5 5-4 6m4-6 4 6" /></g><path v-else d="M3 8v8m4-10v12m10-12v12m4-10v8M7 12h10" /></svg></span><span><b>{{ item.name }}</b><small>{{ item.equipment }} · {{ item.muscles[0]===muscle ? '主要肌群' : '協同肌群' }}</small><small>{{ item.english }}</small></span><span aria-hidden="true">›</span>
        </button>
        <p v-if="!choices.length" class="small muted">這個部位還沒有此器材的動作，試試「全部」。</p>
        <p class="small muted list-foot">點選動作後，下方會出現教學影片與組數記錄。</p>
      </div>
    </div>
    <section v-if="exercise" ref="detailEl" class="card exercise-detail stack" aria-labelledby="exercise-title">
      <div class="spread"><div><span class="eyebrow">{{ editingId ? '編輯訓練' : '開始記錄' }}</span><h2 id="exercise-title">{{ exercise.name }}</h2><span class="badge">{{ exercise.equipment }}</span> <span class="badge">{{ exercise.english }}</span></div><button class="icon" :disabled="saving || !!pending" @click="discard">關閉</button></div>
      <div class="video-frame">
        <iframe v-if="playing" :key="exercise.videoId" :src="`https://www.youtube-nocookie.com/embed/${exercise.videoId}?playsinline=1&rel=0&autoplay=1`" :title="`${exercise.name} YouTube 教學`" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
        <button v-else class="video-preview" @click="playing=true" :aria-label="`播放${exercise.name}教學`"><img :src="`https://i.ytimg.com/vi/${exercise.videoId}/hqdefault.jpg`" :alt="`${exercise.name}教學預覽`" loading="lazy" /><span class="play-label">▶ 播放動作教學</span></button>
      </div>
      <div class="video-source small"><span class="muted">{{ exercise.channel }} · 英文教學</span><a :href="`https://www.youtube.com/watch?v=${exercise.videoId}`" target="_blank" rel="noopener noreferrer">到 YouTube 觀看 ↗</a><a :href="`https://www.youtube.com/results?search_query=${encodeURIComponent(exercise.name+' 中文 動作教學')}`" target="_blank" rel="noopener noreferrer">找中文教學 ↗</a></div>
      <form class="stack" @submit.prevent="saveSets">
        <div class="spread record-heading"><label>訓練日期<input v-model="date" type="date" required :disabled="saving || !!pending" /></label><b class="small" role="status">{{ completed.length }} / {{ sets.length }} 組完成</b></div>
        <div class="set-progress" role="progressbar" :aria-valuenow="completed.length" :aria-valuemin="0" :aria-valuemax="sets.length || 1" aria-label="已完成組數"><span :style="{width:`${sets.length ? completed.length/sets.length*100 : 0}%`}"></span></div>
        <p class="small muted set-hint">重量填實際使用的重量（徒手填 0）；完成後勾選，儲存時只記錄已勾選的組。</p>
        <div class="set-columns small muted"><span>組</span><span>重量 kg</span><span>{{ exercise.mode==='time'?'時間 秒':'次數' }}</span><span>RPE</span><span>完成</span></div>
        <div v-for="(set,index) in sets" :key="index" class="set-row" :class="{finished:set.done}">
          <b class="set-number">{{ index+1 }}</b>
          <input v-model="set.weight_kg" type="number" min="0" max="1000" step="0.5" inputmode="decimal" :aria-label="`第 ${index+1} 組重量`" :disabled="saving || !!pending || set.done" />
          <input v-if="exercise.mode==='time'" v-model="set.duration_s" type="number" min="1" max="86400" step="1" inputmode="numeric" :aria-label="`第 ${index+1} 組秒數`" :disabled="saving || !!pending || set.done" />
          <input v-else v-model="set.reps" type="number" min="1" max="1000" step="1" inputmode="numeric" :aria-label="`第 ${index+1} 組次數`" :disabled="saving || !!pending || set.done" />
          <input v-model="set.rpe" type="number" min="0" max="10" step="0.5" placeholder="—" inputmode="decimal" :aria-label="`第 ${index+1} 組 RPE`" :disabled="saving || !!pending || set.done" />
          <label class="done-box"><input v-model="set.done" type="checkbox" :aria-label="`第 ${index+1} 組完成`" :disabled="saving || !!pending" @change="markSet(set,index)" /></label>
        </div>
        <div class="row wrap"><button type="button" :disabled="saving || !!pending || sets.length>=50" @click="addSet">＋ 新增一組</button><button type="button" :disabled="saving || !!pending || sets.length<=1 || sets.at(-1)?.done" @click="sets.pop()">移除最後一組</button><span class="small muted">已完成總量 {{ Math.round(volume*10)/10 }} kg</span></div>
        <details class="small muted"><summary>RPE 是什麼？</summary><p>可選填的主觀費力程度，範圍 1–10；留空表示未評分。</p></details>
        <label>備註<input v-model="note" maxlength="1000" placeholder="這次訓練的感受、器材或其他紀錄" :disabled="saving || !!pending" /></label>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <p v-if="pending && !saving" class="small muted">儲存結果尚未確認，請重試同一份資料；重試不會重複新增。這份草稿會在此分頁暫存。</p>
        <button class="primary save-sets" type="submit" :disabled="saving || (!completed.length && !pending)">{{ saving ? '儲存中…' : pending ? '重試儲存' : editingId ? `更新 ${completed.length} 組紀錄` : `儲存已完成的 ${completed.length} 組` }}</button>
      </form>
    </section>
  </section>
</template>
<style scoped>
.explore-intro h2 {font-size:1.3rem;margin:.15rem 0;}.explore-intro p {margin:.25rem 0;}.eyebrow {font-size:.72rem;color:var(--muted);letter-spacing:.08em;}.explore-grid {display:grid;gap:.8rem;}.exercise-list h3 {font-size:1.15rem;margin:.2rem 0;}.exercise-list {align-self:start;}.exercise-choice {display:flex;align-items:center;text-align:left;gap:.7rem;padding:.8rem;min-height:76px;}.exercise-choice>span:nth-child(2) {flex:1;min-width:0;}.exercise-choice small {display:block;color:var(--muted);font-size:.72rem;margin-top:.2rem;}.exercise-choice.chosen {border-color:var(--accent);background:var(--accent-soft);}.exercise-symbol {display:grid;place-items:center;width:38px;height:38px;flex-shrink:0;border-radius:12px;background:var(--surface);font-size:1.6rem;color:var(--accent);}.list-foot {margin:.2rem 0 0;}.exercise-detail {scroll-margin-top:1rem;min-width:0;}.exercise-detail h2 {font-size:1.3rem;margin:.15rem 0 .5rem;}.video-frame {aspect-ratio:16/9;border-radius:14px;overflow:hidden;background:#30291f;}.video-frame iframe,.video-preview {display:block;width:100%;height:100%;border:0;}.video-preview {position:relative;padding:0;overflow:hidden;}.video-preview img {width:100%;height:100%;object-fit:cover;}.play-label {position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);white-space:nowrap;background:var(--accent);color:white;padding:.65rem 1rem;border-radius:30px;font-weight:650;box-shadow:0 3px 12px #0003;}.video-source {display:flex;flex-wrap:wrap;gap:.4rem 1rem;}.video-source a {color:var(--accent);text-decoration:underline;}.record-heading {align-items:end;}.record-heading label {max-width:180px;margin:0;}.set-progress {height:6px;border-radius:10px;background:var(--surface-2);overflow:hidden;}.set-progress span {display:block;height:100%;background:var(--accent);transition:width .2s;}.set-hint {margin:0;}.set-columns,.set-row {display:grid;grid-template-columns:24px minmax(0,1.2fr) minmax(0,1fr) minmax(0,.85fr) 40px;gap:.4rem;align-items:center;text-align:center;}.set-row {padding:.6rem .3rem;border-radius:12px;background:var(--surface-2);}.set-row input {padding:.55rem .2rem;text-align:center;min-width:0;}.set-row input:disabled {opacity:1;color:var(--text);-webkit-text-fill-color:var(--text);}.set-row.finished {background:var(--accent-soft);}.set-number {font-size:.85rem;}.done-box {margin:0;display:grid;place-items:center;min-height:42px;}.done-box input {width:23px;height:23px;cursor:pointer;}.success {padding:.7rem 1rem;background:var(--accent-soft);color:var(--accent);border-radius:12px;margin:0;}.save-sets {width:100%;}
@media(min-width:680px){.explore-grid {grid-template-columns:minmax(210px,.9fr) minmax(0,1.1fr);}}
@media(max-width:360px){.set-columns,.set-row {grid-template-columns:20px minmax(0,1fr) minmax(0,.9fr) minmax(0,.75fr) 32px;gap:.25rem;}.set-columns {font-size:.72rem;}}
</style>
