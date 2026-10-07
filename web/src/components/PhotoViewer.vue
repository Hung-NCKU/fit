<script>
import { reactive } from 'vue';

/** 全域只有一個檢視器，任何頁面呼叫 openPhoto(src, caption) 就會跳出來 */
const viewer = reactive({ src: '', caption: '' });

export function openPhoto(src, caption = '') {
  if (!src) return;
  viewer.src = src;
  viewer.caption = caption;
}
</script>

<script setup>
import { onMounted, onUnmounted, watch } from 'vue';

const close = () => { viewer.src = ''; viewer.caption = ''; };
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
.fade-enter-active, .fade-leave-active { transition: opacity .15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
