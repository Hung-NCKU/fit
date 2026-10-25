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
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform==='MacIntel' && navigator.maxTouchPoints>1;
const permission=ref(window.Notification?.permission || 'unsupported');
async function registration() {
  let timeout;
  try {return await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('通知服務未就緒，請關閉 App 後重新開啟再試')),12000);})]);}
  finally {clearTimeout(timeout);}
}

const hoursText = computed(() => cfg.value.hours.map(h => `${h}:00`).join('、'));

async function refresh() {
  try {
    cfg.value = await api.pushConfig();
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    permission.value=window.Notification?.permission || 'unsupported';
    on.value = Boolean(sub) && permission.value === 'granted';
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
    permission.value=perm;
    if (perm !== 'granted') {
      msg.value = perm === 'denied'
        ? isIOS ? '通知已被拒絕。請到 iPhone「設定 → 通知 → 健身養寵」開啟允許通知，再回來重試。' : '通知被封鎖了，請到瀏覽器的網站設定允許通知。'
        : '沒有允許通知。';
      return;
    }
    const reg = await registration();
    msg.value='正在連線通知服務…';
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
    msg.value = `已開啟，${hoursText.value} 會提醒你熱量進度，台灣時間 08:00 與 00:00 另有教練訊息通知。`;
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
    const reg = await registration();
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
    const reg=await registration(),sub=await reg.pushManager.getSubscription();
    if(!sub) {on.value=false;msg.value='這台裝置沒有訂閱，請重新開啟提醒。';return;}
    await api.pushSubscribe(sub.toJSON());
    const r = await api.pushTest(sub.endpoint);
    msg.value = r.sent
      ? '推播服務已接受這台裝置的測試通知。請查看鎖定畫面／通知中心；這不代表手機已顯示。'
      : r.errors?.length ? `推播遭拒：${r.errors.map(e=>e.status+' '+e.code).join('、')}。請保留此訊息供排查。` : '這台裝置的訂閱已失效，請關閉提醒再重新開啟。';
  } catch (e) {
    msg.value = `測試失敗：${e.message}`;
  } finally {
    busy.value = false;
  }
}

async function testDisplay() {
  busy.value=true;msg.value='';
  try {const reg=await registration();await reg.showNotification('健身養寵・手機顯示測試',{body:'看到這則代表手機顯示通知正常，再測試伺服器推播。',icon:'/icon-192.png',tag:'fit-local-test'});msg.value='已請手機顯示本機通知，請查看通知中心。若沒有，請檢查設定中的允許通知、專注模式與通知摘要。';}
  catch(e) {msg.value='手機顯示測試失敗：'+e.message;}
  finally {busy.value=false;}
}
onMounted(refresh);
</script>

<template>
  <button v-if="cfg.enabled" class="icon bell" :class="{ on }" :title="on ? '定時提醒：開啟' : '定時提醒：關閉'"
          @click="show = !show">
    <span aria-hidden="true">{{ on ? '🔔' : '🔕' }}</span> 通知提醒
  </button>

  <div v-if="show" class="sheet">
    <div class="spread">
      <strong>教練與飲食提醒</strong>
      <button class="icon" @click="show = false">✕</button>
    </div>

    <p class="small muted">
      台灣時間每天 <b>08:00</b> 通知今日教練安排，<b>00:00</b> 通知前一天回顧，點通知可開啟教練對話。<br />
      每天 <b>{{ hoursText }}</b> 檢查一次今天吃了多少，落後或超標就推播到手機。
      目前這個帳號有 <b>{{ cfg.devices }}</b> 台裝置開啟。
    </p>

    <p v-if="isIOS && !standalone" class="small warn">請從主畫面開啟健身養寵，才能啟用 iPhone 通知。</p>
    <p v-else-if="!supported" class="small warn">這個瀏覽器不支援推播通知。</p>
    <p v-else-if="isIOS && !standalone" class="small warn">
      iPhone 要先用 Safari 的「分享 → 加入主畫面」把 App 裝起來，從主畫面開啟後才收得到通知。
    </p>

    <div class="row wrap" style="margin-top:.7rem">
      <button v-if="!on" class="primary" :disabled="busy || !supported || isIOS && !standalone" @click="enable">開啟提醒</button>
      <template v-else>
        <button :disabled="busy" @click="testDisplay">測試手機顯示</button>
        <button :disabled="busy" @click="test">立刻測試一次</button>
        <button :disabled="busy" @click="enable">重新連線</button>
        <button class="ghost" :disabled="busy" @click="disable">關閉</button>
      </template>
    </div>

    <p class="small muted">通知權限：{{ permission==='granted' ? '已允許' : permission==='denied' ? '已拒絕' : permission==='default' ? '尚未授權' : '目前環境不支援' }} · {{ standalone ? '主畫面 App' : '瀏覽器' }}</p>
    <p v-if="msg" class="small note" role="status">{{ msg }}</p>
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
  box-shadow: var(--shadow-popover);
}
.sheet p { margin: .5rem 0 0; line-height: 1.6; }
.sheet b { color: var(--text); }
.warn { color: var(--warn); }
.note { color: var(--accent); }
.foot { color: var(--muted); }
</style>
