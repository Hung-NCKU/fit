<script setup>
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { computed, onMounted, ref } from 'vue';
import { api } from './api.js';
import { session } from './auth.js';
import LoginView from './views/LoginView.vue';
import PhotoViewer from './components/PhotoViewer.vue';
import NotifyToggle from './components/NotifyToggle.vue';

const route = useRoute();

/* ---------------- PWA 安裝 ---------------- */
// 事件由 index.html 的行內腳本接住（可能早在 Vue 掛載前就觸發），這裡只負責讀。
const installPrompt = ref(window.__installPrompt || null);
window.addEventListener('installprompt-ready', () => {
  installPrompt.value = window.__installPrompt;
});

// 已經是獨立視窗模式＝早就裝好了，不用再顯示安裝
const standalone = ref(
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true,
);

const showHint = ref(false);

// beforeinstallprompt 不觸發的原因很多（已安裝、瀏覽器不支援、Chrome 的互動門檻…），
// 只要不是獨立視窗模式就保留按鈕，按下去至少能告訴使用者怎麼手動安裝。
const canShowInstall = computed(() => !standalone.value);

async function install() {
  const p = installPrompt.value;
  if (!p) { showHint.value = true; return; }   // 沒有原生提示就給手動步驟
  installPrompt.value = null;
  window.__installPrompt = null;
  p.prompt();
  await p.userChoice;
}

const tabs = [
  { to: '/', label: '教練', icon: '💬' },
  { to: '/today', label: '今日', icon: '🎯' },
  { to: '/workouts', label: '訓練', icon: '🏋️' },
  { to: '/meals', label: '飲食', icon: '🍚' },
];

const title = computed(() => tabs.find(t => t.to === route.path)?.label ?? '增肌教練');
const locked = computed(() => session.authRequired && !session.authed);

async function logout() {
  await api.logout().catch(() => {});
  session.authed = false;
}

onMounted(async () => {
  try {
    const s = await api.session();
    session.authRequired = s.authRequired;
    session.authed = s.authed;
    session.user = s.user;
    session.name = s.name;
    session.users = s.users || [];
  } catch {
    session.authRequired = true;
    session.authed = false;
    // 連不到後端也要把畫面放出來，各頁面自己會顯示錯誤
  } finally {
    session.ready = true;
  }
});
</script>

<template>
  <div class="shell">
    <div v-if="!session.ready" class="boot muted small">載入中…</div>

    <template v-else>
      <!-- 鎖住時只留一條窄列放安裝鈕：
           沒登入也要裝得起來，否則新手機要先登入才能裝 App -->
      <header v-if="locked" class="topbar gate">
        <span class="bell-spacer"></span>
        <button v-if="canShowInstall" class="icon install" @click="install">📲 安裝</button>
      </header>

      <header v-else class="topbar">
        <span class="logo">增肌教練</span>
        <span class="muted small">{{ title }}</span>
        <span v-if="session.name" class="who">{{ session.name }}</span>
        <span class="bell-spacer"></span>
        <NotifyToggle />
        <button v-if="canShowInstall" class="icon install" @click="install">📲 安裝</button>
        <button v-if="session.authRequired" class="icon logout" @click="logout">登出</button>
      </header>

      <div v-if="showHint" class="hint">
        <div class="spread">
          <strong>手動安裝</strong>
          <button class="icon" @click="showHint = false">✕</button>
        </div>
        <p class="small muted">
          瀏覽器沒有主動跳出安裝提示。可能是<b>已經裝過了</b>（先看看桌面有沒有「增肌教練」圖示），
          或這個瀏覽器不支援。
        </p>
        <p class="small">
          Android Chrome：右上角 <b>⋮</b> → <b>加到主畫面</b> 或 <b>安裝應用程式</b><br>
          iPhone Safari：下方 <b>分享</b> → <b>加入主畫面</b>
        </p>
      </div>

      <LoginView v-if="locked" />

      <template v-else>
        <main class="content">
          <RouterView v-slot="{ Component }">
            <component :is="Component" />
          </RouterView>
        </main>

        <nav class="tabbar">
          <RouterLink v-for="t in tabs" :key="t.to" :to="t.to" class="tab">
            <span class="ico">{{ t.icon }}</span>
            <span class="lbl">{{ t.label }}</span>
          </RouterLink>
        </nav>
      </template>
    </template>

    <PhotoViewer />
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: 820px;
  margin: 0 auto;
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
}

.boot { display: grid; place-items: center; height: 100%; padding-top: var(--safe-top); }

.topbar {
  display: flex;
  align-items: baseline;
  gap: .6rem;
  /* 上方多留狀態列的高度，並讓 topbar 的底色一路填到螢幕頂端，
     不然 iPhone 上時間與訊號會直接壓在「增肌教練」上面 */
  padding: calc(.75rem + var(--safe-top)) calc(1rem + var(--safe-right)) .75rem calc(1rem + var(--safe-left));
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  flex: 0 0 auto;
  position: relative;      /* 提醒設定面板以這裡為基準 */
}
.logo { font-weight: 700; letter-spacing: .02em; }

.content {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 1rem;
  padding-left: calc(1rem + var(--safe-left));
  padding-right: calc(1rem + var(--safe-right));
  -webkit-overflow-scrolling: touch;
}

.who {
  margin-left: .2rem;
  padding: .1rem .5rem;
  font-size: .75rem;
  border-radius: 999px;
  background: var(--accent-dim);
  color: #eafff4;
}

.bell-spacer { margin-left: auto; }

/* 登入畫面上的窄列：沒有文字，只放安裝鈕 */
.topbar.gate { justify-content: flex-end; }

.install {
  font-size: .78rem;
  color: var(--accent);
  border-color: var(--accent-dim);
}
.install:hover { color: var(--accent); }

.hint {
  flex: 0 0 auto;
  margin: .6rem 1rem 0;
  padding: .7rem .9rem;
  background: var(--surface);
  border: 1px solid var(--accent-dim);
  border-radius: var(--radius);
}
.hint p { margin: .5rem 0 0; line-height: 1.7; }
.hint b { color: var(--accent); }
.logout { font-size: .78rem; }

.tabbar {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid var(--border);
  background: var(--surface);
  padding-bottom: var(--safe-bottom);
  padding-left: var(--safe-left);
  padding-right: var(--safe-right);
}
.tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: .1rem;
  padding: .5rem 0 .55rem;
  color: var(--muted);
  font-size: .72rem;
  border-top: 2px solid transparent;
}
.tab:hover { color: var(--text); }
.tab.router-link-exact-active { color: var(--accent); border-top-color: var(--accent); }
.ico { font-size: 1.15rem; line-height: 1.2; }

@media (max-width: 520px) {
  .content {
    padding: .75rem;
    padding-left: calc(.75rem + var(--safe-left));
    padding-right: calc(.75rem + var(--safe-right));
  }
}
</style>
