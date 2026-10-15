<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';

/**
 * 選寵物用的 3D 旋轉木馬。
 *
 * 十張卡等分排在一個圓柱上（每張相隔 360/n 度），容器給 perspective，
 * 內層 preserve-3d 後整體繞 Y 軸轉，轉到正面的那張就是選中的。
 * 不用任何輪播函式庫，CSS 3D 就能做完。
 */
const props = defineProps({
  items: { type: Array, required: true },   // [{ id, name, nick, img }]
  modelValue: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);

const index = ref(0);
const CARD_W = 150;                          // 卡片寬度，半徑由它算出來

const step = computed(() => 360 / Math.max(1, props.items.length));

/** 圓柱半徑：讓相鄰卡片剛好不重疊。tan(半個夾角) 是標準算法。 */
const radius = computed(() => {
  const half = (Math.PI / props.items.length);
  return Math.round((CARD_W / 2) / Math.tan(half)) + 10;
});

/** 轉到第 i 張。用累加角度而不是取模，才不會在 0↔9 之間倒著轉一大圈。 */
const angle = ref(0);
function go(i) {
  const n = props.items.length;
  if (!n) return;
  let diff = ((i - index.value) % n + n) % n;   // 0..n-1
  if (diff > n / 2) diff -= n;                  // 選比較近的方向
  angle.value -= diff * step.value;
  index.value = i;
  emit('update:modelValue', props.items[i]?.id ?? '');
}

const next = () => go((index.value + 1) % props.items.length);
const prev = () => go((index.value - 1 + props.items.length) % props.items.length);

/** 外面改了 modelValue（例如重置）時跟著轉過去 */
watch(() => props.modelValue, (id) => {
  const i = props.items.findIndex(x => x.id === id);
  if (i >= 0 && i !== index.value) go(i);
});

/* ---- 滑動 ---- */
let startX = null;
const onStart = (e) => { startX = (e.touches ? e.touches[0] : e).clientX; };
function onEnd(e) {
  if (startX === null) return;
  const x = (e.changedTouches ? e.changedTouches[0] : e).clientX;
  const dx = x - startX;
  startX = null;
  if (Math.abs(dx) > 40) (dx < 0 ? next : prev)();
}

/* ---- 鍵盤 ---- */
function onKey(e) {
  if (e.key === 'ArrowRight') { next(); e.preventDefault(); }
  if (e.key === 'ArrowLeft') { prev(); e.preventDefault(); }
}
onMounted(() => {
  window.addEventListener('keydown', onKey);
  if (props.items.length) go(0);
});
onUnmounted(() => window.removeEventListener('keydown', onKey));

const current = computed(() => props.items[index.value] || null);
</script>

<template>
  <div class="wrap">
    <div
      class="stage"
      @mousedown="onStart" @mouseup="onEnd"
      @touchstart.passive="onStart" @touchend.passive="onEnd"
    >
      <div class="ring" :style="{ transform: `translateZ(${-radius}px) rotateY(${angle}deg)` }">
        <button
          v-for="(it, i) in items" :key="it.id"
          class="card" :class="{ on: i === index }"
          :style="{ transform: `rotateY(${i * step}deg) translateZ(${radius}px)` }"
          :aria-current="i === index"
          @click="go(i)"
        >
          <img :src="it.img" :alt="it.name" loading="lazy" draggable="false" />
        </button>
      </div>
    </div>

    <div class="bar">
      <button class="icon" aria-label="上一隻" @click="prev">←</button>
      <span class="name">
        <b>{{ current?.name }}</b>
        <span class="muted small"> · {{ current?.nick }}</span>
      </span>
      <button class="icon" aria-label="下一隻" @click="next">→</button>
    </div>

    <div class="dots">
      <button
        v-for="(it, i) in items" :key="it.id"
        class="dot" :class="{ on: i === index }"
        :aria-label="it.name"
        @click="go(i)"
      />
    </div>
  </div>
</template>

<style scoped>
.wrap { user-select: none; }

.stage {
  height: 260px;
  perspective: 900px;
  display: grid;
  place-items: center;
  overflow: hidden;
  touch-action: pan-y;   /* 左右留給輪播，上下仍可捲頁 */
}

.ring {
  position: relative;
  width: 150px;
  height: 250px;
  transform-style: preserve-3d;
  transition: transform .55s cubic-bezier(.22, .61, .36, 1);
}

.card {
  position: absolute;
  inset: 0;
  padding: 0;
  border: none;
  background: none;
  border-radius: 14px;
  overflow: hidden;
  /* 背面那幾張要壓暗，不然整圈卡片一樣亮會看不出前後 */
  filter: brightness(.45) saturate(.6);
  transition: filter .45s, box-shadow .45s;
}
.card img { width: 100%; display: block; border-radius: 14px; }

.card.on {
  filter: none;
  box-shadow: 0 0 0 3px var(--accent), var(--shadow-popover);
}

.bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: .4rem;
}
.name { min-width: 9rem; text-align: center; }

.dots { display: flex; justify-content: center; gap: .35rem; margin-top: .5rem; }
.dot {
  width: 7px;
  height: 7px;
  padding: 0;
  border-radius: 999px;
  border: none;
  background: var(--surface-2);
}
.dot.on { background: var(--accent); }

/* 偏好減少動態時不要轉，直接切換 */
@media (prefers-reduced-motion: reduce) {
  .ring { transition: none; }
}
</style>
