/**
 * 使用者清單。每個人一個獨立的 SQLite 檔案（server/data/fit-<id>.db），
 * 飲食、訓練、體重、對話、照片、個人檔案全部分開存，互不干擾。
 * 只有「查看對方的訓練與飲食紀錄」是唯一的跨帳號讀取。
 *
 * 身分由密碼決定：輸入誰的密碼就以誰的身分登入（見 auth.js）。
 * envKey 指向 server/.env 裡的欄位；留空＝該帳號停用，無法登入。
 */

export const USERS = [
  {
    id: 'martina',
    name: 'Martina',
    envKey: 'PASSWORD_MARTINA',
    seed: {
      sex: 'female', age: 27, height_cm: 155, weight_kg: 40,
      goal_weight_kg: 48, activity: 1.55, goal: 'muscle_gain',
      notes: '體重偏輕，目標是穩定增加肌肉量，優先把熱量與蛋白質吃滿。',
    },
  },
  {
    id: 'eli',
    name: 'Eli',
    envKey: 'PASSWORD_ELI',
    seed: {
      sex: 'male', age: 28, height_cm: 180, weight_kg: 77,
      goal_weight_kg: 82, activity: 1.55, goal: 'muscle_gain',
      notes: '體重與身高比例正常，目標是穩定增肌、控制體脂。',
    },
  },
];

export const userIds = () => USERS.map(u => u.id);

export const getUser = (id) => USERS.find(u => u.id === id) || null;

export const userName = (id) => getUser(id)?.name ?? id;

/** 另一個人（目前只有兩位，之後要擴充再改成回傳陣列） */
export const otherUsers = (id) => USERS.filter(u => u.id !== id);

/** 該使用者目前設定的密碼；沒設定就回空字串（代表這個帳號停用） */
export const passwordOf = (user) => String(process.env[user.envKey] ?? '');

/** 有任何一個帳號設了密碼就代表要驗證 */
export const anyPasswordSet = () => USERS.some(u => passwordOf(u).length > 0);
