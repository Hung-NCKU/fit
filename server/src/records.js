import { getDb, getProfile, GOAL_LABEL } from './db.js';

export const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD (本地時區)

export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('sv-SE');
}

const num = (v, d = 0) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const str = (v, d = '') => (v === undefined || v === null ? d : String(v));

/* ---------------- 飲食 ---------------- */

export function addMeal(userId, input, source = 'manual') {
  const db = getDb(userId);
  const r = db.prepare(`
    INSERT INTO meals (date, meal_type, name, portion, kcal, protein_g, carb_g, fat_g, source, note, photo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    str(input.date, today()), str(input.meal_type, 'snack'), str(input.name, '未命名'),
    str(input.portion), num(input.kcal), num(input.protein_g), num(input.carb_g),
    num(input.fat_g), source, str(input.note), str(input.photo),
  );
  return getMeal(userId, Number(r.lastInsertRowid));
}

export const getMeal = (userId, id) =>
  getDb(userId).prepare('SELECT * FROM meals WHERE id = ?').get(id);

export function listMeals(userId, { from, to, date, limit = 500 } = {}) {
  const db = getDb(userId);
  if (date) return db.prepare('SELECT * FROM meals WHERE date = ? ORDER BY id').all(date);
  if (from && to) return db.prepare('SELECT * FROM meals WHERE date BETWEEN ? AND ? ORDER BY date DESC, id DESC').all(from, to);
  return db.prepare('SELECT * FROM meals ORDER BY date DESC, id DESC LIMIT ?').all(limit);
}

export function updateMeal(userId, id, patch) {
  const cur = getMeal(userId, id);
  if (!cur) return null;
  const m = { ...cur, ...patch };
  getDb(userId).prepare(`
    UPDATE meals SET date=?, meal_type=?, name=?, portion=?, kcal=?, protein_g=?, carb_g=?, fat_g=?, note=?
    WHERE id=?
  `).run(str(m.date), str(m.meal_type), str(m.name), str(m.portion), num(m.kcal),
         num(m.protein_g), num(m.carb_g), num(m.fat_g), str(m.note), id);
  return getMeal(userId, id);
}

export const deleteMeal = (userId, id) =>
  getDb(userId).prepare('DELETE FROM meals WHERE id = ?').run(id).changes > 0;

/* ---------------- 訓練 ---------------- */

export function addWorkout(userId, input, source = 'manual') {
  const r = getDb(userId).prepare(`
    INSERT INTO workouts (date, exercise, category, sets, reps, weight_kg, duration_min, rpe, source, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    str(input.date, today()), str(input.exercise, '未命名'), str(input.category, 'other'),
    num(input.sets), num(input.reps), num(input.weight_kg), num(input.duration_min),
    num(input.rpe), source, str(input.note),
  );
  return getWorkout(userId, Number(r.lastInsertRowid));
}

export const getWorkout = (userId, id) =>
  getDb(userId).prepare('SELECT * FROM workouts WHERE id = ?').get(id);

export function listWorkouts(userId, { from, to, date, limit = 500 } = {}) {
  const db = getDb(userId);
  if (date) return db.prepare('SELECT * FROM workouts WHERE date = ? ORDER BY id').all(date);
  if (from && to) return db.prepare('SELECT * FROM workouts WHERE date BETWEEN ? AND ? ORDER BY date DESC, id DESC').all(from, to);
  return db.prepare('SELECT * FROM workouts ORDER BY date DESC, id DESC LIMIT ?').all(limit);
}

export function updateWorkout(userId, id, patch) {
  const cur = getWorkout(userId, id);
  if (!cur) return null;
  const w = { ...cur, ...patch };
  getDb(userId).prepare(`
    UPDATE workouts SET date=?, exercise=?, category=?, sets=?, reps=?, weight_kg=?, duration_min=?, rpe=?, note=?
    WHERE id=?
  `).run(str(w.date), str(w.exercise), str(w.category), num(w.sets), num(w.reps),
         num(w.weight_kg), num(w.duration_min), num(w.rpe), str(w.note), id);
  return getWorkout(userId, id);
}

export const deleteWorkout = (userId, id) =>
  getDb(userId).prepare('DELETE FROM workouts WHERE id = ?').run(id).changes > 0;

/* ---------------- 體重 ---------------- */

export function addWeight(userId, input) {
  const db = getDb(userId);
  const date = str(input.date, today());
  db.prepare(`
    INSERT INTO weights (date, weight_kg, body_fat_pct, note) VALUES (?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET weight_kg=excluded.weight_kg,
                                    body_fat_pct=excluded.body_fat_pct,
                                    note=excluded.note
  `).run(date, num(input.weight_kg), input.body_fat_pct == null ? null : num(input.body_fat_pct), str(input.note));
  syncProfileWeight(userId);
  return db.prepare('SELECT * FROM weights WHERE date = ?').get(date);
}

/** 個人檔案的體重要跟著最新一筆紀錄走；刪光了就維持原值 */
function syncProfileWeight(userId) {
  const db = getDb(userId);
  const latest = db.prepare('SELECT weight_kg FROM weights ORDER BY date DESC LIMIT 1').get();
  if (latest) db.prepare('UPDATE profile SET weight_kg = ? WHERE id = 1').run(latest.weight_kg);
}

export const listWeights = (userId, { limit = 365 } = {}) =>
  getDb(userId).prepare('SELECT * FROM weights ORDER BY date DESC LIMIT ?').all(limit);

export function deleteWeight(userId, id) {
  const gone = getDb(userId).prepare('DELETE FROM weights WHERE id = ?').run(id).changes > 0;
  if (gone) syncProfileWeight(userId);   // 否則個人檔案會停在已刪掉的那筆體重
  return gone;
}

/* ---------------- 統計 ---------------- */

export function dailySummary(userId, date = today()) {
  const db = getDb(userId);
  const n = db.prepare(`
    SELECT COALESCE(SUM(kcal),0) kcal, COALESCE(SUM(protein_g),0) protein_g,
           COALESCE(SUM(carb_g),0) carb_g, COALESCE(SUM(fat_g),0) fat_g, COUNT(*) items
    FROM meals WHERE date = ?
  `).get(date);
  const w = db.prepare(`
    SELECT COUNT(*) items, COALESCE(SUM(sets*reps*weight_kg),0) volume_kg,
           COALESCE(SUM(duration_min),0) duration_min
    FROM workouts WHERE date = ?
  `).get(date);
  const p = getProfile(userId);
  return {
    date, user: userId,
    nutrition: n,
    workout: w,
    targets: {
      kcal: p.target_kcal, protein_g: p.target_protein_g,
      carb_g: p.target_carb_g, fat_g: p.target_fat_g,
    },
    remaining: {
      kcal: Math.round(p.target_kcal - n.kcal),
      protein_g: Math.round(p.target_protein_g - n.protein_g),
    },
  };
}

export function rangeSummary(userId, from, to) {
  const db = getDb(userId);
  const days = db.prepare(`
    SELECT date, SUM(kcal) kcal, SUM(protein_g) protein_g, SUM(carb_g) carb_g, SUM(fat_g) fat_g
    FROM meals WHERE date BETWEEN ? AND ? GROUP BY date ORDER BY date
  `).all(from, to);
  const training = db.prepare(`
    SELECT date, COUNT(*) items, SUM(sets*reps*weight_kg) volume_kg, SUM(duration_min) duration_min
    FROM workouts WHERE date BETWEEN ? AND ? GROUP BY date ORDER BY date
  `).all(from, to);
  const weights = db.prepare('SELECT date, weight_kg FROM weights WHERE date BETWEEN ? AND ? ORDER BY date').all(from, to);
  return { from, to, user: userId, days, training, weights };
}

/** 給 LLM 看的近況摘要（壓縮成短文字，省 token） */
export function recentContext(userId, days = 7) {
  const to = today();
  const from = daysAgo(days - 1);
  const { days: nut, training, weights } = rangeSummary(userId, from, to);
  const p = getProfile(userId);

  const lines = [];
  lines.push(`個人資料：${p.name}，${p.age} 歲${p.sex === 'female' ? '女性' : '男性'}，${p.height_cm}cm，目前 ${p.weight_kg}kg，目標體重 ${p.goal_weight_kg}kg，目標：${GOAL_LABEL[p.goal] ?? p.goal}。`);
  lines.push(`每日目標：${p.target_kcal} kcal / 蛋白質 ${p.target_protein_g}g / 碳水 ${p.target_carb_g}g / 脂肪 ${p.target_fat_g}g（BMR ${p.bmr}、TDEE ${p.tdee}）。`);
  if (p.notes) lines.push(`備註：${p.notes}`);

  lines.push(`\n近 ${days} 天飲食：`);
  lines.push(nut.length
    ? nut.map(r => `  ${r.date}: ${Math.round(r.kcal)}kcal / P${Math.round(r.protein_g)}g C${Math.round(r.carb_g)}g F${Math.round(r.fat_g)}g`).join('\n')
    : '  （無紀錄）');

  lines.push(`近 ${days} 天訓練：`);
  lines.push(training.length
    ? training.map(r => `  ${r.date}: ${r.items} 項，總訓練量 ${Math.round(r.volume_kg || 0)}kg，${Math.round(r.duration_min || 0)} 分鐘`).join('\n')
    : '  （無紀錄）');

  // 附上編號，LLM 才能用 edit_meal / delete_meal 指到正確的那一筆
  const recentMeals = listMeals(userId, { from: daysAgo(1), to, limit: 60 });
  if (recentMeals.length) {
    lines.push('今天與昨天的飲食明細（# 後面是編號，修改或刪除時用）：');
    lines.push(recentMeals.map(m =>
      `  #${m.id} ${m.date} ${m.meal_type} ${m.name}${m.portion ? ` ${m.portion}` : ''}`
      + ` ${Math.round(m.kcal)}kcal P${Math.round(m.protein_g)} C${Math.round(m.carb_g)} F${Math.round(m.fat_g)}`,
    ).join('\n'));
  }

  const todayW = listWorkouts(userId, { date: to });
  if (todayW.length) {
    lines.push('今天的訓練明細：');
    lines.push(todayW.map(w => `  ${w.exercise} ${w.sets}x${w.reps} @${w.weight_kg}kg`).join('\n'));
  }

  if (weights.length) lines.push(`體重紀錄：${weights.map(w => `${w.date} ${w.weight_kg}kg`).join('、')}`);

  const s = dailySummary(userId, to);
  lines.push(`\n今天（${to}）目前累計：${Math.round(s.nutrition.kcal)}kcal / 蛋白質 ${Math.round(s.nutrition.protein_g)}g，距離目標還差 ${s.remaining.kcal}kcal、蛋白質 ${s.remaining.protein_g}g。`);
  return lines.join('\n');
}
