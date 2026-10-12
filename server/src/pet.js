/**
 * 寵物。參考 Neko Atsume：養一隻小動物，用代幣買布置與裝扮。
 *
 * 和原作不同的地方是「牠吃的跟你一樣」—— 寵物的心情與體態完全由飼主的
 * 飲食紀錄推算出來，不是另外一套數值。吃太少牠會瘦、吃太多牠會圓、
 * 連續幾天沒記錄牠會餓。代幣也只能靠達標賺，不能用別的方式取得。
 *
 * 外觀一律用 emoji 組出來，不需要任何圖檔或繪圖函式庫 ——
 * 這個專案其他地方（分頁列、標籤）也是這樣做的。
 */
import { getDb } from './db.js';
import { dailySummary, today, daysAgo } from './records.js';

/* ---------------- 可選的寵物 ---------------- */

/**
 * 可以挑的十隻，對應 web/public/pets/ 裡的插畫（由 web/tools/slice-pets.sh 切出來）。
 * id 就是圖檔名；name 是物種，nick 是插畫上原本寫的名字，領養時當預設名。
 * tint 是那張卡原本的底色（用 ImageMagick 取樣出來的）。場景沿用它，
 * 插畫的背景才會跟場景融在一起，不然看起來就是一張貼紙貼在深色上。
 */
export const SPECIES = [
  { id: 'cat',        name: '小貓',   nick: '橘豆', tint: '#fbefcb' },
  { id: 'dog',        name: '小狗',   nick: '奶泡', tint: '#dde5eb' },
  { id: 'rabbit',     name: '兔子',   nick: '米糕', tint: '#fce2d6' },
  { id: 'hamster',    name: '倉鼠',   nick: '小栗', tint: '#fce8c1' },
  { id: 'guinea',     name: '天竺鼠', nick: '布丁', tint: '#e6ebce' },
  { id: 'hedgehog',   name: '刺蝟',   nick: '針針', tint: '#fde5c5' },
  { id: 'ferret',     name: '雪貂',   nick: '麻糬', tint: '#ebe1e8' },
  { id: 'parrot',     name: '小鸚鵡', nick: '啾啾', tint: '#e3ebd1' },
  { id: 'tortoise',   name: '陸龜',   nick: '苔苔', tint: '#f1eed1' },
  { id: 'chinchilla', name: '龍貓',   nick: '霧球', tint: '#e9e1ed' },
];

export const speciesOf = (id) => SPECIES.find(s => s.id === id) || SPECIES[0];

/* ---------------- 商城 ---------------- */

/**
 * 商城。
 *
 * 圖片一律是 web/public/pets/<id>.webp，由 web/tools/slice-items.sh 從
 * pet/商品_N.png 切出來，所以商品 id 直接用檔名，不另外維護一份對照表。
 *
 * slot 相同的東西互相取代（同時只能戴一頂帽子、擺一樣擺飾）。
 * group 只影響商城怎麼分區顯示，不影響穿戴規則。
 *
 * 價格用「同一類裡愈後面愈貴」的級距自動算，不手寫 99 個數字 ——
 * 原圖每一類的排序本來就大致由簡單到華麗。
 */

/** 五個環境。圖是整張場景插畫，不是小圖示。 */
const SCENES = [
  ['bg_room',   '小房間',  0,   '預設的窩'],
  ['bg_garden', '庭院',    120, '曬得到太陽'],
  ['bg_beach',  '海邊',    220, '看得到海'],
  ['bg_gym',    '健身房',  300, '牠也想練'],
  ['bg_space',  '太空艙',  400, '誰說寵物不能上太空'],
];

/**
 * 每一組：[商品圖的張數編號, slot, 分區名稱, 起價, 每項遞增, 名稱...]
 * 名稱的順序要跟 slice-items.sh 切出來的編號一致（先上後下、先左後右）。
 */
const GROUPS = [
  [1, 'decor', '小房間擺飾', 40, 8,
    '書架', '床鋪', '飯碗', '毛線球', '地毯', '小桌子', '盆栽', '玩具箱', '抓抓板', '小夜燈'],
  [2, 'decor', '庭院擺飾', 50, 8,
    '花圃', '小水盆', '樹樁', '小帳蓬', '鞦韆', '木橋', '菜圃盆栽', '小圍欄', '蝴蝶裝飾', '石子路'],
  [3, 'decor', '海邊擺飾', 50, 8,
    '沙堡', '遮陽傘', '救生圈', '小船模型', '冰飲攤', '貝殼', '海星', '漂流木', '貝殼盆栽', '沙灘椅'],
  [4, 'decor', '太空艙擺飾', 70, 10,
    '漂浮玩具', '太空艙床', '控制台', '星球盆栽', '小機器人', '星星吊飾', '太空食物盒', '圓窗', '文件架', '地毯'],
  [5, 'decor', '健身房擺飾', 60, 10,
    '跑步機', '啞鈴', '拉筋墊', '獎盃', '水壺', '瑜珈球', '毛巾架', '計時器', '置物櫃', '植物盆栽'],
  [10, 'decor', '其他擺飾', 40, 8,
    '盆栽', '毛線球', '小魚乾', '小獎盃', '水果盤', '罐罐', '抱枕', '地毯', '小床'],

  [6, 'hat', '帽子', 60, 12,
    '草帽', '貝雷帽', '毛帽', '探險帽', '太空帽', '海盜帽', '廚師帽', '皇冠', '兔耳帽', '巫師帽'],
  [7, 'cloth', '衣服', 80, 14,
    '條紋T恤', '吊帶褲', '連帽上衣', '圍裙', '太空服', '浴衣', '運動服', '偵探裝', '廚師裝', '雨衣'],
  [8, 'shoe', '鞋襪', 50, 10,
    '運動鞋', '雨鞋', '室內拖', '涼鞋', '太空鞋', '條紋襪', '點點襪', '星星襪', '聖誕襪', '毛毛靴'],
  [9, 'acc', '配件', 60, 12,
    '圍巾', '領結', '小背包', '小披風', '小翅膀', '鈴鐺項圈', '名牌', '泳圈', '竹蜻蜓', '葉子頭冠'],
];

export const SHOP = [
  ...SCENES.map(([id, name, price, desc]) => ({
    id, slot: 'bg', group: '環境', name, price, desc,
    img: `/pets/scene-${id.replace(/^bg_/, '')}.webp`,
  })),
  ...GROUPS.flatMap(([sheet, slot, group, base, step, ...names]) =>
    names.map((name, i) => ({
      id: `item-${sheet}-${i + 1}`,
      slot, group, name,
      price: base + i * step,
      desc: '',
      img: `/pets/item-${sheet}-${i + 1}.webp`,
    }))),
];

/** 商城的分區順序，前端照這個排 */
export const SHOP_GROUPS = [...new Set(SHOP.map(i => i.group))];

export const itemOf = (id) => SHOP.find(i => i.id === id) || null;

/* ---------------- 存取 ---------------- */

const parse = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };

export function getPet(userId) {
  const row = getDb(userId).prepare('SELECT * FROM pet WHERE id = 1').get();
  if (!row) return null;
  return { ...row, equipped: parse(row.equipped, {}) };
}

export function adoptPet(userId, species, name) {
  const sp = SPECIES.find(s => s.id === species);
  if (!sp) throw Object.assign(new Error(`沒有這種寵物：${species}`), { status: 400 });
  if (getPet(userId)) throw Object.assign(new Error('已經有寵物了'), { status: 409 });

  const db = getDb(userId);
  db.prepare(`
    INSERT INTO pet (id, species, name, coins, equipped, settled_to)
    VALUES (1, ?, ?, 0, ?, ?)
  `).run(sp.id, String(name || sp.nick || sp.name).slice(0, 20), JSON.stringify({ bg: 'bg_room' }), daysAgo(8));
  // settled_to 往回設八天：第一次開頁面時會把最近七天完整的日子結算進來。
  // 設成昨天的話新寵物永遠拿不到第一筆（結算只算已過完的日子），
  // 使用者已經記錄好幾週卻看到 0 代幣、商城全部買不起。
  // 預設的窩送的，不用買
  db.prepare('INSERT OR IGNORE INTO pet_items (item_id) VALUES (?)').run('bg_room');
  return getPet(userId);
}

/**
 * 換一隻養。上一隻的代幣與買過的東西全部清掉，重新開始。
 * 這是破壞性操作，前端一定要先跟使用者確認過。
 */
export function replacePet(userId, species, name) {
  const db = getDb(userId);
  db.exec('DELETE FROM pet_items');
  db.exec('DELETE FROM pet');
  const fresh = adoptPet(userId, species, name);

  // 領養會認列最近七天的紀錄當見面禮，但換寵物不該再給一次 ——
  // 否則反覆換寵物就能無限刷代幣。結算起點設成昨天，從明天開始重新累積。
  db.prepare('UPDATE pet SET coins = 0, settled_to = ? WHERE id = 1').run(daysAgo(1));
  return getPet(userId);
}
export const ownedItems = (userId) =>
  getDb(userId).prepare('SELECT item_id FROM pet_items').all().map(r => r.item_id);

/* ---------------- 代幣結算 ---------------- */

/** 一天最多拿多少 */
const COIN_LOGGED = 2;      // 有記錄就好
const COIN_KCAL = 8;        // 熱量落在目標 ±10%
const COIN_PROTEIN = 8;     // 蛋白質達到目標九成

/** 某一天可以拿幾枚 */
export function coinsForDay(userId, date) {
  const s = dailySummary(userId, date);
  if (!s.nutrition.items) return 0;          // 完全沒記錄

  let c = COIN_LOGGED;
  const tk = s.targets.kcal || 0;
  const tp = s.targets.protein_g || 0;
  if (tk && Math.abs(s.nutrition.kcal - tk) <= tk * 0.1) c += COIN_KCAL;
  if (tp && s.nutrition.protein_g >= tp * 0.9) c += COIN_PROTEIN;
  return c;
}

/**
 * 把「上次結算之後到昨天」的代幣一次發完。
 *
 * 只結算已經過完的日子：今天還在記錄中，現在算會不公平。
 * settled_to 記住結算到哪一天，重複呼叫不會重複發。
 */
export function settleCoins(userId) {
  const pet = getPet(userId);
  if (!pet) return { earned: 0, days: 0 };

  const db = getDb(userId);
  const yesterday = daysAgo(1);
  if (pet.settled_to >= yesterday) return { earned: 0, days: 0 };

  // 最多往回補 30 天，避免久沒開 App 時一次跑幾百天
  const from = pet.settled_to && pet.settled_to > daysAgo(30) ? pet.settled_to : daysAgo(30);

  let earned = 0;
  let days = 0;
  const d = new Date(from + 'T00:00:00');
  const end = new Date(yesterday + 'T00:00:00');
  while (d < end) {
    d.setDate(d.getDate() + 1);
    const iso = d.toLocaleDateString('sv-SE');
    const c = coinsForDay(userId, iso);
    if (c) { earned += c; days++; }
  }

  db.prepare('UPDATE pet SET coins = coins + ?, settled_to = ? WHERE id = 1').run(earned, yesterday);
  return { earned, days };
}

/* ---------------- 心情與體態 ---------------- */

const WINDOW = 7;

/**
 * 看最近七天的飲食，推算寵物的狀態。
 * 刻意不存進資料庫：它完全是飲食紀錄的衍生值，存起來只會不同步。
 */
export function petState(userId) {
  const days = [];
  for (let i = 1; i <= WINDOW; i++) {
    const date = daysAgo(i);
    const s = dailySummary(userId, date);
    if (s.nutrition.items) {
      days.push({
        date,
        kcalRatio: s.targets.kcal ? s.nutrition.kcal / s.targets.kcal : 0,
        proteinRatio: s.targets.protein_g ? s.nutrition.protein_g / s.targets.protein_g : 0,
      });
    }
  }

  // 連續幾天沒記錄了
  let silent = 0;
  for (let i = 1; i <= WINDOW; i++) {
    if (dailySummary(userId, daysAgo(i)).nutrition.items) break;
    silent++;
  }

  const avg = (k) => (days.length ? days.reduce((a, b) => a + b[k], 0) / days.length : 0);
  const kcal = avg('kcalRatio');
  const protein = avg('proteinRatio');

  let mood, body, says;
  if (silent >= 3) {
    mood = 'hungry'; body = 'thin';
    says = `${silent} 天沒看到你記錄了，牠在等你`;
  } else if (!days.length) {
    mood = 'ok'; body = 'normal';
    says = '還沒有足夠的紀錄，先吃幾餐讓牠認識你';
  } else if (kcal < 0.7) {
    mood = 'thin'; body = 'thin';
    says = `最近平均只吃到目標的 ${Math.round(kcal * 100)}%，牠跟著瘦了`;
  } else if (kcal > 1.3) {
    mood = 'round'; body = 'round';
    says = `最近平均吃到目標的 ${Math.round(kcal * 100)}%，牠圓了一圈`;
  } else if (kcal >= 0.9 && protein >= 0.9) {
    mood = 'happy'; body = 'normal';
    says = '熱量跟蛋白質都在範圍內，牠心情很好';
  } else if (protein < 0.7) {
    mood = 'ok'; body = 'normal';
    says = `蛋白質只到目標的 ${Math.round(protein * 100)}%，牠有點沒力`;
  } else {
    mood = 'ok'; body = 'normal';
    says = '還可以，但還有進步空間';
  }

  return {
    mood, body, says,
    days: days.length,
    silent,
    kcalPct: Math.round(kcal * 100),
    proteinPct: Math.round(protein * 100),
  };
}

/* ---------------- 商城行為 ---------------- */

export function buyItem(userId, itemId) {
  const item = itemOf(itemId);
  if (!item) throw Object.assign(new Error('沒有這個商品'), { status: 404 });

  const pet = getPet(userId);
  if (!pet) throw Object.assign(new Error('還沒有寵物'), { status: 400 });

  const db = getDb(userId);
  if (ownedItems(userId).includes(itemId)) {
    throw Object.assign(new Error('已經買過了'), { status: 409 });
  }
  if (pet.coins < item.price) {
    throw Object.assign(new Error(`代幣不夠，還差 ${item.price - pet.coins} 枚`), { status: 400 });
  }

  db.prepare('UPDATE pet SET coins = coins - ? WHERE id = 1').run(item.price);
  db.prepare('INSERT INTO pet_items (item_id) VALUES (?)').run(itemId);
  return equipItem(userId, itemId);   // 買了就直接換上
}

export function equipItem(userId, itemId) {
  const item = itemOf(itemId);
  if (!item) throw Object.assign(new Error('沒有這個商品'), { status: 404 });
  if (!ownedItems(userId).includes(itemId)) {
    throw Object.assign(new Error('還沒有這個東西'), { status: 400 });
  }
  const pet = getPet(userId);
  const equipped = { ...pet.equipped, [item.slot]: itemId };
  getDb(userId).prepare('UPDATE pet SET equipped = ? WHERE id = 1').run(JSON.stringify(equipped));
  return getPet(userId);
}

/** 脫掉某一格的裝備（背景不給脫，不然場景會空掉） */
export function unequipSlot(userId, slot) {
  if (slot === 'bg') throw Object.assign(new Error('背景不能移除'), { status: 400 });
  const pet = getPet(userId);
  const equipped = { ...pet.equipped };
  delete equipped[slot];
  getDb(userId).prepare('UPDATE pet SET equipped = ? WHERE id = 1').run(JSON.stringify(equipped));
  return getPet(userId);
}
