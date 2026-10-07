<script setup>
import { computed, watch } from 'vue';
import { session } from '../auth.js';

const model = defineModel({ type: String, required: true });   // 目前正在看誰的紀錄

// 保險：若頁面在 session 就緒前就掛載，model 會是 null，這裡補回自己
watch(() => session.user, (id) => {
  if (id && !session.users.some(u => u.id === model.value)) model.value = id;
}, { immediate: true });

// 只有兩人以上才需要切換
const show = computed(() => session.users.length > 1);
const viewingOther = computed(() => model.value !== session.user);
</script>

<template>
  <div v-if="show" class="tabs">
    <button
      v-for="u in session.users"
      :key="u.id"
      :class="{ on: model === u.id }"
      @click="model = u.id"
    >
      {{ u.name }}<span v-if="u.id === session.user" class="me">（我）</span>
    </button>
    <span v-if="viewingOther" class="badge small">唯讀</span>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: .4rem;
  align-items: center;
  margin-bottom: .2rem;
}
.tabs button {
  padding: .3rem .8rem;
  font-size: .85rem;
  border-radius: 999px;
  color: var(--muted);
}
.tabs button.on {
  background: var(--accent-dim);
  border-color: #3d8a67;
  color: #eafff4;
}
.me { opacity: .7; font-size: .78rem; }
</style>
