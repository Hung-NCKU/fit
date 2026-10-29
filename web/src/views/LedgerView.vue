<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { api, compressImage, todayStr } from '../api.js';
import { blobToWav, canRecord, wavDataUrl } from '../audio-wav.js';
import { session } from '../auth.js';
import { loadCachedPage } from '../page-cache.js';
import { confirmAction } from '../confirm.js';
import UserTabs from '../components/UserTabs.vue';
import {
  PAY_METHODS, categoriesFor, categoryById, formatAmount, monthOf, payById,
} from '../../../shared/expenses.js';

/**
 * 記帳。
 *
 * 跟飲食、訓練同一套日期導覽：一次只看一天，← → 跳到上一個／下一個有記帳的日子。
 * 每一頁都固定看得到「這個月」與「這一天」的合計——記帳最常問的就是這兩個數字。
 *
 * 輸入有兩條路：手動表單，或用一句話讓模型拆成好幾筆。模型那條只產生草稿，
 * 要按確認才寫進資料庫（理由見 server/src/expense-chat.js）。
 */

const viewing = ref(session.user);
const isMine = computed(() => viewing.value === session.user);
const date = ref(todayStr());
const data = ref(null);
const loading = ref(true);
const error = ref('');

// 切使用者或日期時可能有兩個請求同時在飛，而且不保證按順序回來。
// 用序號標記，只採用最後一次發出的結果，畫面才不會停在上一筆資料上。
let reqId = 0;

const apply = (page) => { data.value = page; date.value = page.date; };

async function load() {
  const mine = ++reqId;
  loading.value = true;
  error.value = '';
  const user = viewing.value, day = date.value;
  try {
    const page = await loadCachedPage(
      ['ledger', session.user, user, day],
      () => api.expensePage(day, user),
      cached => { if (mine === reqId) { apply(cached); loading.value = false; } },
    );
    if (mine !== reqId) return;
    apply(page);
  } catch (e) {
    if (mine === reqId) error.value = e.message;
  } finally {
    if (mine === reqId) loading.value = false;
  }
}

watch(viewing, () => { data.value = null; cancel(); clearDraft(); load(); });

/* ---------------- 日期導覽 ---------------- */

const dates = computed(() => data.value?.dates || []);
const dateIdx = computed(() => dates.value.findIndex(d => d.date === date.value));
/** 清單是新到舊，所以「較舊」是往索引大的方向走 */
const hasOlder = computed(() => {
  const i = dateIdx.value;
  return i >= 0 ? i < dates.value.length - 1 : dates.value.some(d => d.date < date.value);
});
const hasNewer = computed(() => {
  const i = dateIdx.value;
  return i >= 0 ? i > 0 : dates.value.some(d => d.date > date.value);
});

/** 跳到上／下一個「有記帳」的日子，而不是單純加減一天 */
function step(dir) {
  const list = dates.value;
  if (!list.length) return;
  const i = dateIdx.value;
  const next = i >= 0
    ? list[i + (dir === 'older' ? 1 : -1)]
    : dir === 'older'
      ? list.find(d => d.date < date.value)
      : [...list].reverse().find(d => d.date > date.value);
  if (next) { date.value = next.date; load(); }
}

/* ---------------- 標題上的數字 ---------------- */

const monthLabel = computed(() => (data.value?.month === monthOf(todayStr())
  ? '本月' : `${Number(data.value?.month?.slice(5))} 月`));
const dayLabel = computed(() => (data.value?.isToday ? '今日' : date.value.slice(5).replace('-', '/')));

/* ---------------- 手動輸入 ---------------- */

const blank = () => ({ date: date.value, kind: 'expense', category: 'food', item: '', amount: null, pay: 'cash', note: '' });
const form = ref(blank());
const editingId = ref(null);
const showForm = ref(false);
const saving = ref(false);

const formCategories = computed(() => categoriesFor(form.value.kind));

// 收支一換，分類也要跟著換一組，否則會把薪水記在「餐飲」底下
watch(() => form.value.kind, (kind) => {
  if (!formCategories.value.some(c => c.id === form.value.category)) {
    form.value.category = kind === 'income' ? 'salary' : 'food';
  }
});

function openForm(preset = {}) {
  form.value = { ...blank(), ...preset };
  editingId.value = preset.id ?? null;
  showForm.value = true;
}

function cancel() {
  form.value = blank();
  editingId.value = null;
  showForm.value = false;
}

async function save() {
  if (!form.value.item.trim() || !(form.value.amount > 0)) return;
  saving.value = true;
  error.value = '';
  try {
    apply(editingId.value
      ? await api.updateExpense(editingId.value, form.value)
      : await api.addExpense(form.value));
    cancel();
  } catch (e) { error.value = e.message; }
  finally { saving.value = false; }
}

function edit(row) {
  openForm({ ...row, amount: Number(row.amount) });
}

async function remove(row) {
  if (!await confirmAction(`刪除「${row.item}」${formatAmount(row.amount)}？`)) return;
  try { apply(await api.deleteExpense(row.id, date.value)); }
  catch (e) { error.value = e.message; }
}

/** 常用項目：點一下就把整筆帶進表單，只剩確認金額 */
function useFrequent(f) {
  openForm({ kind: f.kind, category: f.category, item: f.item, amount: Number(f.amount), pay: f.pay });
}

/* ---------------- 用講的記帳 ---------------- */

const said = ref('');
const draft = ref([]);
const draftNote = ref('');
const parsing = ref('');          // '' | 'text' | 'audio' | 'image'，順便當作進行中的旗標
const savingDraft = ref(false);
const shotInput = ref(null);

function clearDraft() { draft.value = []; draftNote.value = ''; said.value = ''; }

const EMPTY_HINT = {
  text: '沒有看懂，換個說法試試，例如「早餐 60 咖啡 85」。',
  audio: '沒有聽出可以記的帳。講慢一點、把金額唸清楚，或改用打字的。',
  image: '這張圖裡沒看到可以記的消費。換一張看得到品項與金額的截圖試試。',
};

async function runParse(payload, kind) {
  if (parsing.value) return;
  parsing.value = kind;
  error.value = '';
  draft.value = [];
  draftNote.value = '';
  try {
    const res = await api.parseExpenses({ ...payload, date: date.value });
    draft.value = res.rows;
    // 模型不一定會附說明（實測常常只呼叫工具就結束），沒有就自己講一句
    draftNote.value = res.rows.length
      ? res.note || `整理出 ${res.rows.length} 筆${res.skipped ? `，另外 ${res.skipped} 筆沒金額先略過` : ''}。`
      : EMPTY_HINT[kind];
  } catch (e) { error.value = e.message; }
  finally { parsing.value = ''; }
}

const parse = () => said.value.trim() && runParse({ text: said.value.trim() }, 'text');

/**
 * 截圖記帳：LINE Pay／Apple Pay 的交易明細、銀行刷卡通知、電子發票、收據。
 *
 * 這是「自動讀刷卡紀錄」唯一做得到的方式——Apple Pay 與 LINE Pay 都沒有
 * 給第三方讀取消費明細的 API（詳見 server/src/expense-chat.js）。
 * 圖只送去解析、不存檔：上面有卡號末四碼跟交易序號。
 */
async function pickShot(event) {
  const file = event.target.files?.[0];
  event.target.value = '';           // 同一張圖想再試一次也要觸發 change
  if (!file) return;
  try {
    const dataUrl = await compressImage(file);
    await runParse({ image: dataUrl }, 'image');
  } catch (e) { error.value = e.message; }
}

/* ---------------- 錄音 ---------------- */

const recordable = canRecord();
const recording = ref(false);
const seconds = ref(0);
let recorder = null, chunks = [], ticker = null;

// 太長的錄音一來模型未必聽得完整，二來上傳久；一分鐘足夠講完一天的帳
const MAX_SECONDS = 60;

async function toggleRecord() {
  if (recording.value) { recorder?.stop(); return; }
  if (parsing.value) return;
  error.value = '';
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    error.value = '沒有麥克風權限。瀏覽器網址列旁可以開啟，或改用打字的。';
    return;
  }
  chunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  recorder.onstop = async () => {
    stream.getTracks().forEach(t => t.stop());
    clearInterval(ticker);
    recording.value = false;
    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
    if (blob.size < 1200) { error.value = '錄到的聲音太短，再試一次。'; return; }
    try {
      await runParse({ audio: wavDataUrl(await blobToWav(blob)) }, 'audio');
    } catch { error.value = '這段錄音轉檔失敗，再錄一次，或改用打字的。'; }
  };
  recorder.start();
  recording.value = true;
  seconds.value = 0;
  ticker = setInterval(() => {
    if (++seconds.value >= MAX_SECONDS) recorder?.stop();
  }, 1000);
}

// 離開頁面時還在錄就收掉，不然麥克風會一直亮著
onUnmounted(() => { clearInterval(ticker); if (recording.value) recorder?.stop(); });

const draftTotal = computed(() => draft.value.reduce(
  (sum, r) => sum + (r.kind === 'income' ? 0 : Number(r.amount) || 0), 0));

async function saveDraft() {
  if (!draft.value.length || savingDraft.value) return;
  savingDraft.value = true;
  error.value = '';
  try {
    apply(await api.addExpenses(draft.value, date.value));
    clearDraft();
  } catch (e) { error.value = e.message; }
  finally { savingDraft.value = false; }
}

/* ---------------- 月預算 ---------------- */

const budgetOpen = ref(false);
const budgetInput = ref(0);

function openBudget() {
  budgetInput.value = data.value?.settings.budget || 0;
  budgetOpen.value = true;
}

async function saveBudget() {
  error.value = '';
  try {
    apply(await api.saveExpenseSettings({ budget: budgetInput.value, date: date.value }));
    budgetOpen.value = false;
  } catch (e) { error.value = e.message; }
}

const iconOf = id => categoryById(id)?.icon ?? '📦';
const nameOf = id => categoryById(id)?.name ?? id;

onMounted(load);
</script>

<template>
  <div class="stack">
    <div class="spread">
      <h1 style="margin:0">記帳</h1>
      <button v-if="isMine" class="primary" @click="showForm ? cancel() : openForm()">
        {{ showForm ? '取消' : '＋ 記一筆' }}
      </button>
    </div>

    <UserTabs v-model="viewing" />

    <div class="card daybar">
      <div class="row">
        <button class="icon" :disabled="!hasOlder" @click="step('older')">←</button>
        <input v-model="date" type="date" style="width:auto" @change="load" />
        <button class="icon" :disabled="!hasNewer" @click="step('newer')">→</button>
      </div>
      <span class="small muted">{{ data?.day.items || 0 }} 筆</span>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <!-- 本月與當日的合計：記帳最常問的兩個數字，固定放在最上面 -->
    <div v-if="data" class="card stack totals">
      <div class="two-big">
        <div>
          <span class="small muted">{{ monthLabel }}支出</span>
          <b class="big">{{ formatAmount(data.monthTotals.expense) }}</b>
          <span v-if="data.monthTotals.income" class="small muted">
            收入 {{ formatAmount(data.monthTotals.income) }}・結餘 {{ formatAmount(data.monthTotals.net) }}
          </span>
        </div>
        <div>
          <span class="small muted">{{ dayLabel }}支出</span>
          <b class="big">{{ formatAmount(data.day.expense) }}</b>
          <span v-if="data.day.income" class="small muted">收入 {{ formatAmount(data.day.income) }}</span>
        </div>
      </div>

      <div v-if="data.budget" class="stack" style="gap:.35rem">
        <div class="bar"><span :class="{ over: data.budget.over }" :style="{ width: data.budget.pct + '%' }"></span></div>
        <div class="spread small">
          <span :class="data.budget.over ? 'danger' : 'muted'">
            預算 {{ formatAmount(data.budget.budget) }}・{{ data.budget.over ? '超支' : '還剩' }}
            {{ formatAmount(Math.abs(data.budget.left)) }}
          </span>
          <span v-if="data.budget.perDay !== null" class="muted">
            剩 {{ data.budget.daysLeft }} 天，每天可花 {{ formatAmount(data.budget.perDay) }}
          </span>
        </div>
      </div>

      <div v-if="isMine" class="row small" style="justify-content:flex-end">
        <button v-if="!budgetOpen" class="ghost small" @click="openBudget">
          {{ data.settings.budget ? '改月預算' : '設定月預算' }}
        </button>
        <template v-else>
          <input v-model.number="budgetInput" type="number" min="0" inputmode="numeric" style="width:9rem" />
          <button class="ghost" @click="budgetOpen = false">取消</button>
          <button class="primary" @click="saveBudget">存</button>
        </template>
      </div>
    </div>

    <!-- 用講的記帳 -->
    <div v-if="isMine" class="card stack">
      <div class="spread">
        <b>用講的記帳</b>
        <span class="small muted">打字、錄音或丟截圖都可以</span>
      </div>
      <div class="row add-item">
        <input
          v-model="said" maxlength="300" :disabled="!!parsing || recording"
          placeholder="例如：早餐 60、咖啡 85、中午便當 120" aria-label="用一句話記帳"
          @keyup.enter="parse"
        />
        <button class="primary" :disabled="!!parsing || recording || !said.trim()" @click="parse">
          {{ parsing === 'text' ? '整理中…' : '整理' }}
        </button>
      </div>

      <div class="row inputs">
        <button
          v-if="recordable" class="icon wide" :class="{ rec: recording }"
          :disabled="!!parsing" :aria-pressed="recording" @click="toggleRecord"
        >
          <template v-if="recording">● 錄音中 {{ seconds }}s・點一下結束</template>
          <template v-else-if="parsing === 'audio'">聽打中…</template>
          <template v-else>🎤 用唸的</template>
        </button>
        <button class="icon wide" :disabled="!!parsing || recording" @click="shotInput.click()">
          {{ parsing === 'image' ? '看截圖中…' : '🧾 丟截圖' }}
        </button>
        <input
          ref="shotInput" type="file" accept="image/*" class="hidden-file"
          aria-label="上傳交易截圖" @change="pickShot"
        />
      </div>
      <p class="small muted" style="margin:0">
        截圖可以是 LINE Pay／Apple Pay 的交易明細、銀行刷卡通知、電子發票或收據，一張有幾筆就記幾筆。
        圖只用來辨識，不會存起來。
      </p>

      <template v-if="draft.length">
        <p class="small muted" style="margin:0">{{ draftNote }}　確認金額與分類後再記下來：</p>
        <div v-for="(d, i) in draft" :key="i" class="draft">
          <select v-model="d.category" aria-label="分類">
            <option v-for="c in categoriesFor(d.kind)" :key="c.id" :value="c.id">{{ c.icon }} {{ c.name }}</option>
          </select>
          <input v-model="d.item" class="grow" aria-label="項目" />
          <input v-model.number="d.amount" type="number" min="0" step="1" inputmode="decimal" class="amount" aria-label="金額" />
          <button class="icon" title="不要這筆" @click="draft.splice(i, 1)">✕</button>
          <span v-if="d.date !== date" class="small muted date-tag">{{ d.date }}</span>
        </div>
        <div class="row" style="justify-content:flex-end">
          <button class="ghost" @click="clearDraft">取消</button>
          <button class="primary" :disabled="savingDraft" @click="saveDraft">
            記下這 {{ draft.length }} 筆（{{ formatAmount(draftTotal) }}）
          </button>
        </div>
      </template>
      <p v-else-if="draftNote" class="small muted" style="margin:0">{{ draftNote }}</p>
    </div>

    <!-- 手動表單 -->
    <div v-if="showForm && isMine" class="card stack">
      <div class="row kinds">
        <button :class="{ on: form.kind === 'expense' }" @click="form.kind = 'expense'">支出</button>
        <button :class="{ on: form.kind === 'income' }" @click="form.kind = 'income'">收入</button>
      </div>

      <div class="cats">
        <button
          v-for="c in formCategories" :key="c.id"
          class="cat" :class="{ on: form.category === c.id }"
          :aria-pressed="form.category === c.id" @click="form.category = c.id"
        >
          <span class="cat-icon">{{ c.icon }}</span>
          <span class="small">{{ c.name }}</span>
        </button>
      </div>

      <div class="row two">
        <div class="f grow"><label>項目</label>
          <input v-model="form.item" maxlength="60" placeholder="例如：排骨飯" @keyup.enter="save" />
        </div>
        <div class="f"><label>金額</label>
          <input v-model.number="form.amount" type="number" min="0" step="1" inputmode="decimal" style="width:7rem" @keyup.enter="save" />
        </div>
      </div>

      <div class="row two">
        <div class="f grow"><label>日期</label><input v-model="form.date" type="date" /></div>
        <div class="f grow"><label>付款方式</label>
          <select v-model="form.pay">
            <option v-for="p in PAY_METHODS" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
      </div>

      <div class="f"><label>備註</label><input v-model="form.note" maxlength="200" /></div>

      <div v-if="!editingId && data?.frequent.length" class="stack" style="gap:.35rem">
        <span class="small muted">常用（點一下帶入）</span>
        <div class="chips">
          <button v-for="f in data.frequent" :key="f.item + f.kind" class="chip" @click="useFrequent(f)">
            {{ iconOf(f.category) }} {{ f.item }}
            <span class="muted">{{ formatAmount(f.amount) }}</span>
          </button>
        </div>
      </div>

      <div class="row" style="justify-content:flex-end">
        <button class="ghost" @click="cancel">取消</button>
        <button class="primary" :disabled="saving || !form.item.trim() || !(form.amount > 0)" @click="save">
          {{ editingId ? '更新' : '儲存' }}
        </button>
      </div>
    </div>

    <!-- 當天明細 -->
    <div v-if="loading && !data" class="card empty">載入中…</div>
    <div v-else-if="!data?.rows.length" class="card empty">
      <template v-if="isMine">這天還沒有帳。上面用講的或按「＋ 記一筆」都可以。</template>
      <template v-else>對方這天沒有記帳。</template>
    </div>
    <div v-else class="card stack" style="gap:.5rem">
      <div v-for="r in data.rows" :key="r.id" class="entry">
        <span class="cat-icon">{{ iconOf(r.category) }}</span>
        <div class="grow">
          <div class="item-line">
            {{ r.item }}
            <span class="badge">{{ nameOf(r.category) }}</span>
            <span v-if="r.source === 'ai'" class="badge ai">AI</span>
          </div>
          <div class="small muted">{{ payById(r.pay)?.name }}{{ r.note ? `・${r.note}` : '' }}</div>
        </div>
        <b :class="r.kind === 'income' ? 'income' : ''">
          {{ r.kind === 'income' ? '+' : '' }}{{ formatAmount(r.amount) }}
        </b>
        <span v-if="isMine" style="white-space:nowrap">
          <button class="icon" title="編輯" @click="edit(r)">✎</button>
          <button class="icon" title="刪除" @click="remove(r)">✕</button>
        </span>
      </div>
    </div>

    <!-- 本月花在哪 -->
    <div v-if="data?.byCategory.length" class="card stack" style="gap:.5rem">
      <div class="spread">
        <b>{{ monthLabel }}花在哪</b>
        <span class="small muted">{{ data.monthTotals.days }} 天有記帳</span>
      </div>
      <div v-for="c in data.byCategory" :key="c.category" class="cat-row">
        <span class="small">{{ c.icon }} {{ c.name }}</span>
        <div class="bar"><span :style="{ width: c.pct + '%' }"></span></div>
        <span class="small num">{{ formatAmount(c.amount) }}</span>
        <span class="small muted pct">{{ c.pct }}%</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.daybar { display:flex; align-items:center; justify-content:space-between; gap:.6rem; flex-wrap:wrap; padding:.7rem .9rem; }
.f { display:flex; flex-direction:column; gap:.25rem; }
.grow { flex:1; min-width:0; }
.two { gap:.6rem; align-items:flex-end; }
/* 輸入框預設 width:100%，不收著的話右邊的按鈕會被擠成直排 */
.add-item input { flex:1; min-width:0; }
.add-item button { flex:none; white-space:nowrap; }

.inputs { gap:.5rem; }
.inputs .wide { flex:1; white-space:nowrap; }
.inputs .rec { background:#c0523f; color:#fff; border-color:#c0523f; }
.hidden-file { display:none; }

.two-big { display:grid; grid-template-columns:1fr 1fr; gap:.8rem; }
.two-big > div { display:flex; flex-direction:column; gap:.1rem; min-width:0; }
.big { font-size:1.5rem; line-height:1.2; }
.danger { color:#c0523f; }
.income { color:var(--accent); }

/* 預算與分類共用同一種長條 */
.bar { height:8px; border-radius:99px; background:var(--surface-2); overflow:hidden; }
.bar > span { display:block; height:100%; border-radius:99px; background:var(--accent); }
.bar > span.over { background:#c0523f; }

.kinds button { flex:1; border-radius:10px; }
.kinds button.on { background:var(--accent-soft); color:var(--accent); border-color:var(--accent); }

/* 分類用圖示格選，比下拉選單快——記帳 App 最常按的就是這一區 */
.cats { display:grid; grid-template-columns:repeat(6, 1fr); gap:.4rem; }
@media (max-width:520px) { .cats { grid-template-columns:repeat(4, 1fr); } }
.cat { display:flex; flex-direction:column; align-items:center; gap:.15rem; padding:.45rem .2rem; border-radius:10px; }
.cat.on { background:var(--accent-soft); color:var(--accent); border-color:var(--accent); }
.cat-icon { font-size:1.2rem; line-height:1; }

.chips { display:flex; flex-wrap:wrap; gap:.4rem; }
.chip { padding:.3rem .7rem; border-radius:999px; font-size:.85rem; }

.draft { display:flex; gap:.4rem; align-items:center; flex-wrap:wrap; }
.draft select { width:auto; flex:none; }
.draft .amount { width:6rem; flex:none; text-align:right; }
.date-tag { flex-basis:100%; }

.entry { display:flex; gap:.6rem; align-items:center; }
.item-line { display:flex; gap:.4rem; align-items:center; flex-wrap:wrap; }

.cat-row { display:grid; grid-template-columns:6.5rem 1fr auto 2.5rem; gap:.5rem; align-items:center; }
.cat-row .pct { text-align:right; }
</style>
