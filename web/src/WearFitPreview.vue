<script setup>
import { ref,computed } from 'vue';
import { WARDROBE } from '../../server/src/pet-wardrobe.js';
import PetFrames from './components/PetFrames.vue';
import PetPickup from './components/PetPickup.vue';
import GarmentArt from './components/GarmentArt.vue';
import { garmentStyle,wearForeground } from './pet-wear-fit.js';
const species=ref('all'),held=ref(false);
const names={cat:'橘白貓',dog:'小狗',rabbit:'兔子',hamster:'倉鼠',guinea:'天竺鼠',hedgehog:'刺蝟',ferret:'雪貂',parrot:'鸚鵡',tortoise:'陸龜',chinchilla:'龍貓'};
const cards=computed(()=>species.value==='all'?Object.entries(WARDROBE).map(([s,items])=>({species:s,name:names[s],items:['hat','cloth','acc'].map(slot=>items.find(i=>i.slot===slot)).filter(Boolean)})):WARDROBE[species.value].map(item=>({species:item.species,name:item.name,items:[item]})));
</script>
<template>
  <main><h1>十種寵物・合身穿搭</h1><p>按物種查看每件商品，切換拎起姿勢，檢查帽子、衣服與配件的位置。</p>
    <div class="controls"><label>物種 <select v-model="species"><option value="all">十種寵物整套穿搭</option><option v-for="(name,s) in names" :key="s" :value="s">{{name}}</option></select></label><label><input v-model="held" type="checkbox"> 拎起姿勢</label></div>
    <section><article v-for="card in cards" :key="card.name"><div class="stage"><div class="body">
      <PetPickup v-if="held" :species="card.species" :label="names[card.species]" />
      <PetFrames v-else :species="card.species" pose="idle" :label="names[card.species]" />
      <GarmentArt v-for="item in card.items" :key="item.id" class="garment" :item="item" :species="card.species" :lifted="held" :style="garmentStyle(card.species,item,held)" />
      <template v-if="card.items.some(i=>i.slot==='cloth')"><span v-for="(clip,key) in wearForeground(card.species,held)" :key="key" class="foreground" :style="{clipPath:clip}" aria-hidden="true"><PetPickup v-if="held" :species="card.species" /><PetFrames v-else :species="card.species" pose="idle" /></span></template>
    </div></div><p>{{card.name}}</p></article></section>
  </main>
</template>
<style>
*{box-sizing:border-box}body{margin:24px;background:#f5f1e9;color:#473b31;font:16px system-ui}main{max-width:1250px;margin:auto}h1{font-size:24px}.controls{display:flex;gap:24px;align-items:center;flex-wrap:wrap;margin:20px 0}select{font:inherit;padding:8px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}article{background:white;border-radius:16px;text-align:center;overflow:hidden}.stage{height:230px;display:grid;place-items:center;background:url(/pets/scene-room-v2.webp) center/cover}.body{width:220px;height:220px;position:relative}.garment{position:absolute;transform:translateX(-50%);overflow:hidden;pointer-events:none}.foreground{position:absolute;inset:0;z-index:3;pointer-events:none}
</style>
