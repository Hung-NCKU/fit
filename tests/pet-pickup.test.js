import { expect,it } from 'vitest';
import { existsSync } from 'node:fs';
import layouts from '../web/src/pet-pickup-layout.json';
it('十種拎起素材的四幀都完整落在各自顯示範圍內',()=>{
  expect(Object.keys(layouts)).toHaveLength(10);
  for(const [species,l] of Object.entries(layouts)) {
    expect(existsSync(`web/public/pets/pickup-v1/${species}.webp`)).toBe(true);
    expect(l.frames).toHaveLength(4);
    l.frames.forEach((viewport,i)=>{
      const [x,y,w,h]=viewport.split(' ').map(Number),b=l.bounds[i];
      expect(b.width*b.height).toBeGreaterThan(1000);
      expect(b.x).toBeGreaterThanOrEqual(x);
      expect(b.y).toBeGreaterThanOrEqual(y);
      expect(b.x+b.width).toBeLessThanOrEqual(x+w);
      expect(b.y+b.height).toBeLessThanOrEqual(y+h);
    });
  }
});
