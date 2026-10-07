<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  title: { type: String, required: true },
  points: { type: Array, required: true },   // [{ label, value }]
  type: { type: String, default: 'bar' },    // 'bar' | 'line'
  color: { type: String, default: '#199e70' },
  unit: { type: String, default: '' },
  target: { type: Number, default: 0 },
  targetLabel: { type: String, default: '目標' },
  decimals: { type: Number, default: 0 },
});

const W = 640, H = 180;
const PAD = { t: 14, r: 10, b: 22, l: 38 };
const plotW = W - PAD.l - PAD.r;
const plotH = H - PAD.t - PAD.b;

const hasData = computed(() => props.points.some(p => p.value > 0));

const scale = computed(() => {
  const vals = props.points.map(p => p.value).filter(v => Number.isFinite(v));
  let max = Math.max(props.target || 0, ...vals, 1);
  let min = props.type === 'line' ? Math.min(...vals) : 0;
  const pad = (max - min) * 0.12 || max * 0.05;
  max += pad;
  if (props.type === 'line') min = Math.max(0, min - pad);
  return { min, max };
});

const y = (v) => PAD.t + plotH - ((v - scale.value.min) / (scale.value.max - scale.value.min)) * plotH;
const fmt = (v) => Number(v).toFixed(props.decimals);

/** 條狀圖：細長方塊、資料端 4px 圓角、相鄰間隔 2px */
const bars = computed(() => {
  const n = props.points.length || 1;
  const step = plotW / n;
  const w = Math.max(3, step - 2); // 2px 間隔
  return props.points.map((p, i) => {
    const x = PAD.l + i * step + (step - w) / 2;
    const top = p.value > 0 ? y(p.value) : PAD.t + plotH;
    const h = Math.max(p.value > 0 ? 2 : 0, PAD.t + plotH - top);
    const r = Math.min(4, w / 2, h);
    return {
      ...p, i, x, w, top, h, cx: x + w / 2,
      d: `M${x},${PAD.t + plotH} L${x},${top + r} Q${x},${top} ${x + r},${top}
          L${x + w - r},${top} Q${x + w},${top} ${x + w},${top + r}
          L${x + w},${PAD.t + plotH} Z`,
    };
  });
});

/** 折線圖：2px 線寬、>=8px 節點 */
const line = computed(() => {
  const pts = props.points
    .map((p, i) => ({ ...p, i }))
    .filter(p => Number.isFinite(p.value) && p.value > 0);
  const n = props.points.length || 1;
  const step = plotW / n;
  const coords = pts.map(p => ({ ...p, cx: PAD.l + p.i * step + step / 2, cy: y(p.value) }));
  return { coords, d: coords.map((c, i) => `${i ? 'L' : 'M'}${c.cx},${c.cy}`).join(' ') };
});

const marks = computed(() => (props.type === 'line' ? line.value.coords : bars.value));

const gridLines = computed(() => {
  const { min, max } = scale.value;
  const ticks = 3;
  return Array.from({ length: ticks + 1 }, (_, i) => {
    const v = min + ((max - min) * i) / ticks;
    return { v, y: y(v) };
  });
});

const hover = ref(null);
const tip = computed(() => {
  if (hover.value == null) return null;
  const m = marks.value.find(x => x.i === hover.value);
  if (!m) return null;
  const cx = props.type === 'line' ? m.cx : m.cx;
  return { ...m, cx, anchor: cx < W * 0.25 ? 'start' : cx > W * 0.75 ? 'end' : 'middle' };
});
</script>

<template>
  <figure class="chart">
    <figcaption class="spread">
      <span>{{ title }}</span>
      <span v-if="tip" class="small readout">
        {{ tip.label }} · <b :style="{ color }">{{ fmt(tip.value) }}{{ unit }}</b>
      </span>
    </figcaption>

    <div v-if="!hasData" class="empty small">還沒有資料</div>

    <svg v-else :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="title" @mouseleave="hover = null">
      <!-- 格線與刻度（弱化） -->
      <g class="grid">
        <line v-for="g in gridLines" :key="g.v" :x1="PAD.l" :x2="W - PAD.r" :y1="g.y" :y2="g.y" />
        <text v-for="g in gridLines" :key="'t' + g.v" :x="PAD.l - 6" :y="g.y + 3.5">{{ fmt(g.v) }}</text>
      </g>

      <!-- 目標參考線 -->
      <g v-if="target" class="target">
        <line :x1="PAD.l" :x2="W - PAD.r" :y1="y(target)" :y2="y(target)" />
        <text :x="W - PAD.r" :y="y(target) - 5" text-anchor="end">{{ targetLabel }} {{ fmt(target) }}{{ unit }}</text>
      </g>

      <!-- 資料標記 -->
      <template v-if="type === 'bar'">
        <path v-for="b in bars" :key="b.i" :d="b.d" :fill="color"
              :opacity="hover === null || hover === b.i ? 1 : 0.45" />
      </template>
      <template v-else>
        <path :d="line.d" fill="none" :stroke="color" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round" />
        <circle v-for="c in line.coords" :key="c.i" :cx="c.cx" :cy="c.cy" r="4.5"
                :fill="color" stroke="var(--surface)" stroke-width="2" />
      </template>

      <!-- 最後一點直接標示 -->
      <text v-if="marks.length" class="direct" :x="marks[marks.length - 1].cx"
            :y="(type === 'line' ? marks[marks.length - 1].cy : marks[marks.length - 1].top) - 9"
            text-anchor="middle">
        {{ fmt(marks[marks.length - 1].value) }}{{ unit }}
      </text>

      <!-- X 軸標籤：只標首尾，避免擁擠 -->
      <g class="axis">
        <text :x="PAD.l" :y="H - 6" text-anchor="start">{{ points[0]?.label }}</text>
        <text :x="W - PAD.r" :y="H - 6" text-anchor="end">{{ points[points.length - 1]?.label }}</text>
      </g>

      <!-- hover 指示線 -->
      <line v-if="tip" class="cross" :x1="tip.cx" :x2="tip.cx" :y1="PAD.t" :y2="PAD.t + plotH" />

      <!-- 透明熱區（比標記大，好點） -->
      <rect v-for="(p, i) in points" :key="'h' + i" class="hit"
            :x="PAD.l + (i * plotW) / points.length" :y="PAD.t"
            :width="plotW / points.length" :height="plotH"
            @mouseenter="hover = i" />
    </svg>
  </figure>
</template>

<style scoped>
.chart { margin: 0; }
figcaption {
  font-size: .85rem;
  color: var(--muted);
  margin-bottom: .35rem;
}
.readout b { font-variant-numeric: tabular-nums; }

svg { width: 100%; height: auto; display: block; overflow: visible; }

.grid line { stroke: var(--border); stroke-width: 1; }
.grid text { fill: var(--muted); font-size: 9px; text-anchor: end; }

.target line { stroke: var(--muted); stroke-width: 1; stroke-dasharray: 4 4; opacity: .8; }
.target text { fill: var(--muted); font-size: 9px; }

.direct { fill: var(--text); font-size: 10px; font-weight: 600; }
.axis text { fill: var(--muted); font-size: 9px; }

.cross { stroke: var(--muted); stroke-width: 1; opacity: .4; }
.hit { fill: transparent; cursor: crosshair; }
</style>
