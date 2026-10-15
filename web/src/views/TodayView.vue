<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { api, todayStr, MEAL_TYPES, CATEGORIES } from '../api.js';
import { session } from '../auth.js';
import TrendChart from '../components/TrendChart.vue';
import Ring from '../components/Ring.vue';
import UserTabs from '../components/UserTabs.vue';
import { useRoute } from 'vue-router';
import { workoutLabel } from '../workout-metrics.js';

const C = {
  kcal: 'var(--accent)',
  protein: 'var(--protein)',
  carb: 'var(--carb)',
  fat: 'var(--fat)',
  weight: 'var(--accent)',
  volume: 'var(--fat)',
};

const date = ref(todayStr());
const viewing = ref(session.user);                       // 正在看誰的紀錄
const summary = ref(null);
const meals = ref([]);
const workouts = ref([]);
const range = ref(null);
const profile = ref(null);
const error = ref('');
const loading = ref(true);
const route = useRoute();
const scrollBody = () => document.getElementById('body-record')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
const nextStep = computed(() => {
  if (date.value !== todayStr()) return '正在查看過去紀錄；快捷新增會記錄今天';
  if (!summary.value) return '先記下一餐或今天的訓練';
  if (!meals.value.length) return '今天還沒有飲食紀錄，可以先記第一餐';
  if (!workouts.value.length) return '想訓練就記下今天的動作；休息日也沒關係';
  return '今天的飲食與訓練已留下紀錄，去看看寵物吧';
});

// 與其他頁面相同：只採用最後一次發出的請求的結果
let reqId = 0;

async function load() {
  const mine = ++reqId;
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
    if (mine !== reqId) return;   // 已經切到別人了，這份丟掉
    summary.value = s; meals.value = m; workouts.value = w; range.value = r; profile.value = p;
    weights.value = bw;
    fillBody();
  } catch (e) {
    if (mine !== reqId) return;
    error.value = e.message;
  } finally {
    if (mine === reqId) loading.value = false;
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

/* ---------------- 週曆列 ---------------- */

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 哪些日子有飲食紀錄：用來在日期下面點一個小點 */
const daysWithFood = computed(() =>
  new Set((range.value?.days || []).filter(d => Number(d.kcal) > 0).map(d => d.date)));

/** 以選取日為準往前後各取幾天，湊成一條七天的捲軸 */
const weekStrip = computed(() => {
  const out = [];
  const base = new Date(date.value + 'T00:00:00');
  for (let i = -6; i <= 0; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    const iso = d.toLocaleDateString('sv-SE');
    out.push({
      iso,
      day: d.getDate(),
      wd: WEEKDAYS[d.getDay()],
      dot: daysWithFood.value.has(iso),
      future: iso > todayStr(),
    });
  }
  return out;
});

function pickDate(iso) {
  if (iso === date.value || iso > todayStr()) return;
  date.value = iso;
  load();
}

const remaining = computed(() => {
  if (!summary.value) return 0;
  return Math.max(0, Math.round(summary.value.targets.kcal - summary.value.nutrition.kcal));
});

const shiftDate = (n) => {
  const d = new Date(date.value + 'T00:00:00');
  d.setDate(d.getDate() + n);
  date.value = d.toLocaleDateString('sv-SE');
  load();
};

// 先清空再載入，不要顯示上一個人的數字
watch(viewing, () => {
  summary.value = null; meals.value = []; workouts.value = [];
  range.value = null; profile.value = null; weights.value = [];
  load();
});
watch(date, fillBody);

onMounted(load);
onMounted(() => {
  if (route.query.focus === 'weight') document.getElementById('body-record')?.scrollIntoView({ block: 'start' });
});
</script>

<template>
  <div class="stack">
    <UserTabs v-model="viewing" />

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="isMe" class="card stack today-actions">
      <b>{{ date === todayStr() ? '今天的小進度' : `${date} 的紀錄` }}</b>
      <div class="row wrap small"><span>飲食 {{ meals.length }} 筆</span><span>訓練 {{ workouts.length }} 筆</span><span>體態 {{ bodyToday ? '已記錄' : '未記錄' }}</span></div>
      <p class="small muted" style="margin:0">{{ nextStep }}</p>
      <div class="row wrap">
        <RouterLink class="quick-link" to="/meals?new=1">＋ 記飲食</RouterLink>
        <RouterLink class="quick-link" to="/workouts?new=1">＋ 記訓練</RouterLink>
        <button @click="scrollBody">＋ 記體重</button>
        <RouterLink class="quick-link" to="/">看看寵物</RouterLink>
      </div>
    </div>

    <div class="card">
      <div class="spread" style="margin-bottom:.8rem">
        <div class="row">
          <button class="icon" @click="shiftDate(-1)">←</button>
          <input v-model="date" type="date" style="width:auto" @change="load" />
          <button class="icon" :disabled="date >= todayStr()" @click="shiftDate(1)">→</button>
        </div>
        <span v-if="date === todayStr()" class="badge">今天</span>
      </div>

      <!-- 週曆列：一眼看出這週哪幾天有記錄 -->
      <div class="week">
        <button
          v-for="d in weekStrip" :key="d.iso"
          class="day" :class="{ on: d.iso === date }"
          :disabled="d.future"
          @click="pickDate(d.iso)"
        >
          <span class="wd">{{ d.wd }}</span>
          <span class="dd">{{ d.day }}</span>
          <span class="dot" :class="{ show: d.dot }"></span>
        </button>
      </div>

      <!-- 熱量：剩多少 + 環形進度 -->
      <div v-if="summary" class="kcal-row">
        <div>
          <div class="big-num">{{ remaining }}</div>
          <div class="small muted">還剩</div>
          <div class="small">
            <b style="color: var(--accent)">{{ Math.round(summary.nutrition.kcal) }}</b>
            <span class="muted"> / {{ summary.targets.kcal }} kcal</span>
          </div>
        </div>
        <Ring :value="summary.nutrition.kcal" :target="summary.targets.kcal"
              :color="C.kcal" :size="92" :width="9">
          <span class="flame">🔥</span>
        </Ring>
      </div>
      <div v-else-if="loading" class="empty">載入中…</div>
    </div>

    <div v-if="summary" class="grid macros">
      <div v-for="m in [
        { k: '蛋白質', v: summary.nutrition.protein_g, t: summary.targets.protein_g, c: C.protein },
        { k: '碳水',   v: summary.nutrition.carb_g,    t: summary.targets.carb_g,    c: C.carb },
        { k: '脂肪',   v: summary.nutrition.fat_g,     t: summary.targets.fat_g,     c: C.fat },
      ]" :key="m.k" class="card macro">
        <Ring :value="m.v" :target="m.t" :color="m.c" :size="58" :width="6" />
        <div class="small muted">{{ m.k }}</div>
        <div class="small">
          <b>{{ Math.round(m.v) }}</b><span class="muted"> / {{ m.t }}g</span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="spread" style="margin-bottom:.6rem">
        <h3 style="margin:0">體態</h3>
        <span v-if="bodyToday" class="badge">這天已記錄</span>
      </div>

      <form v-if="isMe" id="body-record" class="body-form" @submit.prevent="saveBody">
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
              {{ workoutLabel(w) }}
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
.quick-link { display:inline-flex; align-items:center; padding:.45rem .7rem; border:1px solid var(--border); border-radius:8px; text-decoration:none; color:var(--text); }
#body-record { scroll-margin-top:90px; }
/* ---- 週曆列 ---- */
.week { display: grid; grid-template-columns: repeat(7, 1fr); gap: .25rem; margin-bottom: 1rem; }
.day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: .2rem;
  padding: .45rem 0 .35rem;
  background: none;
  border: none;
  border-radius: 12px;
}
.day:hover:not(:disabled) { background: var(--surface-2); }
.day:disabled { opacity: .3; }
.day .wd { font-size: .68rem; color: var(--muted); }
.day .dd {
  font-size: .95rem;
  font-weight: 600;
  width: 1.9rem;
  height: 1.9rem;
  line-height: 1.9rem;
  border-radius: 999px;
  font-variant-numeric: tabular-nums;
}
.day.on .dd { background: var(--accent); color: var(--on-accent); }
.day .dot { width: 4px; height: 4px; border-radius: 999px; background: transparent; }
.day .dot.show { background: var(--accent); }
.day.on .dot.show { background: var(--accent); }

/* ---- 熱量 ---- */
.kcal-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.flame { font-size: 1.5rem; }

/* ---- 三大營養素 ---- */
.macros { grid-template-columns: repeat(3, 1fr); gap: .6rem; }
.macro {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: .3rem;
  padding: .9rem .4rem;
  text-align: center;
}
.macro b { font-variant-numeric: tabular-nums; }

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
