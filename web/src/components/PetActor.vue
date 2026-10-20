<script setup>
import { computed, ref, watch, onUnmounted } from 'vue';
import BullyFrames from './BullyFrames.vue';
import PetFrames from './PetFrames.vue';
import {petActorSize} from '../room-scale.js';
import PetPickup from './PetPickup.vue';
import OutfitFrames from './OutfitFrames.vue';
import { pickNext } from '../pet-fsm.js';
import { roamingBounds, roamingTarget, roamingDuration, roamingFacing } from '../pet-roaming.js';
const props = defineProps({ pet: Object, state: Object, sceneHeight: Number, sceneWidth:Number, roomKey:String, paused:Boolean, index: Number, count: Number, selected: Boolean, interactive: Boolean, movable:{type:Boolean,default:true}, wearing: Array, preview: Boolean, decorations:Array, celebration:Object, reminder:String });
const emit=defineEmits(['select','move','interact']);
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
const speech=ref('');
const barkIndex=ref(0);
const barkTimer=setInterval(()=>{if(!props.paused && !document.hidden) barkIndex.value++;},4500);
const barking=computed(()=>props.pet.barkReminders && !props.paused && !lifted.value);
const barkText=computed(()=>barkIndex.value%2 ? '汪汪！去運動！' : '汪汪！去吃飯！');
const joyful=ref(false);
let speechTimer;
function say(text, celebrate=false) {
  speech.value=text; joyful.value=celebrate;
  clearTimeout(speechTimer); speechTimer=setTimeout(()=>{speech.value='';joyful.value=false;},4500);
}
watch(()=>props.celebration, value=>{
  if (!value || (value.petKey ? value.petKey!==props.pet.petKey : !props.selected)) return;
  journey=null; moving.value=false; nextTrip=performance.now()+5000;
  say(({meal:'記下這一餐了！謝謝你帶我一起成長 🐾',workout:'你運動，我也一起玩了！今天好開心 ✨',interaction:'陪我玩，我好開心！🐾',weight:'留下今天的體態紀錄了，我陪你慢慢來！'})[value.kind] || '今天也一起留下紀錄了！',true);
}, { immediate: true });
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
function roam(now) {
  const resting=['sleep','eat'].includes(current.value?.pose);
  if(lifted.value || props.paused || reducedMotion.matches || document.hidden || resting) {
    journey=null; moving.value=false; nextTrip=now+2500;
  } else if(journey) {
    const fraction=Math.min(1,(now-journey.start)/journey.duration);
    const eased=fraction*fraction*(3-2*fraction);
    position.value={x:journey.from.x+(journey.to.x-journey.from.x)*eased,y:journey.from.y+(journey.to.y-journey.from.y)*eased};
    if(fraction===1) {if(journey.decor) say(`來看看${journey.decor.name} 🐾`);journey=null;moving.value=false;nextTrip=now+3000+Math.random()*6000;}
  } else if(now>=nextTrip) {
    const bounds=roamingBounds(props.sceneWidth||400,props.sceneHeight,actorSize.value);
    const from={x:Math.min(bounds.right,Math.max(bounds.left,position.value.x)),y:position.value.y};
    const objects=props.decorations || [];
    const decor=objects.length && Math.random()<.25 ? objects[Math.floor(Math.random()*objects.length)] : null;
    const to=decor ? {x:Math.min(bounds.right,Math.max(bounds.left,decor.x)),y:Math.min(90,Math.max(64,decor.y))} : roamingTarget(from,bounds);
    journey={from,to,decor,start:now,duration:roamingDuration(from,to,props.sceneWidth||400,props.sceneHeight,props.pet.species,actorSize.value)*1000};
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
onUnmounted(() => {clearInterval(barkTimer);clearTimeout(timer);clearTimeout(landingTimer);clearTimeout(speechTimer);cancelAnimationFrame(frame);});
const clothes = computed(() => props.wearing || props.pet.worn || []);
const outfit=computed(()=>clothes.value.find(item=>item.slot==='outfit'));
// The complete outfit is baked into each character pose; no garment overlays.
const pose = computed(() => clothes.value.length || props.preview ? 'idle' : joyful.value ? 'play' : moving.value ? 'walk' : current.value?.pose === 'walk' ? 'idle' : current.value?.pose || 'idle');
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
  if(cancelled || !moved || !props.movable) position.value={...pointerDrag.from};
  else {position.value={x:position.value.x,y:Math.min(90,Math.max(64,position.value.y))};emit('move',{petKey:props.pet.petKey,position:{...position.value}});}
  lifted.value=false;pointerDrag=null;suppressClick=moved;nextTrip=performance.now()+8000;
    if(!cancelled && moved && !props.movable)emit('interact',props.pet.petKey);
  landing.value=true;clearTimeout(landingTimer);landingTimer=setTimeout(()=>{landing.value=false;},260);
}
function clickPet() {if(suppressClick) {suppressClick=false;return;}say('我在這裡陪你！今天想做什麼呢？');emit(!props.paused && !props.preview ? 'interact' : 'select',props.pet.petKey);}
const actorSize = computed(() => petActorSize(props.sceneHeight,props.pet.behavior?.size || .3));
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
  <button class="actor" :class="{ selected, visiting:!movable, roaming: moving, lifted, landing, joyful }" :style="style" :disabled="!interactive" :aria-label="`選擇寵物 ${pet.name}`"
    @pointerdown.stop="lift" @pointermove="dragPet" @pointerup="drop($event)" @pointercancel="drop($event,true)" @click="clickPet">
    <span class="body" :class="{ resting: current?.pose === 'sleep' }">
      <BullyFrames v-if="pet.species === 'bully'" :pose="lifted ? 'pickup' : moving ? 'walk' : 'idle'" :label="pet.speciesName" />
      <OutfitFrames v-else-if="outfit" :outfit="outfit.id" :pose="lifted ? 'pickup' : moving ? 'walk' : 'idle'" :label="`${pet.speciesName}・${outfit.name}`" :resting="!lifted && current?.pose === 'sleep'" />
      <PetPickup v-else-if="lifted" :species="pet.species" :label="pet.speciesName" />
      <PetFrames v-else :species="pet.species" :pose="pose" :label="pet.speciesName" :resting="clothes.length > 0 && current?.pose === 'sleep'" />
    </span>
    <span class="name">{{ pet.name }}</span>
    <span v-if="(barking || speech || reminder && selected && !paused && !lifted) && !preview" class="pet-speech" aria-live="off">{{ barking ? barkText : speech || reminder }}</span>
  </button>
</template>
<style scoped>
.actor { position:absolute; padding:0; border:0; background:transparent; background-image:none; box-shadow:none; appearance:none; -webkit-appearance:none; -webkit-tap-highlight-color:transparent; transition:none; outline:none; aspect-ratio:1; transform:translate(-50%,12%); overflow:visible; color:#433c32; touch-action:none; cursor:grab; user-select:none; -webkit-user-select:none; -webkit-touch-callout:none; }
.actor.visiting { cursor:grab; touch-action:none; }
  .actor.lifted { cursor:grabbing; }
.lifted .body { animation:pickup .9s ease-in-out infinite; transform:translateY(-12px) scale(1.06); filter:drop-shadow(0 12px 5px #0002); }
@keyframes pickup { 0%,100% {transform:translateY(-12px) scale(1.06) rotate(-1.5deg);} 50% {transform:translateY(-14px) scale(1.06) rotate(1.5deg);} }
.landing .body { animation:land .25s ease-out; }
@keyframes land { from {transform:translateY(-12px) scale(1.04);} to {transform:translateY(0) scaleX(var(--body));} }
.body,.name { pointer-events:none; }
.actor:disabled { opacity:1; cursor:default; }
/* 全域 button:hover 的深色底不適用於透明角色按鈕。 */
.actor:hover:not(:disabled), .actor:active:not(:disabled), .actor:focus { background:transparent; background-image:none; border-color:transparent; box-shadow:none; }
.actor:focus-visible { outline:2px solid #c19058; outline-offset:3px; }
.body { display:block; width:100%; height:100%; position:relative; transform:scaleX(var(--body-x)); animation:breathe 4.8s ease-in-out infinite; animation-delay:var(--delay); transform-origin:50% 88%; }
.name { position:absolute; top:90%; left:50%; transform:translateX(-50%); white-space:nowrap; border-radius:12px; padding:2px 7px; font-size:11px; background:#fff9; }
.selected .name { background:#fff; box-shadow:0 0 0 2px #c19058; }
.pet-speech { position:absolute; bottom:98%; left:50%; transform:translateX(-50%); width:clamp(100px,35vw,170px); padding:7px 9px; border-radius:12px; background:#fffc; color:#433c32; font-size:12px; line-height:1.5; pointer-events:none; }
.joyful .body { animation:celebrate .65s ease-in-out 3; }
@keyframes celebrate { 0%,100% {transform:scaleX(var(--body-x));} 50% {transform:translateY(-7px) scaleX(var(--body-x));} }
.roaming .body { animation:waddle .6s ease-in-out infinite; }
@keyframes breathe { 0%,100% {transform:scaleX(var(--body-x));} 50% { transform:scaleX(var(--body-x)) scaleY(1.012); } }
@keyframes waddle { 0%,100% {transform:scaleX(var(--body-x));} 50% { transform:translateY(-2px) scaleX(var(--body-x)) rotate(1deg); } }
@media(prefers-reduced-motion:reduce) { .actor,.body,.joyful .body,.roaming .body,.lifted .body,.landing .body { animation:none; } }
</style>
