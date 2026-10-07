// 產生 PWA 需要的 PNG 圖示。不依賴任何繪圖套件，直接畫像素後自己編碼 PNG。
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(OUT, { recursive: true });

const BG = [0x12, 0x15, 0x1b];      // 深色底
const FG = [0x6e, 0xe7, 0xa8];      // 主色（跟網頁的 --accent 一致）

/* ---------- 畫布 ---------- */

function canvas(size) {
  const px = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    px[i * 3] = BG[0]; px[i * 3 + 1] = BG[1]; px[i * 3 + 2] = BG[2];
  }
  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (Math.round(y) * size + Math.round(x)) * 3;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
  };
  /** 圓角矩形（座標用 0~1 的比例，方便跟著尺寸縮放） */
  const rrect = (x0, y0, x1, y1, r, c) => {
    const [ax, ay, bx, by] = [x0 * size, y0 * size, x1 * size, y1 * size];
    const rad = r * size;
    for (let y = Math.floor(ay); y < by; y++) {
      for (let x = Math.floor(ax); x < bx; x++) {
        const dx = Math.max(ax + rad - x, 0, x - (bx - rad - 1));
        const dy = Math.max(ay + rad - y, 0, y - (by - rad - 1));
        if (dx * dx + dy * dy <= rad * rad) put(x, y, c);
      }
    }
  };
  return { px, rrect };
}

/** 啞鈴：中間槓 + 兩側各兩片槓片。maskable 時內容縮在中央安全區。 */
function drawBarbell(size, inset) {
  const { px, rrect } = canvas(size);
  const s = (v) => 0.5 + (v - 0.5) * inset;   // 以中心為基準縮放
  const midTop = s(0.455), midBot = s(0.545);

  rrect(s(0.30), midTop, s(0.70), midBot, 0.02, FG);          // 槓
  rrect(s(0.21), s(0.36), s(0.30), s(0.64), 0.025, FG);       // 內側槓片（左）
  rrect(s(0.70), s(0.36), s(0.79), s(0.64), 0.025, FG);       // 內側槓片（右）
  rrect(s(0.13), s(0.41), s(0.20), s(0.59), 0.02, FG);        // 外側槓片（左）
  rrect(s(0.80), s(0.41), s(0.87), s(0.59), 0.02, FG);        // 外側槓片（右）
  return px;
}

/* ---------- PNG 編碼 ---------- */

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(rgb, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- 輸出 ---------- */

const files = [
  ['icon-192.png', 192, 1],       // 一般圖示
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.72],   // maskable：內容縮進安全區，避免被裁切
  ['apple-touch-icon.png', 180, 1],
];

for (const [name, size, inset] of files) {
  const buf = png(drawBarbell(size, inset), size);
  writeFileSync(join(OUT, name), buf);
  console.log(`${name.padEnd(24)} ${size}x${size}  ${(buf.length / 1024).toFixed(1)}KB`);
}
