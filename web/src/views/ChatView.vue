<script setup>
import { ref, onMounted, nextTick, computed, watch } from 'vue';
import { api, compressImage, photoUrl, MEAL_TYPES, CATEGORIES } from '../api.js';
import { openPhoto } from '../components/PhotoViewer.vue';
import ModelPicker from '../components/ModelPicker.vue';

const messages = ref([]);
const draft = ref('');
const sending = ref(false);
const error = ref('');
const geminiReady = ref(true);
const listEl = ref(null);
const fileEl = ref(null);
const pending = ref(null);      // { dataUrl, name } 待送出的照片
const preparing = ref(false);

/* ---- 模型選擇：記在這台裝置上，下次打開還是同一個 ---- */
const MODEL_KEY = 'fit.model';
const models = ref([]);
const model = ref((() => { try { return localStorage.getItem(MODEL_KEY) || 'auto'; } catch { return 'auto'; } })());
watch(model, (v) => { try { localStorage.setItem(MODEL_KEY, v); } catch { /* 私密模式存不了就算了 */ } });

const modelLabel = (id) => models.value.find(m => m.id === id)?.label || id;

async function refreshModels() {
  try {
    models.value = await api.models();
    // 記住的模型已經不在清單裡（例如 .env 改了）就回到自動
    if (model.value !== 'auto' && !models.value.some(m => m.id === model.value)) model.value = 'auto';
  } catch { /* 拿不到清單不影響聊天，選單只剩「自動」 */ }
}

const SUGGESTIONS = [
  '今天該怎麼練？幫我排一份課表',
  '我剛吃了兩顆蛋、一碗白飯和一杯豆漿',
  '剛做了深蹲 4 組 8 下 25 公斤',
  '我胃口很小，怎麼吃到 2000 大卡？',
  '幫我檢討這週的飲食和訓練',
];

const empty = computed(() => messages.value.length === 0);

function scrollDown() {
  nextTick(() => {
    const el = listEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

async function load() {
  try {
    const [history, health] = await Promise.all([api.chatHistory(), api.health(), refreshModels()]);
    messages.value = history;
    geminiReady.value = health.gemini;
    scrollDown();
  } catch (e) {
    error.value = e.message;
  }
}

async function pickImage(e) {
  const file = e.target.files?.[0];
  e.target.value = '';           // 同一張圖再選一次也要能觸發 change
  if (!file) return;
  error.value = '';
  preparing.value = true;
  try {
    pending.value = { dataUrl: await compressImage(file), name: file.name };
  } catch (err) {
    error.value = err.message;
  } finally {
    preparing.value = false;
  }
}

async function send(text = draft.value) {
  const msg = String(text).trim();
  const image = pending.value?.dataUrl || null;
  if ((!msg && !image) || sending.value) return;

  error.value = '';
  draft.value = '';
  pending.value = null;
  sending.value = true;
  messages.value.push({
    id: `tmp-${Date.now()}`, role: 'user', actions: [],
    content: msg || '（這張照片裡有什麼？幫我估熱量）',
    localImage: image,
  });
  scrollDown();

  try {
    const res = await api.sendChat(msg, image, model.value);
    messages.value.push({
      id: res.id, role: 'assistant', content: res.reply, actions: res.actions || [],
      model: res.model, requestedModel: res.requestedModel, fellBack: res.fellBack,
    });
    refreshModels();   // 更新今日額度狀態（剛才那個模型可能用完了）
  } catch (e) {
    error.value = e.message;
  } finally {
    sending.value = false;
    scrollDown();
  }
}

async function clearAll() {
  if (!confirm('確定要清空所有對話紀錄嗎？（訓練與飲食紀錄不會被刪除）')) return;
  await api.clearChat();
  messages.value = [];
}

function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send();
  }
}

/** 把工具呼叫翻成一句人看得懂的話 */
function describeAction(a) {
  const s = a.result?.saved;
  if (a.tool === 'log_meal' && s)
    return `已記錄飲食：${MEAL_TYPES[s.meal_type] || '點心'} ${s.name}${s.portion ? ` ${s.portion}` : ''} · ${Math.round(s.kcal)} kcal / 蛋白質 ${Math.round(s.protein_g)}g`;
  if (a.tool === 'log_workout' && s)
    return `已記錄訓練：${s.exercise}${s.sets ? ` ${s.sets}×${s.reps}` : ''}${s.weight_kg ? ` @${s.weight_kg}kg` : ''}${s.duration_min ? ` ${s.duration_min} 分鐘` : ''}（${CATEGORIES[s.category] || '其他'}）`;
  if (a.tool === 'log_weight' && s) return `已記錄體重：${s.weight_kg} kg`;
  if (a.tool === 'edit_meal') {
    if (!a.result?.ok) return `⚠️ 修改失敗：${a.result?.error || '找不到這筆紀錄'}`;
    const b = a.result.before, n = a.result.saved;
    const diff = [];
    if (b.name !== n.name) diff.push(`${b.name}→${n.name}`);
    if (b.portion !== n.portion) diff.push(`份量 ${b.portion || '—'}→${n.portion || '—'}`);
    if (Math.round(b.kcal) !== Math.round(n.kcal)) diff.push(`${Math.round(b.kcal)}→${Math.round(n.kcal)} kcal`);
    if (Math.round(b.protein_g) !== Math.round(n.protein_g)) diff.push(`蛋白質 ${Math.round(b.protein_g)}→${Math.round(n.protein_g)}g`);
    if (Math.round(b.carb_g) !== Math.round(n.carb_g)) diff.push(`碳水 ${Math.round(b.carb_g)}→${Math.round(n.carb_g)}g`);
    if (Math.round(b.fat_g) !== Math.round(n.fat_g)) diff.push(`脂肪 ${Math.round(b.fat_g)}→${Math.round(n.fat_g)}g`);
    return `已修改：${n.name}${diff.length ? '・' + diff.join('・') : ''}`;
  }
  if (a.tool === 'delete_meal' || a.tool === 'undo_last_meal') {
    const label = a.tool === 'undo_last_meal' ? '已撤銷' : '已刪除';
    if (!a.result?.ok) return `⚠️ ${a.result?.error || '沒有刪到任何紀錄'}`;
    const names = a.result.removed.map(r => `${r.name}（${Math.round(r.kcal)} kcal）`).join('、');
    return `${label}：${names}・今日累計 ${a.result.今日累計}`;
  }
  if (a.tool === 'update_goal' && a.result?.修改後) {
    const b = a.result.修改前, n = a.result.修改後;
    return `已更新目標：${n.目標}・每日 ${b.熱量}→${n.熱量} kcal・蛋白質 ${b.蛋白質}→${n.蛋白質}g（今日頁已同步）`;
  }
  if (a.tool === 'get_records') return '查詢了歷史紀錄';
  return a.tool;
}

const loggingActions = (m) => (m.actions || []).filter(a => a.tool !== 'get_records');

/** 極簡 markdown：**粗體**、清單、段落 */
function render(text) {
  const esc = String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^#{1,6}\s*(.+)$/gm, '<strong>$1</strong>')
    .replace(/^\s*[-*]\s+(.+)$/gm, '<span class="li">• $1</span>')
    .replace(/^\s*(\d+)\.\s+(.+)$/gm, '<span class="li">$1. $2</span>')
    .replace(/\n/g, '<br>');
}

onMounted(load);
</script>

<template>
  <div class="chat">
    <div v-if="!geminiReady" class="error" style="margin-bottom:.8rem">
      尚未設定 Gemini API key。請編輯 <code>server/.env</code> 填入 <code>GEMINI_API_KEY</code> 後重啟後端。
    </div>

    <div ref="listEl" class="messages">
      <div v-if="empty" class="welcome">
        <div class="hero">🏋️‍♀️</div>
        <h2>跟教練聊聊吧</h2>
        <p class="muted small">
          問訓練、問吃什麼都可以。<br>
          說「我吃了…」「我練了…」，教練會自動記進資料庫。<br>
          也可以按 📷 直接拍餐點照片，讓它辨識熱量。
        </p>
      </div>

      <div v-for="m in messages" :key="m.id" class="msg" :class="m.role">
        <img v-if="m.localImage || m.image" class="photo"
             :src="m.localImage || photoUrl(m.image)" alt="上傳的餐點照片"
             @click="openPhoto(m.localImage || photoUrl(m.image))" />
        <div class="bubble" v-html="render(m.content)"></div>
        <div v-if="m.role === 'assistant' && m.model" class="by">
          {{ modelLabel(m.model) }}
          <template v-if="m.fellBack">・{{ modelLabel(m.requestedModel) }} 今日額度用完，已自動改用</template>
        </div>
        <div v-if="loggingActions(m).length" class="actions">
          <div v-for="(a, i) in loggingActions(m)" :key="i" class="action">
            <span class="dot">✓</span>{{ describeAction(a) }}
          </div>
        </div>
      </div>

      <div v-if="sending" class="msg assistant">
        <div class="bubble typing"><span></span><span></span><span></span></div>
      </div>
    </div>

    <div v-if="error" class="error" style="margin:.6rem 0">{{ error }}</div>

    <div v-if="empty" class="chips">
      <button v-for="s in SUGGESTIONS" :key="s" class="chip" @click="send(s)">{{ s }}</button>
    </div>

    <div v-if="pending" class="pending">
      <img :src="pending.dataUrl" alt="待送出的照片" />
      <div class="stack" style="gap:.2rem; flex:1; min-width:0">
        <span class="small">照片已準備好</span>
        <span class="small muted">送出後教練會辨識裡面的食物並估算熱量</span>
      </div>
      <button class="icon" title="移除" @click="pending = null">✕</button>
    </div>

    <div class="composer">
      <input ref="fileEl" type="file" accept="image/*" hidden @change="pickImage" />
      <button class="attach" :disabled="sending || preparing" title="上傳餐點照片"
              @click="fileEl.click()">
        {{ preparing ? '…' : '📷' }}
      </button>
      <textarea
        v-model="draft"
        rows="1"
        :placeholder="pending ? '想補充什麼嗎？' : '輸入訊息…'"
        @keydown="onKeydown"
      ></textarea>
      <ModelPicker v-model="model" :models="models" :disabled="sending" />
      <button class="primary send" :disabled="sending || (!draft.trim() && !pending)" @click="send()">送出</button>
    </div>
    <div class="spread small muted" style="margin-top:.4rem">
      <span>由 Gemini 提供建議，僅供參考，不構成醫療建議。</span>
      <button v-if="!empty" class="icon" @click="clearAll">清空對話</button>
    </div>
  </div>
</template>

<style scoped>
.chat { display: flex; flex-direction: column; height: 100%; }

.messages {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: .9rem;
  padding-bottom: .5rem;
}

.welcome { text-align: center; padding: 2.5rem 1rem 1rem; }
.hero { font-size: 2.6rem; }

.msg { display: flex; flex-direction: column; max-width: 88%; }
.msg.user { align-self: flex-end; align-items: flex-end; }
.msg.assistant { align-self: flex-start; }

.bubble {
  padding: .65rem .9rem;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--border);
  word-break: break-word;
}
.msg.user .bubble {
  background: var(--accent-dim);
  border-color: #3d8a67;
  color: #eafff4;
}
.bubble :deep(.li) { display: block; padding-left: .3rem; }
.bubble :deep(strong) { color: var(--accent); }
.msg.user .bubble :deep(strong) { color: #fff; }

.actions { margin-top: .35rem; display: flex; flex-direction: column; gap: .25rem; }
.action {
  font-size: .78rem;
  color: var(--accent);
  background: rgba(110, 231, 168, .08);
  border: 1px solid var(--accent-dim);
  border-radius: 8px;
  padding: .25rem .55rem;
}
.dot { margin-right: .35rem; }

.typing { display: flex; gap: 4px; align-items: center; padding: .85rem .9rem; }
.typing span {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--muted);
  animation: blink 1.2s infinite;
}
.typing span:nth-child(2) { animation-delay: .2s; }
.typing span:nth-child(3) { animation-delay: .4s; }
@keyframes blink { 0%, 60%, 100% { opacity: .25; } 30% { opacity: 1; } }

.chips { display: flex; flex-wrap: wrap; gap: .4rem; margin-bottom: .6rem; }
.chip {
  font-size: .8rem;
  padding: .35rem .7rem;
  border-radius: 999px;
  color: var(--muted);
}

.composer {
  position: relative;          /* 模型選單的面板以這裡為基準，撐滿整條輸入列 */
  display: flex;
  gap: .5rem;
  align-items: flex-end;
}
.by {
  margin-top: .25rem;
  font-size: .72rem;
  color: var(--muted);
  opacity: .75;
}
.composer textarea {
  flex: 1 1 auto;
  min-width: 0;                 /* 沒有這行，長文字會把兩側按鈕擠掉 */
  min-height: 42px;
  max-height: 160px;
}
.attach, .send {
  flex: 0 0 auto;
  height: 42px;
  white-space: nowrap;          /* 手機寬度下「送出」原本會斷成兩行 */
}
.attach {
  width: 42px;
  padding: 0;
  font-size: 1.15rem;
  line-height: 1;
}

.photo {
  cursor: zoom-in;
  max-width: min(260px, 70vw);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  margin-bottom: .35rem;
  display: block;
}

.pending {
  display: flex;
  align-items: center;
  gap: .7rem;
  padding: .5rem;
  margin-bottom: .6rem;
  background: var(--surface);
  border: 1px solid var(--accent-dim);
  border-radius: var(--radius);
}
.pending img {
  width: 52px; height: 52px;
  object-fit: cover;
  border-radius: 9px;
  flex: 0 0 auto;
}
</style>
