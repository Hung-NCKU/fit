import { createHash } from 'node:crypto';
import { getDb, getProfile, GOAL_LABEL } from './db.js';
import { listWorkouts } from './records.js';

export const COACH_TIME_ZONE = 'Asia/Taipei';
export function taipeiClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: COACH_TIME_ZONE, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', hourCycle:'h23',
  }).formatToParts(now).map(p => [p.type,p.value]));
  return { date:`${parts.year}-${parts.month}-${parts.day}`, hour:Number(parts.hour) };
}

// A fast, explicit starting plan. It never waits for Gemini or writes completed records.
// Profile targets remain the source of truth; these are suggestions, not measured intake.
export function buildCoachPlan(p) {
  const notes = String(p.notes || '');
  const bmi = p.weight_kg / (p.height_cm / 100) ** 2;
  const healthNotes=notes.replace(/(?:沒有|無|未)(?:受傷|疼痛|心臟病|腎臟病|糖尿病|懷孕)/g,'');
  const needsAssessment = p.age < 18 || /懷孕|孕期|術後|受傷|疼痛|心臟病|腎臟病|糖尿病/.test(healthNotes);
  const home = /徒手|無器材|沒器材/.test(notes);
  const vegetarian = /素食|全素|吃素|純素/.test(notes);
  const cautious = p.activity <= 1.375 || p.age >= 65;
  const days = cautious ? [1,4] : [1,3,5];
  const sets = cautious ? 2 : 3;
  const strength = home
    ? [{name:'椅子起立／徒手深蹲',sets,reps:'8–12'}, {name:'扶高台伏地挺身',sets,reps:'6–12'}, {name:'俯臥 W 提臂',sets:2,reps:'8–12'}, {name:'臀橋',sets,reps:'10–15'}, {name:'棒式',sets:2,reps:'15–30 秒'}]
    : [{name:'高腳杯深蹲',sets,reps:'8–12'}, {name:'平板啞鈴臥推',sets,reps:'8–12'}, {name:'坐姿滑輪划船',sets,reps:'8–12'}, {name:'臀橋',sets,reps:'10–15'}, {name:'棒式',sets:2,reps:'15–30 秒'}];
  const target = { kcal:p.target_kcal, protein:p.target_protein_g, carb:p.target_carb_g, fat:p.target_fat_g };
  const labels = ['早餐','午餐','晚餐','點心'];
  const ratios = [.25,.30,.30,.15];
  const menus = vegetarian
    ? ['燕麥＋無糖豆漿＋水果','糙米飯＋豆腐／豆類＋兩種蔬菜','地瓜／飯＋豆腐／天貝＋蔬菜','水果＋無糖豆漿，依今日差額調整份量']
    : ['全穀吐司／燕麥＋蛋／無糖豆漿＋水果','飯＋雞肉／豆腐＋兩種蔬菜','飯／地瓜＋魚／豆腐＋蔬菜','水果＋無糖豆漿，依今日差額調整份量'];
  const allocated = {kcal:0,protein:0};
  const meals = labels.map((name,i) => {
    const kcal = i === 3 ? target.kcal-allocated.kcal : Math.round(target.kcal*ratios[i]);
    const protein = i === 3 ? target.protein-allocated.protein : Math.round(target.protein*ratios[i]);
    allocated.kcal+=kcal; allocated.protein+=protein;
    return {name,kcal,protein,menu:menus[i]};
  });
  return { version:1, name:p.name, goal:GOAL_LABEL[p.goal], basis:`${p.age} 歲 · ${p.height_cm} cm · ${p.weight_kg} kg · 目標 ${p.goal_weight_kg} kg`,
    notes, needsAssessment, target, meals, days, strength,
    rationale:`依目前活動量先安排每週 ${days.length} 次全身訓練，隔天恢復；活動係數不是訓練經驗，先以入門強度開始。`,
    intensity:'熱身 5–10 分鐘；每組保留約 2–3 下餘力，組間休息 60–120 秒。全部組都能穩定完成次數上限，再小幅加重。',
    nutrition:needsAssessment ? '先確認健康狀況與個別飲食限制，再安排具體熱量和訓練。' : bmi < 18.5 ? '目前體重偏輕，優先規律進食與恢復，不再額外減少熱量；熱量目標可在個人設定調整。' : p.goal === 'fat_loss' ? '依現有熱量目標安排三餐，蛋白質分散吃；不要為補償前一餐而跳餐。' : '依現有熱量目標規律進食，蛋白質分散到三餐與點心。',
    assumptions:`這是依個人檔案建立的起始建議；${home?'採徒手動作':'尚未指定器材，暫以可使用啞鈴與滑輪規劃'}。餐點是搭配範例，標示的是每餐目標，實際份量需依營養標示調整；過敏與禁忌食物請先排除。可告訴教練你的器材、經驗、可運動日和飲食限制。` };
}

export function getCoachPlan(userId) {
  const p = getProfile(userId);
  const fingerprint = createHash('sha256').update(JSON.stringify({version:1,...p,updated_at:undefined,bmr:undefined,tdee:undefined})).digest('hex');
  const db = getDb(userId);
  const old = db.prepare('SELECT content FROM coach_plans WHERE fingerprint=?').get(fingerprint);
  if (old) return { ...JSON.parse(old.content),fingerprint };
  const plan = buildCoachPlan(p);
  db.prepare('INSERT OR IGNORE INTO coach_plans (fingerprint,content) VALUES (?,?)').run(fingerprint,JSON.stringify(plan));
  return {...plan,fingerprint};
}

const weekdays = ['日','一','二','三','四','五','六'];
function dietText(plan) {
  if (plan.needsAssessment) return plan.nutrition;
  return `每日目標 ${plan.target.kcal} kcal · 蛋白質 ${plan.target.protein}g · 碳水 ${plan.target.carb}g · 脂肪 ${plan.target.fat}g。\n` + plan.meals.map(m=>`- ${m.name}：目標 ${m.kcal} kcal／蛋白質 ${m.protein}g；${m.menu}`).join('\n') + `\n${plan.nutrition}`;
}
export function formatStarterPlan(plan) {
  if (plan.needsAssessment) return `**${plan.name} 的教練起始計畫**\n${plan.basis}\n個人檔案提到需要先確認的年齡或健康條件，暫不自動開立訓練與飲食處方。請先補充醫療限制、可做的運動與飲食需求，再與合適的專業人員確認。`;
  return `**${plan.name} 的${plan.goal}起始計畫**\n依據：${plan.basis}\n\n**每週訓練**\n${plan.rationale}\n週${plan.days.map(d=>weekdays[d]).join('、週')}：\n${plan.strength.map(e=>`- ${e.name}：${e.sets} 組 × ${e.reps}`).join('\n')}\n其他天：輕鬆走路與活動恢復；從可負擔的時間開始。\n${plan.intensity}\n\n**飲食安排**\n${dietText(plan)}\n\n${plan.assumptions}\n每日早上 08:00（台灣時間）會在這裡放入當日安排。${plan.notes?`\n已保留你的備註：${plan.notes}`:''}`;
}

export function formatDailyPlan(userId, plan, date) {
  const day = new Date(`${date}T12:00:00+08:00`).getUTCDay();
  const yesterday = new Date(`${date}T12:00:00+08:00`); yesterday.setUTCDate(yesterday.getUTCDate()-1);
  const previousDate = yesterday.toISOString().slice(0,10);
  const recent = listWorkouts(userId,{from:previousDate,to:date});
  const todayDone = recent.some(w=>w.date===date);
  const trainedYesterday = recent.some(w=>w.date===previousDate && w.category!=='cardio' && w.category!=='other');
  let training = plan.days.includes(day) ? plan.strength.map(e=>`- ${e.name}：${e.sets} 組 × ${e.reps}`).join('\n')+`\n${plan.intensity}` : '今天安排恢復：輕鬆走路 10–30 分鐘（依體力調整），活動肩膀與髖部，無須補做重量訓練。';
  if (trainedYesterday) training = '昨天有重量訓練紀錄，今天先安排恢復與輕鬆活動，避免連續重複全身重訓；若昨天只練局部，可告訴教練再調整。';
  if (todayDone) training = '今天已有運動紀錄，不再要求重做預設課表。可告訴教練完成內容與疲勞程度，再決定是否需要其他活動。';
  if (plan.needsAssessment) training = '先確認個人健康限制，今天不自動指定負重或強度；請補充可安全進行的活動。';
  return `**${date} 早安，${plan.name}！今天的飲食與運動**\n每日 08:00 提醒（台灣時間；離線時於恢復服務後補上當日訊息）。\n\n**今日運動**\n${training}\n\n**今日飲食**\n${dietText(plan)}\n\n以上是待執行建議，不代表你已吃過或練完。`;
}

// Message and receipt commit together. Restarts / multiple tabs cannot duplicate a delivery.
function deliver(userId,kind,key,content) {
  const db = getDb(userId);
  db.exec('BEGIN IMMEDIATE');
  try {
    if (db.prepare('SELECT 1 FROM coach_deliveries WHERE kind=? AND delivery_key=?').get(kind,key)) {db.exec('COMMIT');return false;}
    const result = db.prepare("INSERT INTO chat_messages (role,content,actions,image,model) VALUES ('assistant',?,'[]','','')").run(content);
    db.prepare('INSERT INTO coach_deliveries (kind,delivery_key,message_id) VALUES (?,?,?)').run(kind,key,Number(result.lastInsertRowid));
    db.exec('COMMIT'); return true;
  } catch(err) {db.exec('ROLLBACK');throw err;}
}
export function ensureCoachMessages(userId,now = new Date()) {
  const plan = getCoachPlan(userId);
  const initial = deliver(userId,'starter',plan.fingerprint,formatStarterPlan(plan));
  const {date,hour} = taipeiClock(now);
  const daily = hour >= 8 ? deliver(userId,'daily',date,formatDailyPlan(userId,plan,date)) : false;
  return {plan,initial,daily};
}
