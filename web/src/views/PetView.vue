<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { api } from '../api.js';
import { session } from '../auth.js';
import UserTabs from '../components/UserTabs.vue';
import PetCarousel from '../components/PetCarousel.vue';
import PetActor from '../components/PetActor.vue';
import RoomDecor from '../components/RoomDecor.vue';
import DecorArt from '../components/DecorArt.vue';
import OutfitFrames from '../components/OutfitFrames.vue';
import { consumeFeedback } from '../pet-feedback.js';
import { confirmAction } from '../confirm.js';

const viewing = ref(session.user);
const data = ref(null);
const loading = ref(true);
const error = ref('');
// 用 null 而不是空字串：Vue 對布林屬性的規則是「空字串＝屬性存在」，
// :disabled="busy" 在 busy 為 '' 時會真的把按鈕停用掉。
const busy = ref(null);
const tab = ref('home');            // home | shop
const arranging = ref(false);
const decorSelected = ref('');
const shopSection = ref('全部');
const shopSearch = ref('');
const shopOwned = ref('all');
const roomUndo = ref([]);
const celebration = ref(null);
function receiveFeedback() { if (mine.value) celebration.value = consumeFeedback(); }
onMounted(() => { receiveFeedback(); window.addEventListener('fit-record-saved', receiveFeedback); });
onUnmounted(() => window.removeEventListener('fit-record-saved', receiveFeedback));
watch(tab, () => { arranging.value = false; });
const picked = ref('');
const petName = ref('');

// 跟其他頁一樣：切換使用者時可能有兩個請求同時在飛，只採用最後一次的結果
let reqId = 0;

async function load() {
  const mine = ++reqId;
  loading.value = true;
  error.value = '';
  try {
    const d = await api.pet(viewing.value);
    if (mine !== reqId) return;
    data.value = d;
  } catch (e) {
    if (mine !== reqId) return;
    error.value = e.message;
  } finally {
    if (mine === reqId) loading.value = false;
  }
}

watch(viewing, () => { data.value = null; tab.value = 'home'; trying.value = null; purchase.value = null; renaming.value = false; load(); });
onMounted(load);

const pet = computed(() => data.value?.pet || null);
const state = computed(() => data.value?.state || null);
const mine = computed(() => data.value?.mine !== false);
const owned = computed(() => new Set(data.value?.owned || []));
const equipped = computed(() => pet.value?.equipped || {});
watch(() => `${viewing.value}:${equipped.value.bg}`, () => { roomUndo.value=[]; decorSelected.value=''; });
// 生活習性：作息曲線與專屬動作，來源是 pet/動物特性.txt


/** 場景依手機／桌機宽度變化，寵物與落地位置跟著實際高度縮放。 */
const sceneEl = ref(null);
const sceneHeight = ref(230);
const sceneWidth = ref(400);
let sceneObserver;
watch(sceneEl, el => {
  sceneObserver?.disconnect();
  if (!el) return;
  sceneHeight.value = el.clientHeight || 230;
  sceneWidth.value = el.clientWidth || 400;
  sceneObserver = new ResizeObserver(() => { sceneHeight.value = el.clientHeight; sceneWidth.value=el.clientWidth; });
  sceneObserver.observe(el);
});
onUnmounted(() => sceneObserver?.disconnect());

/** 插畫檔名：<id>.webp 是整張卡，<id>-pet.webp 只有動物本體 */
/** 角色卡（選寵物用）與去背的本體（場景用） */
const petCard = (id) => `/pets/${id}.webp`;

/** 輪播要的是 { id, name, nick, img } */
const choices = computed(() =>
  (data.value?.species || []).map(s => ({ ...s, img: petCard(s.id) })));


const sceneImg = computed(() => {
  const id = shown.value.bg || 'bg_room';
  return `/pets/scene-${id.replace(/^bg_/, '')}-v2.webp`;
});



const itemById = (id) => (data.value?.shop || []).find(i => i.id === id) || null;

/* ---------------- 試穿 ---------------- */

/**
 * 商城點一下是「試穿」，不是「買」。
 *
 * 一頂帽子在角色卡上好看，戴到自己那隻身上不一定好看；而且代幣得靠
 * 好好吃飯賺，買錯沒有退款。所以先把東西套到寵物身上給你看，確認了才扣款。
 */
const trying = ref(null);

/** 畫面上要顯示的穿戴狀態：試穿中的東西蓋過實際穿著的 */
const shown = computed(() => (
  trying.value ? { ...equipped.value, [trying.value.slot]: trying.value.id } : equipped.value
));

const tryOn = (item) => { trying.value = trying.value?.id === item.id ? null : item; };

/** 確認才真的買。買過的只是換上，不扣款。 */
function confirmTry() {
  const item = trying.value;
  if (!item) return;
  act(async () => {
    // buyItem 本來就會順手換上，所以買過的才需要另外呼叫 equip
    if (owned.value.has(item.id)) await api.equipItem(item.id, pet.value.petKey);
    else await api.buyItem(item.id, pet.value.petKey);
    trying.value = null;
  }, 'try');
}

const bg = computed(() => itemById(shown.value.bg));
const outfit = computed(() => itemById(shown.value.outfit));

/** 穿戴類跟著個別寵物；房間擺飾獨立保存位置。 */
const worn = computed(() => [outfit.value].filter(Boolean));


/** 體態只影響顯示大小，不改 emoji —— 同一隻動物胖瘦用縮放表現最直覺 */


// 完整套裝一次換上；房間裝飾獨立保存，不佔穿搭部位。
const SLOTS = [
  { id: 'bg',    label: '環境' },
  { id: 'outfit', label: '套裝' },
];

/** 商城照後端給的分區排，一區一張卡 */
const shopGroups = computed(() => {
  const list = (data.value?.shop || []).filter(i=>i.name.includes(shopSearch.value.trim()) && (shopOwned.value==='all' || owned.value.has(i.id) === (shopOwned.value==='owned')));
  const names = [...new Set(list.map(i => i.group))];
  return names.filter(g => shopSection.value === '全部' || g === shopSection.value).map(g => ({ group: g, items: list.filter(i => i.group === g) }));
});
const shopSections = computed(() => ['全部', '寵物', ...new Set((data.value?.shop || []).map(i=>i.group))]);
const petsForSale = computed(() => shopOwned.value === 'owned' ? [] : (data.value?.petsForSale || []).filter(i=>i.name.includes(shopSearch.value.trim())));
const decorations = computed(() => {
  const list = data.value?.decorations || [];
  return trying.value?.slot === 'decor' && !list.some(i=>i.id===trying.value.id)
    ? [...list, {...trying.value,x:70,y:85,scale:1}] : list;
});
const selectedDecor = computed(() => (data.value?.decorations || []).find(i=>i.id===decorSelected.value));
const storedDecor = computed(() => (data.value?.shop || []).filter(i=>i.slot==='decor' && owned.value.has(i.id) && !(data.value?.decorations || []).some(p=>p.id===i.id)));
const isUsed = item => item.slot === 'decor' ? (data.value?.decorations || []).some(i=>i.id===item.id) : equipped.value[item.slot]===item.id;
const snapshot = () => (data.value?.decorations || []).map(i=>({id:i.id,x:i.x,y:i.y,scale:i.scale,locked:!!i.locked,layer:i.layer || 0}));
const moveDecor = ({id,position}) => act(async()=>{
  const before=snapshot();
  try {
    const after=await api.arrangeDecor(id,position,before);
    roomUndo.value=[...roomUndo.value.slice(-19),{before,after}];
  } catch(e) { roomUndo.value=[]; await load(); throw e; }
},'arrange');
const editDecor = patch => {
  const item=selectedDecor.value;
  if(item) moveDecor({id:item.id,position:{x:item.x,y:item.y,scale:item.scale,locked:!!item.locked,layer:item.layer || 0,...patch}});
};
const undoRoom = () => act(async()=>{
  const last=roomUndo.value.at(-1);
  if(!last) return;
  try { await api.restoreRoom(last.before,last.after); roomUndo.value.pop(); }
  catch(e) {roomUndo.value=[];throw e;}
},'undo');
async function resetRoom() {
  if(!await confirmAction('將這個環境的裝飾移回預設位置並解鎖？已購買的商品會保留，也可以撤銷這次重設。')) return;
  act(async()=>{
    const before=snapshot();
    const items=before.map((i,n)=>({...i,x:15+n%6*14,y:72+Math.floor(n/6)%3*8,scale:1,layer:0,locked:false}));
    const after=await api.restoreRoom(items,before);
    roomUndo.value=[...roomUndo.value.slice(-19),{before,after}];
  },'reset');
}
const resizeDecor = event => {
  const item=selectedDecor.value;
  if (item) editDecor({scale:Number(event.target.value)});
};
const movePet = ({petKey,position})=>act(async()=>{
  try {await api.movePet(petKey,position);}
  catch(e) {await load();throw e;}
},'move-pet');
function toggleArranging() {
  arranging.value = !arranging.value;
  trying.value = null;
  if (arranging.value) sceneEl.value?.scrollIntoView({ behavior:'smooth', block:'start' });
}

async function act(fn, key) {
  if (busy.value) return;
  busy.value = key;
  error.value = '';
  try { await fn(); await load(); }
  catch (e) { error.value = e.message; }
  finally { busy.value = null; }
}

const adopt = () => act(() => api.adoptPet(picked.value, petName.value), 'adopt');

/* 換一隻：舊的代幣與買過的東西都會清掉，所以一定要先確認 */
const changing = ref(false);

function startChange() {
  picked.value = '';
  petName.value = '';
  agreed.value = false;
  changing.value = true;
}

/**
 * 換寵物前要先勾同意。
 *
 * 原本用原生的 confirm()，結果出過兩次意外：畫面上誤觸「確認換成這隻」，
 * 系統對話框跳出來之後再誤觸一次（確定鈕就在手指附近），整隻寵物連同
 * 代幣與買過的東西就沒了，而且無法復原。
 *
 * 改成頁面內的勾選框：兩次操作在畫面上的位置差很遠，不可能連續誤觸，
 * 而且離開面板就自動取消，不會留著一個「已確認」的狀態等人踩。
 */
const agreed = ref(false);

function confirmChange() {
  if (!picked.value || !agreed.value) return;
  act(async () => {
    await api.replacePet(picked.value, petName.value, pet.value?.name);
    changing.value = false;
    agreed.value = false;
    tab.value = 'home';
  }, 'change');
}
const unequip = (slot) => act(() => api.unequipSlot(slot, pet.value.petKey), 'un' + slot);


const roster = computed(() => data.value?.roster || []);
const purchase = ref(null);
const purchaseName = ref('');
const purchaseId = ref('');
const renaming = ref(false);
const renameName = ref('');
function choosePet(key) {
  if (!mine.value || key === pet.value?.petKey) return;
  trying.value = null;
  act(() => api.selectPet(key), 'select');
}
function openPurchase(animal) {
  purchase.value = animal; purchaseName.value = ''; purchaseId.value = crypto.randomUUID();
}
function confirmPurchase() {
  const animal = purchase.value;
  if (!animal || !purchaseName.value.trim()) return;
  act(async () => {
    await api.purchasePet(animal.species, purchaseName.value, purchaseId.value);
    purchase.value = null; trying.value = null; tab.value = 'home';
  }, 'purchase');
}
function confirmRename() {
  act(async () => { await api.renamePet(pet.value.petKey, renameName.value); renaming.value = false; }, 'rename');
}

</script>

<template>
  <div class="stack pet-page">
    <UserTabs v-model="viewing" />

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="loading && !data" class="card empty">載入中…</div>

    <div v-if="purchase || renaming" class="pet-modal" role="dialog" aria-modal="true" aria-labelledby="pet-dialog-title">
      <form class="card stack" @submit.prevent="purchase ? confirmPurchase() : confirmRename()">
        <h3 id="pet-dialog-title">{{ purchase ? `購買${purchase.name}` : '幫寵物改名' }}</h3>
        <template v-if="purchase">
          <img class="purchase-face" :src="purchase.img" :alt="purchase.name" />
          <p>花費 {{ purchase.price.toLocaleString() }} 代幣，購買後剩 {{ pet.coins - purchase.price }} 枚。</p>
          <label>新寵物的名字<input v-model="purchaseName" required maxlength="20" autofocus /></label>
        </template>
        <label v-else>寵物名字<input v-model="renameName" required maxlength="20" autofocus /></label>
        <p v-if="error" class="error">{{ error }}</p>
        <div class="row">
          <button type="button" :disabled="busy" @click="purchase = null; renaming = false">取消</button>
          <button class="primary" :disabled="busy || !(purchase ? purchaseName : renameName).trim()">{{ busy ? '處理中…' : purchase ? '確認購買並取名' : '儲存名字' }}</button>
        </div>
      </form>
    </div>
    <!-- 還沒養：選一隻 -->
    <template v-else-if="data && !pet">
      <div v-if="!mine" class="card empty">對方還沒有養寵物</div>
      <div v-else class="card stack">
        <div>
          <h3 style="margin:0">挑一隻來養</h3>
          <p class="small muted" style="margin:.3rem 0 0">
            牠吃的跟你一樣。你把熱量與蛋白質吃滿，牠就有精神；
            連續幾天沒記錄，牠會餓。達標還能賺代幣去商城布置。
          </p>
        </div>

        <PetCarousel v-model="picked" :items="choices" />

        <input v-model="petName" maxlength="20" placeholder="幫牠取個名字（可留空）" />
        <button class="primary" :disabled="!picked || busy" @click="adopt">
          {{ busy ? '領養中…' : '就是你了' }}
        </button>
      </div>
    </template>

    <!-- 已經有寵物 -->
    <template v-else-if="pet">
      <div class="card scene-card" :class="{ 'shop-preview': tab === 'shop' }">
        <div class="spread scene-heading" style="margin-bottom:.6rem">
          <div class="pet-title">
            <b>{{ pet.name || pet.speciesName }}</b>
            <span class="muted small"> · {{ pet.speciesName }}</span>
          </div>
          <span class="row wrap scene-actions" style="gap:.5rem">
            <span class="badge soft">🪙 {{ pet.coins }}</span>
            <button v-if="mine" class="icon" :disabled="busy" @click="renameName = pet.name; renaming = true">改名</button>
            <button v-if="mine && roster.length === 1" class="icon" :disabled="busy" @click="startChange">換一隻</button>
          </span>
        </div>

        <!-- 場景：背景、寵物、裝備疊出來，動作由 pet-fsm.js 的狀態機決定 -->
        <div ref="sceneEl" class="scene" :style="{ '--tint': pet.tint || '#f6efdf', '--floor-lift': sceneHeight * .12 + 'px' }">
          <img class="scene-bg" :src="sceneImg" :alt="bg?.name || '小房間'" />
          <RoomDecor :items="decorations" :editable="mine && arranging && !busy" :selected="decorSelected" @select="decorSelected=$event" @move="moveDecor" />
          <PetActor v-for="(member, index) in roster" :key="member.petKey"
            :decorations="decorations" :celebration="celebration"
            :pet="member" :index="index" :count="roster.length" :state="state" :scene-height="sceneHeight"
            :scene-width="sceneWidth" :paused="arranging || tab === 'shop'"
            :room-key="equipped.bg" @move="movePet"
            :selected="member.petKey === pet.petKey" :interactive="mine && !busy && !arranging"
            :preview="tab === 'shop' && member.petKey === pet.petKey"
            :wearing="member.petKey === pet.petKey ? worn : undefined" @select="choosePet" />
        </div>

        <div class="row wrap family">
          <button v-for="member in roster" :key="member.petKey" :class="{ on: member.petKey === pet.petKey }"
            :disabled="!mine || busy" @click="choosePet(member.petKey)">{{ member.name }} · {{ member.speciesName }}</button>
        </div>
        <p class="small muted">共 {{ roster.length }} 隻寵物，共用代幣與環境；目前替「{{ pet.name }}」挑選穿搭。{{ mine ? '點住寵物可拎起拖移，放開後保存位置。' : '' }}</p>
        <p class="says">{{ state.says }}</p>

        <div class="row wrap stats small">
          <span><span class="muted">近 7 天熱量 </span><b>{{ state.kcalPct }}%</b></span>
          <span><span class="muted">蛋白質 </span><b>{{ state.proteinPct }}%</b></span>
          <span class="muted">有紀錄 {{ state.days }} 天</span>
        </div>
      </div>

      <!-- 換寵物：沿用同一組角色卡，但送出前會再確認一次 -->
      <div v-if="changing" class="card stack">
        <div class="spread">
          <h3 style="margin:0">換一隻來養</h3>
          <button class="icon" @click="changing = false; agreed = false">取消</button>
        </div>
        <p class="small" style="margin:0; color: var(--danger)">
          換掉之後，「{{ pet.name }}」的紀錄會被取代，目前的 {{ pet.coins }} 枚代幣與
          買過的布置全部歸零，無法復原。
        </p>

        <PetCarousel v-model="picked" :items="choices" />

        <input v-model="petName" maxlength="20" placeholder="幫牠取個名字（可留空）" />

        <label class="row agree small">
          <input v-model="agreed" type="checkbox" />
          <span>我知道這會刪掉「{{ pet.name }}」的紀錄，而且無法復原</span>
        </label>

        <button class="primary" :disabled="!picked || !agreed || busy" @click="confirmChange">
          {{ busy ? '處理中…' : '確認換成這隻' }}
        </button>
      </div>

      <div v-if="mine && !changing" class="row seg">
        <button :class="{ on: tab === 'home' }" @click="tab = 'home'">牠的窩</button>
        <button :class="{ on: tab === 'shop' }" @click="tab = 'shop'">商城</button>
      </div>

      <!-- 牠的窩：目前穿戴的東西 -->
      <div v-if="tab === 'home'" class="card stack">
        <template v-if="mine">
          <div class="spread"><h3 style="margin:0">布置小屋</h3><button :disabled="busy" @click="toggleArranging">{{ arranging ? '完成布置' : '編輯布置' }}</button></div>
          <div v-if="arranging" class="row wrap">
            <button :disabled="busy || !roomUndo.length" @click="undoRoom">撤銷上一步</button>
            <button :disabled="busy || !data.decorations.length" @click="resetRoom">重設這個房間的位置</button>
            <span class="small muted">本次編輯可撤銷最近 20 步</span>
          </div>
          <p class="small muted">購買裝飾後會放入環境。開啟編輯後，直接拖曳裝飾；放開自動保存。不同環境各自保留布置。</p>
          <div v-if="arranging && selectedDecor" class="stack">
            <b>{{ selectedDecor.name }}</b>
            <button :disabled="busy" @click="editDecor({locked:!selectedDecor.locked})">{{ selectedDecor.locked ? '🔒 已鎖定，點此解鎖' : '鎖定這件裝飾' }}</button>
            <label>裝飾大小<input type="range" min="0.6" max="1.5" step="0.1" :value="selectedDecor.scale" :disabled="busy || !!selectedDecor.locked" @change="resizeDecor" /></label>
            <div class="row wrap">
              <button :disabled="busy || !!selectedDecor.locked || selectedDecor.layer >= 5" @click="editDecor({layer:(selectedDecor.layer || 0)+1})">移到前一層</button>
              <button :disabled="busy || !!selectedDecor.locked || selectedDecor.layer <= -5" @click="editDecor({layer:(selectedDecor.layer || 0)-1})">移到後一層</button>
              <span class="small muted">層級 {{ selectedDecor.layer || 0 }}</span>
            </div>
            <button :disabled="busy" @click="moveDecor({id:selectedDecor.id,position:null})">收起裝飾（保留已購買商品）</button>
          </div>
          <div v-if="arranging" class="row wrap">
            <button v-for="item in data.decorations" :key="item.id" :class="{on:decorSelected===item.id}" @click="decorSelected=item.id">{{ item.locked ? '🔒 ' : '' }}{{ item.name }}</button>
            <button v-for="item in storedDecor" :key="item.id" :disabled="busy" @click="act(()=>api.equipItem(item.id,pet.petKey),'place')">放入 {{ item.name }}</button>
          </div>
        </template>
        <h3 style="margin:0">目前的布置</h3>
        <div v-for="s in SLOTS" :key="s.id" class="spread slot">
          <span>
            <span class="muted small">{{ s.label }}　</span>
            <template v-if="itemById(equipped[s.id])">
              <OutfitFrames v-if="s.id==='outfit'" class="slot-img" :outfit="equipped[s.id]" :label="itemById(equipped[s.id]).name" still />
              <img v-else class="slot-img" :src="itemById(equipped[s.id]).img" :alt="''" />
              {{ itemById(equipped[s.id]).name }}
            </template>
            <span v-else class="muted small">（沒有）</span>
          </span>
          <button
            v-if="mine && s.id !== 'bg' && equipped[s.id]"
            class="icon" :disabled="busy" @click="unequip(s.id)"
          >移除</button>
        </div>
        <p v-if="mine" class="small muted" style="margin:0">
          今日新增有效飲食每筆立即 +2，每天最多三筆（+6）；修改、刪除及補登過去日期不發新增獎勵。
          今日熱量首次落在目標 ±10% 立即 +8，每天一次；修改也可觸發這份達標獎勵。
          蛋白質達目標九成 +8，隔天開啟自己的寵物頁時自動結算，每天一次。
        </p>
      </div>
      <div v-if="mine && data.rewards && tab === 'home'" class="card stack rewards">
        <h3 style="margin:0">今天的代幣</h3>
        <div class="row wrap"><b>已入帳 +{{ data.rewards.instantEarned }}</b><span>今天還可立即獲得 {{ data.rewards.instantRemaining }} 枚</span></div>
        <div class="small">新增飲食 {{ data.rewards.meals }}/3 筆 · {{ data.rewards.kcal ? '熱量獎勵已入帳 +8' : '首次熱量達標可得 +8' }}</div>
        <div class="small">{{ data.rewards.proteinPending ? '蛋白質今日已達標：+8 待隔天結算' : '蛋白質達目標九成可得 +8，隔天結算' }}</div>
        <RouterLink to="/meals?new=1">記下一餐</RouterLink>
        <details>
          <summary>查看最近入帳明細</summary>
          <p class="small muted">這裡顯示獎勵收入；舊版本未保存的結算時間無法補回。今日達標後仍可繼續記錄實際飲食。</p>
          <div v-for="entry in data.rewards.entries" :key="entry.reward_key" class="reward-entry small">
            <span>{{ entry.date }} · {{ entry.reason }}<small class="muted">{{ entry.created_at ? `入帳：${entry.created_at}` : '舊紀錄未保存入帳時間' }}</small></span><b>+{{ entry.amount }}</b>
          </div>
          <p v-if="!data.rewards.entries.length" class="small muted">還沒有獎勵入帳紀錄。</p>
        </details>
      </div>

      <!-- 商城 -->
      <template v-if="tab === 'shop'">
        <div class="card stack shop-filters">
          <p class="small muted" style="margin:0">先輕鬆布置小屋，再慢慢收集套裝與新夥伴。環境、擺飾較易入手；服飾與寵物需要較長時間累積。</p>
          <label>搜尋商品<input v-model="shopSearch" type="search" placeholder="搜尋套裝、裝飾或寵物名稱" /></label>
          <div class="row wrap">
            <label>商城分類<select v-model="shopSection"><option v-for="section in shopSections" :key="section">{{ section }}</option></select></label>
            <label>擁有狀態<select v-model="shopOwned"><option value="all">全部商品</option><option value="owned">已購買</option><option value="unowned">尚未購買</option></select></label>
          </div>
        </div>
        <div v-if="(shopSection === '全部' || shopSection === '寵物') && petsForSale.length" class="card stack">
          <h3 style="margin:0">再養一隻</h3>
          <p class="small muted">十種寵物每隻 {{ data.petsForSale[0]?.price.toLocaleString() }} 代幣。購買時取名，加入同一個家；同一物種也能養多隻。</p>
          <div class="grid shop">
            <button v-for="animal in petsForSale" :key="animal.species" class="item" :disabled="busy || pet.coins < animal.price" @click="openPurchase(animal)">
              <img class="item-face" :src="animal.img" :alt="animal.name" loading="lazy" />
              <span>{{ animal.name }}</span><span class="small">🪙 {{ animal.price.toLocaleString() }}</span>
            </button>
          </div>
        </div>
        <div v-for="g in shopGroups" :key="g.group" class="card stack">
          <h3 style="margin:0">{{ g.group }}</h3>
          <p v-if="g.group==='套裝'" class="small muted">整隻角色已穿好帽子、衣服與配件；原本買過的單品已免費解鎖對應套裝。</p>
          <div class="grid shop">
            <button
              v-for="i in g.items" :key="i.id"
              class="item"
              :class="{ on: isUsed(i), trying: trying?.id === i.id }"
              :disabled="busy" @click="tryOn(i)"
            >
              <DecorArt v-if="i.slot === 'decor'" class="item-face" :item="i" />
              <OutfitFrames v-else-if="i.slot==='outfit'" class="item-face" :outfit="i.id" :label="i.name" still />
              <img v-else class="item-face" :src="i.img" :alt="i.name" loading="lazy" />
              <span class="small">{{ i.name }}</span>

              <span v-if="isUsed(i)" class="badge soft small">{{ i.slot === 'decor' ? '已擺放' : '使用中' }}</span>
              <span v-else-if="owned.has(i.id)" class="small muted">已擁有</span>
              <span v-else class="small" :class="{ poor: pet.coins < i.price }">🪙 {{ i.price }}</span>
            </button>
          </div>
        </div>
        <p v-if="!shopGroups.length && !((shopSection === '全部' || shopSection === '寵物') && petsForSale.length)" class="card small muted">沒有符合條件的商品，試試其他名稱或篩選條件。</p>
      </template>

      <!-- 試穿中：釘在畫面底部，捲到哪裡都按得到 -->
      <div v-if="trying" class="trybar">
        <DecorArt v-if="trying.slot === 'decor'" class="item-face small-face" :item="trying" />
        <OutfitFrames v-else-if="trying.slot==='outfit'" class="item-face small-face" :outfit="trying.id" :label="trying.name" still />
        <img v-else class="item-face small-face" :src="trying.img" :alt="trying.name" />
        <span class="stack tight">
          <b class="small">{{ trying.name }}</b>
          <span class="small muted">
            {{ owned.has(trying.id) ? '已經有了，換上不用錢'
               : pet.coins < trying.price ? `還差 ${trying.price - pet.coins} 枚代幣`
               : `買下要 ${trying.price} 枚，剩 ${pet.coins - trying.price} 枚` }}
          </span>
        </span>
        <button class="icon" :disabled="busy" @click="trying = null">取消</button>
        <button
          class="primary small"
          :disabled="busy || (!owned.has(trying.id) && pet.coins < trying.price)"
          @click="confirmTry"
        >{{ owned.has(trying.id) ? trying.slot === 'decor' ? '放入小屋' : '換上' : '買下' }}</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.shop-filters label { flex:1; min-width:120px; }
.reward-entry { display:flex; justify-content:space-between; gap:1rem; padding:.6rem 0; border-bottom:1px solid var(--border); }
.reward-entry small { display:block; margin-top:.2rem; }
.pet-modal { position:fixed; inset:0; z-index:30; background:var(--overlay); display:grid; place-items:center; padding:1rem; }
.scene-actions .badge.soft { color:var(--amber-ink); background:var(--amber-soft); }
.pet-modal .card { width:min(420px,100%); max-height:90vh; overflow:auto; }
.purchase-face { width:120px; height:120px; object-fit:contain; align-self:center; }
.family { margin-top:1rem; gap:.5rem; }
.family .on { border-color:var(--accent); background:var(--accent-soft); }

/* 換寵物是唯一不可復原的動作，勾選框故意放在按鈕上方一段距離 */
.agree {
  gap: .5rem;
  align-items: flex-start;
  color: var(--danger);
}
.agree input { width: auto; margin-top: .15rem; }

/* ---- 試穿 ---- */
.item.trying {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.poor { color: var(--danger); }

/* 商品列表很長，確認列要一直跟著，不然得捲回上面才按得到 */
.trybar {
  position: sticky;
  bottom: .6rem;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: .6rem;
  padding: .6rem .8rem;
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-popover);
  border: 1px solid var(--accent-soft);
}
.trybar .stack.tight { flex: 1; gap: .1rem; min-width: 0; }
.small-face { width: 38px; height: 38px; object-fit: contain; }

/* ---- 選寵物 ---- */


/* ---- 場景 ---- */
.pet-page, .scene-card { width:100%; min-width:0; max-width:100%; }
.scene-card { overflow: hidden; }
.scene-heading { flex-wrap:wrap; gap:.4rem; }
.pet-title { min-width:0; overflow-wrap:anywhere; }
.scene-actions { margin-left:auto; }
.family button { max-width:100%; white-space:normal; overflow-wrap:anywhere; }
.scene-card.shop-preview { position:sticky; top:0; z-index:6; padding:0; box-shadow:var(--shadow-popover); }
.shop-preview .scene { min-height:130px; max-height:clamp(130px, 26vh, 240px); }
.shop-preview .scene-heading, .shop-preview .family,
.shop-preview .says, .shop-preview .stats, .shop-preview > p.small,
.shop-preview :deep(.name) { display:none; }
@media(max-height:600px) { .shop-preview .scene { min-height:100px; max-height:120px; } }
.scene-card .says { color: var(--text); }
/* 插畫本身是米白底的，疊在深色上一定像貼紙。
   索性讓整個場景用同一組暖色，變成一扇「看進牠世界」的窗。 */
.scene {
  position: relative;
  width:100%;
  min-width:0;
  max-width:100%;
  height: auto;
  aspect-ratio: 16 / 9;
  min-height: 220px;
  max-height: 420px;
  border-radius: 14px;
  overflow: hidden;
  background: var(--tint, #f6efdf);   /* 場景圖載入前的底色 */
  display: grid;
  place-items: end center;   /* 讓牠站在地上，不要浮在正中間 */
  padding-bottom: var(--floor-lift, 28px);
}
/* 環境是整張插畫，鋪滿整個場景當背景 */
.scene-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center bottom;
}
.says { margin: .8rem 0 .2rem; }
.doing { margin: 0 0 .5rem; }
.stats { gap: 1rem; }
.stats b { font-variant-numeric: tabular-nums; }

/* ---- 分段切換 ---- */
.seg { gap: .4rem; }
.seg button { flex: 1; border-color: transparent; background: var(--surface); }
.seg button.on { background: var(--accent-soft); color: var(--accent); }

.slot { padding: .35rem 0; }

/* ---- 商城 ---- */
.shop { grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: .6rem; }
.item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: .25rem;
  padding: .7rem .4rem;
  text-align: center;
  background: var(--surface-2);
  border: 1px solid transparent;
  border-radius: 14px;
}
.item.on { border-color: var(--accent); }
.item-face { width: 100%; max-width: 54px; display: block; }
.item-face.outfit-frames {width:54px;height:54px;max-width:100%;}
.small-face.outfit-frames {width:36px;height:36px;}
.slot-img.outfit-frames {width:22px;height:22px;display:inline-block;}
.slot-img { width: 22px; vertical-align: -5px; }
.item .desc { line-height: 1.35; }
.item button { width: 100%; }
</style>
