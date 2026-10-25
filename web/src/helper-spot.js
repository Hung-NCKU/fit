/**
 * 浮動小幫手按鈕的停靠位置。
 *
 * 位置記成「哪一側 + 高度比例」而不是像素座標：手機轉向、鍵盤把視窗推高、
 * 或下次換成桌機視窗時，比例還留在原來的相對位置，存下來的座標會跑到畫面外。
 *
 * 垂直座標交給 CSS calc() 去算，安全區域與 dvh 都讓瀏覽器自己量；
 * 水平一律用 left（右側也算成 left），這樣左右換邊時 left 可以補間，
 * 放開後是滑過去貼齊，而不是跳過去。
 *
 * 這裡只算數字與 CSS 字串、不碰 DOM，才能單獨測。
 */
export const BTN = 52;   // 按鈕直徑，跟 CookView 的 CSS 一致
export const GAP = 12;   // 離視窗邊界的距離
export const SLOP = 6;   // 手指難免抖，位移小於這個距離仍然算點擊

const clamp01 = v => Math.min(1, Math.max(0, v));

/** 放開時按鈕左上角的位置 → 貼齊後的停靠點 */
export function snapSpot({ x, y, width, height }) {
  const span = height - BTN - GAP * 2;
  return {
    side: x + BTN / 2 < width / 2 ? 'left' : 'right',
    // 視窗矮到放不下一顆按鈕時 span 會是 0 或負的，別讓它變成 NaN
    ratio: span > 0 ? clamp01((y - GAP) / span) : 0,
  };
}

/** 存下來的值不一定還合理（改過版本、被人手改過），收不回來就回預設位置 */
export function parseSpot(raw) {
  const saved = typeof raw === 'string' ? safeParse(raw) : raw;
  if (!saved || (saved.side !== 'left' && saved.side !== 'right')) return null;
  if (!Number.isFinite(saved.ratio)) return null;
  return { side: saved.side, ratio: clamp01(saved.ratio) };
}

function safeParse(raw) { try { return JSON.parse(raw); } catch { return null; } }

/** 按鈕上緣的 CSS 長度 */
export function topCss(ratio) {
  const span = `max(0px, 100dvh - var(--safe-top) - var(--safe-bottom) - ${BTN + GAP * 2}px)`;
  return `calc(var(--safe-top) + ${GAP}px + ${clamp01(ratio)} * ${span})`;
}

export function toggleStyle(spot) {
  if (!spot) return undefined;        // 沒拖過：照 CSS 的右下角
  return {
    // 固定定位的 100% 是視窗寬度且不含捲軸，100vw 會把按鈕推到捲軸底下
    left: spot.side === 'left'
      ? `max(${GAP}px, var(--safe-left))`
      : `calc(100% - ${BTN}px - max(${GAP}px, var(--safe-right)))`,
    right: 'auto', bottom: 'auto',
    top: topCss(spot.ratio),
  };
}

/** 問答視窗貼著按鈕：按鈕在上半就往下開，在下半就往上開，高度收在剩下的空間裡 */
export function panelStyle(spot, gap = 10) {
  if (!spot) return undefined;
  const top = topCss(spot.ratio);
  if (spot.ratio < 0.5) {
    const panelTop = `calc(${top} + ${BTN + gap}px)`;
    return { top: panelTop, bottom: 'auto',
      maxHeight: `calc(100dvh - ${panelTop} - ${GAP}px - var(--safe-bottom))` };
  }
  return { bottom: `calc(100dvh - ${top} + ${gap}px)`, top: 'auto',
    maxHeight: `calc(${top} - ${gap + GAP}px - var(--safe-top))` };
}
