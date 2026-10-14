<script setup>
import { computed,useId } from 'vue';
import layouts from '../pet-outfit-layout.json';
const props=defineProps({outfit:String,pose:{type:String,default:'idle'},label:String,resting:Boolean,still:Boolean});
const id=useId();
const layout=computed(()=>layouts[props.outfit]);
const pose=computed(()=>layout.value?.poses[props.pose]?props.pose:'idle');
const frames=computed(()=>layout.value?.poses[pose.value] || []);
const duration=computed(()=>pose.value==='walk'?`${({dog:1.2,tortoise:2.4,hedgehog:1.2,guinea:1.1}[props.outfit?.split('-')[1]] || .9)}s`:pose.value==='pickup'?'3.2s':'6.8s');
</script>
<template>
  <span class="outfit-frames" :class="[pose,{resting,still}]" :style="{'--duration':duration}" role="img" :aria-label="label">
    <svg v-for="(viewport,i) in frames" :key="`${outfit}-${pose}-${i}`" class="frame" :class="`frame-${i}`" :viewBox="viewport" :style="{animationDelay:`calc(var(--duration) * ${i?(i-4)/4:0})`}" aria-hidden="true">
      <defs><clipPath :id="`${id}-${i}`"><rect v-bind="layout.bounds[pose][i]" /></clipPath></defs>
      <image :href="`/pets/outfits-v1/${outfit}.webp?v=${layout.sourceHash.slice(0,12)}`" :width="layout.width" :height="layout.height" :clip-path="`url(#${id}-${i})`" />
    </svg>
  </span>
</template>
<style scoped>
.outfit-frames{display:block;position:relative;width:100%;height:100%;filter:drop-shadow(0 2px 2px #0002)}.frame{position:absolute;inset:0;width:100%;height:100%;overflow:hidden;opacity:0;animation:cycle var(--duration) step-end infinite}
@keyframes cycle{0%{opacity:1}25%,100%{opacity:0}}
.idle .frame{animation-delay:0s !important}.idle .frame-0{animation-name:open}.idle .frame-1{animation-name:half}.idle .frame-2{animation-name:closed}.idle .frame-3{animation-name:reopen}
@keyframes open{0%,94%,100%{opacity:1}88%{opacity:0}}@keyframes half{0%,90%,100%{opacity:0}88%{opacity:1}}@keyframes closed{0%,93%,100%{opacity:0}90%{opacity:1}}@keyframes reopen{0%,94%,100%{opacity:0}93%{opacity:1}}
.resting .frame,.still .frame{animation:none;opacity:0}.resting .frame-2,.still .frame-0{opacity:1}
@media(prefers-reduced-motion:reduce){.frame{animation:none !important;opacity:0}.frame-0{opacity:1}.resting .frame-0{opacity:0}.resting .frame-2{opacity:1}}
</style>
