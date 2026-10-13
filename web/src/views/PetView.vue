<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { api } from '../api.js';
import { session } from '../auth.js';
import UserTabs from '../components/UserTabs.vue';
import PetCarousel from '../components/PetCarousel.vue';
import { pickNext } from '../pet-fsm.js';

const viewing = ref(session.user);
const data = ref(null);
const loading = ref(true);
const error = ref('');
// 用 null 而不是空字串：Vue 對布林屬性的規則是「空字串＝屬性存在」，
// :disabled="busy" 在 busy 為 '' 時會真的把按鈕停用掉。
const busy = ref(null);
const tab = ref('home');            // home | shop
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

watch(viewing, () => { data.value = null; tab.value = 'home'; trying.value = null; load(); });
onMounted(load);

const pet = computed(() => data.value?.pet || null);
const state = computed(() => data.value?.state || null);
const mine = computed(() => data.value?.mine !== false);
const owned = computed(() => new Set(data.value?.owned || []));
const equipped = computed(() => pet.value?.equipped || {});
// 生活習性：作息曲線與專屬動作，來源是 pet/動物特性.txt
const behavior = computed(() => data.value?.behavior || null);

/* ---------------- 作息 ---------------- */

/**
 * 行為狀態機。規則都在 ../pet-fsm.js，這裡只負責「時間到了換一個」。
 *
 * 先前這段是一張寫死的時段表，而且只描述了貓的一天；另外九種不管幾點
 * 都是同一張靜態圖。現在改吃後端送來的作息曲線（pet/動物特性.txt），
 * 倉鼠半夜會跑滾輪、陸龜白天才慢慢走。
 */
const current = ref(null);
let timer = null;

function step() {
  const b = behavior.value;
  if (!b) return;
  const d = new Date();
  current.value = pickNext({
    curve: b.curve,
    hour: d.getHours() + d.getMinutes() / 60,
    mood: state.value?.mood,
    ateToday: !!state.value?.ateToday,
    acts: b.acts,
    last: current.value?.kind,
  });
  clearTimeout(timer);
  // 每個狀態撐一段時間才換，不然看起來像在抽搐
  timer = setTimeout(step, (current.value.secs || 25) * 1000);
}

// 換使用者或剛載好資料時重新開始
watch(behavior, (b) => { if (b) { current.value = null; step(); } });
onMounted(step);
onUnmounted(() => clearTimeout(timer));

const activity = computed(() => current.value?.css || 'idle');
const activityText = computed(() => current.value?.label || '發呆中');

/**
 * 場景裡要顯示的那張圖。
 *
 * 十種動物都有五個動作，由 web/tools/slice-actions.sh 從
 * pet/十種可愛動物動作精靈圖鑑.png 切出來。先前只有貓有動作圖，
 * 其他九種不管在做什麼都是同一張靜態本體。
 */
const ACT_SPRITES = new Set(['idle', 'walk', 'eat', 'sleep', 'play']);

/** 場景的高度。CSS 裡的 .scene { height } 要跟這個數字一致。 */
const SCENE_H = 230;

/**
 * 牠該多高。
 *
 * size 來自 pet/動物特性.txt，意思是「站著時佔場景高度的幾成」——
 * 倉鼠 0.13、狗 0.34。先前是寫死的 148px，等於整隻佔了場景的六成四，
 * 不管養的是陸龜還是小鸚鵡都一樣大，房間完全沒有尺度感。
 *
 * 用 px 而不是百分比：場景是 grid item 且 align-items 不是 stretch，
 * 百分比高度在這個情況下不會解析，圖會用自然大小撐破場景。
 */
const petHeight = computed(() => {
  const size = behavior.value?.size ?? 0.3;
  // 趴著的時候看起來會比站著矮一點，給一點補償，不然睡覺時特別小
  const lying = current.value?.css === 'sleep';
  return `${Math.round(SCENE_H * size * (lying ? 1.15 : 1))}px`;
});

/** 貓才有八張動作圖；那幾張本身就畫了 Z、碗、毛線球，不要再疊 emoji 道具 */
/** 動作圖本身就畫了 Z、飯碗、毛線球，有動作圖就不要再疊 emoji 道具 */
const usesActSprite = computed(() => ACT_SPRITES.has(current.value?.pose));

const petSprite = computed(() => {
  if (!pet.value) return '';
  const pose = current.value?.pose;
  // 退回靜態本體：狀態機還沒跑第一輪，或是之後加了新物種但還沒切圖
  return usesActSprite.value
    ? `/pets/act-${pet.value.species}-${pose}.webp`
    : petBody(pet.value.species);
});

/** 插畫檔名：<id>.webp 是整張卡，<id>-pet.webp 只有動物本體 */
/** 角色卡（選寵物用）與去背的本體（場景用） */
const petCard = (id) => `/pets/${id}.webp`;

/** 輪播要的是 { id, name, nick, img } */
const choices = computed(() =>
  (data.value?.species || []).map(s => ({ ...s, img: petCard(s.id) })));
const petBody = (id) => `/pets/${id}-pet.webp`;

const sceneImg = computed(() => {
  const id = shown.value.bg || 'bg_room';
  return `/pets/scene-${id.replace(/^bg_/, '')}.webp`;
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
    if (owned.value.has(item.id)) await api.equipItem(item.id);
    else await api.buyItem(item.id);
    trying.value = null;
  }, 'try');
}

const bg = computed(() => itemById(shown.value.bg));
const hat = computed(() => itemById(shown.value.hat));
const decor = computed(() => itemById(shown.value.decor));
const cloth = computed(() => itemById(shown.value.cloth));
const shoe = computed(() => itemById(shown.value.shoe));
const acc = computed(() => itemById(shown.value.acc));

/** 穿戴類疊在寵物身上，擺飾放在場景角落 */
const worn = computed(() => [hat.value, cloth.value, shoe.value, acc.value].filter(Boolean));


/** 體態只影響顯示大小，不改 emoji —— 同一隻動物胖瘦用縮放表現最直覺 */
const bodyScale = computed(() => ({ thin: .82, normal: 1, round: 1.18 }[state.value?.body] ?? 1));

// 穿搭素材只有帽子、衣服、配件三個部位，沒有鞋襪；
// 擺飾也退場了——場景背景本來就把家具畫進去了（build-scenes.sh）。
const SLOTS = [
  { id: 'bg',    label: '環境' },
  { id: 'hat',   label: '帽子' },
  { id: 'cloth', label: '衣服' },
  { id: 'acc',   label: '配件' },
];

/** 商城照後端給的分區排，一區一張卡 */
const shopGroups = computed(() => {
  const list = data.value?.shop || [];
  const names = [...new Set(list.map(i => i.group))];
  return names.map(g => ({ group: g, items: list.filter(i => i.group === g) }));
});

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
const unequip = (slot) => act(() => api.unequipSlot(slot), 'un' + slot);

/* ---------------- 新增訪客 ---------------- */

/**
 * 主頁的「新增訪客」按鈕。
 *
 * 要讓別人臨時試用，原本得改 users.js、填 .env、重開服務。改成按一下就建一個
 * 獨立帳號（自己的資料庫、自己的寵物），密碼當場產生。
 *
 * 沒設密碼就不顯示：那代表整個服務沒在驗證，誰都進得來，多開帳號沒有意義。
 */
const canInvite = computed(() => session.authRequired && mine.value);
const newGuest = ref(null);
const copied = ref(false);

async function invite() {
  if (busy.value) return;
  busy.value = 'guest';
  error.value = '';
  copied.value = false;
  try {
    newGuest.value = await api.addGuest();
    // 分頁列是吃 session.users 的，重抓一次新帳號才會出現
    session.users = await api.users();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = null;
  }
}

async function copyPassword() {
  try {
    await navigator.clipboard.writeText(newGuest.value.password);
    copied.value = true;
  } catch {
    // 沒有剪貼簿權限（非 https 或使用者拒絕）就算了，密碼本來就看得到
    copied.value = false;
  }
}
</script>

<template>
  <div class="stack">
    <UserTabs v-model="viewing" />

    <!-- 新增訪客：建一個獨立帳號給別人試用，密碼只顯示這一次 -->
    <div v-if="canInvite" class="row invite">
      <button class="icon" :disabled="busy" @click="invite">
        {{ busy === 'guest' ? '建立中…' : '＋ 新增訪客' }}
      </button>
    </div>

    <div v-if="newGuest" class="card stack guest-card">
      <div class="spread">
        <b>{{ newGuest.name }} 建好了</b>
        <button class="icon" @click="newGuest = null">關閉</button>
      </div>
      <p class="small muted" style="margin:0">
        把這組密碼給對方，他登入後就是一個獨立的帳號——自己的飲食紀錄、自己的寵物。
      </p>
      <div class="row pw">
        <code>{{ newGuest.password }}</code>
        <button class="icon" @click="copyPassword">{{ copied ? '已複製' : '複製' }}</button>
      </div>
      <p class="small" style="margin:0; color: var(--danger)">
        密碼只會顯示這一次，關掉就看不到了。
      </p>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="loading && !data" class="card empty">載入中…</div>

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
      <div class="card scene-card">
        <div class="spread" style="margin-bottom:.6rem">
          <div>
            <b>{{ pet.name || pet.speciesName }}</b>
            <span class="muted small"> · {{ pet.speciesName }}</span>
          </div>
          <span class="row" style="gap:.5rem">
            <span class="badge soft">🪙 {{ pet.coins }}</span>
            <button v-if="mine" class="icon" :disabled="busy" @click="startChange">換一隻</button>
          </span>
        </div>

        <!-- 場景：背景、寵物、裝備疊出來，動作由 pet-fsm.js 的狀態機決定 -->
        <div class="scene" :style="{ '--tint': pet.tint || '#f6efdf' }">
          <img class="scene-bg" :src="sceneImg" :alt="bg?.name || '小房間'" />
          <img v-if="decor" class="scene-decor" :src="decor.img" :alt="decor.name" />
          <span class="scene-pet" :class="activity" :style="{ '--body': bodyScale, '--pet-h': petHeight }">
            <img v-for="w in worn" :key="w.id" class="worn" :class="w.slot" :src="w.img" :alt="w.name" />
            <img class="scene-img" :src="petSprite" :alt="pet.speciesName" />
            <!-- 作息的小道具。貓的動作圖本身就畫了 Z 與毛線球，疊上去會變兩份 -->
            <template v-if="!usesActSprite">
              <span v-if="activity === 'sleep'" class="prop zzz">💤</span>
              <span v-else-if="activity === 'eat'" class="prop bowl">🍚</span>
              <span v-else-if="activity === 'play'" class="prop ball">🧶</span>
              <span v-else-if="activity === 'beg'" class="prop beg">❗</span>
            </template>
          </span>
        </div>

        <p class="small muted doing">現在：{{ activityText }}</p>
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
        <h3 style="margin:0">目前的布置</h3>
        <div v-for="s in SLOTS" :key="s.id" class="spread slot">
          <span>
            <span class="muted small">{{ s.label }}　</span>
            <template v-if="itemById(equipped[s.id])">
              <img class="slot-img" :src="itemById(equipped[s.id]).img" :alt="''" />
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
          代幣只能靠達標賺：有記錄 +2、熱量落在目標 ±10% +8、蛋白質達九成 +8。
          每天結算一次，今天的要等明天才算。
        </p>
      </div>

      <!-- 商城 -->
      <template v-else>
        <div v-for="g in shopGroups" :key="g.group" class="card stack">
          <h3 style="margin:0">{{ g.group }}</h3>
          <div class="grid shop">
            <button
              v-for="i in g.items" :key="i.id"
              class="item"
              :class="{ on: equipped[i.slot] === i.id, trying: trying?.id === i.id }"
              :disabled="busy" @click="tryOn(i)"
            >
              <img class="item-face" :src="i.img" :alt="i.name" loading="lazy" />
              <span class="small">{{ i.name }}</span>

              <span v-if="equipped[i.slot] === i.id" class="badge soft small">使用中</span>
              <span v-else-if="owned.has(i.id)" class="small muted">已擁有</span>
              <span v-else class="small" :class="{ poor: pet.coins < i.price }">🪙 {{ i.price }}</span>
            </button>
          </div>
        </div>
      </template>

      <!-- 試穿中：釘在畫面底部，捲到哪裡都按得到 -->
      <div v-if="trying" class="trybar">
        <img class="item-face small-face" :src="trying.img" :alt="trying.name" />
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
        >{{ owned.has(trying.id) ? '換上' : '買下' }}</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* ---- 新增訪客 ---- */
.invite { justify-content: flex-end; }
.guest-card .pw {
  gap: .6rem;
  align-items: center;
}
.guest-card code {
  flex: 1;
  padding: .5rem .7rem;
  border-radius: 10px;
  background: var(--surface-2);
  font-size: 1.05rem;
  letter-spacing: .04em;
  user-select: all;      /* 點一下就整組選起來，手機上好複製 */
}

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
  box-shadow: 0 8px 26px rgba(0, 0, 0, .55);
  border: 1px solid var(--accent-soft);
}
.trybar .stack.tight { flex: 1; gap: .1rem; min-width: 0; }
.small-face { width: 38px; height: 38px; object-fit: contain; }

/* ---- 選寵物 ---- */


/* ---- 場景 ---- */
.scene-card { overflow: hidden; }
.scene-card .says { color: var(--text); }
/* 插畫本身是米白底的，疊在深色上一定像貼紙。
   索性讓整個場景用同一組暖色，變成一扇「看進牠世界」的窗。 */
.scene {
  position: relative;
  height: 230px;
  border-radius: 14px;
  overflow: hidden;
  background: var(--tint, #f6efdf);   /* 場景圖載入前的底色 */
  display: grid;
  place-items: end center;   /* 讓牠站在地上，不要浮在正中間 */
  padding-bottom: 6px;
}
/* 環境是整張插畫，鋪滿整個場景當背景 */
.scene-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.scene-pet {
  --body: 1;              /* 體態縮放，由 JS 依近 7 天熱量帶進來 */
  position: relative;
  display: block;
  /* 固定高度而不是百分比：這是 grid item 且 align-items 不是 stretch，
     百分比高度在這個情況下不會解析，圖會用自然大小撐破場景。 */
  /* 由 petHeight 依物種的真實體型比例算出來 */
  height: var(--pet-h, 100px);
  transform-origin: center bottom;
  /* 呼吸：所有狀態共用，讓牠看起來是活的而不是一張貼紙 */
  animation: breathe 3.6s ease-in-out infinite;
}
.scene-img {
  height: 100%;
  width: auto;
  display: block;
  /* 素材本身已去背，疊在場景插畫上。加一點落地陰影才不會像貼紙 */
  filter: drop-shadow(0 6px 6px rgba(0, 0, 0, .28));
}

@keyframes breathe {
  0%, 100% { transform: scale(var(--body)); }
  50%      { transform: scale(calc(var(--body) * 1.03)); }
}

/* 各作息的動作。插畫本身是靜態的，靠位移與傾斜做出活著的感覺。 */
.scene-pet.sleep { animation: breathe 6s ease-in-out infinite; }
.scene-pet.play  { animation: hop .7s ease-in-out infinite; }
.scene-pet.eat   { animation: nibble .9s ease-in-out infinite; }
.scene-pet.groom { animation: groom 2.4s ease-in-out infinite; }
.scene-pet.beg   { animation: tilt 2.2s ease-in-out infinite; }
/* 走動與發呆是狀態機才有的兩個狀態：走動左右晃，發呆只是慢慢呼吸 */
.scene-pet.walk  { animation: wander 7s ease-in-out infinite; }
.scene-pet.idle  { animation: breathe 9s ease-in-out infinite; }

@keyframes wander {
  0%, 100% { transform: translateX(-16%) scaleX(-1) scale(var(--body)); }
  48%      { transform: translateX(16%)  scaleX(-1) scale(var(--body)); }
  50%      { transform: translateX(16%)  scale(var(--body)); }
  98%      { transform: translateX(-16%) scale(var(--body)); }
}

@keyframes hop {
  0%, 100% { transform: translateY(0) scale(var(--body)); }
  40%      { transform: translateY(-10px) scale(calc(var(--body) * 1.02)); }
}
@keyframes nibble {
  0%, 100% { transform: translateY(0) rotate(0deg) scale(var(--body)); }
  50%      { transform: translateY(5px) rotate(2deg) scale(var(--body)); }
}
@keyframes groom {
  0%, 100% { transform: rotate(0deg) scale(var(--body)); }
  50%      { transform: rotate(5deg) scale(var(--body)); }
}
@keyframes tilt {
  0%, 100% { transform: rotate(-4deg) scale(var(--body)); }
  50%      { transform: rotate(4deg) scale(var(--body)); }
}

/* 作息小道具 */
.prop {
  position: absolute;
  font-size: 1.6rem;
  /* 道具疊在插畫上，給一點描邊才不會糊在背景裡 */
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, .25));
}
.zzz  { top: -6%; right: -4%; animation: floaty 2.8s ease-in-out infinite; }
.bowl { bottom: -6%; right: 2%; }
.ball { bottom: 0; right: -14%; animation: roll 1.5s ease-in-out infinite; }
.beg  { top: -4%; right: 2%; animation: pulse 1.2s ease-in-out infinite; }

@keyframes floaty {
  0%   { opacity: 0; transform: translate(0, 6px) scale(.8); }
  35%  { opacity: .95; }
  100% { opacity: 0; transform: translate(10px, -18px) scale(1.1); }
}
@keyframes roll {
  0%, 100% { transform: translateX(0) rotate(0deg); }
  50%      { transform: translateX(-16px) rotate(-180deg); }
}
@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: .85; }
  50%      { transform: scale(1.25); opacity: 1; }
}

/* 使用者偏好減少動態時全部停掉 */
@media (prefers-reduced-motion: reduce) {
  .scene-pet, .prop { animation: none !important; }
  /* 動畫關掉後沒人套用 scale，體態縮放要自己補上 */
  .scene-pet { transform: scale(var(--body)); }
}
/* 帽子壓在頭上：位置用相對字級算，換寵物也不會跑掉 */
/* 帽子壓在頭頂。插畫的頭大致在上緣往下一點，用百分比定位才不會因物種跑掉 */
.scene-hat {
  position: absolute;
  top: -8%;
  left: 50%;
  transform: translateX(-50%);
  font-size: 1.7rem;
  z-index: 1;
}
/* 擺飾放在場景右下角，不要擋到寵物 */
.scene-decor {
  position: absolute;
  right: 6%;
  bottom: 6%;
  width: 24%;
  max-width: 68px;
  filter: drop-shadow(0 3px 3px rgba(0, 0, 0, .25));
}

/* 穿戴類疊在寵物身上。各部位的落點用百分比，換物種也不會跑掉。 */
.worn {
  position: absolute;
  left: 50%;
  width: 46%;
  transform: translateX(-50%);
  z-index: 2;
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, .2));
}
/* 動作圖是去邊裁出來的，動物本身就貼著上緣，所以帽子只要再往上一點點就好；
   -14% 會整頂浮在頭頂上方。配件與衣服的位置是三個部位的折衷——
   同一個 acc 槽裡既有頭圈也有側背包，不可能都剛好。 */
.worn.hat   { top: -5%; width: 40%; }
.worn.cloth { top: 38%; width: 52%; opacity: .95; }
.worn.acc   { top: 24%; width: 32%; }

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
.slot-img { width: 22px; vertical-align: -5px; }
.item .desc { line-height: 1.35; }
.item button { width: 100%; }
</style>
