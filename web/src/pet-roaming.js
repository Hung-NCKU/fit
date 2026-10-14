export const petSpeed = species => ({ tortoise:5, hedgehog:11, guinea:14, hamster:20, rabbit:24, ferret:28, parrot:18, chinchilla:24, cat:20, dog:18 })[species] || 18;
export const roamingFacing = (from,to) => to.x < from.x ? -1 : 1;

export function roamingBounds(width,height,size) {
  const edge = Math.min(45, (size / 2 + 10) / Math.max(width,1) * 100);
  return { left:edge, right:100-edge, back:64, front:90 };
}

export function roamingTarget(from,bounds,random=Math.random) {
  let target=from;
  for(let attempt=0;attempt<12;attempt++) {
    const back=Math.max(bounds.back,from.y-8),front=Math.min(bounds.front,from.y+8);
    target={x:bounds.left+random()*(bounds.right-bounds.left),y:back+random()*(front-back)};
    if(Math.abs(target.x-from.x)>12) break;
  }
  return target;
}

export function roamingDuration(from,to,width,height,species,size=128) {
  const speed=petSpeed(species)*Math.max(.4,size/128);
  return Math.max(2, Math.hypot((to.x-from.x)*width/100,(to.y-from.y)*height/100)/speed);
}
