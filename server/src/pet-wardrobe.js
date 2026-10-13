/**
 * 穿戴商品。
 *
 * 素材來自 pet/穿搭/：每隻動物一張自己的衣櫃圖，配色跟著物種走
 * （天竺鼠草綠米白、小狗天藍、貓橘白、刺蝟楓葉棕）。
 * web/tools/slice-wear.sh 把它們切成 web/public/pets/wear/<物種>-<編號>.webp。
 *
 * 所以商城賣的是「目前這隻的衣服」，不是一份每隻都一樣的清單。
 * 編號就是切圖的順序（由上而下、由左而右），改動這張表之前要先對過圖。
 *
 * 名稱是看著圖寫的——素材沒有附索引，這是唯一需要人工對齊的地方。
 */

/** 部位 -> 商城分區名稱 */
const GROUP = { hat: '帽子', cloth: '衣服', acc: '配件' };

/** 部位 -> 起價。同一區裡越後面的越貴，跟原圖由簡單到華麗的排序一致。 */
const BASE = { hat: 45, acc: 35, cloth: 65 };
const STEP = 5;

/** [部位, 名稱]，順序＝切圖的編號 */
const WEAR = {
  guinea: [
    ['hat', '草帽'], ['hat', '毛線帽'], ['hat', '貝雷帽'],
    ['acc', '格紋頭巾'], ['acc', '條紋圍巾'], ['acc', '點點領結'],
    ['cloth', '皮背心'], ['cloth', '紅蘿蔔圍裙'], ['cloth', '黃雨衣'],
    ['acc', '側背包'],
  ],
  tortoise: [
    ['hat', '水手帽'], ['hat', '草帽'], ['hat', '綠毛線帽'],
    ['acc', '藍領巾'], ['acc', '條紋圍巾'], ['acc', '格紋領結'],
    ['hat', '黃雨帽'], ['acc', '綠蝴蝶結'], ['acc', '側背包'],
    ['cloth', '綠絨殼套'],
  ],
  dog: [
    ['hat', '棒球帽'], ['hat', '骨頭漁夫帽'], ['hat', '星星睡帽'],
    ['acc', '點點頭巾'], ['acc', '條紋圍巾'], ['acc', '藍領結'],
    // 原圖有兩件並排；角色顯示採左側的帽 T，保留既有商品識別碼。
    ['cloth', '天藍帽T'], ['cloth', '吊帶褲'], ['acc', '骨頭後背包'],
  ],
  ferret: [
    ['hat', '紅毛線帽'], ['hat', '白貝雷帽'], ['hat', '格紋獵帽'],
    ['acc', '紅格紋圍巾'], ['acc', '葉子頭巾'], ['acc', '格紋領結'],
    ['cloth', '皮背心'], ['cloth', '麻花毛衣'], ['acc', '側背包'],
    ['cloth', '黃雨衣'],
  ],
  cat: [
    ['hat', '橘貝雷帽'], ['hat', '蝴蝶結草帽'], ['hat', '毛線帽'],
    ['acc', '條紋圍巾'], ['acc', '水手領'], ['cloth', '貓臉圍裙'],
    ['acc', '橘色領結'], ['cloth', '橘白帽T'], ['cloth', '米色大衣'],
    ['acc', '肉球後背包'],
  ],
  parrot: [
    ['hat', '蝴蝶結草帽'], ['hat', '水手帽'], ['hat', '藍毛線帽'],
    ['acc', '綠花邊領'], ['acc', '粉領結'], ['acc', '藍白條紋圍巾'],
    ['acc', '紅白圍巾'], ['acc', '白花髮飾'], ['cloth', '黃色小斗篷'],
    ['acc', '綠色背包'],
  ],
  chinchilla: [
    ['acc', '小花頭圈'], ['hat', '白貝雷帽'], ['hat', '綠毛線帽'],
    ['acc', '格紋蝴蝶結'], ['acc', '蕾絲領'], ['acc', '黃條紋圍巾'],
    ['acc', '櫻桃領'], ['cloth', '蕾絲洋裝'], ['cloth', '綠色背心'],
    ['acc', '小花側背包'],
  ],
  hamster: [
    ['hat', '紅毛線帽'], ['hat', '小熊漁夫帽'], ['hat', '雲朵睡帽'],
    ['acc', '紅領結'], ['acc', '紅白條紋圍巾'], ['cloth', '吊帶褲'],
    ['cloth', '米白帽T'], ['cloth', '黃大衣'], ['cloth', '小熊圍裙'],
    ['acc', '小熊後背包'],
  ],
  rabbit: [
    ['acc', '粉蝴蝶結髮飾'], ['acc', '小花頭圈'], ['hat', '粉貝雷帽'],
    ['acc', '粉白條紋圍巾'], ['acc', '櫻桃蕾絲領'], ['cloth', '米白針織外套'],
    ['cloth', '黃色雨衣'], ['acc', '小兔側背包'], ['acc', '蕾絲蝴蝶結'],
  ],
  hedgehog: [
    ['hat', '楓葉毛線帽'], ['hat', '松果帽'], ['hat', '楓葉貝雷帽'],
    ['acc', '格紋圍巾'], ['acc', '葉子領飾'], ['acc', '格紋領結'],
    ['cloth', '楓葉背心'], ['cloth', '黃色斗篷'], ['acc', '楓葉側背包'],
    ['hat', '格紋毛帽'],
  ],
};

/** 物種 -> 商品陣列 */
export const WARDROBE = Object.fromEntries(
  Object.entries(WEAR).map(([species, list]) => [
    species,
    list.map(([slot, name], i) => ({
      id: `wear-${species}-${i + 1}`,
      species,
      slot,
      group: GROUP[slot],
      name,
      price: BASE[slot] + i * STEP,
      desc: '',
      img: `/pets/wear/${species}-${i + 1}.webp`,
    })),
  ]),
);

/** 所有物種的衣服攤平成一份，itemOf() 要靠它查已經穿在身上的東西 */
export const ALL_WEAR = Object.values(WARDROBE).flat();

export const wardrobeOf = (species) => WARDROBE[species] || [];
