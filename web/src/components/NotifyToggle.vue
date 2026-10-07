<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api.js';

/**
 * 定時提醒的開關。訂閱資料存在後端，所以每台裝置都要各自打開一次。
 * iPhone 只有「加到主畫面」之後才收得到推播（Safari 的限制）。
 */
const cfg = ref({ enabled: false, publicKey: '', hours: [], devices: 0 });
const on = ref(false);
const busy = ref(false);
const msg = ref('');
const show = ref(false);

const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

const hoursText = computed(() => cfg.value.hours.map(h => `${h}:00`).join('、'));

async function refresh() {
  try {
    cfg.value = await api.pushConfig();
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    on.value = Boolean(sub) && Notification.permission === 'granted';
  } catch { /* 沒拿到設定就當成關閉 */ }
}

/** VAPID 公鑰是 base64url，要轉成 Uint8Array 才能給 pushManager */
function toBytes(base64url) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function enable() {
  busy.value = true;
  msg.value = '';
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      msg.value = perm === 'denied'
        ? '通知被封鎖了。要到瀏覽器的網站設定裡把通知改成「允許」才行。'
        : '沒有允許通知。';
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toBytes(cfg.value.publicKey),
      });
    }
    const r = await api.pushSubscribe(sub.toJSON());
    cfg.value.devices = r.devices;
    on.value = true;
    msg.value = `已開啟，${hoursText.value} 會提醒你熱量進度。`;
  } catch (e) {
    msg.value = `開啟失敗：${e.message}`;
  } finally {
    busy.value = false;
  }
}

async function disable() {
  busy.value = true;
  msg.value = '';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api.pushUnsubscribe(sub.endpoint);
      await sub.unsubscribe();
    }
    on.value = false;
    msg.value = '已關閉這台裝置的提醒。';
    await refresh();
  } catch (e) {
    msg.value = `關閉失敗：${e.message}`;
  } finally {
    busy.value = false;
  }
}

async function test() {
  busy.value = true;
  msg.value = '';
  try {
    const r = await api.pushTest();
    msg.value = r.sent
      ? `已送出測試通知（目前 ${r.eaten} kcal，這個時間建議 ${r.expected} kcal）`
      : '沒有送出——這台裝置還沒訂閱，或訂閱已失效。';
  } catch (e) {
    msg.value = `測試失敗：${e.message}`;
  } finally {
    busy.value = false;
  }
}

onMounted(refresh);
</script>

<template>
  <button v-if="cfg.enabled" class="icon bell" :class="{ on }" :title="on ? '定時提醒：開啟' : '定時提醒：關閉'"
          @click="show = !show">
    {{ on ? '🔔' : '🔕' }}
  </button>

  <div v-if="show" class="sheet">
    <div class="spread">
      <strong>熱量進度提醒</strong>
      <button class="icon" @click="show = false">✕</button>
    </div>

    <p class="small muted">
      每天 <b>{{ hoursText }}</b> 檢查一次今天吃了多少，落後或超標就推播到手機。
      目前這個帳號有 <b>{{ cfg.devices }}</b> 台裝置開啟。
    </p>

    <p v-if="!supported" class="small warn">這個瀏覽器不支援推播通知。</p>
    <p v-else-if="isIOS && !standalone" class="small warn">
      iPhone 要先用 Safari 的「分享 → 加入主畫面」把 App 裝起來，從主畫面開啟後才收得到通知。
    </p>

    <div class="row" style="margin-top:.7rem">
      <button v-if="!on" class="primary" :disabled="busy || !supported" @click="enable">開啟提醒</button>
      <template v-else>
        <button :disabled="busy" @click="test">立刻測試一次</button>
        <button class="ghost" :disabled="busy" @click="disable">關閉</button>
      </template>
    </div>

    <p v-if="msg" class="small note">{{ msg }}</p>
    <p class="small muted foot">電腦上的服務沒有執行的時候不會有通知。</p>
  </div>
</template>

<style scoped>
.bell { font-size: .95rem; }
.bell.on { color: var(--accent); }

.sheet {
  position: absolute;
  top: calc(100% + .4rem);
  right: calc(.6rem + var(--safe-right));
  z-index: 30;
  width: min(330px, calc(100vw - 1.6rem));
  padding: .8rem .9rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 10px 34px rgba(0, 0, 0, .5);
}
.sheet p { margin: .5rem 0 0; line-height: 1.6; }
.sheet b { color: var(--text); }
.warn { color: var(--warn); }
.note { color: var(--accent); }
.foot { opacity: .7; }
</style>
