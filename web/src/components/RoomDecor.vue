<script setup>
import { ref, watch } from 'vue';
import DecorArt from './DecorArt.vue';
const props = defineProps({ items:Array, editable:Boolean, selected:String });
const emit = defineEmits(['select','move']);
const objects = ref([]);
watch(() => props.items, items => { objects.value = (items || []).map(item => ({...item})); }, { immediate:true, deep:true });
let drag;
function start(event,item) {
  if (!props.editable) return;
  emit('select',item.id);
  if (item.locked) return;
  const rect = event.currentTarget.parentElement.getBoundingClientRect();
  drag = { id:item.id, pointer:event.pointerId, startX:event.clientX, startY:event.clientY, x:item.x, y:item.y, rect };
  event.currentTarget.setPointerCapture(event.pointerId);
}
function move(event) {
  if (!drag || event.pointerId !== drag.pointer) return;
  const item = objects.value.find(i => i.id === drag.id);
  item.x = Math.min(95, Math.max(5, drag.x + (event.clientX-drag.startX)/drag.rect.width*100));
  item.y = Math.min(95, Math.max(30, drag.y + (event.clientY-drag.startY)/drag.rect.height*100));
}
function finish(event,cancelled=false) {
  if (!drag || event.pointerId !== drag.pointer) return;
  const item = objects.value.find(i => i.id === drag.id);
  const moved = Math.abs(item.x-drag.x)+Math.abs(item.y-drag.y) > .1;
  if (cancelled) { item.x=drag.x; item.y=drag.y; }
  else if (moved) emit('move', {id:item.id, position:{x:item.x,y:item.y,scale:item.scale,locked:!!item.locked,layer:item.layer || 0}});
  drag = null;
}
function keyboard(event,item) {
  if (!props.editable || item.locked) return;
  const delta = {ArrowLeft:[-2,0],ArrowRight:[2,0],ArrowUp:[0,-2],ArrowDown:[0,2]}[event.key];
  if (!delta) return;
  event.preventDefault();
  emit('move',{id:item.id,position:{x:Math.min(95,Math.max(5,item.x+delta[0])),y:Math.min(95,Math.max(30,item.y+delta[1])),scale:item.scale,locked:!!item.locked,layer:item.layer || 0}});
}
const width = item => {
  const name=item.name;
  const base=/地毯|地墊|石子路/.test(name) ? 22
    : /床|帳篷|木椅|小橋|跑步機|控制台|桌/.test(name) ? 18
    : /書架|展示櫃|獎盃架|抓抓板|鞦韆|單槓|樹|圍欄|柵欄/.test(name) ? 15
    : /碗|盤|球|罐|瓶|壺|魚|玩具|貝殼|海星/.test(name) ? 8
    : /獎盃|獎牌|夜燈|計時器|燈籠|相框|證書/.test(name) ? 10
    : 12;
  return base * item.scale;
};
</script>
<template>
  <button v-for="item in objects" :key="item.id" class="room-object" :class="{ editing:editable, picked:editable && selected === item.id }"
    :style="{left:`${item.x}%`,top:`${item.y}%`,width:`${width(item)}%`,zIndex:(editable ? 2000 : 0) + Math.round(item.y*10) + (item.layer || 0)*100}" :disabled="!editable"
    :aria-label="`裝飾 ${item.name}，拖曳或使用方向鍵移動`" @pointerdown.stop.prevent="start($event,item)" @pointermove="move"
    @pointerup="finish($event)" @pointercancel="finish($event,true)" @keydown="keyboard($event,item)" @click.stop="editable && emit('select',item.id)">
    <DecorArt :item="item" />
  </button>
</template>
<style scoped>
.room-object { position:absolute; transform:translate(-50%,-100%); padding:0; border:0; background:transparent; z-index:0; line-height:0; }
.room-object :deep(.decor-art) { max-height:160px; object-fit:contain; pointer-events:none; filter:drop-shadow(0 2px 1px #60402022); }
.room-object:disabled { opacity:1; pointer-events:none; }
.room-object:hover:not(:disabled),.room-object:active:not(:disabled),.room-object:focus { background:transparent; border:0; }
.room-object.editing { touch-action:none; cursor:grab; z-index:3; }
.room-object.editing:active { cursor:grabbing; }
.room-object.picked,.room-object:focus-visible { outline:2px dashed #c19058; outline-offset:4px; }
</style>
