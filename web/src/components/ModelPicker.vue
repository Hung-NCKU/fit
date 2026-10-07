<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';

/**
 * 輸入框旁的模型選單。
 * 清單面板用 absolute 定位，會對齊最近一個有 position 的祖先（ChatView 的 .composer），
 * 所以能撐滿整條輸入列的寬度，手機上不會被螢幕左緣切掉。
 */
const props = defineProps({
  models: { type: Array, default: () => [] },   // 後端 /api/models
  disabled: { type: Boolean, default: false },
});
const model = defineModel({ type: String, default: 'auto' });

const open = ref(false);
const root = ref(null);
const panel = ref(null);

const AUTO = {
  id: 'auto',
  label: '自動',
  speed: '推薦',
  note: '先用最快的 Flash-Lite，今天額度用完會自動換下一個模型。不知道選什麼就選這個。',
  available: true,
};

const options = computed(() => [AUTO, ...props.models]);
const current = computed(() => options.value.find(o => o.id === model.value) || AUTO);

// 按鈕空間很小，用短名稱：「3.6 Flash」→「3.6」、「Flash-Lite」→「Lite」
const short = (o) => (o.id === 'auto' ? '自動' : o.label.replace('Flash-Lite', 'Lite').replace(' Flash', ''));

function pick(o) {
  if (!o.available) return;
  model.value = o.id;
  open.value = false;
}

function onDocClick(e) {
  if (!open.value) return;
  if (root.value?.contains(e.target) || panel.value?.contains(e.target)) return;
  open.value = false;
}
const onKey = (e) => { if (e.key === 'Escape') open.value = false; };

onMounted(() => {
  document.addEventListener('click', onDocClick);
  window.addEventListener('keydown', onKey);
});
onUnmounted(() => {
  document.removeEventListener('click', onDocClick);
  window.removeEventListener('keydown', onKey);
});
</script>

<template>
  <button
    ref="root"
    class="picker"
    :class="{ on: open }"
    :disabled="disabled"
    :title="`目前模型：${current.label}`"
    aria-haspopup="listbox"
    :aria-expanded="open"
    @click="open = !open"
  >
    <span class="cur">{{ short(current) }}</span>
    <span class="caret">▾</span>
  </button>

  <div v-if="open" ref="panel" class="panel" role="listbox" aria-label="選擇模型">
    <div class="head small muted">選擇回答的模型</div>
    <button
      v-for="o in options"
      :key="o.id"
      class="opt"
      :class="{ sel: o.id === model, off: !o.available }"
      role="option"
      :aria-selected="o.id === model"
      :disabled="!o.available"
      @click="pick(o)"
    >
      <div class="row1">
        <span class="name">{{ o.label }}</span>
        <span v-if="o.speed" class="badge">{{ o.speed }}</span>
        <span v-if="!o.available" class="badge warn">今日額度已用完</span>
        <span v-if="o.id === model" class="check">✓</span>
      </div>
      <div class="note">{{ o.note }}</div>
    </button>
  </div>
</template>

<style scoped>
.picker {
  flex: 0 0 auto;
  height: 42px;
  padding: 0 .6rem;
  display: flex;
  align-items: center;
  gap: .25rem;
  font-size: .82rem;
  white-space: nowrap;
  color: var(--muted);
}
.picker.on { border-color: var(--accent-dim); color: var(--text); }
.cur { color: var(--text); }
.caret { font-size: .7rem; opacity: .7; }

.panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + .5rem);
  z-index: 20;
  max-height: min(60vh, 460px);
  overflow-y: auto;
  padding: .4rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 -8px 30px rgba(0, 0, 0, .45);
}
.head { padding: .3rem .5rem .4rem; }

.opt {
  display: block;
  width: 100%;
  text-align: left;
  padding: .6rem .7rem;
  margin: 0;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
}
.opt + .opt { margin-top: .2rem; }
.opt:hover:not(:disabled) { background: var(--surface-2); border-color: var(--border); }
.opt.sel { background: rgba(110, 231, 168, .08); border-color: var(--accent-dim); }
.opt.off { opacity: .45; cursor: not-allowed; }

.row1 { display: flex; align-items: center; gap: .45rem; flex-wrap: wrap; }
.name { font-weight: 600; font-size: .92rem; }
.check { margin-left: auto; color: var(--accent); font-weight: 700; }
.badge.warn { color: var(--warn); border-color: rgba(245, 169, 127, .4); }
.note {
  margin-top: .25rem;
  font-size: .8rem;
  line-height: 1.55;
  color: var(--muted);
}
</style>
