<script setup>
import { ref, nextTick, onMounted } from 'vue';
import { api } from '../api.js';
import { session } from '../auth.js';

const password = ref('');
const error = ref('');
const busy = ref(false);
const input = ref(null);
const guestPassword = ref('');

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

/**
 * 以訪客身分試用：當場開一個新帳號並直接登入。
 *
 * 密碼顯示出來是為了讓人抄下來——下次要回到同一份紀錄只能靠它，
 * 不抄的話這個帳號就找不回來了。
 */
async function tryAsGuest() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const g = await api.guestLogin();
    // 只先把密碼顯示出來，**還不要** adoptSession()：那會讓 session.authed 變 true，
    // App.vue 立刻切離登入頁，這組只顯示一次的密碼就被畫面帶走了。
    // 等使用者按「抄好了」再真的進去。
    guestPassword.value = g.password;
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

/** 抄好密碼之後才真的進 App（cookie 在建立訪客時就已經發好了） */
async function enterApp() {
  busy.value = true;
  try {
    await adoptSession();
    guestPassword.value = '';
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

onMounted(() => input.value?.focus());
</script>

<template>
  <!-- 訪客建好了：密碼只有這一次看得到，按「知道了」才進 App -->
  <div v-if="guestPassword" class="gate">
    <div class="card box">
      <div class="hero">🔑</div>
      <h2>帳號開好了</h2>
      <p class="muted small">下次要回到同一份紀錄，就用這組密碼登入。</p>
      <code class="pw">{{ guestPassword }}</code>
      <p class="small" style="color: var(--danger)">這組密碼只會顯示這一次。</p>
      <button class="primary" :disabled="busy" @click="enterApp">抄好了，開始使用</button>
    </div>
  </div>

  <div v-else class="gate">
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

      <!-- 沒有密碼的人也能進來看看：當場開一個獨立帳號 -->
      <div class="or"><span>或</span></div>
      <button class="ghost" :disabled="busy" @click="tryAsGuest">
        {{ busy ? '準備中…' : '以訪客身分試用' }}
      </button>
      <p class="muted small foot">
        會開一個全新的帳號，有自己的飲食紀錄與寵物，不會看到別人的資料。
      </p>

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
