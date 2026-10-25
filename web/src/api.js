import {invalidatePageCache,clearPageCache} from './page-cache.js';
import {updateState} from './app-update.js';
import { onUnauthorized } from './auth.js';
import { recordFeedback } from './pet-feedback.js';

const BASE = '/api';

async function request(path, options = {}) {
  const writing=['POST','PUT','PATCH','DELETE'].includes(options.method);
  if(writing)updateState.pendingWrites++;
  try{return await performRequest(path,options);}finally{if(writing)updateState.pendingWrites--;}
}
async function performRequest(path, options = {}) {
  const hasBody = options.body !== undefined && options.body !== null;

  let res;
  try {
    res = await fetch(BASE + path, {
      // 問模型的兩條路徑要給久一點：教練會跑工具所以最久，料理小幫手只問一輪
      signal: options.signal || AbortSignal.timeout(
        path === '/chat' ? 90_000 : path === '/meal-plan/ask' ? 60_000 : 15_000,
      ),
      credentials: 'same-origin',
      ...options,
      // 只有真的帶 body 才宣告 JSON：Fastify 對「content-type 是 JSON 但 body 空的」
      // 會回 400 FST_ERR_CTP_EMPTY_JSON_BODY，DELETE 與登出就是這樣壞掉的
      headers: {
        ...(hasBody ? { 'content-type': 'application/json' } : {}),
        ...options.headers,
      },
      body: hasBody ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new Error('伺服器回應逾時，請稍後再試。');
    }
    // fetch 連不上時只會丟 "Failed to fetch"，對使用者沒意義，換成看得懂的說明
    throw new Error('連不到伺服器。請確認電腦上的服務還在執行（./start.sh），網路也正常。');
  }

  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') {
    clearPageCache();
    onUnauthorized();
    throw new Error('連線已過期，請重新登入');
  }
  if (!res.ok) throw Object.assign(new Error(data.error || `請求失敗（${res.status}）`), { status: res.status });
  if(['POST','PUT','PATCH','DELETE'].includes(options.method))invalidatePageCache(path);
  if (['POST','PATCH'].includes(options.method) && /^\/(meals|workouts|weights)(\/\d+)?$/.test(path)) {
    recordFeedback(path.startsWith('/meals') ? 'meal' : path.startsWith('/workouts') ? 'workout' : 'weight');
  }
  return data;
}

const qs = (params) => {
  const s = new URLSearchParams(
    Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ).toString();
  return s ? `?${s}` : '';
};

export const api = {
  health: () => request('/health'),
  coachPlan: () => request('/chat/plan'),

  session: () => request('/session'),
  login: (password) => request('/login', { method: 'POST', body: { password } }),
  logout: () => request('/logout', { method: 'POST' }),

  getProfile: (user) => request('/profile' + qs({ user })),
  saveNutritionTargets: body=>request('/profile/nutrition-targets',{method:'PUT',body}),
  saveProfile: (body) => request('/profile', { method: 'PUT', body }),

  users: () => request('/users'),

  // 以訪客身分試用：當場開一個帳號並直接登入（不用先登入就能打）。
  // 回應裡的密碼只有這一次拿得到，要顯示給使用者抄下來。
  guestLogin: () => request('/guest', { method: 'POST' }),
  // 建立正式帳號：試用中就升級自己，否則開一個新的
  createAccount: (profile) => request('/account', { method: 'POST', body: profile }),
  deleteAccount: () => request('/account', { method: 'DELETE' }),
  deleteGuest: (id) => request(`/guests/${id}`, { method: 'DELETE' }),

  listMeals: (p) => request('/meals' + qs(p)),
  mealPage: (date,user) => request('/meals/page'+qs({date,user})),
  mealDates: (user) => request('/meals/dates' + qs({ user })),
  addMeal: (body) => request('/meals', { method: 'POST', body }),
  updateMeal: (id, body) => request(`/meals/${id}`, { method: 'PATCH', body }),
  deleteMeal: (id) => request(`/meals/${id}`, { method: 'DELETE' }),

  listWorkouts: (p) => request('/workouts' + qs(p)),
  addWorkout: (body) => request('/workouts', { method: 'POST', body }),
  updateWorkout: (id, body) => request(`/workouts/${id}`, { method: 'PATCH', body }),
  deleteWorkout: (id) => request(`/workouts/${id}`, { method: 'DELETE' }),

  listWeights: (user) => request('/weights' + qs({ user })),
  addWeight: (body) => request('/weights', { method: 'POST', body }),
  deleteWeight: (id) => request(`/weights/${id}`, { method: 'DELETE' }),

  daily: (date, user) => request('/summary/daily' + qs({ date, user })),
  range: (days, user) => request('/summary/range' + qs({ days, user })),

  chatBookmarks: before=>request('/chat/bookmarks'+qs({before})),
  chatQuestion: id=>request('/chat/questions/'+encodeURIComponent(id)),
  chatHistory: () => request('/chat/history'),
  sendChat: (message, image, model, requestId, retry = false) => request('/chat', { method: 'POST', body: { message, image, model, requestId, retry } }),
  chatStatus: id => request(`/chat/requests/${encodeURIComponent(id)}`),
  cancelChat: id => request(`/chat/requests/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  models: () => request('/models'),

  pet: (user) => request('/pet' + qs({ user })),

  // 一週晚餐規劃。每個寫入都回傳整份最新狀態，前端不必自己合併
  mealPlan: (user) => request('/meal-plan' + qs({ user })),
  updateMealPlan: (body) => request('/meal-plan', { method: 'PATCH', body }),
  generateMealPlan: () => request('/meal-plan/generate', { method: 'POST' }),
  swapMealPlanDay: (day) => request('/meal-plan/swap', { method: 'POST', body: { day } }),
  cookRecipe: (recipeId) => request('/meal-plan/cook', { method: 'POST', body: { recipeId } }),
  // 料理小幫手：上下文由前端帶，問答不留在伺服器
  askCook: (question, recipeId, history) =>
    request('/meal-plan/ask', { method: 'POST', body: { question, recipeId, history } }),
  arrangeDecor: (item, position, expected) => request('/pet/room', { method:'PATCH', body:{ item, position, expected } }),
  restoreRoom: (items, expected) => request('/pet/room', { method:'PUT', body:{ items, expected } }),
  movePet: (petKey, position) => request('/pet/position', { method:'PATCH', body:{ petKey, position } }),
  adoptPet: (species, name) => request('/pet', { method: 'POST', body: { species, name } }),
  // confirm 要帶目前這隻的名字，伺服器會核對 —— 這是唯一不可復原的操作
  replacePet: (species, name, confirm) =>
    request('/pet/replace', { method: 'POST', body: { species, name, confirm } }),
  purchasePet: (species, name, requestId) => request('/pet/purchase', { method: 'POST', body: { species, name, requestId } }),
  interactPet: (petKey,user) => request('/pet/interact'+qs({user}),{method:'POST',body:{petKey}}),
  selectPet: (petKey) => request('/pet/select', { method: 'POST', body: { petKey } }),
  renamePet: (petKey, name) => request('/pet/name', { method: 'PATCH', body: { petKey, name } }),
  buyItem: (item, petKey) => request('/pet/buy', { method: 'POST', body: { item, petKey } }),
  // 賣回商店，退半價
  sellItem: (item) => request('/pet/sell', { method: 'POST', body: { item } }),
  equipItem: (item, petKey) => request('/pet/equip', { method: 'POST', body: { item, petKey } }),
  unequipSlot: (slot, petKey) => request('/pet/equip', { method: 'POST', body: { slot, petKey } }),

  pushConfig: () => request('/push/config'),
  pushSubscribe: (subscription) => request('/push/subscribe', { method: 'POST', body: { subscription } }),
  pushUnsubscribe: (endpoint) => request('/push/unsubscribe', { method: 'POST', body: { endpoint } }),
  pushTest: endpoint => request('/push/test', { method: 'POST', body: {endpoint} }),
  clearChat: () => request('/chat/history', { method: 'DELETE' }),
};

export const photoUrl = (file, user, size) =>
  (file ? `/uploads/${file}` + qs({ user, size }) : '');

/**
 * 手機直拍動輒 4000px / 5MB，先在瀏覽器縮到長邊 1280、JPEG 0.82 再上傳：
 * 省流量、Gemini 也不需要更高解析度就能辨識食物。
 */
export function compressImage(file, maxSide = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('讀取檔案失敗'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('這個檔案不是圖片，或格式不支援'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export const todayStr = () => new Date().toLocaleDateString('sv-SE');

export const MEAL_TYPES = {
  breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '點心',
};

export const CATEGORIES = {
  legs: '腿', chest: '胸', back: '背', shoulders: '肩',
  arms: '手臂', core: '核心', cardio: '有氧', other: '其他',
};
