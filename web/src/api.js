import { onUnauthorized } from './auth.js';

const BASE = '/api';

async function request(path, options = {}) {
  const hasBody = options.body !== undefined && options.body !== null;

  let res;
  try {
    res = await fetch(BASE + path, {
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
  } catch {
    // fetch 連不上時只會丟 "Failed to fetch"，對使用者沒意義，換成看得懂的說明
    throw new Error('連不到伺服器。請確認電腦上的服務還在執行（./start.sh），網路也正常。');
  }

  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') {
    onUnauthorized();
    throw new Error('連線已過期，請重新登入');
  }
  if (!res.ok) throw new Error(data.error || `請求失敗（${res.status}）`);
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

  session: () => request('/session'),
  login: (password) => request('/login', { method: 'POST', body: { password } }),
  logout: () => request('/logout', { method: 'POST' }),

  getProfile: (user) => request('/profile' + qs({ user })),
  saveProfile: (body) => request('/profile', { method: 'PUT', body }),

  users: () => request('/users'),

  listMeals: (p) => request('/meals' + qs(p)),
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

  chatHistory: () => request('/chat/history'),
  sendChat: (message, image, model) => request('/chat', { method: 'POST', body: { message, image, model } }),
  models: () => request('/models'),

  pushConfig: () => request('/push/config'),
  pushSubscribe: (subscription) => request('/push/subscribe', { method: 'POST', body: { subscription } }),
  pushUnsubscribe: (endpoint) => request('/push/unsubscribe', { method: 'POST', body: { endpoint } }),
  pushTest: () => request('/push/test', { method: 'POST', body: {} }),
  clearChat: () => request('/chat/history', { method: 'DELETE' }),
};

export const photoUrl = (file, user) =>
  (file ? `/uploads/${file}` + (user ? `?user=${user}` : '') : '');

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
