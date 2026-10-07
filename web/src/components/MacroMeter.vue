<script setup>
import { computed } from 'vue';

const props = defineProps({
  label: { type: String, required: true },
  value: { type: Number, required: true },
  target: { type: Number, required: true },
  unit: { type: String, default: 'g' },
  color: { type: String, default: '#199e70' },
});

const pct = computed(() => (props.target ? Math.min(100, (props.value / props.target) * 100) : 0));
const over = computed(() => props.target && props.value > props.target * 1.1);
const left = computed(() => Math.round(props.target - props.value));
</script>

<template>
  <div class="meter">
    <div class="spread">
      <span class="small muted">{{ label }}</span>
      <span class="val">
        <b>{{ Math.round(value) }}</b><span class="muted small"> / {{ Math.round(target) }}{{ unit }}</span>
      </span>
    </div>
    <div class="track">
      <div class="fill" :style="{ width: pct + '%', background: over ? 'var(--warn)' : color }"></div>
    </div>
    <div class="small muted">
      {{ left > 0 ? `還差 ${left}${unit}` : `已達標，超出 ${-left}${unit}` }}
    </div>
  </div>
</template>

<style scoped>
.meter { display: flex; flex-direction: column; gap: .25rem; }
.val { font-variant-numeric: tabular-nums; font-size: .9rem; }
.track {
  height: 8px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 999px;
  transition: width .3s ease;
}
</style>
