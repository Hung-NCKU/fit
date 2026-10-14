<script setup>
import { computed, ref, watch, onUnmounted } from 'vue';
import PetFrames from './PetFrames.vue';
import PetPickup from './PetPickup.vue';
import { pickNext } from '../pet-fsm.js';
import { roamingBounds, roamingTarget, roamingDuration, roamingFacing } from '../pet-roaming.js';
const props = defineProps({ pet: Object, state: Object, sceneHeight: Number, sceneWidth:Number, roomKey:String, paused:Boolean, index: Number, count: Number, selected: Boolean, interactive: Boolean, wearing: Array, preview: Boolean });
const emit=defineEmits(['select','move']);
const current = ref(null);
const initialPosition=()=>props.pet.position || {x:props.count===1?50:14+props.index*72/(props.count-1),y:88};
const position=ref({...initialPosition()});
const lifted=ref(false);
const landing=ref(false);
let landingTimer;
let pointerDrag, suppressClick=false;
const moving=ref(false);
const facing=ref(1);
let frame, journey, nextTrip=0;
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
function roam(now) {
  const resting=['sleep','eat'].includes(current.value?.pose);
  if(lifted.value || props.paused || reducedMotion.matches || document.hidden || resting) {
    journey=null; moving.value=false; nextTrip=now+2500;
  } else if(journey) {
    const fraction=Math.min(1,(now-journey.start)/journey.duration);
    const eased=fraction*fraction*(3-2*fraction);
    position.value={x:journey.from.x+(journey.to.x-journey.from.x)*eased,y:journey.from.y+(journey.to.y-journey.from.y)*eased};
    if(fraction===1) {journey=null;moving.value=false;nextTrip=now+3000+Math.random()*6000;}
  } else if(now>=nextTrip) {
    const bounds=roamingBounds(props.sceneWidth||400,props.sceneHeight,actorSize.value);
    const from={x:Math.min(bounds.right,Math.max(bounds.left,position.value.x)),y:position.value.y};
    const to=roamingTarget(from,bounds);
    journey={from,to,start:now,duration:roamingDuration(from,to,props.sceneWidth||400,props.sceneHeight,props.pet.species,actorSize.value)*1000};
    facing.value=roamingFacing(from,to); moving.value=true;
  }
  frame=requestAnimationFrame(roam);
}
let timer;
function step() {
  const b = props.pet.behavior;
  if (!b) return;
  const now = new Date();
  current.value = pickNext({ curve: b.curve, hour: now.getHours() + now.getMinutes() / 60, mood: props.state?.mood, ateToday: !!props.state?.ateToday, acts: b.acts, last: current.value?.kind });
  timer = setTimeout(step, (current.value.secs || 25) * 1000);
}
watch(() => props.pet.petKey, () => { clearTimeout(timer); step(); }, { immediate: true });
// Begin after setup so actorSize and behavior are available.
frame=requestAnimationFrame(roam);
onUnmounted(() => {clearTimeout(timer);clearTimeout(landingTimer);cancelAnimationFrame(frame);});
const clothes = computed(() => props.wearing || props.pet.worn || []);
// 衣櫃是正面素材；穿著時保持正面，整個角色連同穿搭一起呼吸、走動。
const pose = computed(() => clothes.value.length || props.preview ? 'idle' : moving.value ? 'walk' : current.value?.pose === 'walk' ? 'idle' : current.value?.pose || 'idle');
watch(()=>props.roomKey,()=>{journey=null;position.value={...initialPosition()};});
watch(()=>props.pet.position,p=>{if(p && !lifted.value && !journey) position.value={...p};});
function lift(event) {
  if(!props.interactive || props.paused) return;
  const rect=event.currentTarget.parentElement.getBoundingClientRect();
  pointerDrag={id:event.pointerId,x:event.clientX,y:event.clientY,from:{...position.value},rect};
  journey=null;moving.value=false;lifted.value=true;
  event.currentTarget.setPointerCapture(event.pointerId);
}
function dragPet(event) {
  if(!pointerDrag || event.pointerId!==pointerDrag.id) return;
  const bounds=roamingBounds(props.sceneWidth||400,props.sceneHeight,actorSize.value);
  const topLimit=Math.max(20,actorSize.value/props.sceneHeight*88+8);
  position.value={x:Math.min(bounds.right,Math.max(bounds.left,pointerDrag.from.x+(event.clientX-pointerDrag.x)/pointerDrag.rect.width*100)),
    y:Math.min(95,Math.max(topLimit,pointerDrag.from.y+(event.clientY-pointerDrag.y)/pointerDrag.rect.height*100))};
}
function drop(event,cancelled=false) {
  if(!pointerDrag || event.pointerId!==pointerDrag.id) return;
  const moved=Math.hypot(event.clientX-pointerDrag.x,event.clientY-pointerDrag.y)>5;
  if(cancelled || !moved) position.value={...pointerDrag.from};
  else {position.value={x:position.value.x,y:Math.min(90,Math.max(64,position.value.y))};emit('move',{petKey:props.pet.petKey,position:{...position.value}});}
  lifted.value=false;pointerDrag=null;suppressClick=moved;nextTrip=performance.now()+8000;
  landing.value=true;clearTimeout(landingTimer);landingTimer=setTimeout(()=>{landing.value=false;},260);
}
function clickPet() {if(suppressClick) {suppressClick=false;return;}emit('select',props.pet.petKey);}
const anchors = {
  cat: [[50,8,44],[50,59,38,29],[50,58,26]], dog: [[50,8,44],[50,60,37,28],[50,60,25]],
  rabbit: [[50,23,38],[50,66,32,22],[50,62,26]], hamster: [[50,15,42],[50,65,34,23],[50,61,26]],
  guinea: [[35,23,35],[57,60,51,28],[37,56,28]], hedgehog: [[58,25,34],[58,64,33,24],[58,60,26]],
  ferret: [[61,14,32],[53,56,32,32],[61,51,26]], parrot: [[60,13,35],[50,55,36,33],[59,49,26]],
  tortoise: [[30,46,30],[61,37,61,40],[30,65,25]], chinchilla: [[50,24,37],[50,65,37,23],[50,61,27]],
};
function garmentStyle(item) {
  let [x,y,w,h] = (anchors[props.pet.species] || anchors.cat)[{hat:0,cloth:1,acc:2}[item.slot] ?? 2];
  if (/背包/.test(item.name)) [x,y,w] = [67,52,26];
  if (/頭圈|髮飾/.test(item.name)) [x,y,w] = (anchors[props.pet.species] || anchors.cat)[0];
  if (lifted.value) {
    [x,y,w,h] = ({hat:[45,28,w*.8],cloth:[45,57,w*.8,26],acc:[45,53,w*.8]})[item.slot] || [45,53,w*.8];
    if (/背包/.test(item.name)) [x,y,w,h]=[59,54,21,undefined];
  }
  return { left: `${x}%`, top: `${y}%`, width: `${w}%`, height: h ? `${h}%` : 'auto' };
}
const actorSize = computed(() => props.preview ? props.sceneHeight * .65 : props.sceneHeight * (props.pet.behavior?.size || .3) * 1.25 * Math.min(1, Math.max(.55, Math.sqrt(4 / props.count))));
const style = computed(() => ({
  left: `clamp(${actorSize.value / 2 + 8}px, ${position.value.x}%, calc(100% - ${actorSize.value / 2 + 8}px))`,
  bottom: `${props.sceneHeight * (1-position.value.y/100)}px`,
  width: `${actorSize.value}px`,
  zIndex: lifted.value ? 2500 : props.preview ? 1100 : Math.round(position.value.y*10),
  '--facing':moving.value ? facing.value : 1,
  '--body-x':(({ thin: .82, normal: 1, round: 1.18 })[props.state?.body] || 1)*(moving.value ? facing.value : 1),
  '--body': ({ thin: .82, normal: 1, round: 1.18 })[props.state?.body] || 1,
  '--delay': `${-props.index * 1.9}s`,
}));
</script>
<template>
  <button class="actor" :class="{ selected, roaming: moving, lifted, landing }" :style="style" :disabled="!interactive" :aria-label="`選擇寵物 ${pet.name}`"
    @pointerdown.stop="lift" @pointermove="dragPet" @pointerup="drop($event)" @pointercancel="drop($event,true)" @click="clickPet">
    <span class="body" :class="{ resting: current?.pose === 'sleep' }">
      <PetPickup v-if="lifted" :species="pet.species" :label="pet.speciesName" />
      <PetFrames v-else :species="pet.species" :pose="pose" :label="pet.speciesName" :resting="clothes.length > 0 && current?.pose === 'sleep'" />
      <template v-for="item in clothes" :key="item.id">
        <svg v-if="item.img.endsWith('/dog-7.webp')" class="garment cloth" :style="garmentStyle(item)" viewBox="0 0 103 119" preserveAspectRatio="none" role="img" :aria-label="item.name"><image :href="item.img" width="200" height="119" /></svg>
        <img v-else class="garment" :class="item.slot" :src="item.img" :alt="item.name" :style="garmentStyle(item)" />
      </template>
    </span>
    <span class="name">{{ pet.name }}</span>
  </button>
</template>
<style scoped>
.actor { position:absolute; padding:0; border:0; background:none; aspect-ratio:1; transform:translate(-50%,12%); overflow:visible; color:#433c32; touch-action:none; cursor:grab; user-select:none; -webkit-user-select:none; -webkit-touch-callout:none; }
.actor.lifted { cursor:grabbing; }
.lifted .body { animation:pickup .9s ease-in-out infinite; transform:translateY(-12px) scale(1.06); filter:drop-shadow(0 12px 5px #0002); }
@keyframes pickup { 0%,100% {transform:translateY(-12px) scale(1.06) rotate(-1.5deg);} 50% {transform:translateY(-14px) scale(1.06) rotate(1.5deg);} }
.landing .body { animation:land .25s ease-out; }
@keyframes land { from {transform:translateY(-12px) scale(1.04);} to {transform:translateY(0) scaleX(var(--body));} }
.body,.name { pointer-events:none; }
.actor:disabled { opacity:1; cursor:default; }
/* 全域 button:hover 的深色底不適用於透明角色按鈕。 */
.actor:hover:not(:disabled), .actor:active:not(:disabled), .actor:focus { background:transparent; border-color:transparent; box-shadow:none; }
.actor:focus-visible { outline:2px solid #c19058; outline-offset:3px; }
.body { display:block; width:100%; height:100%; position:relative; transform:scaleX(var(--body-x)); animation:breathe 4.8s ease-in-out infinite; animation-delay:var(--delay); transform-origin:50% 88%; }
.garment { position:absolute; height:auto; object-fit:contain; transform:translateX(-50%); pointer-events:none; overflow:hidden; }
.cloth { z-index:2; object-fit:fill; } .acc { z-index:3; } .hat { z-index:4; }
.name { position:absolute; top:90%; left:50%; transform:translateX(-50%); white-space:nowrap; border-radius:12px; padding:2px 7px; font-size:11px; background:#fff9; }
.selected .name { background:#fff; box-shadow:0 0 0 2px #c19058; }
.roaming .body { animation:waddle .6s ease-in-out infinite; }
@keyframes breathe { 0%,100% {transform:scaleX(var(--body-x));} 50% { transform:scaleX(var(--body-x)) scaleY(1.012); } }
@keyframes waddle { 0%,100% {transform:scaleX(var(--body-x));} 50% { transform:translateY(-2px) scaleX(var(--body-x)) rotate(1deg); } }
@media(prefers-reduced-motion:reduce) { .actor,.body { animation:none; } }
</style>
