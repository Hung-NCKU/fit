<script setup>
import {loadCachedPage,patchCachedPage} from '../page-cache.js';
import { confirmAction } from '../confirm.js';
import { ref, onMounted, onUnmounted, nextTick, computed, watch } from 'vue';
import { api, compressImage, photoUrl, MEAL_TYPES, CATEGORIES } from '../api.js';
import { openPhoto } from '../components/PhotoViewer.vue';
import ModelPicker from '../components/ModelPicker.vue';
import { session } from '../auth.js';
import { recordFeedback } from '../pet-feedback.js';

const chatCacheKey=['chat',session.user,new Date().toLocaleDateString('sv-SE')];
onUnmounted(()=>{if(!bookmarkBrowsing.value)patchCachedPage(chatCacheKey,previous=>[messages.value,{...previous[1],gemini:geminiReady.value},coachPlan.value]);});
const messages = ref([]);
const bookmarkOpen=ref(false),bookmarkItems=ref([]),bookmarkFetched=ref(false),bookmarkLoading=ref(false),bookmarkMore=ref(false),bookmarkBefore=ref(null),bookmarkBrowsing=ref(false),bookmarkError=ref(''),focusedBookmark=ref(null);
let bookmarkSequence=0,bookmarkTimer;
const bookmarks=computed(()=>{
 const map=new Map(bookmarkItems.value.map(item=>[String(item.id),item]));
 for(const message of messages.value.filter(m=>m.role==='user'))map.set(String(message.id),{id:message.id,preview:message.content?.slice(0,100) || '圖片提問',created_at:message.created_at});
 return [...map.values()].sort((a,b)=>String(b.id).startsWith('tmp-')-String(a.id).startsWith('tmp-') || (Number(b.id)||0)-(Number(a.id)||0));
});
async function loadBookmarks(more=false){
 if(bookmarkLoading.value)return;const sequence=bookmarkSequence;bookmarkLoading.value=true;bookmarkError.value='';
 try {const result=await api.chatBookmarks(more?bookmarkBefore.value:null);if(disposed || sequence!==bookmarkSequence)return;bookmarkItems.value=more?[...bookmarkItems.value,...result.items]:result.items;bookmarkMore.value=result.hasMore;bookmarkBefore.value=result.nextBefore;bookmarkFetched.value=true;}
 catch(e){if(!disposed)bookmarkError.value=e.message;}finally{bookmarkLoading.value=false;}
}
watch(bookmarkOpen,value=>{if(value && !bookmarkFetched.value)loadBookmarks();});

async function jumpToQuestion(item){
 const sequence=++bookmarkSequence;bookmarkBrowsing.value=true;bookmarkError.value='';
 try {
  if(!messages.value.some(m=>String(m.id)===String(item.id))){bookmarkLoading.value=true;const context=await api.chatQuestion(item.id);if(disposed || sequence!==bookmarkSequence)return;messages.value=context;}
  await nextTick();
  const node=document.getElementById('chat-message-'+item.id);if(!node)throw new Error('找不到問題位置，請重新開啟書籤');
  focusedBookmark.value=item.id;node.focus({preventScroll:true});node.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  clearTimeout(bookmarkTimer);bookmarkTimer=setTimeout(()=>{focusedBookmark.value=null;},2500);
 }catch(e){if(!disposed)bookmarkError.value=e.message;}finally{if(sequence===bookmarkSequence)bookmarkLoading.value=false;}
}
async function returnLatest(){
 ++bookmarkSequence;bookmarkLoading.value=true;bookmarkError.value='';
 try {const history=await api.chatHistory();if(disposed)return false;messages.value=history;bookmarkBrowsing.value=false;focusedBookmark.value=null;scrollDown();return true;}
 catch(e){if(!disposed)bookmarkError.value=e.message;return false;}finally{bookmarkLoading.value=false;}
}
onUnmounted(()=>{++bookmarkSequence;clearTimeout(bookmarkTimer);});
const coachPlan=ref(null), composerEl=ref(null);
function preparePlanChange() {draft.value='我想調整訓練和飲食計畫，';nextTick(()=>composerEl.value?.focus());}
let reminderTimer;
async function refreshReminders() {
  if(disposed || sending.value || bookmarkBrowsing.value || document.hidden) return;
  const sequence=submitSequence;
  try {
    const [history,plan]=await Promise.all([api.chatHistory(),api.coachPlan()]);
    if(disposed || sending.value || bookmarkBrowsing.value || sequence!==submitSequence) return;
    const changed=history.at(-1)?.id !== messages.value.at(-1)?.id;
    messages.value=history;coachPlan.value=plan;
    if(changed) scrollDown();
  } catch {}
}

const draft = ref('');
const sending = ref(false);
const error = ref('');
const geminiReady = ref(true);
const listEl = ref(null);
const fileEl = ref(null);
const pending = ref(null);      // { dataUrl, name } 待送出的照片
const preparing = ref(false);
const phase = ref('');
const receipt = ref(null);
const elapsed = ref(0);
let lastPayload = null;
let statusTimer, elapsedTimer, startedAt;
let feedbackReceipt = '';
let disposed = false;
let statusSequence = 0, submitSequence = 0;
const receiptKey = () => `fit.chat.request.${session.user}`;
function remember(id) { try { sessionStorage.setItem(receiptKey(), id); } catch {} }
function forget() { try { sessionStorage.removeItem(receiptKey()); } catch {} }
function startWaiting(id) {
  receipt.value = { request_id: id, state: 'running' };
  sending.value = true; startedAt = Date.now(); elapsed.value = 0;
  clearInterval(elapsedTimer);
  elapsedTimer = setInterval(() => { elapsed.value = Math.floor((Date.now() - startedAt) / 1000); }, 1000);
  clearTimeout(statusTimer); statusTimer = setTimeout(checkStatus, 800);
}
async function checkStatus() {
  clearTimeout(statusTimer);
  if (disposed) return;
  const id = receipt.value?.request_id;
  if (!id) return;
  const sequence = ++statusSequence;
  try {
    const status = await api.chatStatus(id);
    if (disposed || sequence !== statusSequence || receipt.value?.request_id !== id) return;
    receipt.value = status; phase.value = status.phase;
    if (status.state !== 'running') {
      sending.value = false; clearInterval(elapsedTimer); forget();
      error.value = status.state === 'done' ? '' : status.error;
      if (feedbackReceipt !== id) {
        const logged = status.actions?.find(a => /^log_(meal|workout|weight)$/.test(a.tool) && a.result?.ok);
        if (logged) recordFeedback(logged.tool.replace('log_', ''));
        feedbackReceipt = id;
      }
      const history = await api.chatHistory();
      if (!disposed && !bookmarkBrowsing.value && sequence === statusSequence && receipt.value?.request_id === id) { messages.value = history; scrollDown(); }
      return;
    }
  } catch (e) {
    if (disposed || sequence !== statusSequence || receipt.value?.request_id !== id) return;
    if ((e.status === 404 && Date.now() - startedAt > 5000) || Date.now() - startedAt > 120_000) {
      sending.value = false; clearInterval(elapsedTimer);
      phase.value = '暫時無法確認處理結果';
      error.value = '暫時無法確認回覆狀態，請先查看紀錄或重新整理；不要重複新增同一筆。';
      return;
    }
  }
  if (disposed) return;
  statusTimer = setTimeout(checkStatus, 1500);
}
async function cancelSend() {
  try { await api.cancelChat(receipt.value.request_id); await checkStatus(); }
  catch (e) { error.value = e.message; }
}
async function retrySend() {
  if (!lastPayload || !receipt.value?.canRetry || sending.value) return;
  await submitPayload(lastPayload, true);
}
async function submitPayload(payload, retry = false) {
  const sequence = ++submitSequence;
  lastPayload = payload; error.value = ''; phase.value = '準備訊息';
  remember(payload.id); startWaiting(payload.id);
  try {
    await api.sendChat(payload.msg, payload.image, payload.model, payload.id, retry);
  } catch (e) { if (!disposed && sequence === submitSequence && receipt.value?.request_id === payload.id) error.value = e.message; }
  // 查詢同一張收據；斷線後不以新訊息重送，避免重複寫入。
  if (disposed || sequence !== submitSequence || receipt.value?.request_id !== payload.id) return;
  await checkStatus(); refreshModels();
}

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
    if (el && !bookmarkBrowsing.value) el.scrollTop = el.scrollHeight;
  });
}

async function load() {
  const sequence=submitSequence;
  try {
    const apply=([history,health,plan])=>{messages.value=history;coachPlan.value=plan;geminiReady.value=health.gemini;scrollDown();};
    const [history,health,plan]=await loadCachedPage(chatCacheKey,()=>Promise.all([api.chatHistory(),api.health(),api.coachPlan()]),cached=>{if(!disposed)apply(cached);});
    if(disposed || sending.value || bookmarkBrowsing.value || sequence!==submitSequence)return;
    refreshModels();
    messages.value = history;
    coachPlan.value=plan;
    geminiReady.value = health.gemini;
    scrollDown();
    let savedId; try { savedId = sessionStorage.getItem(receiptKey()); } catch {}
    if (savedId) { startWaiting(savedId); await checkStatus(); }
    // 離開頁面時還沒回完的話，回來後最多再等一分鐘讓回覆出現
    const last = history[history.length - 1];
    if (!savedId && last && last.role === 'user') { pollLeft = 12; pollTimer = setTimeout(syncHistory, 5000); }
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

  if(bookmarkBrowsing.value && !await returnLatest())return;
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

  await submitPayload({ msg, image, model: model.value, id: crypto.randomUUID() });
}

/** 重新讀對話歷史；最後一則還是自己說的話，代表伺服器還在想 → 稍後再看 */
let pollTimer = null;
let pollLeft = 0;
async function syncHistory() {
  try {
    const history=await api.chatHistory();
    if(disposed || bookmarkBrowsing.value)return;
    messages.value=history;
    scrollDown();
  } catch { /* 下次再試 */ }
  const last = messages.value[messages.value.length - 1];
  if (last && last.role === 'user' && pollLeft > 0) {
    pollLeft--;
    clearTimeout(pollTimer);
    pollTimer = setTimeout(syncHistory, 5000);
  }
}
onUnmounted(() => { disposed = true; clearTimeout(pollTimer); clearTimeout(statusTimer); clearInterval(elapsedTimer); });

async function clearAll() {
  if (!await confirmAction('確定要清空所有對話紀錄嗎？（訓練與飲食紀錄不會被刪除）')) return;
  await api.clearChat();
  ++bookmarkSequence;messages.value = [];bookmarkItems.value=[];bookmarkFetched.value=false;bookmarkBrowsing.value=false;bookmarkOpen.value=false;
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

onMounted(()=>{load();reminderTimer=setInterval(refreshReminders,30_000);document.addEventListener('visibilitychange',refreshReminders);});
onUnmounted(()=>{clearInterval(reminderTimer);document.removeEventListener('visibilitychange',refreshReminders);});
</script>

<template>
  <div class="chat">
    <details class="question-bookmarks" :open="bookmarkOpen" @toggle="bookmarkOpen=$event.target.open">
      <summary>我的提問書籤<span v-if="bookmarks.length">（{{ bookmarks.length }}）</span></summary>
      <div class="bookmark-content">
      <p class="small muted">點選問題，跳到當時的提問與附近回答。</p>
      <div class="bookmark-list"><button v-for="item in bookmarks" :key="item.id" :disabled="bookmarkLoading" :aria-controls="'chat-message-'+item.id" @click="jumpToQuestion(item)"><span>{{ item.preview || '圖片提問' }}</span><small v-if="item.created_at">{{ item.created_at }}</small></button></div>
      <p v-if="!bookmarks.length && !bookmarkLoading" class="small muted">送出提問後會自動出現在這裡。</p>
      <button v-if="bookmarkMore" :disabled="bookmarkLoading" @click="loadBookmarks(true)">載入更早的提問</button>
      <p v-if="bookmarkLoading" class="small" role="status">讀取問題中…</p>
      </div>
    </details>
    <details v-if="coachPlan" class="coach-plan-card"><summary>我的{{ coachPlan.goal }}計畫 · 08:00 安排 · 00:00 回顧</summary><p class="small muted">台灣時間 · 早上提供安排，午夜回顧前一天的飲食、運動與當日體態紀錄。依已記錄資料與目前目標產生規則式建議；服務離線時恢復後補上前一天回顧。</p><p>{{ coachPlan.basis }}</p><template v-if="!coachPlan.needsAssessment"><p>每日 {{ coachPlan.target.kcal }} kcal · 蛋白質 {{ coachPlan.target.protein }}g</p><p>{{ coachPlan.rationale }}</p><ul><li v-for="e in coachPlan.strength" :key="e.name">{{ e.name }}：{{ e.sets }} 組 × {{ e.reps }}</li></ul><p class="small muted">{{ coachPlan.assumptions }}</p></template><p v-else>請先確認個人健康限制，再安排具體訓練與飲食。</p><button type="button" @click="preparePlanChange">跟教練調整計畫</button></details>
    <div v-if="!geminiReady" class="error" style="margin-bottom:.8rem">
      AI 對話暫時無法使用；預設計畫與每日提醒仍可查看，也能直接記錄飲食與訓練。
    </div>


    <div v-if="bookmarkBrowsing" class="bookmark-location small"><span>正在查看書籤問題</span><button :disabled="bookmarkLoading" @click="returnLatest">回到最新對話</button></div>
    <p v-if="bookmarkError" class="error small" role="alert">{{ bookmarkError }}</p>
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

      <div v-for="m in messages" :key="m.id" :id="'chat-message-'+m.id" tabindex="-1" class="msg" :class="[m.role,{'bookmark-focus':focusedBookmark===m.id}]">
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
        <p class="small muted" role="status" aria-live="polite">{{ phase }} · {{ elapsed }} 秒</p>
        <p v-if="elapsed >= 15" class="small muted">模型可能正在排隊；紀錄完成後會保留，不需要重複送出。</p>
        <button class="small" @click="cancelSend">取消回覆</button>
      </div>
    </div>

    <div v-if="error" class="error" style="margin:.6rem 0">{{ error }}</div>
    <div v-if="!sending && receipt && receipt.state !== 'done'" class="row wrap">
      <button v-if="receipt.canRetry && lastPayload" @click="retrySend">重試這則訊息</button>
      <RouterLink to="/meals">查看飲食紀錄</RouterLink>
      <span v-if="receipt.actions?.some(a => a.tool !== 'get_records')" class="small muted">已有處理紀錄，請先查看，避免再次新增。</span>
    </div>
    <div class="row wrap small" style="margin:.5rem 0">
      <RouterLink to="/meals?new=1">直接記飲食</RouterLink>
      <RouterLink to="/workouts?new=1">直接記訓練</RouterLink>
      <span class="muted">不用等待 AI</span>
    </div>

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
      <textarea ref="composerEl"
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
      <button v-if="!empty" class="icon" :disabled="sending" @click="clearAll">清空對話</button>
    </div>
  </div>
</template>

<style scoped>
.question-bookmarks{position:sticky;top:0;z-index:4;flex:0 0 auto;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:.65rem .8rem;margin-bottom:.6rem;}.bookmark-content{max-height:28vh;overflow:auto;overscroll-behavior:contain}.question-bookmarks summary{cursor:pointer;font-size:.85rem;font-weight:650}.bookmark-list{display:grid;gap:.4rem}.bookmark-list button{text-align:left;display:grid;gap:.2rem;min-width:0}.bookmark-list button span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.bookmark-list small{color:var(--muted);font-size:.65rem}.bookmark-location{display:flex;justify-content:space-between;align-items:center;gap:.5rem;margin-bottom:.5rem}.bookmark-location button{font-size:.75rem}.bookmark-focus .bubble{outline:3px solid var(--accent);outline-offset:3px}.msg:focus{outline:none}
.chat { display: flex; flex-direction: column; height: 100%; }

.messages {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
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
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
.bubble :deep(.li) { display: block; padding-left: .3rem; }
.bubble :deep(strong) { color: var(--accent); }
.msg.user .bubble :deep(strong) { color: #fff; }

.actions { margin-top: .35rem; display: flex; flex-direction: column; gap: .25rem; }
.action {
  font-size: .78rem;
  color: var(--accent);
  background: var(--accent-soft);
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

.coach-plan-card {padding:.7rem 1rem;margin-bottom:.7rem;background:var(--accent-soft);border-radius:14px;flex-shrink:0;font-size:.85rem;max-height:45vh;overflow:auto;}.coach-plan-card summary {font-weight:650;cursor:pointer;}.coach-plan-card p {line-height:1.6;}.coach-plan-card ul {padding-left:1.2rem;}
</style>
