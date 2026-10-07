/**
 * 使用者清單。每個人一個獨立的 SQLite 檔案（server/data/fit-<id>.db），
 * 飲食、訓練、體重、對話、照片、個人檔案全部分開存，互不干擾。
 *
 * 2026-09-29：Martina 停止使用，從清單移除。
 *   她的資料庫 server/data/fit-martina.db 保留在原地不會被動到，
 *   要查舊資料用 ./db.sh martina <檢視>。
 *   要讓她回來，把下面註解掉的那段放回 USERS 即可（資料會原封不動接回去）。
 *
 * 2026-10-05：移除密碼登入。現在沒有身分驗證，一律當成 USERS[0]。
 *   要重新加上登入，不只是填個密碼而已——相關的程式碼（cookie、
 *   登入路由、登入畫面）都已經刪掉了，得重寫。
 */

export const USERS = [
  {
    id: 'eli',
    name: 'Eli',
    seed: {
      sex: 'male', age: 28, height_cm: 180, weight_kg: 77,
      goal_weight_kg: 82, activity: 1.55, goal: 'muscle_gain',
      notes: '體重與身高比例正常，目標是穩定增肌、控制體脂。',
    },
  },
  // {
  //   id: 'martina',
  //   name: 'Martina',
  //   seed: {
  //     sex: 'female', age: 27, height_cm: 155, weight_kg: 40,
  //     goal_weight_kg: 48, activity: 1.55, goal: 'muscle_gain',
  //     notes: '體重偏輕，目標是穩定增加肌肉量，優先把熱量與蛋白質吃滿。',
  //   },
  // },
];

/** 沒有登入機制，所有請求都當成這個人 */
export const ME = USERS[0].id;

export const userIds = () => USERS.map(u => u.id);

export const getUser = (id) => USERS.find(u => u.id === id) || null;

export const userName = (id) => getUser(id)?.name ?? id;

/** 其他使用者（目前只剩一位，所以永遠是空陣列） */
export const otherUsers = (id) => USERS.filter(u => u.id !== id);
