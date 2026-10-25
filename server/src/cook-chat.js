import { generateContent, partsToText } from './gemini.js';
import { DINNER_SHARE, recipeById, servedRecipe } from '../../shared/meal-plan.js';
import { getProfile } from './db.js';
import { getPlan } from './meal-plan.js';

/**
 * 煮飯頁的小幫手。
 *
 * 跟教練同一個模型，但刻意不給工具、也不存對話：這裡問的是「蝦仁可以換成什麼」、
 * 「電鍋沒有要怎麼辦」這種當下的問題，答完就算了。要寫入紀錄請按「煮好了，記一餐」
 * ——讓一個隨口問問的小視窗能改資料庫，風險跟價值不成比例。
 *
 * 上下文由前端帶上來（最近幾輪），伺服器只負責擋長度。
 */
const MAX_TURNS = 8;
const MAX_QUESTION = 500;

const invalid = (message) => Object.assign(new Error(message), { status: 400 });

/** 把目前看的那道菜、以及這個人的條件寫進系統提示，答案才接得上畫面 */
export function cookSystemPrompt(userId, recipeId) {
  const p = getProfile(userId);
  const targets = { kcal: p?.target_kcal || 0, protein_g: p?.target_protein_g || 0 };
  const settings = getPlan(userId);
  const lines = [
    '你是這個健身 App 裡「煮飯」頁的料理小幫手。用繁體中文回答，台灣的食材與用語。',
    '回答要短：三到五句，或條列三到五點。使用者是站在廚房裡問的，不要長篇大論。',
    '可以回答食材替換、刀工火候、保存、備料順序、份量換算、食物安全（例如肉要熟到幾度）。',
    '不確定的事就說不確定，不要編造營養數字；需要精確熱量時請對方以食譜上的數值為準。',
    '你沒有任何修改紀錄的能力。使用者若想把這餐記下來，請他按畫面上的「煮好了，記一餐」。',
  ];

  if (targets.kcal) {
    lines.push(`這個人的每日目標是 ${targets.kcal} kcal、蛋白質 ${targets.protein_g} g；`
      + `晚餐約抓四成，也就是 ${Math.round(targets.kcal * DINNER_SHARE)} kcal、`
      + `${Math.round(targets.protein_g * DINNER_SHARE)} g。`);
  }
  if (settings.diets?.length) lines.push(`飲食需求：${settings.diets.join('、')}，建議不要牴觸。`);
  if (settings.equipment?.length) lines.push(`家裡有的設備：${settings.equipment.join('、')}。`);

  const r = recipeById(Number(recipeId));
  if (r) {
    const served = servedRecipe(r, targets);
    lines.push(
      '使用者正在看這道菜，優先針對它回答：',
      JSON.stringify({
        名稱: r.name,
        設備: r.equipment,
        時間: `${r.time} 分鐘`,
        份量: `${served.portion} 人份`,
        熱量: `${served.servedKcal} kcal`,
        蛋白質: `${served.servedProtein} g`,
        食材: r.ingredients.map(([n, q, u]) => `${n} ${Math.round(q * served.portion * 10) / 10}${u}`),
        做法: r.steps,
      }),
    );
  }
  return lines.join('\n');
}

export async function askCook(userId, { question, recipeId = null, history = [], model = null } = {}, opts = {}) {
  const text = String(question ?? '').trim();
  if (!text) throw invalid('請先輸入問題');
  if (text.length > MAX_QUESTION) throw invalid(`問題最多 ${MAX_QUESTION} 個字`);
  if (!Array.isArray(history)) throw invalid('對話紀錄格式不正確');

  const contents = [
    ...history.slice(-MAX_TURNS).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.text ?? '').slice(0, 2000) }],
    })).filter(m => m.parts[0].text),
    { role: 'user', parts: [{ text }] },
  ];

  const result = await generateContent({
    contents,
    systemInstruction: cookSystemPrompt(userId, recipeId),
    preferModel: model,
    // 比教練短：這是站在爐子前面問的，等太久不如自己查
    deadline: Date.now() + Number(process.env.COOK_TIMEOUT_MS ?? 45_000),
    signal: opts.signal,
  });
  return { answer: partsToText(result.candidate.content?.parts), model: result.model };
}
