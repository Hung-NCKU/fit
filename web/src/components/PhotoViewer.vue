<script>
import { reactive } from 'vue';

/**
 * 全域只有一個檢視器，任何頁面呼叫 openPhoto(src, caption) 就會跳出來。
 *
 * 第三個參數給 rotate(turns) 時會多出轉正按鈕（只有自己的餐點照片會給）。
 * rotate 要回傳轉好的新網址：照片轉完會換一個新 id，舊網址的快取永遠是舊圖。
 */
const viewer = reactive({ src: '', caption: '', rotate: null, busy: false, error: '' });

export function openPhoto(src, caption = '', { rotate = null } = {}) {
  if (!src) return;
  Object.assign(viewer, { src, caption, rotate, busy: false, error: '' });
}
</script>

<script setup>
import { onMounted, onUnmounted, watch } from 'vue';

const close = () => { Object.assign(viewer, { src: '', caption: '', rotate: null, busy: false, error: '' }); };

async function turn(turns) {
  if (!viewer.rotate || viewer.busy) return;
  viewer.busy = true;
  viewer.error = '';
  try { viewer.src = await viewer.rotate(turns); }
  catch (e) { viewer.error = e.message; }
  finally { viewer.busy = false; }
}
const onKey = (e) => { if (e.key === 'Escape') close(); };

// 開著的時候鎖住背景捲動，手機上才不會一邊滑一邊捲到後面的列表
watch(() => viewer.src, (v) => { document.body.style.overflow = v ? 'hidden' : ''; });

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <Transition name="fade">
    <div v-if="viewer.src" class="overlay" role="dialog" aria-modal="true" @click="close">
      <button class="x" aria-label="關閉" @click.stop="close">✕</button>
      <figure @click.stop>
        <img :src="viewer.src" :alt="viewer.caption || '餐點照片'" />
        <figcaption v-if="viewer.caption">{{ viewer.caption }}</figcaption>
        <div v-if="viewer.rotate" class="turns">
          <button :disabled="viewer.busy" aria-label="逆時針轉 90 度" @click="turn(-1)">↺ 往左轉</button>
          <button :disabled="viewer.busy" aria-label="順時針轉 90 度" @click="turn(1)">往右轉 ↻</button>
        </div>
        <p v-if="viewer.busy" class="note">轉正中…</p>
        <p v-else-if="viewer.error" class="note err">{{ viewer.error }}</p>
      </figure>
    </div>
  </Transition>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(3rem + var(--safe-top)) calc(1rem + var(--safe-right))
           calc(1.5rem + var(--safe-bottom)) calc(1rem + var(--safe-left));
  background: rgba(5, 7, 10, .92);
  cursor: zoom-out;
}
figure {
  margin: 0;
  max-width: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: .6rem;
  cursor: default;
}
img {
  max-width: 100%;
  max-height: calc(100dvh - 8rem - var(--safe-top) - var(--safe-bottom));
  object-fit: contain;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, .5);
}
figcaption {
  color: var(--text);
  font-size: .9rem;
  text-align: center;
}
.x {
  position: absolute;
  top: calc(.8rem + var(--safe-top));
  right: calc(.8rem + var(--safe-right));
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 999px;
  font-size: 1rem;
  background: rgba(255, 255, 255, .12);
  border-color: transparent;
  color: #fff;
}
/* 轉正按鈕：深色背景上的半透明圓角鈕，跟右上角的關閉鈕同一種樣子 */
.turns { display: flex; gap: .6rem; }
.turns button { padding: .45rem 1rem; border-radius: 999px; }
/*
 * 全站按鈕樣式（ui-polish.css 的 .shell[data-ui] button）權重比這裡的 .x 高，
 * 會把底色蓋成白的——白字配白底，關閉鈕整個看不見，按過的轉正鈕也一樣
 * （手機上點過會停在 :hover）。前面多掛 .overlay 把權重拉過它，hover 也要一起蓋。
 */
.overlay .x, .overlay .turns button {
  background: rgba(255, 255, 255, .12); border-color: transparent; color: #fff;
}
.overlay .x:hover:not(:disabled), .overlay .turns button:hover:not(:disabled) {
  background: rgba(255, 255, 255, .24); border-color: transparent; color: #fff;
}
.note { margin: 0; color: #ddd; font-size: .85rem; }
.note.err { color: #ffb4a8; }
.fade-enter-active, .fade-leave-active { transition: opacity .15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
