<script setup>
import {onMounted,onUnmounted,ref,watch,nextTick} from 'vue';
import {updateState,watchAppUpdates,reloadUpdatedApp} from '../app-update.js';
const panel=ref(null);watch(()=>updateState.version,async version=>{if(version){await nextTick();panel.value?.focus();}});
let stop;onMounted(()=>{stop=watchAppUpdates();});onUnmounted(()=>stop?.());
</script>
<template>
  <div v-if="updateState.version" class="update-cover" role="dialog" aria-modal="true" aria-labelledby="update-title">
    <section ref="panel" class="update-box" tabindex="-1">
      <h2 id="update-title">已推出新版，請重新載入</h2>
      <p>更新後才能繼續使用，已儲存的紀錄與登入狀態會保留。尚未送出的輸入會被清除。</p>
      <p v-if="updateState.pendingWrites" role="status">正在儲存或處理訊息，完成後即可更新，請勿關閉。</p>
      <button class="primary" :disabled="updateState.pendingWrites>0 || updateState.reloading" @click="reloadUpdatedApp">{{ updateState.reloading ? '更新中…' : '重新載入最新版' }}</button>
      <p v-if="updateState.error" role="alert">{{ updateState.error }}</p>
      <details><summary>App 與網頁版如何更新？</summary>
        <p>主畫面 App：點上方按鈕即可更新，不需要刪除或重新安裝。若仍顯示舊版，從手機多工畫面完全關閉，再由主畫面開啟。</p>
        <p>手機網頁版：點上方按鈕，或使用 Safari／Chrome 選單的「重新載入／重新整理」。</p>
        <p>電腦網頁版：點上方按鈕，或按 Ctrl＋R（Mac：⌘＋R）。若仍是舊版，Windows 按 Ctrl＋Shift＋R，Mac 按 ⌘＋Shift＋R。</p>
      </details>
    </section>
  </div>
</template>
<style scoped>
.update-cover{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:calc(1rem + env(safe-area-inset-top,0px)) 1rem calc(1rem + env(safe-area-inset-bottom,0px));background:#41362499;overflow:auto;overscroll-behavior:contain}.update-box{width:min(100%,440px);max-height:100%;overflow:auto;background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:1.2rem;box-shadow:var(--shadow-popover)}h2{font-size:1.1rem;margin-top:0}p{line-height:1.7;font-size:.85rem}button{width:100%;margin:.4rem 0 1rem}summary{cursor:pointer;font-weight:600;font-size:.85rem}
</style>
