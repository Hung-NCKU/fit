import { randomUUID } from 'node:crypto';
import { savePhoto, getPhoto } from './db.js';

const ALLOWED = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

export const MAX_BYTES = Number(process.env.MAX_IMAGE_BYTES || 6 * 1024 * 1024);

/**
 * 解析前端送來的 data URL，存進該使用者資料庫的 photos 表。
 * 回傳的 file 是照片 id（沿用「uuid.副檔名」格式，跟舊的檔案名相容）。
 * @returns {{ file: string, mimeType: string, base64: string }}
 */
export function saveDataUrl(userId, dataUrl) {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i.exec(String(dataUrl).trim());
  if (!m) throw Object.assign(new Error('圖片格式無法辨識'), { status: 400 });

  const mimeType = m[1].toLowerCase();
  const ext = ALLOWED[mimeType];
  if (!ext) throw Object.assign(new Error(`不支援的圖片格式：${mimeType}`), { status: 415 });

  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length) throw Object.assign(new Error('圖片是空的'), { status: 400 });
  if (buf.length > MAX_BYTES) {
    throw Object.assign(
      new Error(`圖片太大（${(buf.length / 1024 / 1024).toFixed(1)}MB），上限 ${(MAX_BYTES / 1024 / 1024).toFixed(0)}MB`),
      { status: 413 },
    );
  }

  const file = `${randomUUID()}.${ext}`;
  savePhoto(userId, file, mimeType, buf);
  return { file, mimeType, base64: buf.toString('base64') };
}

/** 取出照片供 /uploads/:id 使用 */
export function readPhoto(userId, id) {
  if (!id || id.includes('/') || id.includes('\\') || id.includes('..')) return null;
  const row = getPhoto(userId, id);
  return row ? { mime: row.mime, buf: Buffer.from(row.data) } : null;
}
