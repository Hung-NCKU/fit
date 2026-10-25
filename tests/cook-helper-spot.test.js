import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BTN, GAP, SLOP, panelStyle, parseSpot, snapSpot, toggleStyle,
} from '../web/src/helper-spot.js';

const PHONE = { width: 390, height: 844 };

describe('料理小幫手按鈕的拖曳停靠', () => {
  it('放開後貼到較近的那一側，高度留在放手的地方', () => {
    expect(snapSpot({ x: 20, y: 400, ...PHONE }).side).toBe('left');
    expect(snapSpot({ x: 300, y: 400, ...PHONE }).side).toBe('right');
    // 畫面正中央算右邊（跟預設位置同一側），不要讓它在中線上抖
    expect(snapSpot({ x: 195 - BTN / 2, y: 400, ...PHONE }).side).toBe('right');

    const span = PHONE.height - BTN - GAP * 2;
    expect(snapSpot({ x: 20, y: GAP, ...PHONE }).ratio).toBe(0);
    expect(snapSpot({ x: 20, y: GAP + span, ...PHONE }).ratio).toBe(1);
    expect(snapSpot({ x: 20, y: GAP + span / 2, ...PHONE }).ratio).toBeCloseTo(0.5);
  });

  it('拖出畫面或視窗矮到放不下按鈕時不會算出畫面外的位置', () => {
    expect(snapSpot({ x: -80, y: -500, ...PHONE }).ratio).toBe(0);
    expect(snapSpot({ x: 999, y: 9999, ...PHONE }).ratio).toBe(1);
    expect(snapSpot({ x: 0, y: 0, width: 390, height: 40 }).ratio).toBe(0);
  });

  it('存壞了的位置一律回預設的右下角，而不是跳到畫面外', () => {
    expect(parseSpot(null)).toBeNull();
    expect(parseSpot('not json')).toBeNull();
    expect(parseSpot('{"side":"middle","ratio":0.5}')).toBeNull();
    expect(parseSpot({ side: 'left', ratio: NaN })).toBeNull();
    expect(parseSpot({ side: 'left', ratio: 9 })).toEqual({ side: 'left', ratio: 1 });
    expect(parseSpot(JSON.stringify(snapSpot({ x: 300, y: 700, ...PHONE }))))
      .toEqual(snapSpot({ x: 300, y: 700, ...PHONE }));
  });

  it('水平一律用 left，左右換邊才能補間滑過去', () => {
    const left = toggleStyle({ side: 'left', ratio: 0.3 });
    const right = toggleStyle({ side: 'right', ratio: 0.3 });
    for (const style of [left, right]) {
      expect(style.left).not.toBe('auto');
      expect(style.right).toBe('auto');
      expect(style.bottom).toBe('auto');
      // 100vw 含捲軸，桌機上會把按鈕推到捲軸底下；固定定位的 100% 不含
      expect(style.left).not.toMatch(/vw/);
    }
    expect(right.left).toContain('100%');
    expect(left.top).toBe(right.top);
    expect(toggleStyle(null)).toBeUndefined();   // 沒拖過就交給 CSS
  });

  it('問答視窗跟著按鈕：在上半往下開，在下半往上開', () => {
    const high = panelStyle({ side: 'right', ratio: 0.1 });
    expect(high.bottom).toBe('auto');
    expect(high.top).toContain('calc');
    const low = panelStyle({ side: 'right', ratio: 0.9 });
    expect(low.top).toBe('auto');
    expect(low.bottom).toContain('calc');
    // 兩種方向都要收在剩下的空間裡，不然會被畫面切掉一半
    for (const style of [high, low]) expect(style.maxHeight).toContain('calc');
    expect(panelStyle(null)).toBeUndefined();
  });

  it('常數跟 CookView 的 CSS 對得上，改了尺寸不會悄悄錯位', () => {
    const view = readFileSync(new URL('../web/src/views/CookView.vue', import.meta.url), 'utf8');
    expect(view).toContain(`width:${BTN}px; height:${BTN}px;`);
    // 沒有 touch-action:none 的話，手機上拖按鈕只會捲動畫面
    expect(view).toMatch(/\.helper-toggle\s*\{[^}]*touch-action:\s*none/s);
    expect(SLOP).toBeGreaterThan(0);
  });
});
