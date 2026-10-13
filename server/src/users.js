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
  {
    id: 'guest',
    name: '訪客',
    envKey: 'PASSWORD_GUEST',
    // seed 是建資料庫時才用的一次性初始值，而且每個欄位都必填，
    // 所以這裡放一組中性的暫定數字。登入之後直接跟教練說
    //「我 30 歲、170 公分、65 公斤、想增肌」就會重算每日目標
    //（update_goal 工具），不必改這個檔案。
    seed: {
      sex: 'female', age: 30, height_cm: 170, weight_kg: 65,
      goal_weight_kg: 65, activity: 1.55, goal: 'maintain',
      notes: '這是通用帳號，身體數據還是暫定的。跟教練說一次真實的年齡、身高、體重與目標，牠會重算。',
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
