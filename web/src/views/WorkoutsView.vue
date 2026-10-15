<script setup>
import { confirmAction } from '../confirm.js';
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { api, CATEGORIES } from '../api.js';
import { session } from '../auth.js';
import { useRoute } from 'vue-router';
import UserTabs from '../components/UserTabs.vue';
import WorkoutExplorer from '../components/WorkoutExplorer.vue';
import NutritionCalculator from '../components/NutritionCalculator.vue';
import CardioRecorder from '../components/CardioRecorder.vue';
import { workoutLabel, workoutEnergyLabel } from '../workout-metrics.js';
import catalog from '../../../shared/workout-catalog.json';
const explorer=ref(null),customExplorer=ref(null),cardioRecorder=ref(null),trainingMode=ref('strength');

const rows = ref([]);
const error = ref('');
const viewing = ref(session.user);                       // 正在看誰的紀錄
const isMine = computed(() => viewing.value === session.user);
const showForm = ref(false);
const route = useRoute();
const loading = ref(false);
// 切換使用者時可能有兩個請求同時在飛，而它們不保證按順序回來。
// 先發的後到的話，畫面會停在上一個人的資料上（手機特別明顯，延遲高）。
// 用序號標記，只採用最後一次發出的那個請求的結果。
let reqId = 0;

async function load() {
  const mine = ++reqId;
  error.value = '';
  loading.value = true;
  try {
    const data = await api.listWorkouts({ limit: 300, user: viewing.value });
    if (mine !== reqId) return;   // 已經有更新的請求，這份丟掉
    rows.value = data;
  } catch (e) {
    if (mine !== reqId) return;
    error.value = e.message;
  } finally {
    if (mine === reqId) loading.value = false;
  }
}
// 先清空再載入：不要讓上一個人的紀錄挂在畫面上等新資料
watch(viewing, () => { rows.value = []; cancel(); load(); });

async function edit(w) {
  if(w.category==='cardio') {trainingMode.value='cardio';showForm.value=false;await nextTick();await cardioRecorder.value?.startEdit(w);return;}
  if(w.set_details?.length && catalog.exercises.some(e=>e.name===w.exercise)) {
    trainingMode.value='strength';showForm.value=false;await nextTick();await explorer.value?.startEdit(w);return;
  }
  showForm.value=true;await nextTick();await customExplorer.value?.startEdit(w);
}

async function remove(w) {
  if (!await confirmAction(`刪除「${w.exercise}」？`)) return;
  await api.deleteWorkout(w.id);
  await load();
}

function cancel() {
  showForm.value = false;
}

/** 依日期分組，並算出當日總訓練量 */
const grouped = computed(() => {
  const map = new Map();
  for (const w of rows.value) {
    if (!map.has(w.date)) map.set(w.date, []);
    map.get(w.date).push(w);
  }
  return [...map.entries()].map(([date, items]) => ({
    date,
    items,
    calories:Math.round(items.reduce((a,w)=>a+Number(w.calories_kcal || 0),0)),
    missing:items.filter(w=>w.calories_kcal===null || w.calories_kcal===undefined).length,
    minutes: Math.round(items.reduce((a,w)=>a+Number(w.duration_min || 0),0)*10)/10,
    cardioMinutes:Math.round(items.filter(w=>w.category==='cardio').reduce((a,w)=>a+Number(w.duration_min || 0),0)*10)/10,
  }));
});

onMounted(load);
watch(() => route.query.new, v => { if (v === '1') { cancel(); showForm.value = true; } }, { immediate: true });
</script>

<template>
  <div class="stack">
    <div class="spread">
      <h1 style="margin:0">訓練</h1>
      <button v-if="isMine" @click="showForm ? cancel() : (showForm = true)">
        {{ showForm ? '返回動作探索' : '＋ 手動新增' }}
      </button>
    </div>

    <UserTabs v-model="viewing" />
    <NutritionCalculator v-if="isMine" />

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="isMine && !showForm" class="row training-modes" aria-label="訓練種類"><button :class="{active:trainingMode==='strength'}" :aria-pressed="trainingMode==='strength'" @click="trainingMode='strength'">肌力訓練</button><button :class="{active:trainingMode==='cardio'}" :aria-pressed="trainingMode==='cardio'" @click="trainingMode='cardio'">有氧運動</button></div>
    <WorkoutExplorer v-if="isMine && !showForm" v-show="trainingMode==='strength'" ref="explorer" @saved="load" />
    <CardioRecorder v-if="isMine && !showForm" v-show="trainingMode==='cardio'" ref="cardioRecorder" @saved="load" />

    <WorkoutExplorer v-if="showForm && isMine" ref="customExplorer" custom-only @close="cancel" @saved="cancel();load()" />

    <div v-if="loading" class="card empty">載入中…</div>
    <div v-else-if="!grouped.length" class="card empty">
      <template v-if="isMine">還沒有訓練紀錄。從上方選一個部位與動作，或使用手動新增。</template>
      <template v-else>對方還沒有訓練紀錄。</template>
    </div>

    <p v-if="grouped.length" class="small muted volume-help">訓練以累計消耗熱量（kcal）呈現。肌力未填時間時採每組平均 3 分鐘與一般強度估算；有氧依種類與總時間估算，不需記錄休息秒數。</p>
    <div v-for="g in grouped" :key="g.date" class="card">
      <div class="spread" style="margin-bottom:.4rem">
        <h3 style="margin:0">{{ g.date }}</h3>
        <span class="small muted">
          {{ g.items.length }} 項<template v-if="g.missing<g.items.length"> · 消耗約 {{ g.calories }} kcal</template><template v-if="g.missing"> · {{ g.missing }} 筆尚未估算</template><template v-if="g.minutes"> · 總時間 {{ g.minutes }} 分</template><template v-if="g.cardioMinutes">（有氧 {{ g.cardioMinutes }} 分）</template>
        </span>
      </div>
      <div class="workout-logs">
          <article v-for="w in g.items" :key="w.id" class="workout-log">
            <div class="spread log-title">
              <b>{{ w.exercise }}</b>
              <div v-if="isMine" class="row log-actions">
                <button class="icon" :aria-label="`編輯${w.exercise}`" @click="edit(w)">✎</button>
                <button class="icon" :aria-label="`刪除${w.exercise}`" @click="remove(w)">✕</button>
              </div>
            </div>
            <div class="row wrap small">
              <span class="badge">{{ CATEGORIES[w.category] || '其他' }}</span>
              <span v-if="w.source === 'ai'" class="badge ai">AI</span>
              <span>{{ workoutLabel(w) }}</span><span class="badge">{{ workoutEnergyLabel(w) }}</span>
            </div>
            <details v-if="w.set_details?.length" class="small set-history">
              <summary>{{ w.category==='cardio' ? '查看有氧時間' : '查看每組' }}</summary>
              <div v-for="(set,index) in w.set_details" :key="index" class="saved-set"><span>第 {{ index+1 }} 組</span><b>{{ set.duration_s ? `${set.duration_s} 秒` : `${set.weight_kg} kg × ${set.reps} 下` }}</b><span class="muted">{{ set.rpe ? `RPE ${set.rpe}` : '—' }}</span></div>
            </details>
            <p v-if="w.note" class="small muted log-note">{{ w.note }}</p>
          </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workout-logs {display:grid;gap:.6rem;}.workout-log {padding:.8rem 0;border-top:1px solid var(--border);}.workout-log:first-child {border-top:0;}.log-title {margin-bottom:.35rem;}.log-title b {overflow-wrap:anywhere;}.log-actions {flex-shrink:0;gap:.1rem;}.set-history {margin-top:.7rem;}.saved-set {display:flex;justify-content:space-between;gap:.7rem;padding:.55rem 0;border-bottom:1px solid var(--border);}.log-note {margin:.4rem 0 0;overflow-wrap:anywhere;}
.form { grid-template-columns: repeat(3, 1fr); }
.span2 { grid-column: span 3; }
@media (max-width: 560px) {
  .form { grid-template-columns: repeat(2, 1fr); }
  .span2 { grid-column: span 2; }
}

.training-modes {margin-bottom:.8rem;}.training-modes button {flex:1;min-height:44px;}.training-modes .active {background:var(--accent);border-color:var(--accent);color:white;}.volume-help {line-height:1.7;}
</style>
