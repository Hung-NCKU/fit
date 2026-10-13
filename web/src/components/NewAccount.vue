<script setup>
import { ref } from 'vue';
import { api } from '../api.js';
import { session } from '../auth.js';

/**
 * 建立正式帳號。
 *
 * 同一張表單兩種用途：
 *   還在試用（session.trial）→ 把目前這個訪客升級，試用時記的東西都留著
 *   已經是正式使用者        → 另外開一個新帳號，建好後顯示新密碼
 *
 * 身體數據一定要填：每日熱量與三大營養素是從它們算出來的，
 * 留著預設值等於一開始就給錯目標。
 */
const open = ref(false);
const busy = ref(false);
const error = ref('');
const done = ref(null);

const form = ref({
  name: '',
  sex: 'female',
  age: null,
  height_cm: null,
  weight_kg: null,
  goal_weight_kg: null,
  activity: 1.55,
  goal: 'muscle_gain',
});

const ACTIVITIES = [
  { v: 1.2, label: '幾乎不動' },
  { v: 1.375, label: '每週 1-3 天' },
  { v: 1.55, label: '每週 3-5 天' },
  { v: 1.725, label: '每週 6-7 天' },
];
const GOALS = [
  { v: 'muscle_gain', label: '增肌' },
  { v: 'maintain', label: '維持' },
  { v: 'fat_loss', label: '減脂' },
];

function start() {
  error.value = '';
  done.value = null;
  // 試用中的話，名字欄先留空讓他自己填（預設是「訪客 3」那種編號）
  form.value.name = session.trial ? '' : '';
  open.value = true;
}

async function submit() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const r = await api.createAccount(form.value);
    // 升級的話身分沒變、只是有了名字；開新帳號則要顯示密碼給對方
    const s = await api.session();
    session.user = s.user;
    session.name = s.name;
    session.trial = s.trial;
    session.users = await api.users();
    done.value = r;
    open.value = false;
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <!-- 標題列空間很緊：試用中才寫完整的「建立帳號」（那是主要的行動呼籲），
       已經是正式使用者的話縮成「＋ 帳號」就好 -->
  <button class="icon add" :title="session.trial ? '建立帳號' : '新增使用者'" @click="start">
    {{ session.trial ? '建立帳號' : '＋ 帳號' }}
  </button>

  <!-- 表單 -->
  <div v-if="open" class="sheet" @click.self="open = false">
    <div class="card stack panel">
      <div class="spread">
        <h3 style="margin:0">{{ session.trial ? '建立你的帳號' : '新增使用者' }}</h3>
        <button class="icon" @click="open = false">取消</button>
      </div>

      <p v-if="session.trial" class="small muted" style="margin:0">
        你現在是訪客，關掉就沒了。填完就會變成正式帳號，剛剛記的東西都會留著。
      </p>

      <label class="f">
        <span class="small muted">名稱</span>
        <input v-model="form.name" maxlength="20" placeholder="顯示在分頁上的名字" />
      </label>

      <div class="row two">
        <label class="f">
          <span class="small muted">性別</span>
          <select v-model="form.sex">
            <option value="female">女</option>
            <option value="male">男</option>
          </select>
        </label>
        <label class="f">
          <span class="small muted">年齡</span>
          <input v-model.number="form.age" type="number" inputmode="numeric" placeholder="28" />
        </label>
      </div>

      <div class="row two">
        <label class="f">
          <span class="small muted">身高（公分）</span>
          <input v-model.number="form.height_cm" type="number" inputmode="decimal" placeholder="170" />
        </label>
        <label class="f">
          <span class="small muted">體重（公斤）</span>
          <input v-model.number="form.weight_kg" type="number" inputmode="decimal" placeholder="65" />
        </label>
      </div>

      <label class="f">
        <span class="small muted">目標體重（公斤）</span>
        <input v-model.number="form.goal_weight_kg" type="number" inputmode="decimal" placeholder="70" />
      </label>

      <label class="f">
        <span class="small muted">想要的體態</span>
        <div class="row seg">
          <button
            v-for="g in GOALS" :key="g.v"
            :class="{ on: form.goal === g.v }"
            @click="form.goal = g.v"
          >{{ g.label }}</button>
        </div>
      </label>

      <label class="f">
        <span class="small muted">每週運動幾天</span>
        <select v-model.number="form.activity">
          <option v-for="a in ACTIVITIES" :key="a.v" :value="a.v">{{ a.label }}</option>
        </select>
      </label>

      <div v-if="error" class="error">{{ error }}</div>

      <button class="primary" :disabled="busy" @click="submit">
        {{ busy ? '建立中…' : '建立帳號' }}
      </button>
      <p class="small muted" style="margin:0">
        熱量與蛋白質目標會依這些數字算出來，之後可以再跟教練說要調整。
      </p>
    </div>
  </div>

  <!-- 建好了 -->
  <div v-if="done" class="sheet" @click.self="done = null">
    <div class="card stack panel">
      <h3 style="margin:0">{{ done.name }} 建好了</h3>
      <template v-if="done.password">
        <p class="small muted" style="margin:0">把這組密碼給對方，他用它登入就是自己的帳號。</p>
        <code class="pw">{{ done.password }}</code>
        <p class="small" style="margin:0; color: var(--danger)">密碼只會顯示這一次。</p>
      </template>
      <p v-else class="small muted" style="margin:0">
        從現在開始這是你的正式帳號，密碼還是試用開始時給你的那一組。
      </p>
      <button class="primary" @click="done = null">知道了</button>
    </div>
  </div>
</template>

<style scoped>
.add {
  font-size: .78rem;
  white-space: nowrap;
  color: var(--accent);
  border-color: var(--accent-dim);
}

/* 三選一的按鈕組。PetView 也有一份同樣的樣式，但那是 scoped 的，
   跨不到這裡——選到哪一個完全看不出來。 */
.seg { gap: .4rem; }
.seg button { flex: 1; border-color: transparent; background: var(--surface-2); }
.seg button.on { background: var(--accent-soft); color: var(--accent); }

/* 蓋在整個畫面上的淡出層。表單欄位多，用抽屜式比塞進頁面裡好讀。 */
.sheet {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(0, 0, 0, .6);
  overflow-y: auto;
}
.panel { width: 100%; max-width: 380px; }
.f { display: flex; flex-direction: column; gap: .25rem; }
.two { gap: .6rem; }
.two .f { flex: 1; min-width: 0; }
.pw {
  display: block;
  padding: .7rem;
  border-radius: 12px;
  background: var(--surface-2);
  font-size: 1.1rem;
  letter-spacing: .04em;
  user-select: all;
}
</style>
