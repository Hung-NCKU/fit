<script setup>
import { computed, useId } from 'vue';
import layouts from '../decor-art-layout.json';
const props=defineProps({ item:Object });
const layout=computed(()=>layouts[props.item?.id]);
const clipId=`decor-${useId()}`;
</script>
<template>
  <svg v-if="layout" class="decor-art" :viewBox="layout.viewBox" :width="layout.bounds.width" :height="layout.bounds.height" role="img" :aria-label="item.name">
    <defs><clipPath :id="clipId" clipPathUnits="userSpaceOnUse"><rect v-bind="layout.bounds" /></clipPath></defs>
    <image :href="`/pets/decor-v2/${layout.sheet}.webp`" :width="layout.width" :height="layout.height" :clip-path="`url(#${clipId})`" />
  </svg>
  <img v-else class="decor-art" :src="item.img" :alt="item.name" draggable="false" />
</template>
<style scoped>
.decor-art { display:block; width:100%; height:auto; overflow:hidden; }
</style>
