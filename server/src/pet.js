/**
 * 寵物。參考 Neko Atsume：養一隻小動物，用代幣買布置與裝扮。
 *
 * 和原作不同的地方是「牠吃的跟你一樣」—— 寵物的心情與體態完全由飼主的
 * 飲食紀錄推算出來，不是另外一套數值。吃太少牠會瘦、吃太多牠會圓、
 * 連續幾天沒記錄牠會餓。代幣靠記錄飲食與達標賺，不能用別的方式取得。
 *
 * 動物使用專屬動畫，裝飾可購買後拖移布置；多隻寵物共用環境與錢包。
 */
import { getDb } from './db.js';
import { dailySummary, today, daysAgo } from './records.js';
import { ALL_WEAR } from './pet-wardrobe.js';
import { ALL_OUTFITS, outfitsFor, legacyOutfitFor, outfitEquipment, outfitOwnership } from './pet-outfits.js';
import { readFileSync } from 'node:fs';
const DECORATIONS = JSON.parse(readFileSync(new URL('./pet-catalog.json', import.meta.url), 'utf8')).filter(item => item.slot === 'decor');

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
 * 共用環境、可拖移布置的裝飾，以及每物種三套完整穿搭。
 * 套裝使用整隻已穿好衣服的角色動畫，一次換上，不再疊單品素材。
 * 舊單品仍可查詢購買紀錄，並免費解鎖對應套裝。
 * outfit 部位同時只穿一套；group 只影響商城分類。
 */

/** 五個環境。圖是整張場景插畫，不是小圖示。 */
const SCENES = [
  ['bg_room',   '小房間',  0,   '預設的窩'],
  ['bg_garden', '庭院',    30, '曬得到太陽'],
  ['bg_beach',  '海邊',    45, '看得到海'],
  ['bg_gym',    '健身房',  60, '牠也想練'],
  ['bg_space',  '太空艙',  80, '誰說寵物不能上太空'],
];

/** 五個環境是所有物種共用的 */
const SCENE_ITEMS = SCENES.map(([id, name, price, desc]) => ({
  id, slot: 'bg', group: '環境', name, price, desc,
  img: `/pets/scene-${id.replace(/^bg_/, '')}-v2.webp`,
}));

/** 這隻看得到的商城內容 */
export const shopFor = (species) => [...SCENE_ITEMS, ...DECORATIONS, ...outfitsFor(species)];

/**
 * 查一件商品。要涵蓋所有物種的衣服，不能只看目前這隻的——
 * 換寵物之後舊的穿戴紀錄還在 pet_history 裡，查得到才顯示得出來。
 */
const EVERYTHING = [...SCENE_ITEMS, ...DECORATIONS, ...ALL_OUTFITS, ...ALL_WEAR];

/** 商城的分區順序，前端照這個排 */
export const shopGroupsFor = (species) => [...new Set(shopFor(species).map(i => i.group))];

export const itemOf = (id) => EVERYTHING.find(i => i.id === id) || null;

/* ---------------- 存取 ---------------- */

const parse = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };

export const PET_PRICE = 1000;

function mainPet(userId) {
  const row = getDb(userId).prepare('SELECT * FROM pet WHERE id = 1').get();
  return row ? { ...row, petKey: 'main', equipped: outfitEquipment(row.species,parse(row.equipped, {})) } : null;
}

export function listPets(userId) {
  const main = mainPet(userId);
  if (!main) return [];
  const companions = getDb(userId).prepare('SELECT * FROM pet_companions ORDER BY id').all();
  return [main, ...companions.map(row => ({
    ...row, petKey: `companion-${row.id}`, coins: main.coins, settled_to: main.settled_to,
    equipped: { ...outfitEquipment(row.species,parse(row.equipped, {})), bg: main.equipped.bg || 'bg_room' },
  }))];
}

export function petByKey(userId, key) {
  const pet = listPets(userId).find(p => p.petKey === key);
  if (!pet) throw Object.assign(new Error('找不到這隻寵物'), { status: 404 });
  return pet;
}

export function getPet(userId) {
  const pets = listPets(userId);
  if (!pets.length) return null;
  const selected = getDb(userId).prepare('SELECT pet_key FROM pet_selection WHERE id = 1').get()?.pet_key;
  return pets.find(p => p.petKey === selected) || pets[0];
}

export function selectPet(userId, key) {
  petByKey(userId, key);
  getDb(userId).prepare('INSERT INTO pet_selection (id, pet_key) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET pet_key = excluded.pet_key').run(key);
  return getPet(userId);
}

function validPetName(value) {
  const name = String(value ?? '').trim();
  if (!name || name.length > 20) throw Object.assign(new Error('寵物名字請填 1～20 個字'), { status: 400 });
  return name;
}

export function renamePet(userId, key, value) {
  petByKey(userId, key);
  const name = validPetName(value);
  const db = getDb(userId);
  if (key === 'main') db.prepare('UPDATE pet SET name = ? WHERE id = 1').run(name);
  else db.prepare('UPDATE pet_companions SET name = ? WHERE id = ?').run(name, Number(key.replace('companion-', '')));
  return petByKey(userId, key);
}

/** 購買只增加寵物；錢包、衣櫃、歷史紀錄都保留。requestId 防止重送扣兩次。 */
export function purchasePet(userId, species, value, requestId) {
  if (!SPECIES.some(s => s.id === species)) throw Object.assign(new Error('沒有這種寵物'), { status: 400 });
  const name = validPetName(value);
  if (!/^[a-zA-Z0-9_-]{12,80}$/.test(String(requestId ?? ''))) throw Object.assign(new Error('缺少有效的購買識別碼'), { status: 400 });
  if (!mainPet(userId)) throw Object.assign(new Error('請先領養第一隻寵物'), { status: 400 });
  const db = getDb(userId);
  db.exec('BEGIN IMMEDIATE');
  try {
    const previous = db.prepare('SELECT * FROM pet_companions WHERE purchase_id = ?').get(requestId);
    if (previous) {
      if (previous.species !== species || previous.name !== name) throw Object.assign(new Error('購買識別碼已使用'), { status: 409 });
      db.exec('COMMIT');
      return petByKey(userId, `companion-${previous.id}`);
    }
    const paid = db.prepare('UPDATE pet SET coins = coins - ? WHERE id = 1 AND coins >= ?').run(PET_PRICE, PET_PRICE);
    if (!paid.changes) throw Object.assign(new Error(`代幣不足，購買寵物需要 ${PET_PRICE.toLocaleString()} 枚`), { status: 400 });
    const result = db.prepare('INSERT INTO pet_companions (species, name, purchase_id) VALUES (?, ?, ?)').run(species, name, requestId);
    const key = `companion-${result.lastInsertRowid}`;
    db.prepare('INSERT INTO pet_selection (id, pet_key) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET pet_key = excluded.pet_key').run(key);
    db.exec('COMMIT');
    return getPet(userId);
  } catch (err) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw err;
  }
}

function saveEquipment(userId, pet, equipped) {
  const db = getDb(userId);
  if (pet.petKey === 'main') db.prepare('UPDATE pet SET equipped = ? WHERE id = 1').run(JSON.stringify(equipped));
  else {
    const { bg, ...clothes } = equipped;
    db.prepare('UPDATE pet_companions SET equipped = ? WHERE id = ?').run(JSON.stringify(clothes), pet.id);
  }
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
 *
 * 這是整個 App 唯一不可復原的操作，而且實際上誤觸過三次（兩次是原生
 * confirm() 的「確定」剛好落在手指附近，一次原因不明，日誌已經被覆蓋）。
 * 所以確認不能只靠前端：呼叫端必須把「目前這隻的名字」原樣帶回來。
 *
 * 這樣一來，舊版前端（還在用 confirm()、不會送這個欄位）會直接被擋下來，
 * 而不是把寵物換掉；任何誤觸也不可能湊出正確的名字。
 */
export function replacePet(userId, species, name, confirmName) {
  if (listPets(userId).length > 1) throw Object.assign(new Error('已經多養寵物，請切換照顧或到商城購買；不再使用替換重置'), { status: 409 });
  const current = getPet(userId);
  if (current && String(confirmName ?? '').trim() !== current.name) {
    throw Object.assign(
      new Error('換寵物要把目前這隻的名字帶回來確認'),
      { status: 400 },
    );
  }

  const db = getDb(userId);

  // 先把舊的那一隻整隻留下來再動手。「無法復原」是設計上的選擇，
  // 不是技術上的必然——留一份存根的成本幾乎是零。
  if (current) {
    const row = db.prepare('SELECT * FROM pet WHERE id = 1').get();
    db.prepare(`
      INSERT INTO pet_history (species, name, coins, equipped, settled_to, items, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.species, row.name, row.coins, row.equipped, row.settled_to,
      JSON.stringify(ownedItems(userId)), row.created_at,
    );
  }

  db.exec('DELETE FROM pet_selection');
  db.exec('DELETE FROM pet_room_decor');
  db.exec('DELETE FROM pet_room_positions');
  db.exec('DELETE FROM pet_reward_ledger');
  db.exec('DELETE FROM pet_items');
  db.exec('DELETE FROM pet');
  const fresh = adoptPet(userId, species, name);

  // 領養會認列最近七天的紀錄當見面禮，但換寵物不該再給一次 ——
  // 否則反覆換寵物就能無限刷代幣。結算起點設成昨天，從明天開始重新累積。
  db.prepare('UPDATE pet SET coins = 0, settled_to = ? WHERE id = 1').run(daysAgo(1));
  return getPet(userId);
}
export const ownedItems = (userId) =>
  outfitOwnership(getDb(userId).prepare('SELECT item_id FROM pet_items').all().map(r => r.item_id));

/* ---------------- 代幣結算 ---------------- */

/** 一天最多拿多少 */
const COIN_LOGGED = 2;      // 有記錄就好
const COIN_KCAL = 8;        // 熱量落在目標 ±10%
const COIN_PROTEIN = 8;     // 蛋白質達到目標九成

/**
 * 新規則上線日：這天（含）之後，「有記錄 +2」與「熱量達標 +8」改成記錄當下入帳
 * （見 rewardMealSaved），每日結算只剩蛋白質那份。這天之前的日子照舊結算，
 * 否則上線前還沒結算到的日子會少拿。
 */
const INSTANT_FROM = '2026-10-14';
const COIN_PER_MEAL = 2;
const MAX_REWARDED_MEALS = 3; // 每天最多 +6；修改不算新增

/** 某一天結算時可以拿幾枚 */
export function coinsForDay(userId, date) {
  const s = dailySummary(userId, date);
  if (!s.nutrition.items) return 0;          // 完全沒記錄

  const legacy = date < INSTANT_FROM;
  let c = legacy ? COIN_LOGGED : 0;
  const tk = s.targets.kcal || 0;
  const tp = s.targets.protein_g || 0;
  if (legacy && tk && Math.abs(s.nutrition.kcal - tk) <= tk * 0.1) c += COIN_KCAL;
  if (tp && s.nutrition.protein_g >= tp * 0.9) c += COIN_PROTEIN;
  return c;
}

/** 今日新增飲食每筆 +2、最多三筆；新增或修改首次熱量達標 +8。 */
export function rewardMealSaved(userId, date, { isNew = false, mealId = null } = {}) {
  if (!getPet(userId) || date !== today() || date < INSTANT_FROM) return 0;
  const db = getDb(userId);
  db.exec('BEGIN IMMEDIATE');
  try {
    let earned = 0;
    const count = db.prepare('SELECT COUNT(*) AS n FROM pet_meal_rewards WHERE date = ?').get(date).n;
    if (isNew && Number.isInteger(mealId) && count < MAX_REWARDED_MEALS) {
      const meal = db.prepare('SELECT date, kcal FROM meals WHERE id = ?').get(mealId);
      if (meal?.date === date && meal.kcal > 0) {
        const r = db.prepare('INSERT OR IGNORE INTO pet_meal_rewards (meal_id, date) VALUES (?, ?)').run(mealId, date);
        if (r.changes) {
          earned += COIN_PER_MEAL;
          db.prepare('INSERT INTO pet_reward_ledger(reward_key,date,reason,amount) VALUES (?,?,?,?)').run(`meal:${mealId}`, date, '新增有效飲食', COIN_PER_MEAL);
        }
      }
    }
    const summary = dailySummary(userId, date);
    const tk = summary.targets.kcal || 0;
    if (tk && summary.nutrition.items && Math.abs(summary.nutrition.kcal - tk) <= tk * 0.1) {
      const r = db.prepare('INSERT OR IGNORE INTO pet_daily_bonus (date) VALUES (?)').run(date);
      if (r.changes) {
        earned += COIN_KCAL;
        db.prepare('INSERT INTO pet_reward_ledger(reward_key,date,reason,amount) VALUES (?,?,?,?)').run(`kcal:${date}`, date, '熱量首次達標', COIN_KCAL);
      }
    }
    if (earned) db.prepare('UPDATE pet SET coins = coins + ? WHERE id = 1').run(earned);
    db.exec('COMMIT');
    return earned;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
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
  db.exec('BEGIN IMMEDIATE');
  try {

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
    if (c) {
      earned += c; days++;
      db.prepare('INSERT INTO pet_reward_ledger(reward_key,date,reason,amount) VALUES (?,?,?,?)')
        .run(`settle:${iso}`, iso, iso < INSTANT_FROM ? '舊規則每日結算' : '蛋白質達標結算', c);
    }
  }

  db.prepare('UPDATE pet SET coins = coins + ?, settled_to = ? WHERE id = 1').run(earned, yesterday);
  db.exec('COMMIT');
  return { earned, days };
  } catch (err) { db.exec('ROLLBACK'); throw err; }
}

export function rewardOverview(userId) {
  if (!getPet(userId)) return null;
  const db = getDb(userId), date = today();
  const meals = db.prepare('SELECT COUNT(*) AS n FROM pet_meal_rewards WHERE date=?').get(date).n;
  const kcal = !!db.prepare('SELECT date FROM pet_daily_bonus WHERE date=?').get(date);
  const s = dailySummary(userId, date);
  const proteinPending = !!(s.nutrition.items && s.targets.protein_g && s.nutrition.protein_g >= s.targets.protein_g * .9);
  const entries = db.prepare(`
    SELECT reward_key, date, reason, amount, created_at FROM pet_reward_ledger
    UNION ALL
    SELECT 'meal:' || meal_id, date, '新增有效飲食（舊憑證）', 2, NULL FROM pet_meal_rewards
    WHERE NOT EXISTS (SELECT 1 FROM pet_reward_ledger WHERE reward_key='meal:' || meal_id)
    UNION ALL
    SELECT 'kcal:' || date, date, '熱量首次達標', 8, created_at FROM pet_daily_bonus b
    WHERE NOT EXISTS (SELECT 1 FROM pet_reward_ledger WHERE reward_key='kcal:' || b.date)
    ORDER BY date DESC, created_at DESC LIMIT 30
  `).all();
  return { date, instantEarned: meals * 2 + (kcal ? 8 : 0), instantRemaining: Math.max(0, 3 - meals) * 2 + (kcal ? 0 : 8),
    proteinPending: proteinPending ? 8 : 0, meals, kcal, entries };
}

/* ---------------- 心情與體態 ---------------- */

const WINDOW = 7;

/**
 * 看最近七天的飲食，推算寵物的狀態。
 * 刻意不存進資料庫：它完全是飲食紀錄的衍生值，存起來只會不同步。
 */
export function petState(userId) {
  const ratios = (date) => {
    const s = dailySummary(userId, date);
    if (!s.nutrition.items) return null;
    return {
      date,
      items: s.nutrition.items,
      kcalRatio: s.targets.kcal ? s.nutrition.kcal / s.targets.kcal : 0,
      proteinRatio: s.targets.protein_g ? s.nutrition.protein_g / s.targets.protein_g : 0,
    };
  };

  const days = [];
  for (let i = 1; i <= WINDOW; i++) {
    const d = ratios(daysAgo(i));
    if (d) days.push(d);
  }

  /**
   * 今天要不要算進平均。
   *
   * 今天還沒過完，所以早上吃完早餐就把它算進去，會讓平均反而往下掉——
   * 剛吃完東西寵物卻變瘦，這說不過去。但是整天不算也不對：
   * 吃滿一天的量了，寵物卻還是一副餓壞的樣子（Martina 遇到的就是這個）。
   *
   * 折衷：今天只在「已經吃到目標」或「天都快黑了」的時候才算。
   * 這個偏袒是單向的——今天只會讓結果變好，不會無端變差。
   */
  const todayRow = ratios(today());
  if (todayRow && (todayRow.kcalRatio >= 1 || new Date().getHours() >= 20)) {
    days.push(todayRow);
  }

  // 新帳號沒有缺席天數；舊帳號依最後記錄的日期計算，不限制在八天。
  const lastDate = getDb(userId).prepare('SELECT MAX(date) AS date FROM meals WHERE date <= ?').get(today()).date;
  const silent = lastDate
    ? Math.max(0, Math.round((Date.parse(today()) - Date.parse(lastDate)) / 86_400_000))
    : 0;

  const avg = (k) => (days.length ? days.reduce((a, b) => a + b[k], 0) / days.length : 0);
  const kcal = avg('kcalRatio');
  const protein = avg('proteinRatio');

  let mood, body, says;
  if (silent >= 3) {
    mood = 'hungry'; body = 'thin';
    says = `${silent} 天沒看到你記錄了，牠在等你`;
  } else if (silent >= 1) {
    mood = 'ok'; body = 'normal';
    says = '休息也沒關係，牠會在小屋陪你；想記錄時再一起出發';
  } else if (!days.length) {
    mood = 'ok'; body = 'normal';
    says = lastDate ? '還沒有足夠的紀錄，先吃幾餐讓牠認識你' : '歡迎！先記錄第一餐，讓牠認識你';
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
    // 牡吃的跟你一樣：主人今天沒記錄，遊戲裡的飯磗就不會出現
    ateToday: dailySummary(userId, today()).nutrition.items > 0,
    kcalPct: Math.round(kcal * 100),
    proteinPct: Math.round(protein * 100),
  };
}

/* ---------------- 商城行為 ---------------- */

export function buyItem(userId, itemId, petKey = null) {
  const item = itemOf(itemId);
  if (!item) throw Object.assign(new Error('沒有這個商品'), { status: 404 });
  if(legacyOutfitFor(itemId)) throw Object.assign(new Error('單品已改為完整套裝，請到套裝區選購'),{status:400});
  const pet = petKey ? petByKey(userId, petKey) : getPet(userId);
  if (!pet) throw Object.assign(new Error('還沒有寵物'), { status: 400 });
  if (item.species && item.species !== pet.species) throw Object.assign(new Error('這件穿搭不適合這隻寵物'), { status: 400 });
  const db = getDb(userId);
  db.exec('BEGIN IMMEDIATE');
  try {
    if (ownedItems(userId).includes(itemId)) throw Object.assign(new Error('已經買過了'), { status: 409 });
    const paid = db.prepare('UPDATE pet SET coins = coins - ? WHERE id = 1 AND coins >= ?').run(item.price, item.price);
    if (!paid.changes) throw Object.assign(new Error('代幣不足'), { status: 400 });
    db.prepare('INSERT INTO pet_items (item_id) VALUES (?)').run(itemId);
    const result = equipItem(userId, itemId, pet.petKey);
    db.exec('COMMIT');
    return result;
  } catch (err) { if (db.isTransaction) db.exec('ROLLBACK'); throw err; }
}

export function equipItem(userId, itemId, petKey = null) {
  const item = itemOf(itemId);
  if (!item) throw Object.assign(new Error('沒有這個商品'), { status: 404 });
  if (!ownedItems(userId).includes(itemId)) throw Object.assign(new Error('還沒有這個東西'), { status: 400 });
  const pet = petKey ? petByKey(userId, petKey) : getPet(userId);
  if (!pet) throw Object.assign(new Error('還沒有寵物'), { status: 400 });
  if (item.slot === 'decor') {
    const scene = mainPet(userId).equipped.bg || 'bg_room';
    getDb(userId).prepare('INSERT OR IGNORE INTO pet_room_decor(scene, item_id) VALUES (?, ?)').run(scene, itemId);
    return getPet(userId);
  }
  if (item.species && item.species !== pet.species) throw Object.assign(new Error('這件穿搭不適合這隻寵物'), { status: 400 });
  const target = item.slot === 'bg' ? mainPet(userId) : pet;
  const outfit=legacyOutfitFor(itemId);
  saveEquipment(userId, target, { ...target.equipped, [outfit ? 'outfit' : item.slot]: outfit?.id || itemId });
  return getPet(userId);
}

export function unequipSlot(userId, slot, petKey = null) {
  if (slot === 'bg') throw Object.assign(new Error('背景不能移除'), { status: 400 });
  if (!['outfit','hat', 'cloth', 'acc'].includes(slot)) throw Object.assign(new Error('沒有這個穿搭部位'), { status: 400 });
  const pet = petKey ? petByKey(userId, petKey) : getPet(userId);
  if (!pet) throw Object.assign(new Error('還沒有寵物'), { status: 400 });
  const equipped = { ...pet.equipped };
  delete equipped[slot];
  if(['hat','cloth','acc'].includes(slot)) delete equipped.outfit;
  saveEquipment(userId, pet, equipped);
  return getPet(userId);
}

export function roomDecor(userId) {
  const pet = mainPet(userId);
  if (!pet) return [];
  return getDb(userId).prepare('SELECT item_id, x, y, scale, locked, layer FROM pet_room_decor WHERE scene = ?').all(pet.equipped.bg || 'bg_room')
    .map(row => ({ ...itemOf(row.item_id), x: row.x, y: row.y, scale: row.scale, locked: row.locked, layer: row.layer })).filter(item => item.id);
}

export function petRoomPosition(userId,key) {
  const scene=mainPet(userId)?.equipped.bg || 'bg_room';
  return getDb(userId).prepare('SELECT x,y FROM pet_room_positions WHERE scene=? AND pet_key=?').get(scene,key) || null;
}
export function movePet(userId,key,position) {
  petByKey(userId,key);
  const {x,y}=position || {};
  if(![x,y].every(Number.isFinite) || x<5 || x>95 || y<64 || y>90) throw Object.assign(new Error('請把寵物放在環境的地板範圍'),{status:400});
  const scene=mainPet(userId).equipped.bg || 'bg_room';
  getDb(userId).prepare('INSERT INTO pet_room_positions(scene,pet_key,x,y) VALUES (?,?,?,?) ON CONFLICT(scene,pet_key) DO UPDATE SET x=excluded.x,y=excluded.y').run(scene,key,x,y);
  return {x,y};
}

const roomSnapshot = items => JSON.stringify(items.map(i=>({id:i.id,x:i.x,y:i.y,scale:i.scale,locked:!!i.locked,layer:i.layer || 0})).sort((a,b)=>a.id.localeCompare(b.id)));
function checkRoomVersion(userId, expected) {
  if (expected && roomSnapshot(expected) !== roomSnapshot(roomDecor(userId))) throw Object.assign(new Error('小屋已在另一個畫面更新，請重新載入後再編輯'),{status:409});
}
export function restoreRoom(userId, items, expected) {
  if (!Array.isArray(items) || items.length > 141 || !Array.isArray(expected)) throw Object.assign(new Error('布置資料無效'),{status:400});
  const db=getDb(userId), scene=mainPet(userId)?.equipped.bg || 'bg_room';
  if (!mainPet(userId)) throw Object.assign(new Error('請先領養寵物'),{status:400});
  if (new Set(items.map(i=>i.id)).size !== items.length) throw Object.assign(new Error('裝飾不可重複'),{status:400});
  db.exec('BEGIN IMMEDIATE');
  try {
    checkRoomVersion(userId,expected);
    db.prepare('DELETE FROM pet_room_decor WHERE scene=?').run(scene);
    for (const item of items) arrangeDecor(userId,item.id,{x:item.x,y:item.y,scale:item.scale,locked:!!item.locked,layer:item.layer || 0});
    db.exec('COMMIT');
    return roomDecor(userId);
  } catch(err) {db.exec('ROLLBACK');throw err;}
}
export function arrangeDecor(userId, itemId, position, expected) {
  checkRoomVersion(userId,expected);
  const item = itemOf(itemId);
  const pet = mainPet(userId);
  if (!pet || item?.slot !== 'decor' || !ownedItems(userId).includes(itemId)) throw Object.assign(new Error('只能布置已購買的裝飾'), { status: 400 });
  const db = getDb(userId);
  const scene = pet.equipped.bg || 'bg_room';
  if (position === null) {
    db.prepare('DELETE FROM pet_room_decor WHERE scene = ? AND item_id = ?').run(scene, itemId);
  } else {
    const { x, y, scale } = position || {};
    const prior = db.prepare('SELECT locked,layer FROM pet_room_decor WHERE scene=? AND item_id=?').get(scene,itemId);
    const locked = position.locked ?? !!prior?.locked;
    const layer = position.layer ?? prior?.layer ?? 0;
    if (typeof locked !== 'boolean' || !Number.isInteger(layer) || layer < -5 || layer > 5) throw Object.assign(new Error('裝飾鎖定或層級無效'), { status: 400 });
    if (![x,y,scale].every(Number.isFinite) || x < 5 || x > 95 || y < 30 || y > 95 || scale < .6 || scale > 1.5) throw Object.assign(new Error('裝飾位置或大小超出範圍'), { status: 400 });
    if (prior?.locked && position.locked !== false) {
      const old = db.prepare('SELECT x,y,scale FROM pet_room_decor WHERE scene=? AND item_id=?').get(scene,itemId);
      if (x !== old.x || y !== old.y || scale !== old.scale || layer !== prior.layer) throw Object.assign(new Error('請先解鎖裝飾再移動'), { status: 409 });
    }
    db.prepare('INSERT INTO pet_room_decor(scene,item_id,x,y,scale,locked,layer) VALUES (?,?,?,?,?,?,?) ON CONFLICT(scene,item_id) DO UPDATE SET x=excluded.x,y=excluded.y,scale=excluded.scale,locked=excluded.locked,layer=excluded.layer').run(scene,itemId,x,y,scale,locked ? 1 : 0,layer);
  }
  return roomDecor(userId);
}
