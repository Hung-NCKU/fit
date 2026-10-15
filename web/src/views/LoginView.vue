<script setup>
import { ref, nextTick, onMounted } from 'vue';
import { api } from '../api.js';
import { session } from '../auth.js';

const password = ref('');
const error = ref('');
const busy = ref(false);
const input = ref(null);

/** 登入成功之後把 session 補齊。登入回應只有 user/name，users 清單要再問一次。 */
async function adoptSession() {
  const s = await api.session();
  session.user = s.user;
  session.name = s.name;
  session.users = s.users || [];
  session.authed = s.authed;
  session.trial = Boolean(s.trial);
  session.guest = Boolean(s.guest);
}

/** 訪客直接開始試用；登出時清除試用資料。 */
async function tryAsGuest() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await api.guestLogin();
    await adoptSession();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function submit() {
  if (!password.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await api.login(password.value);
    password.value = '';
    await adoptSession();
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
      <img class="hero" src="/icon-192.png?v=fitness-puppy-v1" alt="拿啞鈴健身的垂耳狗" />
      <h2>健身養寵</h2>
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

      <!-- 沒有密碼的人也能進來看看：當場開一個獨立帳號 -->
      <div class="or"><span>或</span></div>
      <button class="ghost" :disabled="busy" @click="tryAsGuest">
        {{ busy ? '準備中…' : '以訪客身分試用' }}
      </button>
      <p class="muted small foot">
        不用提供密碼或 Gemini API 金鑰，直接開始試用。試用中可建立帳號保留紀錄；未建立帳號就登出，會刪除試用紀錄。
      </p>

      <p class="muted small foot">輸入你的登入密碼，即可回到原本的帳號。</p>
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
.hero { width:104px; height:104px; border-radius:26px; margin:0 auto .7rem; box-shadow:0 6px 18px #80501e15; }
form { display: flex; flex-direction: column; gap: .6rem; margin-top: 1rem; }

/* 「或」兩側各一條線 */
.or {
  display: flex;
  align-items: center;
  gap: .6rem;
  margin: 1rem 0 .6rem;
  color: var(--muted);
  font-size: .85rem;
}
.or::before, .or::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--line, rgba(255, 255, 255, .12));
}

.ghost {
  width: 100%;
  background: transparent;
  border: 1px solid var(--accent);
  color: var(--accent);
}

.pw {
  display: block;
  margin: 1rem 0 .4rem;
  padding: .7rem;
  border-radius: 12px;
  background: var(--surface-2);
  font-size: 1.15rem;
  letter-spacing: .04em;
  user-select: all;   /* 點一下整組選起來，手機好複製 */
}
.error { margin-top: .8rem; text-align: left; }
.foot { margin: 1rem 0 0; }
</style>
