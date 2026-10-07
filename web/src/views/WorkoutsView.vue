<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { api, todayStr, CATEGORIES } from '../api.js';
import { session } from '../auth.js';
import UserTabs from '../components/UserTabs.vue';

const rows = ref([]);
const error = ref('');
const viewing = ref(session.user);                       // 正在看誰的紀錄
const isMine = computed(() => viewing.value === session.user);
const showForm = ref(false);
const saving = ref(false);

const blank = () => ({
  date: todayStr(), exercise: '', category: 'legs',
  sets: 3, reps: 10, weight_kg: 0, duration_min: 0, rpe: 7, note: '',
});
const form = ref(blank());
const editingId = ref(null);

async function load() {
  error.value = '';
  try { rows.value = await api.listWorkouts({ limit: 300, user: viewing.value }); }
  catch (e) { error.value = e.message; }
}
watch(viewing, () => { cancel(); load(); });

async function save() {
  if (!form.value.exercise.trim()) return;
  saving.value = true;
  error.value = '';
  try {
    if (editingId.value) await api.updateWorkout(editingId.value, form.value);
    else await api.addWorkout(form.value);
    form.value = blank();
    editingId.value = null;
    showForm.value = false;
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}

function edit(w) {
  form.value = { ...w };
  editingId.value = w.id;
  showForm.value = true;
}

async function remove(w) {
  if (!confirm(`刪除「${w.exercise}」？`)) return;
  await api.deleteWorkout(w.id);
  await load();
}

function cancel() {
  form.value = blank();
  editingId.value = null;
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
    volume: Math.round(items.reduce((a, w) => a + w.sets * w.reps * w.weight_kg, 0)),
    minutes: Math.round(items.reduce((a, w) => a + w.duration_min, 0)),
  }));
});

onMounted(load);
</script>

<template>
  <div class="stack">
    <div class="spread">
      <h1 style="margin:0">訓練紀錄</h1>
      <button v-if="isMine" class="primary" @click="showForm ? cancel() : (showForm = true)">
        {{ showForm ? '取消' : '＋ 新增' }}
      </button>
    </div>

    <UserTabs v-model="viewing" />

    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="showForm && isMine" class="card">
      <div class="grid form">
        <div><label>日期</label><input v-model="form.date" type="date" /></div>
        <div><label>部位</label>
          <select v-model="form.category">
            <option v-for="(zh, k) in CATEGORIES" :key="k" :value="k">{{ zh }}</option>
          </select>
        </div>
        <div class="span2"><label>動作</label>
          <input v-model="form.exercise" placeholder="例如：槓鈴深蹲" @keyup.enter="save" />
        </div>
        <div><label>組數</label><input v-model.number="form.sets" type="number" min="0" /></div>
        <div><label>次數</label><input v-model.number="form.reps" type="number" min="0" /></div>
        <div><label>重量 (kg)</label><input v-model.number="form.weight_kg" type="number" min="0" step="0.5" /></div>
        <div><label>時間 (分)</label><input v-model.number="form.duration_min" type="number" min="0" /></div>
        <div><label>RPE 1-10</label><input v-model.number="form.rpe" type="number" min="0" max="10" step="0.5" /></div>
        <div class="span2"><label>備註</label><input v-model="form.note" placeholder="體感、狀況…" /></div>
      </div>
      <div class="row" style="margin-top:.8rem; justify-content:flex-end">
        <button class="ghost" @click="cancel">取消</button>
        <button class="primary" :disabled="saving || !form.exercise.trim()" @click="save">
          {{ editingId ? '更新' : '儲存' }}
        </button>
      </div>
    </div>

    <div v-if="!grouped.length" class="card empty">
      <template v-if="isMine">還沒有訓練紀錄。可以直接在「教練」頁說「我今天做了深蹲 4 組 8 下 25 公斤」。</template>
      <template v-else>對方還沒有訓練紀錄。</template>
    </div>

    <div v-for="g in grouped" :key="g.date" class="card">
      <div class="spread" style="margin-bottom:.4rem">
        <h3 style="margin:0">{{ g.date }}</h3>
        <span class="small muted">
          {{ g.items.length }} 項 · 總量 {{ g.volume }} kg<template v-if="g.minutes"> · {{ g.minutes }} 分</template>
        </span>
      </div>
      <table>
        <tbody>
          <tr v-for="w in g.items" :key="w.id">
            <td>
              {{ w.exercise }}
              <span class="badge">{{ CATEGORIES[w.category] || '其他' }}</span>
              <span v-if="w.source === 'ai'" class="badge ai">AI</span>
              <div v-if="w.note" class="small muted">{{ w.note }}</div>
            </td>
            <td class="num muted" style="white-space:nowrap">
              <template v-if="w.sets">{{ w.sets }}×{{ w.reps }}</template>
              <template v-if="w.weight_kg"> @{{ w.weight_kg }}kg</template>
              <template v-if="w.duration_min"> {{ w.duration_min }}分</template>
              <template v-if="w.rpe"> · RPE {{ w.rpe }}</template>
            </td>
            <td v-if="isMine" style="width:1%; white-space:nowrap">
              <button class="icon" title="編輯" @click="edit(w)">✎</button>
              <button class="icon" title="刪除" @click="remove(w)">✕</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.form { grid-template-columns: repeat(3, 1fr); }
.span2 { grid-column: span 3; }
@media (max-width: 560px) {
  .form { grid-template-columns: repeat(2, 1fr); }
  .span2 { grid-column: span 2; }
}
</style>
