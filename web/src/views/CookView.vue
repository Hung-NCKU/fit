<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { api } from '../api.js';
import { session } from '../auth.js';
import { render } from '../markdown.js';
import { BTN, SLOP, snapSpot, parseSpot, toggleStyle, panelStyle } from '../helper-spot.js';
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
const playing = ref(null);     // 正在播放教學影片的食譜（點了才載 iframe）
const cooked = ref('');
const newItem = ref('');       // 購物清單手動輸入

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

/** 勾購物清單：存回後端，換裝置也還在。key 由後端給，手動項目有 + 前綴 */
function check(key) {
  const list = settings.value.checked || [];
  patch({ checked: list.includes(key) ? list.filter(v => v !== key) : [...list, key] });
}

/** 自己加一項到購物清單。照著打的字存，不去猜數量單位 */
function addExtra() {
  const text = newItem.value.trim();
  if (!text || busy.value) return;
  const list = settings.value.extras || [];
  newItem.value = '';
  if (list.includes(text)) return;        // 已經有同樣一項就不重複加
  patch({ extras: [...list, text] });
}

function removeExtra(text) {
  patch({
    extras: (settings.value.extras || []).filter(v => v !== text),
    // 連勾選狀態一起清掉，不然刪了又加會記得上次勾的
    checked: (settings.value.checked || []).filter(k => k !== `+${text}`),
  });
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

/**
 * 料理小幫手：站在廚房裡隨口問的小視窗。
 *
 * 用的是跟教練同一個模型，但不給工具、也不存對話——問完就算了。
 * 正在看哪道菜就把那道菜一起送過去，答案才接得上畫面。
 */
const helperOpen = ref(false);
const chat = ref([]);
const question = ref('');
const asking = ref(false);
const askError = ref('');
const logEl = ref(null);

async function ask() {
  const text = question.value.trim();
  if (!text || asking.value) return;
  question.value = '';
  askError.value = '';
  const sent = chat.value.slice();        // 這一句之前的對話才是上下文
  chat.value.push({ role: 'user', text });
  asking.value = true;
  await scrollLog();
  try {
    const { answer } = await api.askCook(text, open.value?.id ?? null, sent);
    chat.value.push({ role: 'assistant', text: answer });
  } catch (e) {
    askError.value = e.message;
  } finally {
    asking.value = false;
    await scrollLog();
  }
}

async function scrollLog() {
  await nextTick();
  if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight;
}

/**
 * 按鈕可以拖，放開後貼回最近的那一側。
 *
 * 它是固定在畫面上的，不管捲到哪裡都會壓住一塊地方——有時候正好壓在
 * 「煮好了，記一餐」或影片上，所以要能挪開，而且挪到哪裡下次還在那裡。
 *
 * 用 pointer 事件（滑鼠與觸控同一套）＋ setPointerCapture：手指滑出按鈕外面
 * 之後還是收得到移動。位移沒超過 SLOP 就當成點擊，不然手指一抖就開不起來。
 */
const SPOT_KEY = 'fit.cook.helper-spot';
const spot = ref(loadSpot());
const drag = ref(null);      // 拖曳中按鈕左上角的即時座標，沒在拖是 null
let press = null;            // 按下那一刻的指標位置與抓取偏移
let dragged = false;         // 剛剛是拖曳：緊接著那一下 click 不要當成開關

function loadSpot() {
  try { return parseSpot(localStorage.getItem(SPOT_KEY)); }
  catch { return null; }      // 私密模式讀不到就用預設的右下角
}

const clamp = (v, max) => Math.min(Math.max(v, 0), Math.max(max, 0));

function pressStart(e) {
  const box = e.currentTarget.getBoundingClientRect();
  press = { x: e.clientX, y: e.clientY, dx: e.clientX - box.left, dy: e.clientY - box.top };
  e.currentTarget.setPointerCapture?.(e.pointerId);
}

function pressMove(e) {
  if (!press) return;
  if (!drag.value && Math.hypot(e.clientX - press.x, e.clientY - press.y) < SLOP) return;
  drag.value = {
    x: clamp(e.clientX - press.dx, window.innerWidth - BTN),
    y: clamp(e.clientY - press.dy, window.innerHeight - BTN),
  };
}

function pressEnd() {
  if (!press) return;
  press = null;
  const at = drag.value;
  drag.value = null;
  if (!at) return;            // 原地放開：交給 click 去開關
  dragged = true;
  // 沒收到後續的 click（某些觸控瀏覽器）時別把下一次點擊也吃掉
  setTimeout(() => { dragged = false; }, 400);
  spot.value = snapSpot({ ...at, width: window.innerWidth, height: window.innerHeight });
  try { localStorage.setItem(SPOT_KEY, JSON.stringify(spot.value)); }
  catch { /* 存不了就只留這一次 */ }
}

function toggleHelper() {
  if (dragged) { dragged = false; return; }
  helperOpen.value = !helperOpen.value;
}

const toggleAt = computed(() => (drag.value
  ? { left: `${drag.value.x}px`, top: `${drag.value.y}px`, right: 'auto', bottom: 'auto' }
  : toggleStyle(spot.value)));
const panelAt = computed(() => panelStyle(spot.value));

const shoppingText = computed(() =>
  (data.value?.shopping || []).map(r => r.label).join('\n'));
const searchUrl = (r) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(r.videoQuery)}`;
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
          食譜是一人份，份量不夠的會自動算成 1.5 或 2 份，食材與購物清單一起放大。
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
        <span class="small muted">
          {{ r.servedKcal }} kcal・蛋白質 {{ r.servedProtein }} g・約 {{ r.servedCost }} 元/人
          <template v-if="r.portion !== 1">（吃 {{ r.portion }} 份才到目標）</template>
        </span>
        <div class="row wrap" style="gap:.4rem">
          <span v-for="t in r.tags" :key="t" class="badge soft small">{{ t }}</span>
        </div>
        <div class="row" style="gap:.5rem">
          <button class="icon" @click="open = open?.id === r.id ? null : r; playing = null">
            {{ open?.id === r.id ? '收起步驟' : '看步驟' }}
          </button>
          <button v-if="mine" class="primary small" :disabled="busy" @click="cook(r)">
            {{ busy === 'cook' + r.id ? '記錄中…' : '煮好了，記一餐' }}
          </button>
        </div>
        <div v-if="open?.id === r.id" class="stack steps">
          <b class="small">食材（{{ r.portion }} 人份）</b>
          <ul class="small">
            <li v-for="(ing, n) in r.ingredients" :key="n">
              {{ ing[0] }} {{ Math.round(ing[1] * r.portion * 10) / 10 }}{{ ing[2] }}
            </li>
          </ul>
          <b class="small">做法</b>
          <ol class="small">
            <li v-for="(s, n) in r.steps" :key="n">{{ s }}</li>
          </ol>

          <!-- 教學影片。點了才載 iframe，不然七道菜一展開就是七個播放器 -->
          <b class="small">教學影片</b>
          <div v-if="r.videoId" class="video-frame">
            <iframe
              v-if="playing === r.id" :key="r.videoId"
              :src="`https://www.youtube-nocookie.com/embed/${r.videoId}?playsinline=1&rel=0&autoplay=1`"
              :title="`${r.name} YouTube 教學`" allowfullscreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerpolicy="strict-origin-when-cross-origin"
            ></iframe>
            <button v-else class="video-preview" :aria-label="`播放${r.name}教學`" @click="playing = r.id">
              <img :src="`https://i.ytimg.com/vi/${r.videoId}/hqdefault.jpg`" :alt="`${r.name}教學預覽`" loading="lazy" />
              <span class="play-label">▶ 播放教學</span>
            </button>
          </div>
          <div class="video-source small">
            <span v-if="r.videoId" class="muted">{{ r.channel }}・{{ r.videoTitle }}</span>
            <span v-else class="muted">這道還沒挑到夠貼切的影片，直接搜尋比較準</span>
            <a :href="searchUrl(r)" target="_blank" rel="noopener noreferrer">
              {{ r.videoId ? '找其他做法 ↗' : '在 YouTube 找做法 ↗' }}
            </a>
          </div>
        </div>
      </div>

      <!-- 購物清單 -->
      <div v-if="data.shopping.length || mine" class="card stack">
        <div class="spread">
          <h3 style="margin:0">購物清單</h3>
          <button v-if="data.shopping.length" class="icon" @click="copyList">複製</button>
        </div>
        <p class="small muted" style="margin:0">
          七天份已依 {{ settings.people }} 人合併同名食材，另外要買的可以自己加。
        </p>
        <div v-for="row in data.shopping" :key="row.key" class="row buy">
          <label class="row grow">
            <input
              type="checkbox" :disabled="!mine || busy"
              :checked="(settings.checked || []).includes(row.key)"
              @change="check(row.key)"
            />
            <span :class="{ done: (settings.checked || []).includes(row.key) }">{{ row.label }}</span>
          </label>
          <button
            v-if="row.manual && mine" class="icon" :disabled="busy"
            :aria-label="`刪除 ${row.label}`" @click="removeExtra(row.name)"
          >✕</button>
        </div>
        <form v-if="mine" class="row add-item" @submit.prevent="addExtra">
          <input
            v-model="newItem" maxlength="40" :disabled="busy"
            placeholder="自己加一項，例如：牛奶 2 瓶" aria-label="新增購物清單項目"
          />
          <button type="submit" class="icon" :disabled="busy || !newItem.trim()">新增</button>
        </form>
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

    <!-- 浮動小幫手。預設在右下角，可以拖走，再按一次收起 -->
    <button
      class="helper-toggle" :class="{ on: helperOpen, dragging: !!drag }" :style="toggleAt"
      :aria-expanded="helperOpen" aria-controls="cook-helper"
      :aria-label="helperOpen ? '收起料理小幫手' : '打開料理小幫手（可拖曳）'"
      @pointerdown="pressStart" @pointermove="pressMove"
      @pointerup="pressEnd" @pointercancel="pressEnd"
      @click="toggleHelper"
    >{{ helperOpen ? '✕' : '🍳' }}</button>

    <section v-if="helperOpen" id="cook-helper" class="helper card stack" :style="panelAt">
      <div class="spread">
        <b>料理小幫手</b>
        <span class="small muted">{{ open ? open.name : '展開一道菜就會針對它回答' }}</span>
      </div>
      <div ref="logEl" class="log stack">
        <p v-if="!chat.length" class="small muted" style="margin:0">
          問食材能換什麼、火候、怎麼備料都可以。它不會改你的紀錄，要記這一餐請按「煮好了，記一餐」。
        </p>
        <p v-for="(m, i) in chat" :key="i" class="msg small" :class="m.role" v-html="render(m.text)"></p>
        <p v-if="asking" class="small muted" style="margin:0">想一下…</p>
      </div>
      <div v-if="askError" class="error small">{{ askError }}</div>
      <form class="row add-item" @submit.prevent="ask">
        <input
          v-model="question" maxlength="500" :disabled="asking"
          placeholder="例如：蝦仁可以換成什麼？" aria-label="問料理小幫手"
        />
        <button type="submit" class="icon" :disabled="asking || !question.trim()">送出</button>
      </form>
    </section>
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
.grow { flex:1; min-width:0; gap:.6rem; align-items:center; }
/* 輸入框預設 width:100%，不收著的話「新增」會被擠成直排的兩個字 */
.add-item input { flex:1; min-width:0; }
.add-item button { flex:none; white-space:nowrap; }
.video-frame { aspect-ratio:16/9; border-radius:14px; overflow:hidden; background:#30291f; }
.video-frame iframe, .video-preview { display:block; width:100%; height:100%; border:0; }
.video-preview { position:relative; padding:0; overflow:hidden; }
.video-preview img { width:100%; height:100%; object-fit:cover; }
.play-label {
  position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); white-space:nowrap;
  background:var(--accent); color:#fff; padding:.6rem 1rem; border-radius:30px; font-weight:650;
}
.video-source { display:flex; flex-wrap:wrap; gap:.3rem .8rem; align-items:baseline; }
.video-source a { color:var(--accent); text-decoration:underline; }

/* 右下角：左下角是 App 的「功能」把手，不要疊在一起 */
.helper-toggle {
  position:fixed; right:max(12px, var(--safe-right)); z-index:25;
  bottom:calc(12px + var(--safe-bottom));
  width:52px; height:52px; padding:0; border-radius:50%; font-size:1.4rem;
  background:var(--surface); box-shadow:0 3px 12px #0003;
  /* 拖的時候不要讓畫面跟著捲，不然在手機上永遠拖不動 */
  touch-action:none; cursor:grab;
  transition:left .18s ease, top .18s ease;
}
.helper-toggle.on { background:var(--accent); color:var(--on-accent); border-color:var(--accent); }
/* 跟著手指走的時候不能有 transition，不然會黏在後面慢慢追 */
.helper-toggle.dragging { cursor:grabbing; transition:none; z-index:26; box-shadow:0 6px 18px #0005; }
@media(prefers-reduced-motion:reduce){ .helper-toggle { transition:none; } }
.helper {
  position:fixed; z-index:24;
  right:max(12px, var(--safe-right)); left:max(12px, var(--safe-left));
  bottom:calc(74px + var(--safe-bottom));
  max-width:520px; margin-inline:auto;
  box-shadow:0 6px 24px #0004;
  /* 按鈕被拖到中間時視窗高度會被 panelStyle 收窄，由對話記錄讓出空間 */
  overflow:hidden;
}
.helper .log { flex:1 1 auto; min-height:0; max-height:40vh; overflow-y:auto; gap:.5rem; }
/* 換行已經由 markdown 轉成 <br>，不要再加 pre-wrap，不然會變兩倍行距 */
.helper .msg { margin:0; padding:.5rem .7rem; border-radius:12px; line-height:1.6; }
.helper .msg :deep(.li) { display:block; padding-left:.3rem; }
.helper .msg.user { background:var(--accent-soft); color:var(--accent); align-self:flex-end; max-width:85%; }
.helper .msg.assistant { background:var(--surface-2); }
</style>
