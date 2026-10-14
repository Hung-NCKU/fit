import catalog from './pet-outfit-catalog.json' with { type: 'json' };
import { ALL_WEAR } from './pet-wardrobe.js';
const legacyById=new Map(ALL_WEAR.map(item=>[item.id,item]));
export const ALL_OUTFITS=catalog.map(set=>({
  ...set,slot:'outfit',group:'套裝',
  price:Math.max(150,set.legacy.reduce((sum,id)=>sum+(legacyById.get(id)?.price || 0),0)),
  desc:'帽子、衣服與配件一起畫好的完整套裝，支援走路與拎起。',
  img:`/pets/outfits-v1/${set.id}.webp`,
}));
export const outfitsFor=species=>ALL_OUTFITS.filter(set=>set.species===species);
export const legacyOutfitFor=id=>ALL_OUTFITS.find(set=>set.legacy.includes(id));
export function outfitEquipment(species,equipment) {
  const {hat,cloth,acc,...rest}=equipment;
  const current=ALL_OUTFITS.find(set=>set.id===rest.outfit && set.species===species);
  const converted=current || [cloth,hat,acc].map(legacyOutfitFor).find(set=>set?.species===species);
  if(converted) rest.outfit=converted.id;
  else delete rest.outfit;
  return rest;
}
export function outfitOwnership(owned) {
  const raw=new Set(owned);
  // Keep every legacy purchase and grant its corresponding full outfit at no charge.
  for(const set of ALL_OUTFITS) if(set.legacy.some(id=>raw.has(id))) raw.add(set.id);
  return [...raw];
}
