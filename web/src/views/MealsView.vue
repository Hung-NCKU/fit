<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { api, photoUrl, todayStr, MEAL_TYPES } from '../api.js';
import { session } from '../auth.js';
import UserTabs from '../components/UserTabs.vue';
import { openPhoto } from '../components/PhotoViewer.vue';

const rows = ref([]);
const error = ref('');
const viewing = ref(session.user);                       // 正在看誰的紀錄
const isMine = computed(() => viewing.value === session.user);
const showForm = ref(false);
const saving = ref(false);

const blank = () => ({
  date: todayStr(), meal_type: 'lunch', name: '', portion: '',
  kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0, note: '',
});
const form = ref(blank());
const editingId = ref(null);

async function load() {
  error.value = '';
  try { rows.value = await api.listMeals({ limit: 300, user: viewing.value }); }
  catch (e) { error.value = e.message; }
}
watch(viewing, () => { cancel(); load(); });

async function save() {
  if (!form.value.name.trim()) return;
  saving.value = true;
  error.value = '';
  try {
    if (editingId.value) await api.updateMeal(editingId.value, form.value);
    else await api.addMeal(form.value);
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

function edit(m) {
  form.value = { ...m };
  editingId.value = m.id;
  showForm.value = true;
}

async function remove(m) {
  if (!confirm(`刪除「${m.name}」？`)) return;
  await api.deleteMeal(m.id);
  await load();
}

function cancel() {
  form.value = blank();
  editingId.value = null;
  showForm.value = false;
}

const grouped = computed(() => {
  const map = new Map();
  for (const m of rows.value) {
    if (!map.has(m.date)) map.set(m.date, []);
    map.get(m.date).push(m);
  }
  return [...map.entries()].map(([date, items]) => ({
    date,
    items,
    kcal: Math.round(items.reduce((a, m) => a + m.kcal, 0)),
    protein: Math.round(items.reduce((a, m) => a + m.protein_g, 0)),
  }));
});

onMounted(load);
</script>

<template>
  <div class="stack">
    <div class="spread">
      <h1 style="margin:0">飲食紀錄</h1>
      <button v-if="isMine" class="primary" @click="showForm ? cancel() : (showForm = true)">
        {{ showForm ? '取消' : '＋ 新增' }}
      </button>
    </div>

    <UserTabs v-model="viewing" />

    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="showForm && isMine" class="card">
      <div class="grid form">
        <div><label>日期</label><input v-model="form.date" type="date" /></div>
        <div><label>餐別</label>
          <select v-model="form.meal_type">
            <option v-for="(zh, k) in MEAL_TYPES" :key="k" :value="k">{{ zh }}</option>
          </select>
        </div>
        <div><label>份量</label><input v-model="form.portion" placeholder="150g / 一碗" /></div>
        <div class="span3"><label>食物</label>
          <input v-model="form.name" placeholder="例如：雞胸肉" @keyup.enter="save" />
        </div>
        <div><label>熱量 (kcal)</label><input v-model.number="form.kcal" type="number" min="0" /></div>
        <div><label>蛋白質 (g)</label><input v-model.number="form.protein_g" type="number" min="0" step="0.1" /></div>
        <div><label>碳水 (g)</label><input v-model.number="form.carb_g" type="number" min="0" step="0.1" /></div>
        <div class="span3"><label>備註</label><input v-model="form.note" /></div>
        <div><label>脂肪 (g)</label><input v-model.number="form.fat_g" type="number" min="0" step="0.1" /></div>
      </div>
      <p class="small muted" style="margin:.6rem 0 0">
        懶得查營養素？直接在「教練」頁說你吃了什麼，AI 會估好並自動寫入。
      </p>
      <div class="row" style="margin-top:.8rem; justify-content:flex-end">
        <button class="ghost" @click="cancel">取消</button>
        <button class="primary" :disabled="saving || !form.name.trim()" @click="save">
          {{ editingId ? '更新' : '儲存' }}
        </button>
      </div>
    </div>

    <div v-if="!grouped.length" class="card empty">
      <template v-if="isMine">還沒有飲食紀錄。可以直接在「教練」頁說「我剛吃了兩顆蛋和一碗飯」。</template>
      <template v-else>對方還沒有飲食紀錄。</template>
    </div>

    <div v-for="g in grouped" :key="g.date" class="card">
      <div class="spread" style="margin-bottom:.4rem">
        <h3 style="margin:0">{{ g.date }}</h3>
        <span class="small muted">{{ g.kcal }} kcal · 蛋白質 {{ g.protein }}g</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>食物</th>
            <th class="num">kcal</th><th class="num">P</th><th class="num">C</th><th class="num">F</th>
            <th v-if="isMine"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in g.items" :key="m.id">
            <td>
              <div class="item">
                <button v-if="m.photo" class="thumb-btn" :title="`查看「${m.name}」的照片`"
                        @click="openPhoto(photoUrl(m.photo, viewing), `${m.name}　${Math.round(m.kcal)} kcal`)">
                  <img class="thumb" :src="photoUrl(m.photo, viewing)" :alt="m.name" />
                </button>
                <div>
                  <span class="badge">{{ MEAL_TYPES[m.meal_type] || '點心' }}</span>
                  {{ m.name }}
                  <span class="muted small">{{ m.portion }}</span>
                  <span v-if="m.source === 'photo'" class="badge ai">📷 照片</span>
                  <span v-else-if="m.source === 'ai'" class="badge ai">AI</span>
                  <div v-if="m.note" class="small muted">{{ m.note }}</div>
                </div>
              </div>
            </td>
            <td class="num">{{ Math.round(m.kcal) }}</td>
            <td class="num muted">{{ Math.round(m.protein_g) }}</td>
            <td class="num muted">{{ Math.round(m.carb_g) }}</td>
            <td class="num muted">{{ Math.round(m.fat_g) }}</td>
            <td v-if="isMine" style="width:1%; white-space:nowrap">
              <button class="icon" title="編輯" @click="edit(m)">✎</button>
              <button class="icon" title="刪除" @click="remove(m)">✕</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.item { display: flex; gap: .6rem; align-items: flex-start; }
.thumb-btn {
  padding: 0;
  border: none;
  background: none;
  border-radius: 8px;
  cursor: zoom-in;
  flex: 0 0 auto;
}
.thumb {
  width: 44px; height: 44px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--border);
  display: block;
}

.form { grid-template-columns: repeat(3, 1fr); }
.span3 { grid-column: span 3; }
@media (max-width: 560px) {
  .form { grid-template-columns: repeat(2, 1fr); }
  .span3 { grid-column: span 2; }
}
</style>
