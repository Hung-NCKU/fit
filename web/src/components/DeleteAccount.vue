<script setup>
import { confirmAction } from '../confirm.js';
import { computed } from 'vue';
import { api } from '../api.js';
import { session } from '../auth.js';

/**
 * 刪除目前登入的帳號。只有後台建立的帳號（session.guest）才會出現；
 * 固定帳號（Martina、Eli）不顯示，後端也會擋。
 */
const show = computed(() => session.guest);

async function remove() {
  const ok = await confirmAction(
    `要刪除「${session.name}」嗎？\n會刪掉所有飲食、訓練、寵物紀錄，無法復原。`,
  );
  if (!ok) return;
  try {
    await api.deleteAccount();
  } catch (e) {
    window.alert(`刪除失敗：${e.message || e}`);
    return;
  }
  // 回到登入頁
  session.authed = false;
  session.user = null;
  session.name = null;
  session.guest = false;
  session.trial = false;
}
</script>

<template>
  <button v-if="show" class="icon" title="刪除這個帳號" @click="remove">🗑 刪除帳號</button>
</template>
