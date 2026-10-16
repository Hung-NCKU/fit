<script setup>
import { RouterLink, RouterView, useRoute } from 'vue-router';
import {clearPageCache} from './page-cache.js';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { api } from './api.js';
import { session } from './auth.js';
import LoginView from './views/LoginView.vue';
import PhotoViewer from './components/PhotoViewer.vue';
import NotifyToggle from './components/NotifyToggle.vue';
import DeleteAccount from './components/DeleteAccount.vue';
import NewAccount from './components/NewAccount.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import UpdateNotice from './components/UpdateNotice.vue';
import {updateState} from './app-update.js';

const route = useRoute();
watch(()=>[session.user,session.authed],clearPageCache,{flush:'sync'});

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
  { to: '/', label: '寵物', icon: '🐾' },
  { to: '/chat', label: '教練', icon: '💬' },
  { to: '/today', label: '今日', icon: '🎯' },
  { to: '/workouts', label: '訓練', icon: '🏋️' },
  { to: '/meals', label: '飲食', icon: '🍚' },
];

const title = computed(() => tabs.find(t => t.to === route.path)?.label ?? '健身養寵');
const locked = computed(() => session.authRequired && !session.authed);
const chromeVisible=ref(false),headerEl=ref(null),navEl=ref(null);
const navHeight=ref(72);
let chromeTimer;
function hideChrome(){
  if(headerEl.value?.querySelector('.sheet')){chromeTimer=setTimeout(hideChrome,8000);return;}
  chromeVisible.value=false;
}
function showChrome(){
  if(!session.ready || locked.value)return;
  chromeVisible.value=true;clearTimeout(chromeTimer);chromeTimer=setTimeout(hideChrome,8000);
}
function toggleChrome(){
  if(chromeVisible.value && !headerEl.value?.querySelector('.sheet')){clearTimeout(chromeTimer);chromeVisible.value=false;}
  else showChrome();
}
function keepChrome(event){
  if(chromeVisible.value && event.target?.closest?.('.topbar,.tabbar'))showChrome();
}
const barObserver=new ResizeObserver(entries=>{
  for(const entry of entries){if(entry.target===navEl.value)navHeight.value=entry.target.getBoundingClientRect().height;}
});
watch([headerEl,navEl],([header,nav])=>{barObserver.disconnect();if(header)barObserver.observe(header);if(nav)barObserver.observe(nav);});
onMounted(()=>{document.addEventListener('click',keepChrome,true);document.addEventListener('keydown',keepChrome,true);});
onUnmounted(()=>{clearTimeout(chromeTimer);barObserver.disconnect();document.removeEventListener('click',keepChrome,true);document.removeEventListener('keydown',keepChrome,true);});

async function logout() {
  try {
    await api.logout();
  } catch (e) {
    window.alert(`登出失敗：${e.message}`);
    return;
  }
  session.authed = false;
  session.user = null;
  session.name = null;
  session.users = [];
  session.trial = false;
  session.guest = false;
}

onMounted(async () => {
  try {
    const s = await api.session();
    session.authRequired = s.authRequired;
    session.authed = s.authed;
    session.user = s.user;
    session.name = s.name;
    session.users = s.users || [];
    session.trial = Boolean(s.trial);
    session.guest = Boolean(s.guest);
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
  <ConfirmDialog />
  <UpdateNotice />
  <div class="shell" :inert="!!updateState.version" :class="{ 'chrome-auto': session.ready && !locked, 'chrome-hidden': !chromeVisible }">
    <div v-if="!session.ready" class="boot muted small">載入中…</div>

    <template v-else>
      <!-- 鎖住時只留一條窄列放安裝鈕：
           沒登入也要裝得起來，否則新手機要先登入才能裝 App -->
      <header v-if="locked" class="topbar gate">
        <span class="bell-spacer"></span>
        <button v-if="canShowInstall" class="icon install" @click="install">📲 安裝</button>
      </header>

      <header v-else id="app-topbar" ref="headerEl" class="topbar" :inert="!chromeVisible" :aria-hidden="!chromeVisible">
        <span class="logo"><img class="brand-icon" src="/icon-192.png?v=fitness-puppy-v1" alt="" /><span class="brand-copy"><b>健身養寵</b><span class="brand-subtitle">{{ title }}<template v-if="session.name"> · {{ session.name }}</template></span></span></span>
        <div class="header-tools">
        <DeleteAccount v-if="session.authed" />
        <NewAccount v-if="session.authed" />
        <NotifyToggle />
        <button v-if="canShowInstall" class="icon install" @click="install">📲 安裝</button>
        <button v-if="session.authRequired" class="icon logout" @click="logout">登出</button>
        </div>
      </header>

      <div v-if="showHint" class="hint">
        <div class="spread">
          <strong>手動安裝</strong>
          <button class="icon" @click="showHint = false">✕</button>
        </div>
        <p class="small muted">
          瀏覽器沒有主動跳出安裝提示。可能是<b>已經裝過了</b>（先看看桌面有沒有「健身養寵」圖示），
          或這個瀏覽器不支援。
        </p>
        <p class="small">
          Android Chrome：右上角 <b>⋮</b> → <b>加到主畫面</b> 或 <b>安裝應用程式</b><br>
          iPhone Safari：下方 <b>分享</b> → <b>加入主畫面</b>
        </p>
      </div>

      <LoginView v-if="locked" />

      <template v-else>
        <button class="chrome-handle chrome-handle-bottom" :style="{bottom:chromeVisible ? (navHeight+8)+'px' : 'max(8px, min(var(--safe-bottom), 12px))'}" :aria-expanded="chromeVisible" :aria-label="chromeVisible ? '收起功能列' : '展開功能列'" aria-controls="app-topbar app-tabbar" @click="toggleChrome"><span aria-hidden="true">{{ chromeVisible ? '⌄' : '⌃' }}</span></button>
        <main class="content">
          <RouterView v-slot="{ Component }">
            <component :is="Component" />
          </RouterView>
        </main>

        <nav id="app-tabbar" ref="navEl" class="tabbar" :inert="!chromeVisible" :aria-hidden="!chromeVisible" aria-label="頁面切換">
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

.chrome-auto .topbar {
  position:fixed;top:0;left:max(0px, calc((100% - 820px) / 2));width:min(100%,820px);z-index:30;
}
.chrome-auto .tabbar {
  position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:min(100%,820px);z-index:30;
}
.chrome-auto .topbar,.chrome-auto .tabbar { transition:opacity .18s ease,visibility .18s; }
.chrome-auto.chrome-hidden .topbar,.chrome-auto.chrome-hidden .tabbar { opacity:0;visibility:hidden;pointer-events:none; }
.chrome-auto .content { margin-top:var(--safe-top);margin-bottom:calc(44px + clamp(6px, var(--safe-bottom), 12px));padding-top:1rem;padding-bottom:1rem; }
@media(prefers-reduced-motion:reduce){.chrome-auto .topbar,.chrome-auto .tabbar{transition:none;}}
.chrome-handle {position:fixed;left:max(calc(8px + var(--safe-left)), calc((100% - 820px) / 2 + 8px));z-index:40;width:44px;height:44px;padding:0;border-radius:50%;font-size:1.4rem;font-weight:650;background:var(--surface);border:1px solid var(--border);box-shadow:var(--shadow-popover);touch-action:manipulation;}

:global(.shell:has(.topbar .sheet) .chrome-handle) {visibility:hidden;}
:global(html.app-keyboard .chrome-handle-bottom) {display:none;}
.boot { display: grid; place-items: center; height: 100%; padding-top: var(--safe-top); }

.topbar {
  display: flex;
  align-items: center;
  gap: .6rem;
  /* 上方多留狀態列的高度，並讓 topbar 的底色一路填到螢幕頂端，
     不然 iPhone 上時間與訊號會直接壓在「健身養寵」上面 */
  padding: calc(.75rem + var(--safe-top)) calc(1rem + var(--safe-right)) .75rem calc(1rem + var(--safe-left));
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  flex: 0 0 auto;
  position: relative;      /* 提醒設定面板以這裡為基準 */
}
.logo { display:inline-flex; align-items:center; gap:.55rem; letter-spacing:.02em; color:var(--text); min-width:0; }
.brand-icon { width:36px; height:36px; border-radius:11px; flex-shrink:0; }
.brand-copy { display:flex; flex-direction:column; gap:.28rem; min-width:0; line-height:1.15; }
.brand-copy b {font-size:.94rem;}
.brand-subtitle {font-size:.72rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px;letter-spacing:0;}
.header-tools { display:flex; align-items:center; justify-content:flex-end; gap:.25rem; margin-left:auto; flex-wrap:wrap; }

/* 品牌與分頁／使用者上下排列；窄螢幕讓右側操作列完整換行。 */
.topbar > * { flex: 0 0 auto; }
.topbar .logo { flex:1 1 120px; }
.topbar .header-tools {flex:0 1 auto;}
.topbar .logo { white-space: nowrap; }

@media (max-width: 460px) {
  .topbar { gap: .45rem; flex-wrap:wrap; }
  .brand-subtitle {max-width:120px;}
  .topbar .header-tools {max-width:100%;}
}

.content {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  padding: 1rem;
  padding-left: calc(1rem + var(--safe-left));
  padding-right: calc(1rem + var(--safe-right));
  -webkit-overflow-scrolling: touch;
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
  grid-template-columns: repeat(5, 1fr);
  border-top: 1px solid var(--border);
  background: var(--surface);
  padding-bottom: var(--safe-bottom);
  padding-left: var(--safe-left);
  padding-right: var(--safe-right);
}
:global(html.ios-installed .tabbar) {
  position:fixed;
  bottom:0;
  left:50%;
  transform:translateX(-50%);
  width:min(100%,820px);
  z-index:20;
}
:global(html.ios-installed .chrome-auto .tabbar) { padding-bottom:clamp(6px, var(--safe-bottom), 12px); }
:global(html.ios-installed .chrome-auto .content) { margin-top:var(--safe-top);padding-top:1rem;padding-bottom:1rem; }
:global(html.ios-installed .chrome-auto::before) { content:'';position:fixed;top:0;left:0;right:0;height:var(--safe-top);background:var(--surface);z-index:35;pointer-events:none; }
:global(html.ios-installed.app-keyboard .tabbar) { display:none; }
:global(html.app-keyboard .chrome-auto .content) { margin-bottom:0;padding-bottom:.75rem; }
.tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: .15rem;
  padding: .45rem 0 .5rem;
  color: var(--muted);
  font-size: .72rem;
}
.tab:hover { color: var(--text); }

/* 圖示本身是一塊可以上底色的區域 —— 選中時變成琥珀色圓角底，
   而不是畫一條上邊框。這是那個 App 分頁列最明顯的特徵。 */
.ico {
  font-size: 1.1rem;
  line-height: 1;
  padding: .3rem .8rem;
  border-radius: 12px;
  transition: background .15s;
}
.tab.router-link-exact-active { color: var(--accent); }
.tab.router-link-exact-active .ico { background: var(--accent-soft); }

@media (max-width: 520px) {
  .content {
    padding: .75rem;
    padding-left: calc(.75rem + var(--safe-left));
    padding-right: calc(.75rem + var(--safe-right));
  }
}
</style>
