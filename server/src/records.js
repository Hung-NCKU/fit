import {workoutEnergy} from './workout-energy.js';
import { getDb, getProfile, GOAL_LABEL } from './db.js';
import { normalizeSets, decodeWorkout, workoutVolumeSql, normalizeCardio } from './workout-sets.js';
import { createHash } from 'node:crypto';

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

export function listMeals(userId, { from, to, date, limit = 500, offset = 0 } = {}) {
  const db = getDb(userId);
  if (date) return db.prepare('SELECT * FROM meals WHERE date = ? ORDER BY id').all(date);
  if (from && to) return db.prepare('SELECT * FROM meals WHERE date BETWEEN ? AND ? ORDER BY date DESC, id DESC').all(from, to);
  // offset 給飲食頁分頁用：整份歷史一次載入時，光是照片就有數十 MB
  return db.prepare('SELECT * FROM meals ORDER BY date DESC, id DESC LIMIT ? OFFSET ?')
    .all(num(limit) || 500, num(offset));
}

/**
 * 有飲食紀錄的日期清單（新到舊），附當天的筆數與熱量。
 * 飲食頁用它做日期分頁：一次只載一天，而且按 ← 時直接跳到「上一個有紀錄的日子」，
 * 不會卡在一堆空白日期上。回傳量很小（幾十列純文字），可以一次拿完。
 */
export const listMealDates = (userId) => getDb(userId).prepare(`
  SELECT date, COUNT(*) items, ROUND(SUM(kcal)) kcal, ROUND(SUM(protein_g)) protein_g
  FROM meals GROUP BY date ORDER BY date DESC
`).all();

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
  const details=input.set_details === undefined ? [] : normalizeSets(input.set_details);
  input=normalizeCardio(input,details);
  const values=[str(input.date,today()),str(input.exercise,'未命名'),str(input.category,'other'),details.length || num(input.sets),
    details.length ? details[0].reps : num(input.reps),details.length ? details[0].weight_kg : num(input.weight_kg),
    details.length ? details.some(s=>s.duration_s>0) ? details.reduce((sum,s)=>sum+s.duration_s,0)/60 : num(input.duration_min) : num(input.duration_min),num(input.rpe),source,str(input.note),JSON.stringify(details)];
  const parsedDate=new Date(values[0]+'T00:00:00Z');
  if(details.length && (!/^\d{4}-\d{2}-\d{2}$/.test(values[0]) || Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0,10)!==values[0] || !values[1].trim() || values[1].length>120)) throw Object.assign(new Error('日期或動作名稱無效'),{status:400});
  const energy=workoutEnergy({...input,set_details:details,duration_min:values[6]},getProfile(userId).weight_kg);
  const id=input.requestId;
  if(id!==undefined && (typeof id!=='string' || !/^[a-zA-Z0-9-]{16,80}$/.test(id))) throw Object.assign(new Error('儲存識別碼無效'),{status:400});
  const hash=createHash('sha256').update(JSON.stringify([...values,input.calories_kcal ?? null,input.met ?? null])).digest('hex');
  const db=getDb(userId);
  const existing=id && db.prepare('SELECT * FROM workout_save_requests WHERE request_id=?').get(id);
  if(existing) {
    const legacyHash=input.calories_kcal==null && input.met==null ? createHash('sha256').update(JSON.stringify(values)).digest('hex') : null;
    if(existing.payload_hash!==hash && existing.payload_hash!==legacyHash) throw Object.assign(new Error('同一筆儲存請求不可更換內容'),{status:409});
    const row=getWorkout(userId,existing.workout_id);
    if(!row) throw Object.assign(new Error('這份紀錄已被刪除，不會重新新增'),{status:409});
    return row;
  }
  if(id) db.exec('BEGIN IMMEDIATE');
  try {
    const r=db.prepare(`INSERT INTO workouts (date,exercise,category,sets,reps,weight_kg,duration_min,rpe,source,note,set_details,calories_kcal,calorie_meta) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...values,energy.calories_kcal,JSON.stringify(energy.calorie_meta));
    const rowId=Number(r.lastInsertRowid);
    if(id) {db.prepare('INSERT INTO workout_save_requests VALUES (?,?,?)').run(id,hash,rowId);db.exec('COMMIT');}
    return getWorkout(userId,rowId);
  } catch(err) {if(id) db.exec('ROLLBACK');throw err;}
}

export const getWorkout = (userId, id) =>
  decodeWorkout(getDb(userId).prepare('SELECT * FROM workouts WHERE id = ?').get(id));

export function listWorkouts(userId, { from, to, date, limit = 500 } = {}) {
  const db = getDb(userId);
  if (date) return db.prepare('SELECT * FROM workouts WHERE date = ? ORDER BY id').all(date).map(decodeWorkout);
  if (from && to) return db.prepare('SELECT * FROM workouts WHERE date BETWEEN ? AND ? ORDER BY date DESC, id DESC').all(from, to).map(decodeWorkout);
  return db.prepare('SELECT * FROM workouts ORDER BY date DESC, id DESC LIMIT ?').all(limit).map(decodeWorkout);
}

/** 日期導覽不受紀錄筆數上限限制。 */
export const listWorkoutDates = userId => getDb(userId).prepare('SELECT date, COUNT(*) items FROM workouts GROUP BY date ORDER BY date DESC').all();

/** 最近一次相同動作，含同日已儲存紀錄；補登時不讀未來日期。 */
export function workoutHistory(userId,{exercise,category,before=today()}={}){
 const parsed=new Date(before+'T00:00:00Z');
 if(typeof exercise!=='string' || !exercise.trim() || exercise.length>120 || typeof category!=='string' || typeof before!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(before) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0,10)!==before)throw Object.assign(new Error('動作或日期無效'),{status:400});
 const db=getDb(userId),filters=[exercise.trim(),category,before];
 const workout=decodeWorkout(db.prepare('SELECT * FROM workouts WHERE exercise=? AND category=? AND date<=? ORDER BY date DESC,id DESC LIMIT 1').get(...filters)) || null;
 const personalBest=db.prepare(`WITH candidates AS (
  SELECT w.id,w.date,
   CASE WHEN j.key IS NOT NULL THEN CAST(json_extract(j.value,'$.weight_kg') AS REAL) ELSE w.weight_kg END weight_kg,
   CASE WHEN j.key IS NOT NULL THEN CAST(json_extract(j.value,'$.reps') AS INTEGER) ELSE w.reps END reps,
   CASE WHEN j.key IS NOT NULL THEN CAST(json_extract(j.value,'$.duration_s') AS REAL) WHEN w.reps>0 THEN 0 ELSE w.duration_min*60/MAX(1,w.sets) END duration_s,
   COALESCE(CAST(j.key AS INTEGER)+1,1) set_number
  FROM workouts w LEFT JOIN json_each(w.set_details) j
  WHERE w.exercise=? AND w.category=? AND w.date<=?
 ) SELECT * FROM candidates WHERE weight_kg>0 AND (reps>0 OR duration_s>0)
 ORDER BY weight_kg DESC,reps DESC,date DESC,id DESC,set_number ASC LIMIT 1`).get(...filters) || null;
 return {workout,personalBest};
}

export function updateWorkout(userId, id, patch) {
  const cur = getWorkout(userId, id);
  if (!cur) return null;
  let w = { ...cur, ...patch };
  const changesAggregate=['sets','reps','weight_kg','duration_min'].some(key=>patch[key]!==undefined && Number(patch[key])!==Number(cur[key]));
  const details=patch.set_details!==undefined ? Array.isArray(patch.set_details) && !patch.set_details.length ? [] : normalizeSets(patch.set_details) : changesAggregate ? [] : cur.set_details;
  w=normalizeCardio(w,details);
  if(details.length) {w.sets=details.length;w.reps=details[0].reps;w.weight_kg=details[0].weight_kg;w.duration_min=details.some(s=>s.duration_s>0) ? details.reduce((sum,s)=>sum+s.duration_s,0)/60 : num(w.duration_min);}
  const energy=workoutEnergy({...w,set_details:details,calories_kcal:patch.calories_kcal,met:patch.met},getProfile(userId).weight_kg,cur);
  getDb(userId).prepare(`
    UPDATE workouts SET date=?, exercise=?, category=?, sets=?, reps=?, weight_kg=?, duration_min=?, rpe=?, note=?, set_details=?,calories_kcal=?,calorie_meta=?
    WHERE id=?
  `).run(str(w.date), str(w.exercise), str(w.category), num(w.sets), num(w.reps),
         num(w.weight_kg), num(w.duration_min), num(w.rpe), str(w.note), JSON.stringify(details),energy.calories_kcal,JSON.stringify(energy.calorie_meta), id);
  return getWorkout(userId, id);
}

export const deleteWorkout = (userId, id) =>
  getDb(userId).prepare('DELETE FROM workouts WHERE id = ?').run(id).changes > 0;

/* ---------------- 體重 ---------------- */

/** 沒填就是 null，不要變成 0 —— 0 公分的腰圍會把趨勢圖毀掉 */
const optNum = (v) => (v === undefined || v === null || v === '' ? null : num(v));

export function addWeight(userId, input) {
  const db = getDb(userId);
  const date = str(input.date, today());
  const weight = optNum(input.weight_kg);

  // 體重是 NOT NULL，所以那一天還沒有紀錄時必須給。
  // 已經有紀錄則可以只補圍度（「腰圍 72」），舊體重會保留。
  const existing = db.prepare('SELECT weight_kg FROM weights WHERE date = ?').get(date);
  if (weight == null && !existing) {
    throw Object.assign(new Error(`${date} 還沒有體態紀錄，第一筆請至少填體重`), { status: 400 });
  }

  db.prepare(`
    INSERT INTO weights (date, weight_kg, body_fat_pct, waist_cm, note)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      weight_kg    = COALESCE(excluded.weight_kg, weights.weight_kg),
      -- 選填欄位用 COALESCE：早上記體重、晚上再量腰圍時，
      -- 不要因為第二次沒帶體脂就把早上那筆抹掉。
      -- （對話裡說「腰圍 72」時只會帶一個值，靠這行才不會損資料）
      body_fat_pct = COALESCE(excluded.body_fat_pct, weights.body_fat_pct),
      waist_cm     = COALESCE(excluded.waist_cm,     weights.waist_cm),
      note         = CASE WHEN excluded.note = '' THEN weights.note ELSE excluded.note END
  `).run(date, weight ?? existing.weight_kg, optNum(input.body_fat_pct),
         optNum(input.waist_cm), str(input.note));
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
    SELECT COUNT(*) items, COALESCE(SUM(calories_kcal),0) calories_kcal, SUM(CASE WHEN calories_kcal IS NULL THEN 1 ELSE 0 END) calories_missing, COALESCE(SUM(${workoutVolumeSql}),0) volume_kg,
           COALESCE(SUM(duration_min),0) duration_min,
           COALESCE(SUM(CASE WHEN category='cardio' THEN duration_min ELSE 0 END),0) cardio_min
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
    SELECT date, COUNT(*) items, COALESCE(SUM(calories_kcal),0) calories_kcal, SUM(CASE WHEN calories_kcal IS NULL THEN 1 ELSE 0 END) calories_missing, SUM(${workoutVolumeSql}) volume_kg, SUM(duration_min) duration_min, SUM(CASE WHEN category='cardio' THEN duration_min ELSE 0 END) cardio_min
    FROM workouts WHERE date BETWEEN ? AND ? GROUP BY date ORDER BY date
  `).all(from, to);
  const weights = db.prepare(`
    SELECT date, weight_kg, body_fat_pct, waist_cm
    FROM weights WHERE date BETWEEN ? AND ? ORDER BY date
  `).all(from, to);
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
    ? training.map(r => `  ${r.date}: ${r.items} 項，已記消耗熱量 ${Math.round(r.calories_kcal || 0)}kcal（${r.calories_missing || 0}筆待補時間／熱量），有氧 ${Math.round(r.cardio_min || 0)} 分鐘，總計時 ${Math.round(r.duration_min || 0)} 分鐘`).join('\n')
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
    lines.push(todayW.map(w => `  ${w.exercise} `+(w.category==='cardio' ? `有氧 ${w.duration_min}分鐘` : w.set_details.length ? w.set_details.map((s,i)=>`第${i+1}組 ${s.duration_s ? `${s.duration_s}秒` : `${s.weight_kg}kg×${s.reps}下`}`).join('、') : `${w.sets}x${w.reps} @${w.weight_kg}kg`)).join('\n'));
  }

  if (weights.length) lines.push(`體重紀錄：${weights.map(w => `${w.date} ${w.weight_kg}kg`).join('、')}`);

  const s = dailySummary(userId, to);
  lines.push(`\n今天（${to}）目前累計：${Math.round(s.nutrition.kcal)}kcal / 蛋白質 ${Math.round(s.nutrition.protein_g)}g，距離目標還差 ${s.remaining.kcal}kcal、蛋白質 ${s.remaining.protein_g}g。`);
  return lines.join('\n');
}
