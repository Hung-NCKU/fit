<script setup>
import { ref, computed, watch, useId } from 'vue';
import catalog from '../../../shared/workout-catalog.json';
const props=defineProps({modelValue:String});
const emit=defineEmits(['update:modelValue']);
const side=ref('front');
const uid=useId();
watch(()=>props.modelValue,id=>{const muscle=catalog.muscles.find(m=>m.id===id);if(muscle)side.value=muscle.side;});
const visible=computed(()=>catalog.muscles.filter(m=>m.side===side.value));
// Original schematic SVG. Hit areas follow muscle groups rather than copying
// third-party anatomical models or illustrations.
const shapes={
  shoulders:['M103 90 Q82 88 77 112 L83 132 Q101 125 108 108Z'],
  chest:['M109 98 Q125 89 150 101 L150 137 Q124 151 105 131Z'],
  biceps:['M79 133 Q88 127 98 137 L91 175 Q79 185 72 170Z'],
  core:['M124 147 Q137 145 150 149 L150 176 Q136 181 122 175Z','M123 182 Q136 180 150 183 L150 207 Q137 213 125 208Z','M126 215 Q138 214 150 217 L150 240 Q139 242 132 236Z'],
  quads:['M111 253 Q130 250 146 268 L140 337 Q130 357 118 345 L105 287Z'],
  back:['M110 96 L150 91 L150 139 L113 155 L102 123Z','M113 158 L150 145 L150 225 L133 245 L118 217Z'],
  triceps:['M79 133 Q94 127 98 138 L92 175 Q81 186 72 170Z'],
  glutes:['M112 238 Q132 228 150 245 L150 279 Q125 293 109 274Z'],
  hamstrings:['M111 285 Q130 295 145 286 L140 341 Q129 359 117 346Z'],
  calves:['M119 362 Q133 355 139 370 L132 411 Q122 428 115 409Z'],
};
const select=id=>emit('update:modelValue',id);
const fibers={chest:['M113 103Q129 107 145 109','M111 113Q128 120 145 119','M113 125Q126 133 143 130'],back:['M113 107L144 131','M117 119L140 138','M118 168Q132 177 143 180','M122 188L143 203'],quads:['M117 267Q123 297 124 332','M136 274Q130 305 131 337'],hamstrings:['M120 298L125 338','M136 298L132 338'],glutes:['M116 249Q131 243 143 252','M116 263Q128 258 143 267']};
</script>
<template>
  <div class="muscle-map">
    <div class="spread map-heading"><b>想練哪裡？</b><div class="row face-switch" aria-label="人體方向"><button :class="{on:side==='front'}" :aria-pressed="side==='front'" @click="side='front'">正面</button><button :class="{on:side==='back'}" :aria-pressed="side==='back'" @click="side='back'">背面</button></div></div>
    <p class="small muted map-hint">點選肌肉區域，也可以用下方部位按鈕選擇。</p>
    <svg class="body-map" viewBox="0 0 300 485" aria-label="可選擇訓練部位的人體示意圖" :style="{'--anatomy-fill':`url(#${uid}-body)`,'--muscle-fill':`url(#${uid}-muscle)`}">
      <defs><linearGradient :id="`${uid}-body`"><stop stop-color="#e6d4b8" /><stop offset=".45" stop-color="#fff6e7" /><stop offset="1" stop-color="#dfc8a8" /></linearGradient><linearGradient :id="`${uid}-muscle`"><stop stop-color="#e5d1b4" /><stop offset=".5" stop-color="#cfb18c" /><stop offset="1" stop-color="#e4c9a5" /></linearGradient></defs>
      <ellipse cx="150" cy="465" rx="66" ry="8" class="ground" />
      <g class="anatomy-base" aria-hidden="true">
        <path d="M132 70 L131 85 Q117 94 104 93 Q85 87 76 105 L67 146 L61 189 L47 228 L44 247 Q48 258 57 250 L64 236 L67 222 L83 192 L98 154 L103 190 L111 222 L104 255 L101 293 L111 351 L110 390 L116 434 L108 451 Q106 461 126 460 L136 451 L138 420 L145 375 L143 348 L150 300 L157 348 L155 375 L162 420 L164 451 L174 460 Q194 461 192 451 L184 434 L190 390 L189 351 L199 293 L196 255 L189 222 L197 190 L202 154 L217 192 L233 222 L236 236 L243 250 Q252 258 256 247 L253 228 L239 189 L233 146 L224 105 Q215 87 196 93 Q183 94 169 85 L168 70Z" />
        <path d="M129 34 Q150 16 171 34 L173 56 Q169 79 150 82 Q131 79 127 56Z" />
        <path class="body-line" d="M150 96V242 M114 352L139 352 M161 352L186 352 M114 437L135 437 M165 437L186 437" />
        <template v-if="side==='back'"><path class="body-line" d="M129 61Q150 71 171 61 M107 115L147 151L193 115 M109 275Q130 291 150 276Q170 291 191 275" /></template>
        <template v-else><path class="body-line" d="M138 48h3m18 0h3 M144 65q6 4 12 0 M107 143Q128 157 148 145 M152 145Q172 157 193 143" /></template>
      </g>
      <g v-for="muscle in visible" :key="muscle.id" class="muscle" :class="{selected:modelValue===muscle.id}" role="button" tabindex="0" :aria-label="`圖選${muscle.name}`" :aria-pressed="modelValue===muscle.id" @click="select(muscle.id)" @keydown.enter.prevent="select(muscle.id)" @keydown.space.prevent="select(muscle.id)">
        <title>{{ muscle.name }} · {{ muscle.detail }}</title>
        <g v-for="mirror in [false,true]" :key="String(mirror)" :transform="mirror ? 'translate(300 0) scale(-1 1)' : undefined"><path v-for="(d,index) in shapes[muscle.id]" :key="index" :d="d" /><path v-for="(d,index) in fibers[muscle.id] || []" :key="`fiber-${index}`" class="fiber" :d="d" /></g>
      </g>
    </svg>
    <div class="muscle-options"><button v-for="muscle in catalog.muscles" :key="muscle.id" :class="{on:modelValue===muscle.id}" :aria-pressed="modelValue===muscle.id" @click="select(muscle.id)">{{ muscle.name }}</button></div>
    <p class="map-note small muted">肌群位置為訓練選擇示意。</p>
  </div>
</template>
<style scoped>
.map-heading { gap:.5rem; }.map-hint {margin:.5rem 0 0;}.face-switch {gap:.3rem;}.face-switch button {padding:.3rem .7rem;font-size:.8rem;min-height:36px;}
.on {background:var(--accent-soft);border-color:var(--accent);color:var(--accent);font-weight:650;}
.body-map {display:block;width:100%;height:360px;margin:.2rem auto;}.ground {fill:#dfc6a13d;}.anatomy-base {fill:#f6ead8;stroke:#b29c7e;stroke-width:1.6;stroke-linejoin:round;}.body-line {fill:none;stroke:#cbb596;}
.anatomy-base,.ground {pointer-events:none;}.muscle {fill:#d9c2a3;stroke:#b79b78;stroke-width:1.4;cursor:pointer;outline:none;transition:fill .15s;}.muscle.selected {fill:var(--accent);stroke:#30462a;stroke-width:2;}.muscle:hover,.muscle:focus-visible {fill:#a4b58b;stroke:var(--accent);stroke-width:2.5;}.muscle.selected:hover {fill:var(--accent);}
.anatomy-base {fill:var(--anatomy-fill);}.muscle {fill:var(--muscle-fill);}.muscle.selected {fill:var(--accent);}.muscle .fiber {fill:none;stroke:#fff2dd;stroke-width:1;opacity:.5;pointer-events:none;}.muscle.selected .fiber {stroke:#dfebd2;opacity:.4;}
.muscle-options {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.4rem;}.muscle-options button {min-height:42px;font-size:.8rem;padding:.4rem .3rem;}.map-note {margin:.6rem 0 0;}
@media(min-width:760px){.body-map {height:390px;}}
</style>
