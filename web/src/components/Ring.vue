<script setup>
import { computed } from 'vue';

/**
 * 環形進度。那個 App 把熱量與三大營養素都畫成環，是它最顯眼的視覺元素。
 * 用 SVG 的 stroke-dasharray 畫，不需要任何圖表函式庫。
 */
const props = defineProps({
  value: { type: Number, default: 0 },
  target: { type: Number, default: 0 },
  color: { type: String, default: 'var(--accent)' },
  size: { type: Number, default: 76 },
  width: { type: Number, default: 7 },
});

const R = computed(() => (props.size - props.width) / 2);
const C = computed(() => 2 * Math.PI * R.value);

/** 超過目標就畫滿，不要繞第二圈 */
const ratio = computed(() => {
  if (!props.target) return 0;
  return Math.max(0, Math.min(1, props.value / props.target));
});

const dash = computed(() => `${C.value * ratio.value} ${C.value}`);
const over = computed(() => props.target > 0 && props.value > props.target);
</script>

<template>
  <!-- 轉 -90 度讓起點在十二點鐘方向 -->
  <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" class="ring">
    <circle
      :cx="size / 2" :cy="size / 2" :r="R"
      fill="none" stroke="var(--surface-2)" :stroke-width="width"
    />
    <!-- ratio 為 0 時整條都不畫：stroke-linecap="round" 會在起點留下一個小圓點 -->
    <circle
      v-if="ratio > 0"
      :cx="size / 2" :cy="size / 2" :r="R"
      fill="none"
      :stroke="over ? 'var(--danger)' : color"
      :stroke-width="width"
      stroke-linecap="round"
      :stroke-dasharray="dash"
      :transform="`rotate(-90 ${size / 2} ${size / 2})`"
    />
    <foreignObject x="0" y="0" :width="size" :height="size">
      <div class="mid"><slot /></div>
    </foreignObject>
  </svg>
</template>

<style scoped>
.ring { display: block; flex: 0 0 auto; }
.ring circle { transition: stroke-dasharray .4s ease; }

.mid {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1.1;
}
</style>
