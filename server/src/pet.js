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

/** 每種寵物各自有五種心情的樣子 */
export const SPECIES = [
  { id: 'cat',     name: '貓',   faces: { happy: '😸', ok: '😺', thin: '🙀', round: '😻', hungry: '😿' } },
  { id: 'dog',     name: '狗',   faces: { happy: '🐶', ok: '🐕', thin: '🐩', round: '🦮', hungry: '🐺' } },
  { id: 'rabbit',  name: '兔',   faces: { happy: '🐰', ok: '🐇', thin: '🐇', round: '🐰', hungry: '🥕' } },
  { id: 'hamster', name: '倉鼠', faces: { happy: '🐹', ok: '🐹', thin: '🐁', round: '🐹', hungry: '🐀' } },
  { id: 'bird',    name: '鸚鵡', faces: { happy: '🦜', ok: '🐦', thin: '🐤', round: '🦆', hungry: '🪹' } },
  { id: 'dragon',  name: '小龍', faces: { happy: '🐲', ok: '🐉', thin: '🦎', round: '🐊', hungry: '🥚' } },
];

export const speciesOf = (id) => SPECIES.find(s => s.id === id) || SPECIES[0];

/* ---------------- 商城 ---------------- */

/** slot 相同的東西互相取代（同時只能戴一頂帽子） */
export const SHOP = [
  // 環境
  { id: 'bg_room',    slot: 'bg',  name: '小房間',   emoji: '🏠', price: 0,   desc: '預設的窩' },
  { id: 'bg_garden',  slot: 'bg',  name: '庭院',     emoji: '🌳', price: 120, desc: '曬得到太陽' },
  { id: 'bg_beach',   slot: 'bg',  name: '海邊',     emoji: '🏖️', price: 220, desc: '看得到海' },
  { id: 'bg_space',   slot: 'bg',  name: '太空艙',   emoji: '🌌', price: 400, desc: '誰說寵物不能上太空' },
  { id: 'bg_gym',     slot: 'bg',  name: '健身房',   emoji: '🏋️', price: 300, desc: '牠也想練' },

  // 帽子
  { id: 'hat_cap',    slot: 'hat', name: '鴨舌帽',   emoji: '🧢', price: 80,  desc: '' },
  { id: 'hat_crown',  slot: 'hat', name: '皇冠',     emoji: '👑', price: 350, desc: '達標王專用' },
  { id: 'hat_party',  slot: 'hat', name: '派對帽',   emoji: '🎉', price: 100, desc: '' },
  { id: 'hat_chef',   slot: 'hat', name: '廚師帽',   emoji: '👨‍🍳', price: 150, desc: '牠說牠會煮' },

  // 玩具／擺飾
  { id: 'toy_ball',   slot: 'toy', name: '毛線球',   emoji: '🧶', price: 60,  desc: '' },
  { id: 'toy_fish',   slot: 'toy', name: '小魚乾',   emoji: '🐟', price: 90,  desc: '' },
  { id: 'toy_plant',  slot: 'toy', name: '盆栽',     emoji: '🪴', price: 110, desc: '' },
  { id: 'toy_trophy', slot: 'toy', name: '獎盃',     emoji: '🏆', price: 500, desc: '連續達標的證明' },
];

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
  `).run(sp.id, String(name || sp.name).slice(0, 20), JSON.stringify({ bg: 'bg_room' }), daysAgo(8));
  // settled_to 往回設八天：第一次開頁面時會把最近七天完整的日子結算進來。
  // 設成昨天的話新寵物永遠拿不到第一筆（結算只算已過完的日子），
  // 使用者已經記錄好幾週卻看到 0 代幣、商城全部買不起。
  // 預設的窩送的，不用買
  db.prepare('INSERT OR IGNORE INTO pet_items (item_id) VALUES (?)').run('bg_room');
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
