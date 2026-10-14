<script setup>
import { computed, useId } from 'vue';
import layouts from '../pet-wear-layout.json';
import frames from '../pet-frame-layout.json';
import pickups from '../pet-pickup-layout.json';
import { garmentFit } from '../pet-wear-fit.js';
const props=defineProps({item:Object,species:String,lifted:Boolean});
const maskId=useId();
const art=computed(()=>layouts[props.item.img.split('/').pop().replace(/\.webp$/,'')]);
const silhouette=computed(()=>{
  if(props.item.slot!=='cloth' || !props.species || !art.value) return null;
  const f=garmentFit(props.species,props.item,props.lifted),a=art.value;
  const l=props.lifted?pickups[props.species]:frames[props.species];
  const b=props.lifted?l.bounds[0]:l.bounds.idle[0];
  return {x:a.x-(f.x-f.w/2)*a.w/f.w,y:a.y-f.y*a.h/f.h,width:100*a.w/f.w,height:100*a.h/f.h,
    viewBox:props.lifted?l.frames[0]:l.poses.idle[0],layout:l,bounds:b,
    img:props.lifted?`/pets/pickup-v1/${props.species}.webp`:`/pets/animated-${props.species}-v2.webp`};
});
</script>
<template>
  <svg v-if="art" :viewBox="`${art.x} ${art.y} ${art.w} ${art.h}`" preserveAspectRatio="none" role="img" :aria-label="item.name">
    <defs>
      <clipPath v-if="art.clip" :id="`${maskId}-art`"><polygon :points="art.clip" /></clipPath>
      <mask v-if="silhouette" :id="maskId" maskUnits="userSpaceOnUse" :x="art.x" :y="art.y" :width="art.w" :height="art.h" style="mask-type:alpha">
        <svg v-bind="{x:silhouette.x,y:silhouette.y,width:silhouette.width,height:silhouette.height,viewBox:silhouette.viewBox}">
          <defs><clipPath :id="`${maskId}-frame`"><rect v-bind="silhouette.bounds" /></clipPath></defs>
          <image :href="silhouette.img" :width="silhouette.layout.width" :height="silhouette.layout.height" :clip-path="`url(#${maskId}-frame)`" />
        </svg>
      </mask>
    </defs>
    <image :href="item.img" :width="art.width" :height="art.height" :mask="silhouette ? `url(#${maskId})` : undefined" :clip-path="art.clip ? `url(#${maskId}-art)` : undefined" />
  </svg>
  <img v-else :src="item.img" :alt="item.name" />
</template>
