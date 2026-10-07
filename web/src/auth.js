import { reactive } from 'vue';

/**
 * 全域的「我是誰」。沒有登入機制，啟動時打一次 /api/session 把名字填進來就好。
 */
export const session = reactive({
  ready: false,
  user: null,      // 目前使用者的 id
  name: null,      // 顯示用的名字
  users: [],       // 所有使用者 [{ id, name }]
});
