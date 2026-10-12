<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';

/**
 * 寵物的舞台。
 *
 * 裡面跑的是一個 Godot 4 匯出的網頁版小遊戲（game/pet/），用逐格動畫
 * 與行為狀態機讓寵物自己活動。但 Godot 的 index.wasm 有 38 MB（壓縮後
 * 約 9 MB），而寵物是開啟 App 的第一頁——不能讓它擋住第一次繪製。
 *
 * 所以：
 *   1. 先把原本純 CSS 的靜態場景畫出來（<slot>），立刻就看得到東西
 *   2. 等這塊真的捲進畫面、而且閒置了一下，才去抓引擎
 *   3. 引擎跑起來才換成 canvas；抓不到或跑不動就一直留在靜態版
 *
 * 遊戲不知道任何業務規則，牠不知道什麼是蛋白質。網頁把「現在幾點、
 * 這種動物的作息曲線、心情、穿了什麼」放進 window.__petConfig，
 * 遊戲輪詢 rev 的變化。這樣改規則不必重新匯出遊戲。
 */
const props = defineProps({
  pet: { type: Object, required: true },
  state: { type: Object, default: null },
  behavior: { type: Object, default: null },
  scene: { type: String, default: '' },
  wear: { type: Object, default: () => ({}) },
  decor: { type: String, default: '' },
  bowl: { type: String, default: '' },
  // 引擎沒跑起來時顯示的「現在在做什麼」，由靜態作息算出來
  fallbackDoing: { type: String, default: '' },
});

const canvas = ref(null);
// 觀察外框而不是 canvas：canvas 包在 v-show="running" 裡，引擎還沒跑起來時
// 它是 display:none，沒有大小，IntersectionObserver 永遠不會回報它進入畫面。
const wrap = ref(null);
const running = ref(false);
const doing = ref('');
// 手機上沒有開發者工具可以點，網址加 ?petdebug 就把引擎的狀態印在畫面上
const debug = location.search.includes('petdebug');
const status = ref('等待捲到畫面內');
const dbg = ref('');

let engine = null;
let io = null;
let timer = null;
let poll = null;
let rev = 0;

/** 丟給遊戲的設定。rev 變了遊戲就會重讀。 */
const config = computed(() => {
  const now = new Date();
  return {
    base: location.origin,
    species: props.pet.species,
    size: props.behavior?.size ?? 0.28,
    acts: props.behavior?.acts ?? [],
    curve: props.behavior?.curve ?? [],
    anim: props.behavior?.anim ?? null,
    hour: now.getHours() + now.getMinutes() / 60,
    mood: props.state?.mood ?? 'ok',
    ateToday: !!props.state?.ateToday,
    scene: props.scene,
    wear: props.wear,
    decor: props.decor,
    bowl: props.bowl,
  };
});

function push() {
  window.__petConfig = { ...config.value, rev: ++rev };
}

// 換裝、換場景、心情變了都要讓遊戲知道
watch(config, push, { deep: true });

/** 引擎在不在。沒有匯出過（或還沒 build）就安靜地留在靜態版。 */
async function available() {
  try {
    const r = await fetch('/petgame/index.js', { method: 'HEAD' });
    return r.ok;
  } catch {
    return false;
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('載入失敗'));
    document.head.appendChild(s);
  });
}

async function boot() {
  if (engine || !canvas.value) return;
  status.value = '檢查引擎…';
  if (!(await available())) { status.value = '沒有匯出過遊戲'; return; }
  try {
    status.value = '載入 index.js…';
    if (!window.Engine) await loadScript('/petgame/index.js');
    push();
    engine = new window.Engine({
      canvas: canvas.value,
      // 匯出時的相對路徑是對著 /petgame/，但我們的頁面在 /，要給絕對路徑
      executable: '/petgame/index',
      mainPack: '/petgame/index.pck',
      // 0 = Godot 完全不碰畫布尺寸，用 HTML 上寫死的 640×400。
      //
      // 2（adaptive）會把畫布設成 CSS 尺寸 × 像素密度，遊戲裡 get_viewport_rect()
      // 就拿到兩三千的數字，所有按比例算的版面會整個爆掉。
      // 1（project）尺寸雖然對，但它會連 CSS 寬高一起寫死成 640px，
      // 卡片明明有 800px 寬，畫面卻只佔左邊一塊。
      // 自己寫死解析度、再讓 CSS 用 width:100% 放大，兩個問題都沒有。
      canvasResizePolicy: 0,
      focusCanvas: false,      // 不要一載入就把鍵盤焦點搶走
      experimentalVK: false,
    });
    status.value = '下載 wasm 並啟動…';
    await engine.startGame();
    status.value = '執行中';
    running.value = true;
    // 遊戲把現在的動作寫在 window.__petDoing，拿來顯示在畫面下方
    poll = setInterval(() => {
      doing.value = window.__petDoing || '';
      dbg.value = window.__petDebug || '';
    }, 1000);
  } catch (e) {
    // 引擎跑不起來不是錯誤，靜態場景本來就能用
    console.warn('寵物動畫沒跑起來：', e.message);
    status.value = `啟動失敗：${e.message}`;
    engine = null;
  }
}

onMounted(() => {
  push();
  // 捲到了才載。IntersectionObserver 沒有的話就退回「晚一點載」
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) {
        io.disconnect();
        io = null;
        timer = setTimeout(boot, 400);
      }
    }, { rootMargin: '200px' });
    io.observe(wrap.value);
  } else {
    timer = setTimeout(boot, 1500);
  }
});

onUnmounted(() => {
  io?.disconnect();
  clearTimeout(timer);
  clearInterval(poll);
  // Godot 沒有乾淨的「關掉引擎」API，但離開這一頁時把 canvas 移掉就夠了
  engine = null;
  delete window.__petConfig;
});

defineExpose({ doing });
</script>

<template>
  <div ref="wrap" class="stage-wrap">
    <!-- id 是必要的：Godot 把畫布的 id 當成 Emscripten 的事件目標選擇器
         （'#' + canvas.id）。沒有 id 就變成 querySelector('#')，啟動時會丟
         "'#' is not a valid selector" 然後整個引擎起不來。 -->
    <canvas
      v-show="running" id="petgame-canvas" ref="canvas" class="godot"
      width="640" height="400"
    />
    <div v-show="!running" class="still"><slot /></div>
    <p v-if="doing || fallbackDoing" class="small muted doing">
      現在：{{ (running && doing) || fallbackDoing }}
    </p>
    <p v-if="debug" class="small muted doing">引擎：{{ status }} ｜ {{ dbg }}</p>
  </div>
</template>

<style scoped>
.stage-wrap { position: relative; }

.godot {
  display: block;
  /* !important ：Godot 的執行時有時會寫 inline 的寬高，
     不贏過它的話畫布會回到 640px 原尺寸，卡片右半邊空著。 */
  width: 100% !important;
  height: auto !important;
  aspect-ratio: 8 / 5;
  border-radius: var(--radius);
  background: var(--surface-2);
  /* 畫布本身不處理捲動，不然在手機上會卡住整頁 */
  touch-action: pan-y;
}

.doing { margin: .4rem 0 0; }
</style>
