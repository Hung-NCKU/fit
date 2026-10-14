<script setup>
import { computed, useId } from 'vue';
import layouts from '../pet-pickup-layout.json';
const props = defineProps({ species: String, label: String });
const id = useId();
const layout = computed(() => layouts[props.species] || layouts.cat);
</script>
<template>
  <span class="pickup-frames" role="img" :aria-label="`拎起 ${label}`">
    <svg v-for="(viewport,i) in layout.frames" :key="i" class="frame" :viewBox="viewport" :style="{animationDelay:`${i ? (i-4)*.8 : 0}s`}" aria-hidden="true">
      <defs><clipPath :id="`${id}-pickup-${i}`"><rect v-bind="layout.bounds[i]" /></clipPath></defs>
      <image :href="`/pets/pickup-v1/${species}.webp`" :width="layout.width" :height="layout.height" :clip-path="`url(#${id}-pickup-${i})`" />
    </svg>
  </span>
</template>
<style scoped>
.pickup-frames {display:block;position:relative;width:100%;height:100%;}
.frame {position:absolute;inset:0;width:100%;height:100%;opacity:0;animation:dangle 3.2s step-end infinite;}
@keyframes dangle {0% {opacity:1;}25%,100% {opacity:0;}}
@media(prefers-reduced-motion:reduce) {.frame {animation:none;opacity:0;}.frame:first-child {opacity:1;}}
</style>
