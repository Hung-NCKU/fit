<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '../api.js';
import { session } from '../auth.js';
import UserTabs from '../components/UserTabs.vue';

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

watch(viewing, () => { data.value = null; tab.value = 'home'; load(); });
onMounted(load);

const pet = computed(() => data.value?.pet || null);
const state = computed(() => data.value?.state || null);
const mine = computed(() => data.value?.mine !== false);
const owned = computed(() => new Set(data.value?.owned || []));
const equipped = computed(() => pet.value?.equipped || {});

/** 心情決定牠現在的臉 */
const face = computed(() => {
  if (!pet.value || !state.value) return '🐾';
  return pet.value.faces[state.value.mood] || pet.value.faces.ok;
});

const itemById = (id) => (data.value?.shop || []).find(i => i.id === id) || null;
const bg = computed(() => itemById(equipped.value.bg));
const hat = computed(() => itemById(equipped.value.hat));
const toy = computed(() => itemById(equipped.value.toy));

/** 體態只影響顯示大小，不改 emoji —— 同一隻動物胖瘦用縮放表現最直覺 */
const bodyScale = computed(() => ({ thin: .82, normal: 1, round: 1.18 }[state.value?.body] ?? 1));

const SLOTS = [
  { id: 'bg', label: '環境' },
  { id: 'hat', label: '帽子' },
  { id: 'toy', label: '擺飾' },
];
const shopBySlot = computed(() => SLOTS.map(s => ({
  ...s,
  items: (data.value?.shop || []).filter(i => i.slot === s.id),
})));

async function act(fn, key) {
  if (busy.value) return;
  busy.value = key;
  error.value = '';
  try { await fn(); await load(); }
  catch (e) { error.value = e.message; }
  finally { busy.value = null; }
}

const adopt = () => act(() => api.adoptPet(picked.value, petName.value), 'adopt');
const buy = (id) => act(() => api.buyItem(id), id);
const equip = (id) => act(() => api.equipItem(id), id);
const unequip = (slot) => act(() => api.unequipSlot(slot), 'un' + slot);
</script>

<template>
  <div class="stack">
    <UserTabs v-model="viewing" />
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

        <div class="grid picker">
          <button
            v-for="s in data.species" :key="s.id"
            class="pick" :class="{ on: picked === s.id }"
            @click="picked = s.id"
          >
            <span class="pick-face">{{ s.faces.happy }}</span>
            <span class="small">{{ s.name }}</span>
          </button>
        </div>

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
          <span class="badge soft">🪙 {{ pet.coins }}</span>
        </div>

        <!-- 場景：背景、寵物、裝備全部用 emoji 疊出來 -->
        <div class="scene">
          <span class="scene-bg">{{ bg?.emoji || '🏠' }}</span>
          <span v-if="toy" class="scene-toy">{{ toy.emoji }}</span>
          <span class="scene-pet" :style="{ transform: `scale(${bodyScale})` }">
            <span v-if="hat" class="scene-hat">{{ hat.emoji }}</span>
            {{ face }}
          </span>
        </div>

        <p class="says">{{ state.says }}</p>

        <div class="row wrap stats small">
          <span><span class="muted">近 7 天熱量 </span><b>{{ state.kcalPct }}%</b></span>
          <span><span class="muted">蛋白質 </span><b>{{ state.proteinPct }}%</b></span>
          <span class="muted">有紀錄 {{ state.days }} 天</span>
        </div>
      </div>

      <div v-if="mine" class="row seg">
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
              {{ itemById(equipped[s.id]).emoji }} {{ itemById(equipped[s.id]).name }}
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
        <div v-for="g in shopBySlot" :key="g.id" class="card stack">
          <h3 style="margin:0">{{ g.label }}</h3>
          <div class="grid shop">
            <div
              v-for="i in g.items" :key="i.id"
              class="item" :class="{ on: equipped[i.slot] === i.id }"
            >
              <span class="item-face">{{ i.emoji }}</span>
              <span class="small">{{ i.name }}</span>
              <span v-if="i.desc" class="small muted desc">{{ i.desc }}</span>

              <button
                v-if="!owned.has(i.id)"
                class="small" :disabled="busy || pet.coins < i.price"
                @click="buy(i.id)"
              >🪙 {{ i.price }}</button>
              <button
                v-else-if="equipped[i.slot] !== i.id"
                class="small" :disabled="busy" @click="equip(i.id)"
              >換上</button>
              <span v-else class="badge soft small">使用中</span>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
/* ---- 選寵物 ---- */
.picker { grid-template-columns: repeat(3, 1fr); gap: .6rem; }
.pick {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: .2rem;
  padding: .8rem .3rem;
  background: var(--surface-2);
  border-color: transparent;
  border-radius: 14px;
}
.pick.on { background: var(--accent-soft); color: var(--accent); }
.pick-face { font-size: 2rem; line-height: 1.1; }

/* ---- 場景 ---- */
.scene-card { overflow: hidden; }
.scene {
  position: relative;
  height: 190px;
  border-radius: 14px;
  background: radial-gradient(circle at 50% 120%, var(--surface-2), var(--bg));
  display: grid;
  place-items: center;
}
.scene-bg {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 7rem;
  opacity: .16;
}
.scene-pet {
  position: relative;
  font-size: 4.2rem;
  line-height: 1;
  transition: transform .4s ease;
}
/* 帽子壓在頭上：位置用相對字級算，換寵物也不會跑掉 */
.scene-hat {
  position: absolute;
  top: -.42em;
  left: 50%;
  transform: translateX(-50%);
  font-size: .55em;
}
.scene-toy { position: absolute; right: 14%; bottom: 14%; font-size: 1.8rem; }

.says { margin: .8rem 0 .5rem; }
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
.item-face { font-size: 1.9rem; line-height: 1.1; }
.item .desc { line-height: 1.35; }
.item button { width: 100%; }
</style>
