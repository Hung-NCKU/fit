import { reactive } from 'vue';

/** 全域登入狀態。API 收到 401 時會把 authed 設回 false，App.vue 就會切回登入畫面。 */
export const session = reactive({
  ready: false,
  authRequired: false,
  authed: false,
  user: null,      // 目前登入者的 id
  name: null,      // 顯示用的名字
  users: [],       // 所有使用者 [{ id, name }]
});

/** 另一位使用者（目前只有兩人） */
export const otherUser = () => session.users.find(u => u.id !== session.user) || null;

export function onUnauthorized() {
  session.authed = false;
  session.authRequired = true;
  session.ready = true;
}
