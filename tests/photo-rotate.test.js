import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const jpeg = createRequire(new URL('../server/package.json', import.meta.url))('jpeg-js');

let db, rotate;
beforeAll(async () => {
  vi.stubEnv('FIT_DATA_DIR', mkdtempSync(join(tmpdir(), 'fit-rotate-')));
  db = await import('../server/src/db.js');
  rotate = await import('../server/src/photo-rotate.js');
});
afterAll(() => { vi.unstubAllEnvs(); });
beforeEach(() => { db.getDb('eli').exec('DELETE FROM photos; DELETE FROM meals; DELETE FROM chat_messages'); });

/** 左半紅、右半藍的 16×8 圖。色塊對齊 JPEG 的 8×8 區塊，壓縮後顏色仍然分得清楚 */
function redBlue() {
  const w = 16, h = 8, data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    data[i] = x < 8 ? 255 : 0; data[i + 2] = x < 8 ? 0 : 255; data[i + 3] = 255;
  }
  return Buffer.from(jpeg.encode({ data, width: w, height: h }, 95).data);
}

const colorAt = (img, x, y) => {
  const i = (y * img.width + x) * 4;
  return img.data[i] > img.data[i + 2] ? 'red' : 'blue';
};

describe('像素旋轉', () => {
  // 2×3 的小圖，每格一個編號，看得出每格搬去哪裡
  //   0 1
  //   2 3
  //   4 5
  const cells = Buffer.from([0, 1, 2, 3, 4, 5].flatMap(v => [v, 0, 0, 255]));
  const ids = r => [...Array(r.width * r.height)].map((_, i) => r.data[i * 4]);

  it('順時針 90 度：寬高對調，左下角那格轉到左上角', () => {
    const r = rotate.rotateRgba(cells, 2, 3, 1);
    expect([r.width, r.height]).toEqual([3, 2]);
    expect(ids(r)).toEqual([4, 2, 0, 5, 3, 1]);
  });

  it('逆時針 90 度與 180 度', () => {
    const ccw = rotate.rotateRgba(cells, 2, 3, -1);
    expect([ccw.width, ccw.height]).toEqual([3, 2]);
    expect(ids(ccw)).toEqual([1, 3, 5, 0, 2, 4]);
    const half = rotate.rotateRgba(cells, 2, 3, 2);
    expect([half.width, half.height]).toEqual([2, 3]);
    expect(ids(half)).toEqual([5, 4, 3, 2, 1, 0]);
  });

  it('往右轉一次再往左轉一次會回到原圖', () => {
    const r = rotate.rotateRgba(cells, 2, 3, 1);
    const back = rotate.rotateRgba(r.data, r.width, r.height, -1);
    expect(ids(back)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('照片轉正', () => {
  function seed() {
    db.savePhoto('eli', 'old.jpg', 'image/jpeg', redBlue());
    const d = db.getDb('eli');
    // 一張照片辨識出兩道菜：兩筆飲食都指著它，對話裡也有一則
    d.prepare("INSERT INTO meals (date, name, photo) VALUES ('2026-10-29', '便當', 'old.jpg'), ('2026-10-29', '青菜', 'old.jpg')").run();
    d.prepare("INSERT INTO chat_messages (role, content, image) VALUES ('user', '幫我記', 'old.jpg')").run();
  }

  it('轉完換新 id，飲食與對話一起改指新照片，舊的刪掉', () => {
    seed();
    const { photo, width, height } = rotate.rotatePhoto('eli', 'old.jpg', 1);
    expect(photo).not.toBe('old.jpg');
    expect([width, height]).toEqual([8, 16]);

    const d = db.getDb('eli');
    expect(d.prepare('SELECT photo FROM meals').all().map(r => r.photo)).toEqual([photo, photo]);
    expect(d.prepare('SELECT image FROM chat_messages').get().image).toBe(photo);
    // 舊 id 一定要消失：瀏覽器把它當成「永遠不會變」快取了一週
    expect(db.getPhoto('eli', 'old.jpg')).toBeUndefined();

    // 原本左紅右藍，順時針轉完應該是上紅下藍
    const img = jpeg.decode(Buffer.from(db.getPhoto('eli', photo).data), { useTArray: true });
    expect(colorAt(img, 4, 3)).toBe('red');
    expect(colorAt(img, 4, 12)).toBe('blue');
  });

  it('只接受 90 度與 180 度，找不到或不是 JPEG 就擋下', () => {
    seed();
    expect(() => rotate.rotatePhoto('eli', 'old.jpg', 3)).toThrow(/90 度/);
    expect(() => rotate.rotatePhoto('eli', 'old.jpg', 'abc')).toThrow(/90 度/);
    expect(() => rotate.rotatePhoto('eli', 'nope.jpg', 1)).toThrow(expect.objectContaining({ status: 404 }));
    db.savePhoto('eli', 'pic.png', 'image/png', Buffer.from('fake'));
    expect(() => rotate.rotatePhoto('eli', 'pic.png', 1)).toThrow(expect.objectContaining({ status: 415 }));
    // 擋下來的時候原本的參照不能被動到
    expect(db.getDb('eli').prepare('SELECT photo FROM meals').all().every(r => r.photo === 'old.jpg')).toBe(true);
  });
});
