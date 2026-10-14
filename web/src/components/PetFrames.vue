<script setup>
import { computed, useId } from 'vue';
import layouts from '../pet-frame-layout.json';
const props = defineProps({ species: String, pose: String, label: String, resting: Boolean });
const instanceId = useId();
const layout = computed(() => layouts[props.species]);
const frames = computed(() => layout.value.poses[props.pose] || layout.value.poses.idle);
const duration = computed(() => {
  const seconds = ({ idle: 6.8, walk: .8, eat: 2.2, sleep: 6, play: 2.6 })[props.pose] || 6.8;
  const slowerWalk = ({ tortoise: 3, dog: 1.5, hedgehog: 1.5, guinea: 1.2, parrot: 1.2 })[props.species] || 1;
  return `${seconds * (props.pose === 'walk' ? slowerWalk : 1)}s`;
});
const clipId = i => `pet-frame-${instanceId}-${props.species}-${props.pose}-${i}`;
</script>

<template>
  <span class="pet-frames" :class="[pose, { resting }]" :style="{ '--duration': duration }" role="img" :aria-label="label">
    <svg v-for="(viewport, i) in frames" :key="i" class="frame" :class="`frame-${i}`" :viewBox="viewport" :style="{ animationDelay: `calc(var(--duration) * ${i ? (i - 4) / 4 : 0})` }" aria-hidden="true">
      <defs><clipPath :id="clipId(i)" clipPathUnits="userSpaceOnUse"><rect v-bind="layout.bounds[pose || 'idle'][i]" /></clipPath></defs>
      <image :href="`/pets/animated-${species}-v2.webp`" :width="layout.width" :height="layout.height" :clip-path="`url(#${clipId(i)})`" />
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
.resting .frame { animation: none; opacity: 0; }
.resting .frame-2 { opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  .frame { animation: none; opacity: 0; }
  .frame-0 { opacity: 1; }
}
</style>
