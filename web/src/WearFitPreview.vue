<script setup>
import { ref,computed } from 'vue';
import { ALL_OUTFITS } from '../../server/src/pet-outfits.js';
import OutfitFrames from './components/OutfitFrames.vue';
const species=ref('all'),pose=ref('idle'),collection=ref('1');
const names={cat:'橘白貓',dog:'小狗',rabbit:'兔子',hamster:'倉鼠',guinea:'天竺鼠',hedgehog:'刺蝟',ferret:'雪貂',parrot:'鸚鵡',tortoise:'陸龜',chinchilla:'龍貓'};
const cards=computed(()=>ALL_OUTFITS.filter(set=>species.value==='all'?set.id.endsWith(`-${collection.value}`):set.species===species.value));
</script>
<template>
  <main><h1>十種寵物・完整套裝</h1><p>每套直接重畫整隻穿好衣服的角色，共 30 套；站立、走路與拎起各有四幀動畫。</p>
    <div class="controls"><label>物種 <select v-model="species"><option value="all">十種寵物</option><option v-for="(name,s) in names" :key="s" :value="s">{{name}}</option></select></label><label v-if="species==='all'">系列 <select v-model="collection"><option value="1">第一套</option><option value="2">第二套</option><option value="3">第三套</option></select></label><label>動作 <select v-model="pose"><option value="idle">站立</option><option value="walk">走路</option><option value="pickup">拎起</option></select></label></div>
    <section><article v-for="card in cards" :key="card.id"><div class="stage"><div class="body"><OutfitFrames :outfit="card.id" :pose="pose" :label="`${names[card.species]}・${card.name}`" /></div></div><p>{{names[card.species]}}・{{card.name}}</p></article></section>
  </main>
</template>
<style>
*{box-sizing:border-box}body{margin:24px;background:#f5f1e9;color:#473b31;font:16px system-ui}main{max-width:1250px;margin:auto}h1{font-size:24px}.controls{display:flex;gap:24px;align-items:center;flex-wrap:wrap;margin:20px 0}select{font:inherit;padding:8px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}article{background:white;border-radius:16px;text-align:center;overflow:hidden}.stage{height:230px;display:grid;place-items:center;background:url(/pets/scene-room-v2.webp) center/cover}.body{width:220px;height:220px;position:relative}.garment{position:absolute;transform:translateX(-50%);overflow:hidden;pointer-events:none}.foreground{position:absolute;inset:0;z-index:3;pointer-events:none}
</style>
