<script setup>
import { ref, nextTick, onMounted } from 'vue';
import { api } from '../api.js';
import { session } from '../auth.js';

const password = ref('');
const error = ref('');
const busy = ref(false);
const input = ref(null);

async function submit() {
  if (!password.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await api.login(password.value);
    password.value = '';
    // 登入回應只有 user/name，users 清單要再問一次 session；
    // 缺了這步 session.user 會留在 null，下方「只看誰的紀錄」分頁會不對
    const s = await api.session();
    session.user = s.user;
    session.name = s.name;
    session.users = s.users || [];
    session.authed = s.authed;
  } catch (e) {
    error.value = e.message;
    await nextTick();
    input.value?.focus();
  } finally {
    busy.value = false;
  }
}

onMounted(() => input.value?.focus());
</script>

<template>
  <div class="gate">
    <div class="card box">
      <div class="hero">🏋️‍♀️</div>
      <h2>增肌教練</h2>
      <p class="muted small">請輸入密碼</p>

      <form @submit.prevent="submit">
        <input
          ref="input"
          v-model="password"
          type="password"
          autocomplete="current-password"
          placeholder="密碼"
          :disabled="busy"
        />
        <button class="primary" type="submit" :disabled="busy || !password">
          {{ busy ? '登入中…' : '登入' }}
        </button>
      </form>

      <div v-if="error" class="error">{{ error }}</div>
      <p class="muted small foot">輸入誰的密碼就以誰的身分登入（設定在 <code>server/.env</code>）</p>
    </div>
  </div>
</template>

<style scoped>
.gate {
  display: flex;
  align-items: center;
  justify-content: center;
  /* 上方可能有一條放安裝鈕的窄列，用 flex 填滿剩餘空間；
     寫 min-height:100% 會把整個畫面擐出捲軸 */
  flex: 1 1 auto;
  min-height: 0;
  padding: 1rem;
}
.box { width: 100%; max-width: 340px; text-align: center; }
.hero { font-size: 2.6rem; }
form { display: flex; flex-direction: column; gap: .6rem; margin-top: 1rem; }
.error { margin-top: .8rem; text-align: left; }
.foot { margin: 1rem 0 0; }
</style>
