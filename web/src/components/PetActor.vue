<script setup>
import { computed, ref, watch, onUnmounted } from 'vue';
import PetFrames from './PetFrames.vue';
import { pickNext } from '../pet-fsm.js';
const props = defineProps({ pet: Object, state: Object, sceneHeight: Number, index: Number, count: Number, selected: Boolean, interactive: Boolean, wearing: Array });
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
const pose = computed(() => clothes.value.length ? 'idle' : current.value?.pose || 'idle');
const anchors = {
  cat: [[50,8,44],[50,60,30],[50,58,26]], dog: [[50,8,44],[50,63,25],[50,60,25]],
  rabbit: [[50,23,38],[50,52,40],[50,48,28]], hamster: [[50,15,42],[50,54,40],[50,48,28]],
  guinea: [[35,23,35],[57,50,52],[37,50,28]], hedgehog: [[58,25,34],[57,57,39],[58,50,26]],
  ferret: [[61,14,32],[53,48,36],[61,40,26]], parrot: [[60,13,35],[50,49,42],[59,41,28]],
  tortoise: [[30,46,30],[61,34,61],[30,65,25]], chinchilla: [[50,24,37],[50,54,44],[50,48,29]],
};
function garmentStyle(item) {
  let [x,y,w] = (anchors[props.pet.species] || anchors.cat)[{hat:0,cloth:1,acc:2}[item.slot] ?? 2];
  if (/背包/.test(item.name)) [x,y,w] = [67,52,26];
  if (/頭圈|髮飾/.test(item.name)) [x,y,w] = (anchors[props.pet.species] || anchors.cat)[0];
  return { left: `${x}%`, top: `${y}%`, width: `${w}%` };
}
const style = computed(() => ({
  left: `${props.count === 1 ? 50 : 14 + props.index * 72 / (props.count - 1)}%`,
  bottom: `${props.sceneHeight * .12}px`,
  width: `${props.sceneHeight * (props.pet.behavior?.size || .3) * 1.25 * Math.min(1, Math.max(.55, Math.sqrt(4 / props.count)))}px`,
  '--body': ({ thin: .82, normal: 1, round: 1.18 })[props.state?.body] || 1,
  '--delay': `${-props.index * 1.9}s`,
}));
</script>
<template>
  <button class="actor" :class="{ selected, roaming: current?.pose === 'walk' }" :style="style" :disabled="!interactive" :aria-label="`選擇寵物 ${pet.name}`" @click="$emit('select', pet.petKey)">
    <span class="body" :class="{ resting: current?.pose === 'sleep' }">
      <PetFrames :species="pet.species" :pose="pose" :label="pet.speciesName" :resting="clothes.length > 0 && current?.pose === 'sleep'" />
      <template v-for="item in clothes" :key="item.id">
        <svg v-if="item.img.endsWith('/dog-7.webp')" class="garment cloth" :style="garmentStyle(item)" viewBox="0 0 103 119" role="img" :aria-label="item.name"><image :href="item.img" width="200" height="119" /></svg>
        <img v-else class="garment" :class="item.slot" :src="item.img" :alt="item.name" :style="garmentStyle(item)" />
      </template>
    </span>
    <span class="name">{{ pet.name }}</span>
  </button>
</template>
<style scoped>
.actor { position:absolute; padding:0; border:0; background:none; aspect-ratio:1; transform:translate(-50%,12%); overflow:visible; color:#433c32; }
.actor:disabled { opacity:1; cursor:default; }
.body { display:block; width:100%; height:100%; position:relative; transform:scaleX(var(--body)); animation:breathe 4.8s ease-in-out infinite; animation-delay:var(--delay); transform-origin:50% 88%; }
.garment { position:absolute; height:auto; object-fit:contain; transform:translateX(-50%); pointer-events:none; overflow:hidden; }
.cloth { z-index:2; } .acc { z-index:3; } .hat { z-index:4; }
.name { position:absolute; top:90%; left:50%; transform:translateX(-50%); white-space:nowrap; border-radius:12px; padding:2px 7px; font-size:11px; background:#fff9; }
.selected .name { background:#fff; box-shadow:0 0 0 2px #c19058; }
.roaming { animation:wander 16s ease-in-out infinite; animation-delay:var(--delay); }
@keyframes breathe { 50% { transform:scaleX(var(--body)) scaleY(1.012); } }
@keyframes wander { 0%,100% { margin-left:-8px; } 50% { margin-left:8px; } }
@media(prefers-reduced-motion:reduce) { .actor,.body { animation:none; } }
</style>
