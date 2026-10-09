<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { api, todayStr, MEAL_TYPES, CATEGORIES } from '../api.js';
import { session } from '../auth.js';
import TrendChart from '../components/TrendChart.vue';
import MacroMeter from '../components/MacroMeter.vue';
import UserTabs from '../components/UserTabs.vue';

const C = { kcal: '#199e70', weight: '#3987e5', volume: '#d95926' };

const date = ref(todayStr());
const viewing = ref(session.user);                       // 正在看誰的紀錄
const summary = ref(null);
const meals = ref([]);
const workouts = ref([]);
const range = ref(null);
const profile = ref(null);
const error = ref('');
const loading = ref(true);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const u = viewing.value;
    const [s, m, w, r, p, bw] = await Promise.all([
      api.daily(date.value, u),
      api.listMeals({ date: date.value, user: u }),
      api.listWorkouts({ date: date.value, user: u }),
      api.range(14, u),
      api.getProfile(u),
      api.listWeights(u),
    ]);
    summary.value = s; meals.value = m; workouts.value = w; range.value = r; profile.value = p;
    weights.value = bw;
    fillBody();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

/** 補齊區間內沒有紀錄的日子，圖表才不會把時間軸壓縮 */
function series(rows, key) {
  if (!range.value) return [];
  const map = new Map(rows.map(r => [r.date, Number(r[key]) || 0]));
  const out = [];
  const d = new Date(range.value.from + 'T00:00:00');
  const end = new Date(range.value.to + 'T00:00:00');
  while (d <= end) {
    const iso = d.toLocaleDateString('sv-SE');
    out.push({ label: iso.slice(5).replace('-', '/'), value: map.get(iso) ?? 0 });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

const kcalSeries = computed(() => series(range.value?.days || [], 'kcal'));
const volumeSeries = computed(() => series(range.value?.training || [], 'volume_kg'));
const weightSeries = computed(() => {
  const rows = range.value?.weights || [];
  return rows.map(r => ({ label: r.date.slice(5).replace('-', '/'), value: Number(r.weight_kg) }));
});

const avgKcal = computed(() => {
  const vals = kcalSeries.value.filter(p => p.value > 0).map(p => p.value);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
});

const trainedDays = computed(() => (range.value?.training || []).length);

const bmi = computed(() => {
  if (!profile.value) return 0;
  const h = profile.value.height_cm / 100;
  return (profile.value.weight_kg / (h * h)).toFixed(1);
});

/* ---------------- 體態 ---------------- */

const BODY_FIELDS = [
  { key: 'weight_kg',    label: '體重',   unit: 'kg', step: '0.1', required: true },
  { key: 'body_fat_pct', label: '體脂',   unit: '%',  step: '0.1' },
  { key: 'waist_cm',     label: '腰圍',   unit: 'cm', step: '0.5' },
];

const weights = ref([]);
const body = ref({});
const bodySaving = ref(false);
const bodyMsg = ref('');
const bodyMetric = ref('weight_kg');

const isMe = computed(() => viewing.value === session.user);

/** 選的那一天已經記過的體態 */
const bodyToday = computed(() => weights.value.find(w => w.date === date.value) || null);

function fillBody() {
  const row = bodyToday.value;
  const out = {};
  for (const f of BODY_FIELDS) out[f.key] = row?.[f.key] ?? '';
  // 沒記過就拿個人檔案的體重當預設，少打幾個字
  if (out.weight_kg === '' && profile.value) out.weight_kg = profile.value.weight_kg;
  body.value = out;
}

async function saveBody() {
  if (!body.value.weight_kg || bodySaving.value) return;
  bodySaving.value = true;
  bodyMsg.value = '';
  try {
    const payload = { date: date.value };
    for (const f of BODY_FIELDS) {
      const v = body.value[f.key];
      payload[f.key] = v === '' || v === null ? null : Number(v);
    }
    await api.addWeight(payload);
    bodyMsg.value = '已記錄';
    await load();
    setTimeout(() => { bodyMsg.value = ''; }, 2500);
  } catch (e) {
    bodyMsg.value = e.message;
  } finally {
    bodySaving.value = false;
  }
}

/** 選定指標的趨勢；沒填的那天跳過，不要當成 0 */
const bodySeries = computed(() => (range.value?.weights || [])
  .filter(r => r[bodyMetric.value] != null)
  .map(r => ({ label: r.date.slice(5).replace('-', '/'), value: Number(r[bodyMetric.value]) })));

const bodyField = computed(() => BODY_FIELDS.find(f => f.key === bodyMetric.value));

/** 跟區間內第一筆比的變化量 */
const bodyDelta = computed(() => {
  const s = bodySeries.value;
  if (s.length < 2) return null;
  const d = s[s.length - 1].value - s[0].value;
  return { diff: d, days: s.length };
});

const latestBody = computed(() => weights.value[0] || null);

const shiftDate = (n) => {
  const d = new Date(date.value + 'T00:00:00');
  d.setDate(d.getDate() + n);
  date.value = d.toLocaleDateString('sv-SE');
  load();
};

watch(viewing, load);
watch(date, fillBody);

onMounted(load);
</script>

<template>
  <div class="stack">
    <UserTabs v-model="viewing" />

    <div v-if="error" class="error">{{ error }}</div>

    <div class="card">
      <div class="spread" style="margin-bottom:.8rem">
        <div class="row">
          <button class="icon" @click="shiftDate(-1)">←</button>
          <input v-model="date" type="date" style="width:auto" @change="load" />
          <button class="icon" :disabled="date >= todayStr()" @click="shiftDate(1)">→</button>
        </div>
        <span v-if="date === todayStr()" class="badge">今天</span>
      </div>

      <div v-if="summary" class="grid meters">
        <MacroMeter label="熱量" :value="summary.nutrition.kcal" :target="summary.targets.kcal" unit=" kcal" :color="C.kcal" />
        <MacroMeter label="蛋白質" :value="summary.nutrition.protein_g" :target="summary.targets.protein_g" :color="C.kcal" />
        <MacroMeter label="碳水" :value="summary.nutrition.carb_g" :target="summary.targets.carb_g" :color="C.weight" />
        <MacroMeter label="脂肪" :value="summary.nutrition.fat_g" :target="summary.targets.fat_g" :color="C.volume" />
      </div>
      <div v-else-if="loading" class="empty">載入中…</div>
    </div>

    <div class="card">
      <div class="spread" style="margin-bottom:.6rem">
        <h3 style="margin:0">體態</h3>
        <span v-if="bodyToday" class="badge">這天已記錄</span>
      </div>

      <form v-if="isMe" class="body-form" @submit.prevent="saveBody">
        <label v-for="f in BODY_FIELDS" :key="f.key">
          <span class="small muted">{{ f.label }}</span>
          <input v-model="body[f.key]" type="number" :step="f.step" inputmode="decimal"
                 :placeholder="f.unit" :required="f.required" />
        </label>
        <button class="primary" type="submit" :disabled="bodySaving || !body.weight_kg">
          {{ bodySaving ? '儲存中…' : (bodyToday ? '更新' : '記錄') }}
        </button>
      </form>
      <p v-if="isMe" class="small muted foot">只有體重是必填，其他量了再補。同一天再存會更新，空著的欄位不會把舊值抹掉。</p>

      <div v-if="latestBody" class="row wrap latest">
        <div v-for="f in BODY_FIELDS" :key="f.key" v-show="latestBody[f.key] != null">
          <span class="muted small">{{ f.label }} </span>
          <b>{{ latestBody[f.key] }}</b><span class="muted small">{{ f.unit }}</span>
        </div>
      </div>
      <div v-else-if="!isMe" class="empty">對方還沒有體態紀錄</div>

      <div class="row wrap metric-pick">
        <button v-for="f in BODY_FIELDS" :key="f.key" class="icon"
                :class="{ on: bodyMetric === f.key }" @click="bodyMetric = f.key">{{ f.label }}</button>
      </div>

      <TrendChart v-if="bodySeries.length > 1"
                  :title="bodyField.label + ' 趨勢'" :points="bodySeries" type="line"
                  :color="C.weight" :unit="' ' + bodyField.unit" :decimals="1"
                  :target="bodyMetric === 'weight_kg' ? (profile?.goal_weight_kg || 0) : 0"
                  target-label="目標體重" />
      <div v-else class="small muted">
        {{ bodyMetric === 'weight_kg' ? '多記幾天就會出現趨勢圖。' : bodyField.label + '還沒有足夠的紀錄。' }}
      </div>
    </div>

    <div class="card">
      <div class="spread" style="margin-bottom:.5rem">
        <h3 style="margin:0">今天的訓練</h3>
        <span class="small muted" v-if="summary">
          總量 {{ Math.round(summary.workout.volume_kg) }} kg
          <template v-if="summary.workout.duration_min"> · {{ Math.round(summary.workout.duration_min) }} 分鐘</template>
        </span>
      </div>
      <table v-if="workouts.length">
        <tbody>
          <tr v-for="w in workouts" :key="w.id">
            <td>{{ w.exercise }} <span class="badge">{{ CATEGORIES[w.category] || '其他' }}</span></td>
            <td class="num muted">
              <template v-if="w.sets">{{ w.sets }}×{{ w.reps }}</template>
              <template v-if="w.weight_kg"> @{{ w.weight_kg }}kg</template>
              <template v-if="w.duration_min"> {{ w.duration_min }}分</template>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">今天還沒有訓練紀錄</div>
    </div>

    <div class="card">
      <h3 style="margin-bottom:.5rem">今天吃的</h3>
      <table v-if="meals.length">
        <tbody>
          <tr v-for="m in meals" :key="m.id">
            <td>
              <span class="badge">{{ MEAL_TYPES[m.meal_type] || '點心' }}</span>
              {{ m.name }}
              <span class="muted small">{{ m.portion }}</span>
            </td>
            <td class="num muted">{{ Math.round(m.kcal) }} kcal · P{{ Math.round(m.protein_g) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">今天還沒有飲食紀錄</div>
    </div>

    <div class="card stack">
      <div class="row wrap stats">
        <div><span class="k">{{ avgKcal }}</span><span class="muted small"> 日均大卡（14天）</span></div>
        <div><span class="k">{{ trainedDays }}</span><span class="muted small"> 天有訓練</span></div>
        <div v-if="profile"><span class="k">{{ profile.weight_kg }}</span><span class="muted small"> kg · BMI {{ bmi }}</span></div>
      </div>

      <TrendChart title="近 14 天熱量攝取" :points="kcalSeries" type="bar"
                  :color="C.kcal" unit=" kcal" :target="summary?.targets.kcal || 0" target-label="目標" />

      <TrendChart title="近 14 天訓練總量" :points="volumeSeries" type="bar"
                  :color="C.volume" unit=" kg" />

    </div>
  </div>
</template>

<style scoped>
.meters { grid-template-columns: repeat(2, 1fr); gap: 1rem .9rem; }
@media (max-width: 480px) { .meters { grid-template-columns: 1fr; } }

.body-form {
  display: grid;
  grid-template-columns: repeat(3, 1fr) auto;
  gap: .5rem;
  align-items: end;
}
.body-form label { display: flex; flex-direction: column; gap: .2rem; }
.body-form input { width: 100%; }
.foot { margin: .5rem 0 0; }

.latest { gap: 1rem; margin-top: .8rem; }
.latest b { font-variant-numeric: tabular-nums; }

.metric-pick { gap: .35rem; margin-top: .9rem; }
.metric-pick .on { color: var(--accent); border-color: var(--accent-dim); }

@media (max-width: 560px) {
  .body-form { grid-template-columns: repeat(3, 1fr); }
  .body-form button { grid-column: 1 / -1; }
}

.stats { gap: 1.2rem; }
.k { font-size: 1.3rem; font-weight: 700; font-variant-numeric: tabular-nums; }
</style>
