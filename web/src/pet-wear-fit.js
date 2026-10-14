import art from './pet-wear-layout.json' with { type: 'json' };

// Coordinates refer to the normalized animation viewport, not the atlas cell.
// crown: hat brim centre; neck: collar centre; torso: garment top and extent.
export const wearAnchors = {
  cat: {crown:[43,32,40],neck:[43,64,30],torso:[43,59,41,29],side:[65,58,18]},
  dog: {crown:[44,31,42],neck:[45,63,31],torso:[48,60,43,29],side:[66,58,18]},
  rabbit: {crown:[48,27,36],neck:[49,59,27],torso:[49,55,40,32],side:[65,59,16]},
  hamster: {crown:[50,32,42],neck:[50,61,33],torso:[51,56,51,32],side:[71,59,18]},
  guinea: {crown:[31,38,32],neck:[43,76,24],torso:[59,43,55,41],side:[72,53,19]},
  hedgehog: {crown:[60,47,31],neck:[60,68,24],torso:[60,63,35,25],side:[73,58,16]},
  ferret: {crown:[63,26,28],neck:[61,45,22],torso:[55,44,33,38],side:[38,58,17]},
  parrot: {crown:[60,21,30],neck:[57,39,25],torso:[53,38,38,29],side:[38,46,16]},
  tortoise: {crown:[28,61,31],neck:[41,77,22],torso:[59,26,57,47],side:[72,54,18]},
  chinchilla: {crown:[43,42,34],neck:[43,64,28],torso:[43,59,43,28],side:[61,60,17]},
};
export const pickupWearAnchors = {
  cat:{crown:[47,36,29],neck:[47,55,21],torso:[48,55,27,22],side:[60,60,14]},
  dog:{crown:[46,33,29],neck:[47,56,21],torso:[48,56,27,23],side:[61,62,14]},
  rabbit:{crown:[51,33,28],neck:[51,55,20],torso:[52,55,25,23],side:[63,62,13]},
  hamster:{crown:[48,37,29],neck:[48,56,22],torso:[49,56,29,22],side:[61,63,14]},
  guinea:{crown:[44,35,27],neck:[45,57,20],torso:[50,57,27,22],side:[62,62,14]},
  hedgehog:{crown:[47,44,27],neck:[48,61,18],torso:[51,60,24,19],side:[61,64,13]},
  ferret:{crown:[50,29,23],neck:[52,46,17],torso:[56,46,25,21],side:[65,51,13]},
  parrot:{crown:[47,28,25],neck:[47,44,20],torso:[49,44,29,21],side:[61,49,13]},
  tortoise:{crown:[34,61,28],neck:[35,75,20],torso:[53,39,47,36],side:[68,57,15]},
  chinchilla:{crown:[43,39,27],neck:[45,54,20],torso:[48,54,27,19],side:[59,58,13]},
};

export function garmentFit(species,item,lifted=false) {
  const a=(lifted?pickupWearAnchors:wearAnchors)[species] || wearAnchors.cat;
  const key=item.img.split('/').pop().replace(/\.webp$/,'');
  const crop=art[key];
  const ratio=crop ? crop.w/crop.h : 1;
  let x,y,w,h;
  let type=item.slot;
  if(/頭圈|髮飾/.test(item.name)) type='headpiece';
  else if(/背包/.test(item.name)) type='bag';
  else if(item.slot==='acc' && /領結|蝴蝶結/.test(item.name)) type='bow';
  else if(item.slot==='acc' && /圍巾/.test(item.name)) type='scarf';
  if(type==='hat' || type==='headpiece') {
    [x,y,w]=a.crown;
    if(type==='headpiece') {w*=.85;h=Math.min(w/ratio,lifted?12:16);w=h*ratio;y-=h*.6;}
    else {
      h=Math.min(w/ratio,lifted?22:29,(y-2)/.9);w=h*ratio;
      // The lower edge is the brim; a hat is seated above the forehead.
      y-=h*.9;
    }
  } else if(type==='cloth') {
    [x,y,w,h]=a.torso;
    // Keep the illustrated sleeves and collar in proportion; reserve paws below.
    const fittedRatio=Math.max(ratio*.7,Math.min(ratio*1.35,w/h));
    w=Math.min(w,h*fittedRatio);
    h=w/fittedRatio;
    if(/圍裙|吊帶褲|洋裝/.test(item.name)) {y+=1;h-=1;}
  } else if(type==='bag') {
    [x,y,w]=a.side;h=Math.min(w/ratio,lifted?20:24);w=h*ratio;
  } else {
    [x,y,w]=a.neck;
    if(type==='bow') w*=.62;
    h=Math.min(w/ratio,type==='bow'?9:type==='scarf'?(lifted?17:19):12);
    w=h*ratio;
    y-=type==='scarf'?h*.18:h*.35;
  }
  return {x,y,w,h,type,crop,layer:type==='hat'||type==='headpiece'?6:type==='cloth'?2:5};
}
// Foreground fur keeps clothing behind the chin and feet instead of over them.
export function wearForeground(species,lifted=false) {
  const heads=lifted?{
    cat:[47,44,18,13],dog:[46,44,23,14],rabbit:[51,43,25,14],hamster:[48,45,21,14],
    guinea:[43,46,20,14],hedgehog:[47,50,18,13],ferret:[50,35,15,12],
    parrot:[47,34,15,11],tortoise:[34,65,19,13],chinchilla:[43,44,19,12],
  }:{
    cat:[43,43,29,23],dog:[44,43,35,23],rabbit:[48,40,36,23],hamster:[50,44,38,20],
    guinea:[30,58,27,26],hedgehog:[60,53,25,14],ferret:[63,32,21,15],
    parrot:[60,28,18,13],tortoise:[28,66,25,19],chinchilla:[43,52,29,14],
  };
  const [x,y,rx,ry]=heads[species] || heads.cat;
  const feet=lifted?({cat:77,dog:79,rabbit:78,hamster:78,guinea:79,hedgehog:78,ferret:66,parrot:64,tortoise:76,chinchilla:71}[species]||78):({ferret:80,parrot:67,tortoise:77,guinea:80,hedgehog:83}[species]||80);
  return {head:`ellipse(${rx}% ${ry}% at ${x}% ${y}%)`,feet:`inset(${feet}% 0 0 0)`};
}
export function garmentStyle(species,item,lifted=false) {
  const f=garmentFit(species,item,lifted);
  return {left:`${f.x}%`,top:`${f.y}%`,width:`${f.w}%`,height:`${f.h}%`,zIndex:f.layer};
}
