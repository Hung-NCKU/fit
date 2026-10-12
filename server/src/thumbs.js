/**
 * 餐點縮圖。
 *
 * 飲食清單裡那張圖只有幾十 px 寬，卻是直接載入原始照片 —— 平均 300KB、
 * 最大 385KB。一天幾張、在外網通道上就是好幾秒。這裡把它縮成約 15KB。
 *
 * 用 jpeg-js 而不是 sharp：sharp 是原生模組，要編譯，會破壞這個專案
 * 「不需要 build toolchain、Docker 直接 npm ci」的前提。jpeg-js 是純 JavaScript，
 * 慢一些，但縮圖只在第一次要求時算一次，之後存進資料庫重複使用。
 */
import jpeg from 'jpeg-js';
import { getDb } from './db.js';

/** 縮圖長邊的像素。清單裡顯示約 44px，給兩倍供高解析螢幕用。 */
const MAX_SIDE = 120;
const QUALITY = 60;

/** 最近鄰取樣。縮到 120px 的小圖，雙線性的差別肉眼看不出來，但快很多。 */
function resize(src, w, h, dw, dh) {
  const out = Buffer.allocUnsafe(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(h - 1, (y * h / dh) | 0);
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(w - 1, (x * w / dw) | 0);
      src.copy(out, (y * dw + x) * 4, (sy * w + sx) * 4, (sy * w + sx) * 4 + 4);
    }
  }
  return out;
}

/**
 * 產生縮圖。失敗（格式不支援、檔案壞掉）時回 null，呼叫端退回原圖。
 * @returns {Buffer|null}
 */
export function makeThumb(buf, mime) {
  if (mime !== 'image/jpeg') return null;      // 目前照片全是 JPEG；其他格式不處理
  try {
    const img = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 256 });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    if (scale >= 1) return null;               // 本來就夠小，不值得多存一份

    const dw = Math.max(1, Math.round(img.width * scale));
    const dh = Math.max(1, Math.round(img.height * scale));
    const data = resize(Buffer.from(img.data), img.width, img.height, dw, dh);
    const out = jpeg.encode({ data, width: dw, height: dh }, QUALITY).data;

    // 理論上不會，但如果縮完反而更大就別用
    return out.length < buf.length ? Buffer.from(out) : null;
  } catch {
    return null;
  }
}

/**
 * 取縮圖：資料庫裡有就直接用，沒有就算一次並存回去。
 * 算不出來時回傳原圖，畫面不會因此破掉。
 * @returns {{ mime: string, buf: Buffer }|null}
 */
export function readThumb(userId, id) {
  const db = getDb(userId);
  const row = db.prepare('SELECT mime, data, thumb FROM photos WHERE id = ?').get(id);
  if (!row) return null;

  if (row.thumb) return { mime: 'image/jpeg', buf: Buffer.from(row.thumb) };

  const thumb = makeThumb(Buffer.from(row.data), row.mime);
  if (!thumb) return { mime: row.mime, buf: Buffer.from(row.data) };

  db.prepare('UPDATE photos SET thumb = ? WHERE id = ?').run(thumb, id);
  return { mime: 'image/jpeg', buf: thumb };
}
