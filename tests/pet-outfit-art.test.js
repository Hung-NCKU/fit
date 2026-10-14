import {it,expect} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ALL_OUTFITS} from '../server/src/pet-outfits.js';
import layouts from '../web/src/pet-outfit-layout.json';
it('30 套都使用各自完整角色圖，360 幀定位完整且與保存的原圖一致',()=>{
  expect(Object.keys(layouts)).toHaveLength(30);
  for(const set of ALL_OUTFITS) {
    const l=layouts[set.id];
    expect(l).toBeDefined();
    expect(existsSync(`web/public${set.img}`)).toBe(true);
    const original=readFileSync(`pet/outfits-v1/${set.id}-source.png`);
    expect(l.sourceHash).toBe(createHash('sha256').update(original).digest('hex'));
    for(const pose of ['idle','walk','pickup']) {
      expect(l.poses[pose]).toHaveLength(4);
      expect(l.bounds[pose]).toHaveLength(4);
      l.poses[pose].forEach((view,i)=>{
        const [x,y,w,h]=view.split(' ').map(Number),b=l.bounds[pose][i];
        expect(w).toBe(h);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x+b.width).toBeLessThanOrEqual(l.width);
        expect(b.y+b.height).toBeLessThanOrEqual(l.height);
        expect(b.x).toBeGreaterThanOrEqual(x);
        expect(b.y).toBeGreaterThanOrEqual(y);
        expect(b.x+b.width).toBeLessThanOrEqual(x+w);
        expect(b.y+b.height).toBeLessThanOrEqual(y+h);
      });
    }
  }
});
