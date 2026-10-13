/**
 * 寵物的行為狀態機（網頁版）。
 *
 * 規則跟先前 game/pet/fsm/state_machine.gd 那一版完全一樣，只是改成在瀏覽器裡跑、
 * 用 CSS 動畫表現，不再需要 Godot 的執行環境與那顆 38 MB 的 wasm。
 *
 * 轉移不是寫死的流程圖，是「時間到了依權重重抽」。權重來自兩件事：
 *
 *   1. 作息曲線 —— pet/動物特性.txt 的生活習性，由後端算成 0~1 的活躍度
 *   2. 主人的飲食 —— 心情與體態，吃不夠牠就懶，吃得好牠就愛玩
 *
 * 所以同一隻貓早上六點和中午十二點會做不一樣的事，而且是因為「貓是晨昏型
 * 動物」這個事實，不是因為某個分支寫了 if (hour === 6)。
 */

/**
 * 專屬動作怎麼演。
 *
 * key 是 動物特性.txt 那二十幾個動作的 id，css 是場景要套的動畫類別，
 * pose 是貓的動作圖檔名（只有貓有八張動作圖，其他物種會自動退回本體圖）。
 * 沒列到的動作會落到 idle，不會壞掉，只是動得比較普通。
 */
const RECIPES = {
  // 貓
  groom: { css: 'groom', pose: 'groom' },
  scratch: { css: 'play', pose: 'play' },
  sunbathe: { css: 'sleep', pose: 'sleep' },
  // 狗
  fetch: { css: 'walk', pose: 'walk' },
  wag: { css: 'play', pose: 'happy' },
  doze: { css: 'sleep', pose: 'sleep' },
  // 兔
  hop: { css: 'play', pose: 'play' },
  wash: { css: 'groom', pose: 'groom' },
  nibble: { css: 'eat', pose: 'eat' },
  // 倉鼠
  wheel: { css: 'play', pose: 'play' },
  stash: { css: 'walk', pose: 'walk' },
  // 天竺鼠
  graze: { css: 'eat', pose: 'eat' },
  hide: { css: 'sleep', pose: 'sleep' },
  popcorn: { css: 'play', pose: 'happy' },
  // 刺蝟
  explore: { css: 'walk', pose: 'walk' },
  sniff: { css: 'idle', pose: 'idle' },
  curl: { css: 'sleep', pose: 'sleep' },
  // 雪貂
  tunnel: { css: 'walk', pose: 'walk' },
  roll: { css: 'play', pose: 'play' },
  play: { css: 'play', pose: 'play' },
  // 鸚鵡
  preen: { css: 'groom', pose: 'groom' },
  climb: { css: 'play', pose: 'play' },
  squawk: { css: 'play', pose: 'happy' },
  // 陸龜
  plod: { css: 'walk', pose: 'walk' },
  veggie: { css: 'eat', pose: 'eat' },
  // 龍貓
  dustbath: { css: 'groom', pose: 'groom' },
  leap: { css: 'play', pose: 'play' },
  gnaw: { css: 'eat', pose: 'eat' },
};

/** 基本狀態：每種動物都有，不需要專屬動作 */
const BASE = {
  sleep: { css: 'sleep', pose: 'sleep', label: '睡得很熟', secs: 50 },
  doze: { css: 'sleep', pose: 'sleep', label: '半夢半醒', secs: 35 },
  idle: { css: 'idle', pose: 'idle', label: '發呆中', secs: 25 },
  walk: { css: 'walk', pose: 'walk', label: '走來走去', secs: 30 },
  eat: { css: 'eat', pose: 'eat', label: '正在吃東西', secs: 25 },
  beg: { css: 'beg', pose: 'walk', label: '一直在討食', secs: 30 },
};

/**
 * 幾點的活躍度。小時可以是小數，整點之間線性內插，
 * 活躍度才不會每小時跳一下。
 */
export function activityAt(curve, hour) {
  if (!Array.isArray(curve) || curve.length < 24) return 0.5;
  const h = ((hour % 24) + 24) % 24;
  const i = Math.floor(h);
  const t = h - i;
  return curve[i] * (1 - t) + curve[(i + 1) % 24] * t;
}

/** 各狀態的權重。活躍度是主軸，心情只做加減。 */
export function weightsFor({ activity, mood, ateToday, last }) {
  let a = activity;
  switch (mood) {
    case 'hungry':
    case 'thin':
      a *= 0.55;            // 餓著或沒力的時候整體往下壓一截
      break;
    case 'happy':
      a = Math.min(1, a * 1.15);
      break;
    case 'round':
      a *= 0.85;            // 圓滾滾的時候懶一點
      break;
    default:
      break;
  }

  let w;
  if (a < 0.25) w = { sleep: 70, doze: 25, idle: 5 };
  else if (a < 0.5) w = { doze: 32, idle: 34, walk: 22, act: 12 };
  else if (a < 0.75) w = { idle: 18, walk: 34, act: 38, doze: 10 };
  else w = { idle: 8, walk: 28, act: 54, doze: 2 };

  // 主人今天有吃，寵物才會有東西吃 —— 牠吃的跟主人一樣
  if (ateToday && a >= 0.35) w.eat = 12;

  // 好幾天沒記錄了，牠會一直過來討
  if (mood === 'hungry') w.beg = 45;

  // 同一個狀態連兩次看起來像卡住，把剛剛那個壓低
  if (last && w[last] != null) w[last] *= 0.35;

  return w;
}

function weightedPick(w) {
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [k, v] of Object.entries(w)) {
    r -= v;
    if (r <= 0) return k;
  }
  return 'idle';
}

/**
 * 抽下一個狀態。
 * 回傳 { kind, css, pose, label, secs }：kind 是給「不要連抽兩次」用的，
 * css 是場景的動畫類別，pose 是貓的動作圖，label 是顯示用的中文。
 */
export function pickNext({ curve, hour, mood, ateToday, acts, last }) {
  const activity = activityAt(curve, hour);
  const kind = weightedPick(weightsFor({ activity, mood, ateToday, last }));

  if (kind !== 'act') {
    return { kind, ...(BASE[kind] || BASE.idle) };
  }

  // 專屬動作：從這個物種的清單裡挑一個，配上它的演法
  const list = Array.isArray(acts) && acts.length ? acts : null;
  if (!list) return { kind: 'idle', ...BASE.idle };
  const a = list[Math.floor(Math.random() * list.length)];
  const r = RECIPES[a.id] || { css: 'idle', pose: 'idle' };
  return { kind: 'act', css: r.css, pose: r.pose, label: a.label, secs: 28 };
}
