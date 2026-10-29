/**
 * 照片手動轉正。
 *
 * 為什麼不能自動：手機靠重力感應決定照片哪邊朝上，而拍餐點常常是手機平放、
 * 鏡頭朝下對著桌面——這時感應器分不出直拿還是橫拿，只能沿用上一個方向，
 * 猜錯的話照片在拍下的那一刻就是歪的，檔案裡也不會留下任何可以修正的線索。
 * 俯拍的一盤菜本來就沒有「上面」，程式猜不比手機準，所以給一顆按鈕。
 *
 * 轉完存成「新的照片 id」，不是覆蓋原本那張：/uploads/:id 送的是
 * immutable 快取（id 是 uuid、內容不會變），原地覆蓋的話瀏覽器會繼續顯示
 * 舊的那張整整一週。所以改成換 id，再把飲食與對話裡指著舊 id 的地方一起改掉。
 *
 * 用 jpeg-js 而不是 sharp：理由同 thumbs.js，不想引入要編譯的原生模組。
 */
import jpeg from 'jpeg-js';
import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';

const QUALITY = 90;   // 上傳時已經是 0.82 的 JPEG，再壓一次要留高一點，不然看得出糊

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

/**
 * RGBA 像素順時針轉 turns 個 90 度。
 * @returns {{ data: Buffer, width: number, height: number }}
 */
export function rotateRgba(src, width, height, turns) {
  const t = ((turns % 4) + 4) % 4;
  if (t === 0) return { data: Buffer.from(src), width, height };
  const swap = t !== 2;
  const w2 = swap ? height : width, h2 = swap ? width : height;
  const out = Buffer.allocUnsafe(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // 原圖 (x, y) 搬到新圖的哪一格
      const [nx, ny] = t === 1 ? [height - 1 - y, x]
        : t === 2 ? [width - 1 - x, height - 1 - y]
          : [y, width - 1 - x];
      const from = (y * width + x) * 4, to = (ny * w2 + nx) * 4;
      out[to] = src[from]; out[to + 1] = src[from + 1]; out[to + 2] = src[from + 2]; out[to + 3] = src[from + 3];
    }
  }
  return { data: out, width: w2, height: h2 };
}

/**
 * 轉一張照片，回傳新的照片 id。
 * turns：1 = 順時針 90°、-1 = 逆時針 90°、2 = 180°。
 */
export function rotatePhoto(userId, id, turns) {
  const n = Number(turns);
  if (![1, -1, 2].includes(n)) throw fail('只能轉 90 度或 180 度');
  const db = getDb(userId);
  const row = db.prepare('SELECT mime, data FROM photos WHERE id = ?').get(id);
  if (!row) throw fail('找不到這張照片', 404);
  if (row.mime !== 'image/jpeg') throw fail('這張照片的格式不能轉', 415);

  const img = jpeg.decode(Buffer.from(row.data), { useTArray: true, maxMemoryUsageInMB: 512 });
  const turned = rotateRgba(img.data, img.width, img.height, n);
  const buf = Buffer.from(jpeg.encode(turned, QUALITY).data);
  const next = `${randomUUID()}.jpg`;

  // 換 id 跟改參照要一起成功：做到一半的話，飲食清單會指著不存在的照片
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO photos (id, mime, size, data) VALUES (?, ?, ?, ?)').run(next, 'image/jpeg', buf.length, buf);
    db.prepare('UPDATE meals SET photo = ? WHERE photo = ?').run(next, id);
    db.prepare('UPDATE chat_messages SET image = ? WHERE image = ?').run(next, id);
    db.prepare('DELETE FROM photos WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
  return { photo: next, width: turned.width, height: turned.height };
}
