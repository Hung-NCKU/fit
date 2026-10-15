<script setup>
import { ref, computed, watch, useId } from 'vue';
import catalog from '../../../shared/workout-catalog.json';
const props=defineProps({modelValue:String,focus:String});
const emit=defineEmits(['update:modelValue']);
const side=ref('front'), uid=useId();
watch(()=>props.modelValue,id=>{const muscle=catalog.muscles.find(m=>m.id===id);if(muscle)side.value=muscle.side;},{immediate:true});
const visible=computed(()=>catalog.muscles.filter(m=>m.side===side.value));
const imageUrl=computed(()=>`/training/anatomy-${side.value}-v1.webp`);
// Coordinates follow the original generated 1024 × 1536 plates. The bitmap stays
// neutral; symmetric hit areas tint selection without hiding the muscle fibers.
const shapes={
  shoulders:['M426 279 Q336 269 303 323 Q285 361 299 405 Q317 370 345 349Z'],
  chest:['M437 284 Q483 281 512 293 L512 408 Q490 440 449 434 Q391 431 359 398 L350 350Z'],
  biceps:['M338 387 Q368 407 364 446 Q354 494 329 523 Q306 540 290 519 Q276 500 286 461 L305 415Z'],
  core:['M451 434 Q481 424 512 433 L512 660 L449 653 Q444 611 445 568Z','M386 435 L434 450 L441 635 L398 616 Q384 541 386 435Z'],
  quads:['M361 769 Q429 800 496 785 Q499 868 466 950 Q457 984 425 1000 Q405 964 388 996 Q345 948 340 861Z'],
  back:['M446 232 L512 221 L512 533 Q487 481 455 409 L388 322 L362 291Z','M374 424 Q410 429 461 418 L512 539 L512 625 Q451 598 404 635 Q384 579 374 424Z'],
  triceps:['M317 389 Q342 376 358 402 L372 454 Q367 507 338 542 Q314 533 300 507 L283 473Z'],
  glutes:['M379 663 Q444 645 512 673 L512 805 Q454 834 374 803 L347 777Z'],
  hamstrings:['M358 827 Q422 848 498 827 Q488 919 461 982 L430 1061 L393 1030 Q360 984 346 915Z'],
  calves:['M391 1050 Q416 1074 429 1108 Q458 1158 447 1200 Q435 1235 408 1252 Q387 1228 362 1230 Q334 1184 349 1134Z'],
};
const focusShapes={
  'upper-chest':['M437 284 Q483 281 512 293 L512 329 Q428 317 366 365 L350 350Z'],
  'middle-chest':['M366 365 Q430 322 512 330 L512 391 Q439 405 359 398Z'],
  'lower-chest':['M359 398 Q440 407 512 392 L512 408 Q490 440 449 434 Q391 431 359 398Z'],
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
    <p class="small muted map-hint">點選肌肉，紅色標示目前選擇的訓練部位。</p>
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
.body-map {display:block;width:100%;height:460px;margin:.2rem auto;background:radial-gradient(ellipse at 50% 40%,#fff,#f4f3ed);border:1px solid #e1dfd6;border-radius:18px;}
.anatomy-plate {pointer-events:none;}.muscle {cursor:pointer;outline:none;}.muscle path {fill:#d95336;fill-opacity:0;stroke:#923c2a;stroke-opacity:0;stroke-width:3;transition:fill-opacity .15s;pointer-events:all;}.muscle.selected path {fill-opacity:.42;stroke-opacity:.6;}.muscle.subdued path {fill-opacity:.1;stroke-opacity:0;}.muscle:hover path,.muscle:focus-visible path {fill-opacity:.25;stroke-opacity:1;}.muscle.selected:hover path {fill-opacity:.48;}.muscle:focus-visible path {stroke-width:7;}.focus-highlight {fill:#d95336;fill-opacity:.5;stroke:#923c2a;stroke-width:3;pointer-events:none;}
.map-legend {display:flex;align-items:center;justify-content:center;gap:.4rem;margin:.5rem 0 .8rem;font-size:.8rem;font-weight:650;}.map-legend i {width:9px;height:9px;background:#d95336;border-radius:50%;}.map-legend span {color:var(--muted);font-size:.7rem;font-weight:400;}
.muscle-options {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.4rem;}.muscle-options button {min-height:42px;font-size:.8rem;padding:.4rem .3rem;}.map-note {margin:.6rem 0 0;line-height:1.6;}
@media(max-width:360px){.body-map {height:420px;}}
@media(prefers-reduced-motion:reduce){.muscle path {transition:none;}}
</style>
