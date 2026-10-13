<script setup>
import { computed } from 'vue';
import layouts from '../pet-frame-layout.json';
const props = defineProps({ species: String, pose: String, label: String });
const layout = computed(() => layouts[props.species]);
const frames = computed(() => layout.value.poses[props.pose] || layout.value.poses.idle);
const duration = computed(() => ({ idle: '6.8s', walk: '.8s', eat: '2.2s', sleep: '6s', play: '2.6s' })[props.pose] || '6.8s');
</script>

<template>
  <span class="pet-frames" :class="pose" :style="{ '--duration': duration }" role="img" :aria-label="label">
    <svg v-for="(viewport, i) in frames" :key="i" class="frame" :class="`frame-${i}`" :viewBox="viewport" :style="{ animationDelay: `calc(var(--duration) * ${i ? (i - 4) / 4 : 0})` }" aria-hidden="true">
      <image :href="`/pets/animated-${species}-v2.webp`" :width="layout.width" :height="layout.height" />
    </svg>
  </span>
</template>

<style scoped>
.pet-frames { display: block; width: 100%; height: 100%; position: relative; filter: drop-shadow(0 2px 2px #0002); }
.frame { position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden; opacity: 0; animation: cycle var(--duration) step-end infinite; }
@keyframes cycle { 0% { opacity: 1; } 25%, 100% { opacity: 0; } }
.idle .frame { animation-delay: 0s !important; }
.idle .frame-0 { animation-name: eyes-open; }
.idle .frame-1 { animation-name: eyes-half; }
.idle .frame-2 { animation-name: eyes-closed; }
.idle .frame-3 { animation-name: eyes-reopen; }
@keyframes eyes-open { 0%, 94%, 100% { opacity: 1; } 88% { opacity: 0; } }
@keyframes eyes-half { 0%, 90%, 100% { opacity: 0; } 88% { opacity: 1; } }
@keyframes eyes-closed { 0%, 93%, 100% { opacity: 0; } 90% { opacity: 1; } }
@keyframes eyes-reopen { 0%, 94%, 100% { opacity: 0; } 93% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .frame { animation: none; opacity: 0; }
  .frame-0 { opacity: 1; }
}
</style>
