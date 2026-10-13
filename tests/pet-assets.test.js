import { readFileSync, existsSync } from 'node:fs';
import { expect, it } from 'vitest';
import { SPECIES } from '../server/src/pet.js';
const layouts = JSON.parse(readFileSync(new URL('../web/src/pet-frame-layout.json', import.meta.url)));
it('十種可領養動物都有五種完整四幀動作及實際素材', () => {
  expect(Object.keys(layouts).sort()).toEqual(SPECIES.map(s => s.id).sort());
  for (const { id } of SPECIES) {
    const layout = layouts[id];
    expect(existsSync(new URL(`../web/public/pets/animated-${id}-v2.webp`, import.meta.url))).toBe(true);
    expect(Object.keys(layout.poses).sort()).toEqual(['eat', 'idle', 'play', 'sleep', 'walk']);
    for (const [pose, frames] of Object.entries(layout.poses)) {
      expect(frames).toHaveLength(4);
      frames.forEach((box, i) => {
        const [x, y, w, h] = box.split(' ').map(Number);
        const bounds = layout.bounds[pose][i];
        expect([x, y, w, h].every(Number.isFinite)).toBe(true);
        expect(bounds.x).toBeGreaterThanOrEqual(x);
        expect(bounds.y).toBeGreaterThanOrEqual(y);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(x + w);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(y + h);
      });
    }
  }
});
it('五種可購買環境都有新版背景，原素材保留', () => {
  for (const id of ['room', 'garden', 'beach', 'gym', 'space']) {
    expect(existsSync(new URL(`../web/public/pets/scene-${id}-v2.webp`, import.meta.url))).toBe(true);
    expect(existsSync(new URL(`../web/public/pets/scene-${id}.webp`, import.meta.url))).toBe(true);
  }
});
