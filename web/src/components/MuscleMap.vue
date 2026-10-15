<script setup>
import { ref, computed, watch, useId } from 'vue';
import catalog from '../../../shared/workout-catalog.json';
const props=defineProps({modelValue:String,focus:String});
const emit=defineEmits(['update:modelValue']);
const side=ref('front'), uid=useId();
watch(()=>props.modelValue,id=>{const muscle=catalog.muscles.find(m=>m.id===id);if(muscle)side.value=muscle.side;},{immediate:true});
const visible=computed(()=>catalog.muscles.filter(m=>m.side===side.value));
const imageUrl=computed(()=>`/training/anatomy-${side.value}-pet-v2.webp`);
// Coordinates follow the original generated 1024 × 1536 plates. The bitmap stays
// neutral; symmetric hit areas tint selection without hiding the illustrated muscle panels.
const shapes={
  shoulders:['M403 283 Q321 259 283 309 Q263 354 278 408 Q318 365 350 349Z'],
  chest:['M433 294 Q485 288 512 308 L512 408 Q490 444 447 441 Q380 443 350 404 L347 366 Q378 325 433 294Z'],
  biceps:['M332 383 Q361 401 352 448 Q337 507 306 542 L271 548 Q254 511 262 467 L281 419Z'],
  core:['M447 439 Q483 427 512 440 L512 701 Q475 700 459 660 Q442 600 447 439Z','M385 438 L433 452 L441 618 L453 664 L395 624 Q377 535 385 438Z'],
  quads:['M365 712 Q398 690 426 733 Q471 791 490 824 L481 927 Q471 1007 450 998 Q425 954 407 993 Q338 956 330 872 Q320 790 365 712Z'],
  back:['M444 245 L512 212 L512 528 L469 432 Q448 370 411 324 L366 286Z','M367 420 Q417 434 448 408 L512 538 L512 633 Q464 600 417 628 Q375 568 367 420Z'],
  triceps:['M317 383 Q349 392 350 448 L328 524 L286 556 Q263 536 260 495 L257 448Z'],
  glutes:['M407 642 Q470 631 512 697 L512 775 Q479 815 429 811 Q387 812 362 778 L375 695Z'],
  hamstrings:['M362 790 Q415 828 493 797 L489 895 L444 1018 L407 1060 Q369 995 346 940 Q327 862 362 790Z'],
  calves:['M389 1054 Q418 1046 443 1091 Q471 1141 453 1197 Q445 1228 422 1236 L400 1224 Q381 1230 359 1201 Q327 1163 342 1097Z'],
};
const focusShapes={
  'upper-chest':['M433 294 Q485 288 512 308 L512 339 Q428 326 347 366 Q378 325 433 294Z'],
  'middle-chest':['M347 366 Q430 326 512 339 L512 395 Q439 412 350 404Z'],
  'lower-chest':['M350 404 Q440 412 512 395 L512 408 Q490 444 447 441 Q380 443 350 404Z'],
  rhomboids:['M450 336 L500 310 L500 448 L462 417Z'],
  'teres-minor':['M360 347 Q386 356 414 384 L395 400 L353 376Z'],
  'teres-major':['M353 379 L394 400 L447 405 L451 423 Q405 440 369 421Z'],
  'upper-lats':['M374 429 L458 421 L498 526 L416 547 Q388 500 374 429Z'],
  'lower-lats':['M416 549 L500 530 L512 625 Q451 598 404 635Z'],
  'spinal-erectors':['M487 474 L507 514 L507 638 L478 630Z'],
};
const selectedFocus=computed(()=>catalog.focuses.find(f=>f.id===props.focus && f.parent===props.modelValue));
const detailShapes=computed(()=>selectedFocus.value ? focusShapes[selectedFocus.value.id] : null);
const select=id=>emit('update:modelValue',id);
</script>
<template>
  <div class="muscle-map">
    <div class="spread map-heading"><b>想練哪裡？</b><div class="row face-switch" aria-label="人體方向"><button :class="{on:side==='front'}" :aria-pressed="side==='front'" @click="side='front'">正面</button><button :class="{on:side==='back'}" :aria-pressed="side==='back'" @click="side='back'">背面</button></div></div>
    <p class="small muted map-hint">點選肌肉，杏橘色標示目前選擇的訓練部位。</p>
    <svg class="body-map" viewBox="0 0 1024 1536" aria-label="可選擇訓練部位的人體示意圖">
      <defs><mask :id="`${uid}-silhouette`" mask-type="alpha"><image :href="imageUrl" width="1024" height="1536" /></mask></defs>
      <image :href="imageUrl" width="1024" height="1536" class="anatomy-plate" />
      <g :mask="`url(#${uid}-silhouette)`">
        <g v-for="muscle in visible" :key="muscle.id" class="muscle" :class="{selected:modelValue===muscle.id,subdued:modelValue===muscle.id && detailShapes}" role="button" tabindex="0" :aria-label="`圖選${muscle.name}`" :aria-pressed="modelValue===muscle.id" @click="select(muscle.id)" @keydown.enter.prevent="select(muscle.id)" @keydown.space.prevent="select(muscle.id)">
          <title>{{ muscle.name }} · {{ muscle.detail }}</title>
          <g v-for="mirror in [false,true]" :key="String(mirror)" :transform="mirror ? 'translate(1024 0) scale(-1 1)' : undefined"><path v-for="(d,index) in shapes[muscle.id]" :key="index" :d="d" /></g>
        </g>
        <g v-if="detailShapes && visible.some(m=>m.id===modelValue)" class="focus-highlight" aria-hidden="true"><g v-for="mirror in [false,true]" :key="String(mirror)" :transform="mirror ? 'translate(1024 0) scale(-1 1)' : undefined"><path v-for="(d,i) in detailShapes" :key="i" :d="d" /></g></g>
      </g>
    </svg>
    <div class="map-legend"><i aria-hidden="true"></i>{{ selectedFocus?.name || catalog.muscles.find(m=>m.id===modelValue)?.name }}<span>目前選取</span></div>
    <div class="muscle-options"><button v-for="muscle in catalog.muscles" :key="muscle.id" :class="{on:modelValue===muscle.id}" :aria-pressed="modelValue===muscle.id" @click="select(muscle.id)">{{ muscle.name }}</button></div>
    <p class="map-note small muted">肌群位置為訓練選擇示意；菱形肌等深層肌群採投影位置標示。</p>
  </div>
</template>
<style scoped>
.map-heading {gap:.5rem;}.map-hint {margin:.5rem 0 .4rem;line-height:1.6;}.face-switch {gap:.3rem;}.face-switch button {padding:.3rem .7rem;font-size:.8rem;min-height:36px;}
.on {background:var(--accent-soft);border-color:var(--accent);color:var(--accent);font-weight:650;}
.body-map {display:block;width:100%;height:460px;margin:.2rem auto;background:radial-gradient(ellipse at 50% 40%,#fffdf7,#fff0d6);border:1px solid #ead5b3;border-radius:18px;}
.anatomy-plate {pointer-events:none;}.muscle {cursor:pointer;outline:none;}.muscle path {fill:#cf7948;fill-opacity:0;stroke:#885335;stroke-opacity:0;stroke-width:3;transition:fill-opacity .15s;pointer-events:all;}.muscle.selected path {fill-opacity:.36;stroke-opacity:.6;}.muscle.subdued path {fill-opacity:.1;stroke-opacity:0;}.muscle:hover path,.muscle:focus-visible path {fill-opacity:.25;stroke-opacity:1;}.muscle.selected:hover path {fill-opacity:.42;}.muscle:focus-visible path {stroke-width:7;}.focus-highlight {fill:#cf7948;fill-opacity:.42;stroke:#885335;stroke-width:3;pointer-events:none;}
.map-legend {display:flex;align-items:center;justify-content:center;gap:.4rem;margin:.5rem 0 .8rem;font-size:.8rem;font-weight:650;}.map-legend i {width:9px;height:9px;background:#cf7948;border-radius:50%;}.map-legend span {color:var(--muted);font-size:.7rem;font-weight:400;}
.muscle-options {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.4rem;}.muscle-options button {min-height:42px;font-size:.8rem;padding:.4rem .3rem;}.map-note {margin:.6rem 0 0;line-height:1.6;}
@media(max-width:360px){.body-map {height:420px;}}
@media(prefers-reduced-motion:reduce){.muscle path {transition:none;}}
</style>
