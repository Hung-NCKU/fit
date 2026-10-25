<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { api } from '../api.js';
import { session } from '../auth.js';
import UserTabs from '../components/UserTabs.vue';

/**
 * 一週晚餐規劃（從「好好煮 Chef」搬過來）。
 *
 * 跟原版最大的差別是挑菜依據：原本看預算，現在看這個人的熱量與蛋白質目標，
 * 所以畫面上會把「今晚的目標」寫出來——不然使用者不知道為什麼是這幾道。
 * 煮完一道可以直接記成飲食紀錄，這是兩邊合起來的主要理由。
 */
const DAYS = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];

const viewing = ref(session.user);
const data = ref(null);
const loading = ref(true);
const error = ref('');
const busy = ref(null);
const open = ref(null);        // 正在看步驟的食譜
const cooked = ref('');

let reqId = 0;
async function load() {
  const mine = ++reqId;
  loading.value = true;
  error.value = '';
  try {
    const d = await api.mealPlan(viewing.value);
    if (mine !== reqId) return;
    data.value = d;
  } catch (e) {
    if (mine !== reqId) return;
    error.value = e.message;
  } finally {
    if (mine === reqId) loading.value = false;
  }
}
watch(viewing, () => { data.value = null; open.value = null; load(); });
onMounted(load);

const mine = computed(() => viewing.value === session.user);
const settings = computed(() => data.value?.settings || {});
const plan = computed(() => data.value?.plan || []);
const target = computed(() => data.value?.dinnerTarget || { kcal: 0, protein_g: 0 });

async function act(fn, key) {
  if (busy.value) return;
  busy.value = key;
  error.value = '';
  try { data.value = await fn(); }
  catch (e) { error.value = e.message; }
  finally { busy.value = null; }
}

const patch = (body) => act(() => api.updateMealPlan(body), 'patch');
const generate = () => act(() => api.generateMealPlan(), 'generate');
const swap = (day) => act(() => api.swapMealPlanDay(day), 'swap' + day);

function toggle(field, value) {
  const list = settings.value[field] || [];
  patch({ [field]: list.includes(value) ? list.filter(v => v !== value) : [...list, value] });
}

/** 勾購物清單：存回後端，換裝置也還在 */
function check(name) {
  const list = settings.value.checked || [];
  patch({ checked: list.includes(name) ? list.filter(v => v !== name) : [...list, name] });
}

async function cook(recipe) {
  if (busy.value) return;
  busy.value = 'cook' + recipe.id;
  error.value = '';
  try {
    await api.cookRecipe(recipe.id);
    cooked.value = `已記成今天的晚餐：${recipe.name} ${recipe.kcal} kcal`;
    setTimeout(() => { cooked.value = ''; }, 6000);
  } catch (e) { error.value = e.message; }
  finally { busy.value = null; }
}

const shoppingText = computed(() =>
  (data.value?.shopping || []).map(r => `${r.name} ${r.qty}${r.unit}`).join('\n'));
async function copyList() {
  try { await navigator.clipboard.writeText(shoppingText.value); cooked.value = '購物清單已複製'; }
  catch { error.value = '這個瀏覽器不給複製，請長按選取'; }
  setTimeout(() => { cooked.value = ''; }, 4000);
}
</script>

<template>
  <div class="stack">
    <UserTabs v-model="viewing" />
    <p v-if="cooked" class="ok" role="status">✓ {{ cooked }}</p>
    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="loading && !data" class="card empty">載入中…</div>

    <template v-else-if="data">
      <!-- 為什麼是這幾道 -->
      <div class="card stack">
        <div class="spread">
          <h3 style="margin:0">這週的晚餐</h3>
          <button v-if="mine" class="icon" :disabled="busy" @click="generate">
            {{ busy === 'generate' ? '排菜中…' : '重新排菜' }}
          </button>
        </div>
        <p v-if="target.kcal" class="small muted" style="margin:0">
          依你的每日目標挑菜：晚餐抓 <b>{{ target.kcal }} kcal</b>、蛋白質 <b>{{ target.protein_g }} g</b>。
          預算是次要條件，不會因此排不出菜。
        </p>
        <p v-else class="small muted" style="margin:0">
          還沒有每日目標，所以暫時照預算挑。到「今日」把身體數據填好就會改用營養目標。
        </p>
        <p class="small muted" style="margin:0">
          符合條件的食譜 {{ data.eligibleCount }} 道・這份菜單一週約 {{ data.weekCost }} 元
        </p>
      </div>

      <div v-if="!plan.length" class="card empty">
        還沒有菜單。{{ mine ? '按上面的「重新排菜」開始。' : '對方還沒排。' }}
      </div>

      <!-- 七天 -->
      <div v-for="(r, i) in plan" :key="i" class="card stack day">
        <div class="spread">
          <span><b>{{ DAYS[i] }}</b> <span class="muted small">{{ r.time }} 分鐘・{{ r.equipment }}</span></span>
          <button v-if="mine" class="icon" :disabled="busy" @click="swap(i)">
            {{ busy === 'swap' + i ? '換菜中…' : '換一道' }}
          </button>
        </div>
        <b>{{ r.name }}</b>
        <span class="small muted">{{ r.kcal }} kcal・蛋白質 {{ r.protein }} g・約 {{ r.cost }} 元/人</span>
        <div class="row wrap" style="gap:.4rem">
          <span v-for="t in r.tags" :key="t" class="badge soft small">{{ t }}</span>
        </div>
        <div class="row" style="gap:.5rem">
          <button class="icon" @click="open = open?.id === r.id ? null : r">
            {{ open?.id === r.id ? '收起步驟' : '看步驟' }}
          </button>
          <button v-if="mine" class="primary small" :disabled="busy" @click="cook(r)">
            {{ busy === 'cook' + r.id ? '記錄中…' : '煮好了，記一餐' }}
          </button>
        </div>
        <div v-if="open?.id === r.id" class="stack steps">
          <b class="small">食材（1 人份）</b>
          <ul class="small">
            <li v-for="(ing, n) in r.ingredients" :key="n">{{ ing[0] }} {{ ing[1] }}{{ ing[2] }}</li>
          </ul>
          <b class="small">做法</b>
          <ol class="small">
            <li v-for="(s, n) in r.steps" :key="n">{{ s }}</li>
          </ol>
        </div>
      </div>

      <!-- 購物清單 -->
      <div v-if="data.shopping.length" class="card stack">
        <div class="spread">
          <h3 style="margin:0">購物清單</h3>
          <button class="icon" @click="copyList">複製</button>
        </div>
        <p class="small muted" style="margin:0">七天份已依 {{ settings.people }} 人合併同名食材。</p>
        <label v-for="row in data.shopping" :key="row.name" class="row buy">
          <input
            type="checkbox" :disabled="!mine || busy"
            :checked="(settings.checked || []).includes(row.name)"
            @change="check(row.name)"
          />
          <span :class="{ done: (settings.checked || []).includes(row.name) }">
            {{ row.name }} {{ row.qty }}{{ row.unit }}
          </span>
        </label>
      </div>

      <!-- 設定 -->
      <div v-if="mine" class="card stack">
        <h3 style="margin:0">條件</h3>
        <div class="row two">
          <label class="f"><span class="small muted">幾個人吃</span>
            <input :value="settings.people" type="number" min="1" max="8" :disabled="busy"
                   @change="patch({ people: Number($event.target.value) })" /></label>
          <label class="f"><span class="small muted">每週預算（元）</span>
            <input :value="settings.budget" type="number" min="500" max="6000" step="100" :disabled="busy"
                   @change="patch({ budget: Number($event.target.value) })" /></label>
        </div>
        <div v-for="(opts, field) in { diets: data.options.diets, equipment: data.options.equipment, stores: data.options.stores }"
             :key="field" class="f">
          <span class="small muted">{{ { diets: '飲食需求', equipment: '可用設備', stores: '採買通路' }[field] }}</span>
          <div class="row wrap" style="gap:.4rem">
            <button v-for="o in opts" :key="o" class="icon"
                    :class="{ on: (settings[field] || []).includes(o) }"
                    :disabled="busy" @click="toggle(field, o)">{{ o }}</button>
          </div>
        </div>
        <p class="small muted" style="margin:0">
          設備全不勾＝不限制。改了條件要按「重新排菜」才會換菜單。
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ok { padding:.7rem; background:var(--accent-soft); color:var(--accent); border-radius:10px; margin:0; }
.day .steps { border-top:1px solid var(--border); padding-top:.6rem; }
.day ul, .day ol { margin:.2rem 0; padding-left:1.2rem; }
.day li { margin:.25rem 0; line-height:1.6; }
.two { gap:.6rem; }
.two .f { flex:1; min-width:0; }
.f { display:flex; flex-direction:column; gap:.25rem; }
.icon.on { background:var(--accent-soft); color:var(--accent); border-color:var(--accent); }
.buy { gap:.6rem; align-items:center; }
.buy input { width:auto; }
.buy .done { color:var(--muted); text-decoration:line-through; }
</style>
