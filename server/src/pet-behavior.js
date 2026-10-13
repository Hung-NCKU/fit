/**
 * 動物特性 —— 來源是 pet/動物特性.txt，那份表格就是這個檔案的規格。
 *
 * 在這之前只有貓有作息，另外九種不管幾點都是同一張靜態圖。這裡把
 * 「生活習性」拆成兩件可以被程式執行的東西：
 *
 *   rhythm  一天二十四小時的活躍度曲線（0~1）
 *   acts    該物種的專屬動作，直接對應 Godot 行為狀態機裡的狀態名
 *
 * 這份設定是唯一的來源：後端算心情、前端寫說明、Godot 跑 FSM，
 * 全部吃同一份 JSON（遊戲端是開場時由網頁透過 JavaScriptBridge 餵進去的，
 * GDScript 裡不會再抄一份，不然兩邊遲早會對不起來）。
 */

/* ---------------- 作息曲線 ---------------- */

/**
 * size 是牠站著時該佔場景高度的幾成（真實體型的相對比例），
 * 遊戲端照這個縮放，倉鼠才不會跟狗一樣大。
 *
 * 每種作息給二十四個數字，index 就是小時。
 * 直接列出來比用三角函數湊好讀，也好調——這是美術手感的東西，不是物理。
 */
const RHYTHMS = {
  // 日行性：天亮開始動，下午再一波，入夜就休息
  diurnal: [
    0.05, 0.05, 0.05, 0.05, 0.10, 0.30, 0.60, 0.90, 1.00, 1.00, 0.90, 0.80,
    0.60, 0.50, 0.60, 0.80, 0.90, 1.00, 0.90, 0.70, 0.40, 0.20, 0.10, 0.05,
  ],
  // 夜行性：日夜顛倒
  nocturnal: [
    0.90, 1.00, 1.00, 0.90, 0.70, 0.40, 0.15, 0.05, 0.05, 0.05, 0.05, 0.05,
    0.05, 0.05, 0.05, 0.05, 0.10, 0.20, 0.40, 0.70, 0.90, 1.00, 1.00, 0.95,
  ],
  // 晨昏型：清晨與黃昏兩個高峰，中午最懶
  crepuscular: [
    0.30, 0.20, 0.15, 0.15, 0.30, 0.70, 1.00, 0.90, 0.60, 0.40, 0.30, 0.25,
    0.20, 0.20, 0.25, 0.35, 0.50, 0.80, 1.00, 0.90, 0.60, 0.45, 0.40, 0.35,
  ],
  // 多相型：日夜都有活動，中間穿插短暫休息，所以整天都在中段起伏
  polyphasic: [
    0.35, 0.30, 0.35, 0.30, 0.40, 0.50, 0.70, 0.80, 0.70, 0.60, 0.70, 0.60,
    0.50, 0.60, 0.70, 0.60, 0.70, 0.80, 0.80, 0.70, 0.60, 0.50, 0.45, 0.40,
  ],
  // 配合主人：跟著人類的上班與回家時間走
  owner: [
    0.05, 0.05, 0.05, 0.05, 0.05, 0.15, 0.40, 0.80, 0.90, 0.80, 0.70, 0.70,
    0.60, 0.60, 0.70, 0.80, 0.90, 1.00, 0.95, 0.80, 0.60, 0.35, 0.15, 0.08,
  ],
  // 睡很久但醒來很衝：平常趴著，偶爾來一段爆發
  longsleep: [
    0.10, 0.10, 0.10, 0.10, 0.15, 0.30, 0.60, 0.30, 0.10, 0.10, 0.35, 0.15,
    0.10, 0.10, 0.50, 0.20, 0.10, 0.30, 0.80, 0.60, 0.30, 0.15, 0.10, 0.10,
  ],
};

/* ---------------- 十種動物 ---------------- */

/**
 * habit 是 動物特性.txt 的原文，acts 是那一欄「可以設計的專屬動作」。
 * act 的 id 會變成 Godot 狀態機的狀態名，所以只能用 ASCII。
 */
export const HABITS = {
  cat: {
    size: 0.3,
    habit: '全天分段睡眠，晨昏較活躍',
    rhythm: 'crepuscular',
    acts: [
      { id: 'groom', label: '舔毛' },
      { id: 'scratch', label: '抓抓板' },
      { id: 'sunbathe', label: '曬太陽' },
    ],
  },
  dog: {
    size: 0.34,
    habit: '通常配合主人白天活動',
    rhythm: 'owner',
    acts: [
      { id: 'fetch', label: '追球' },
      { id: 'wag', label: '搖尾巴' },
      { id: 'doze', label: '打盹' },
    ],
  },
  rabbit: {
    size: 0.27,
    habit: '晨昏活動較明顯',
    rhythm: 'crepuscular',
    acts: [
      { id: 'hop', label: '跳躍' },
      { id: 'wash', label: '洗臉' },
      { id: 'nibble', label: '啃草' },
    ],
  },
  hamster: {
    size: 0.13,
    habit: '夜行性傾向',
    rhythm: 'nocturnal',
    acts: [
      { id: 'wheel', label: '跑滾輪' },
      { id: 'stash', label: '藏食物' },
    ],
  },
  guinea: {
    size: 0.19,
    habit: '日夜都有活動及短暫休息',
    rhythm: 'polyphasic',
    acts: [
      { id: 'graze', label: '吃草' },
      { id: 'hide', label: '躲小屋' },
      { id: 'popcorn', label: '興奮跳躍' },
    ],
  },
  hedgehog: {
    size: 0.16,
    habit: '主要夜行性',
    rhythm: 'nocturnal',
    acts: [
      { id: 'explore', label: '探索' },
      { id: 'sniff', label: '嗅聞' },
      { id: 'curl', label: '縮成球' },
    ],
  },
  ferret: {
    size: 0.23,
    habit: '一天睡很久，醒來活躍',
    rhythm: 'longsleep',
    acts: [
      { id: 'tunnel', label: '鑽隧道' },
      { id: 'roll', label: '翻滾' },
      { id: 'play', label: '玩耍' },
    ],
  },
  parrot: {
    size: 0.2,
    habit: '日行性',
    rhythm: 'diurnal',
    acts: [
      { id: 'preen', label: '整理羽毛' },
      { id: 'climb', label: '攀爬' },
      { id: 'squawk', label: '鳴叫' },
    ],
  },
  tortoise: {
    size: 0.17,
    habit: '以白天活動為主',
    rhythm: 'diurnal',
    acts: [
      { id: 'sunbathe', label: '曬太陽' },
      { id: 'plod', label: '慢走' },
      { id: 'veggie', label: '吃菜' },
    ],
  },
  chinchilla: {
    size: 0.22,
    habit: '常在晨昏活躍',
    rhythm: 'crepuscular',
    acts: [
      { id: 'dustbath', label: '沙浴' },
      { id: 'leap', label: '跳平台' },
      { id: 'gnaw', label: '磨牙' },
    ],
  },
};

/** 幾點的活躍度。小時可以是小數，中間用線性內插，免得整點跳一下。 */
export function activityAt(species, hour = new Date().getHours()) {
  const curve = RHYTHMS[HABITS[species]?.rhythm] || RHYTHMS.diurnal;
  const h = ((hour % 24) + 24) % 24;
  const i = Math.floor(h);
  const t = h - i;
  return curve[i] * (1 - t) + curve[(i + 1) % 24] * t;
}

/**
 * 丟給前端與 Godot 的完整設定。
 * curve 整條都送，遊戲端才能自己跑時間（例如測試時加速一天）。
 */
export function behaviorOf(species) {
  const h = HABITS[species] || HABITS.cat;
  return {
    species,
    habit: h.habit,
    size: h.size,
    rhythm: h.rhythm,
    acts: h.acts,
    curve: RHYTHMS[h.rhythm],
  };
}

/**
 * 現在在做什麼：給一句中文說明用的。
 * 真正的動作由 Godot 的狀態機挑，這裡只負責「文字版」的現況。
 */
export function doingNow(species, hour = new Date().getHours()) {
  const a = activityAt(species, hour);
  const h = HABITS[species] || HABITS.cat;
  if (a < 0.2) return '睡得很熟';
  if (a < 0.4) return '半夢半醒地趴著';
  if (a < 0.7) return `慢慢地${h.acts[0].label}`;
  return h.acts[h.acts.length - 1].label;
}
