<script setup>
import { computed, ref, watch, onUnmounted } from 'vue';
import PetFrames from './PetFrames.vue';
import { pickNext } from '../pet-fsm.js';
const props = defineProps({ pet: Object, state: Object, sceneHeight: Number, index: Number, count: Number, selected: Boolean, interactive: Boolean, wearing: Array, preview: Boolean });
defineEmits(['select']);
const current = ref(null);
let timer;
function step() {
  const b = props.pet.behavior;
  if (!b) return;
  const now = new Date();
  current.value = pickNext({ curve: b.curve, hour: now.getHours() + now.getMinutes() / 60, mood: props.state?.mood, ateToday: !!props.state?.ateToday, acts: b.acts, last: current.value?.kind });
  timer = setTimeout(step, (current.value.secs || 25) * 1000);
}
watch(() => props.pet.petKey, () => { clearTimeout(timer); step(); }, { immediate: true });
onUnmounted(() => clearTimeout(timer));
const clothes = computed(() => props.wearing || props.pet.worn || []);
// 衣櫃是正面素材；穿著時保持正面，整個角色連同穿搭一起呼吸、走動。
const pose = computed(() => clothes.value.length || props.preview ? 'idle' : current.value?.pose || 'idle');
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
  return { left: `${x}%`, top: `${y}%`, width: `${w}%`, height: h ? `${h}%` : 'auto' };
}
const actorSize = computed(() => props.preview ? props.sceneHeight * .65 : props.sceneHeight * (props.pet.behavior?.size || .3) * 1.25 * Math.min(1, Math.max(.55, Math.sqrt(4 / props.count))));
const style = computed(() => ({
  left: `clamp(${actorSize.value / 2 + 8}px, ${props.count === 1 ? 50 : 14 + props.index * 72 / (props.count - 1)}%, calc(100% - ${actorSize.value / 2 + 8}px))`,
  bottom: `${props.sceneHeight * .12}px`,
  width: `${actorSize.value}px`,
  zIndex: props.preview ? 2 : 1,
  '--body': ({ thin: .82, normal: 1, round: 1.18 })[props.state?.body] || 1,
  '--delay': `${-props.index * 1.9}s`,
}));
</script>
<template>
  <button class="actor" :class="{ selected, roaming: current?.pose === 'walk' }" :style="style" :disabled="!interactive" :aria-label="`選擇寵物 ${pet.name}`" @click="$emit('select', pet.petKey)">
    <span class="body" :class="{ resting: current?.pose === 'sleep' }">
      <PetFrames :species="pet.species" :pose="pose" :label="pet.speciesName" :resting="clothes.length > 0 && current?.pose === 'sleep'" />
      <template v-for="item in clothes" :key="item.id">
        <svg v-if="item.img.endsWith('/dog-7.webp')" class="garment cloth" :style="garmentStyle(item)" viewBox="0 0 103 119" preserveAspectRatio="none" role="img" :aria-label="item.name"><image :href="item.img" width="200" height="119" /></svg>
        <img v-else class="garment" :class="item.slot" :src="item.img" :alt="item.name" :style="garmentStyle(item)" />
      </template>
    </span>
    <span class="name">{{ pet.name }}</span>
  </button>
</template>
<style scoped>
.actor { position:absolute; padding:0; border:0; background:none; aspect-ratio:1; transform:translate(-50%,12%); overflow:visible; color:#433c32; }
.actor:disabled { opacity:1; cursor:default; }
/* 全域 button:hover 的深色底不適用於透明角色按鈕。 */
.actor:hover:not(:disabled), .actor:active:not(:disabled), .actor:focus { background:transparent; border-color:transparent; box-shadow:none; }
.actor:focus-visible { outline:2px solid #c19058; outline-offset:3px; }
.body { display:block; width:100%; height:100%; position:relative; transform:scaleX(var(--body)); animation:breathe 4.8s ease-in-out infinite; animation-delay:var(--delay); transform-origin:50% 88%; }
.garment { position:absolute; height:auto; object-fit:contain; transform:translateX(-50%); pointer-events:none; overflow:hidden; }
.cloth { z-index:2; object-fit:fill; } .acc { z-index:3; } .hat { z-index:4; }
.name { position:absolute; top:90%; left:50%; transform:translateX(-50%); white-space:nowrap; border-radius:12px; padding:2px 7px; font-size:11px; background:#fff9; }
.selected .name { background:#fff; box-shadow:0 0 0 2px #c19058; }
.roaming { animation:wander 16s ease-in-out infinite; animation-delay:var(--delay); }
@keyframes breathe { 50% { transform:scaleX(var(--body)) scaleY(1.012); } }
@keyframes wander { 0%,100% { margin-left:-8px; } 50% { margin-left:8px; } }
@media(prefers-reduced-motion:reduce) { .actor,.body { animation:none; } }
</style>
