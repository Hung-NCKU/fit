import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import authRoutes, { authRequired, currentUser, isPublicPath, sessionSecret } from './auth.js';
import apiRoutes from './routes/api.js';
import chatRoutes from './routes/chat.js';
import pushRoutes from './routes/push.js';
import { readPhoto } from './uploads.js';
import { initAllDatabases } from './db.js';
import { startScheduler } from './scheduler.js';
import { startAutoBackup } from './autobackup.js';
import { USERS, getUser, passwordOf } from './users.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIST = join(__dirname, '..', '..', 'web', 'dist');

initAllDatabases();

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'info' },
  bodyLimit: 12 * 1024 * 1024,  // 照片以 base64 夾在 JSON 裡送上來
  trustProxy: true,             // 走通道時才拿得到真實來源 IP
});

// 瀏覽器常常在 DELETE / 無 body 的 POST 上照樣送 content-type: application/json，
// Fastify 預設會回 400 FST_ERR_CTP_EMPTY_JSON_BODY，這裡把空 body 當成沒有 body
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  if (!body || !body.trim()) return done(null, undefined);
  try {
    done(null, JSON.parse(body));
  } catch {
    done(Object.assign(new Error('JSON 格式錯誤'), { statusCode: 400 }));
  }
});

await app.register(cors, { origin: true, credentials: true });
await app.register(cookie, { secret: sessionSecret() });

// 驗證：未登入時擋掉所有 API 與照片，但放行登入畫面的靜態檔
app.decorateRequest('userId', null);
app.addHook('onRequest', async (req, reply) => {
  req.userId = currentUser(req);
  if (!authRequired() || isPublicPath(req.url) || req.userId) return;
  return reply.code(401).send({ error: '請先登入' });
});

await app.register(authRoutes, { prefix: '/api' });
await app.register(apiRoutes, { prefix: '/api' });
await app.register(chatRoutes, { prefix: '/api' });
await app.register(pushRoutes, { prefix: '/api' });

/**
 * 餐點照片。?user=eli 可以看對方的照片，因為訓練與飲食紀錄本來就互看得到，
 * 照片是飲食紀錄的一部分。
 */
app.get('/uploads/:id', async (req, reply) => {
  const owner = req.query.user && getUser(req.query.user) ? req.query.user : req.userId;
  const photo = readPhoto(owner, req.params.id);
  if (!photo) return reply.code(404).send({ error: '找不到照片' });
  return reply
    .header('content-type', photo.mime)
    .header('cache-control', 'private, max-age=604800, immutable')  // id 是 uuid，內容不會變
    .send(photo.buf);
});

// 正式模式：直接由 Fastify 提供打包好的 Vue 前端
if (existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, { root: WEB_DIST });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/uploads')) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return reply.sendFile('index.html'); // SPA fallback
  });
}

app.setErrorHandler((err, req, reply) => {
  req.log.error({ err }, 'request failed');
  reply.code(err.status || err.statusCode || 500).send({ error: err.message || '伺服器錯誤' });
});

const port = Number(process.env.PORT || 3000);
await app.listen({ port, host: '0.0.0.0' });

if (!process.env.GEMINI_API_KEY) {
  app.log.warn('⚠️  尚未設定 GEMINI_API_KEY，AI 對話功能會失敗。請編輯 server/.env');
}
const noPassword = USERS.filter(u => !passwordOf(u));
if (!authRequired()) {
  app.log.warn('⚠️  沒有任何帳號設密碼：任何連得到這個位址的人都能使用。開到外網前務必設定。');
} else if (noPassword.length) {
  app.log.warn(`⚠️  這些帳號沒設密碼，目前無法登入：${noPassword.map(u => u.name).join('、')}`);
}
startScheduler();
startAutoBackup();
app.log.info(`✅ http://localhost:${port}  使用者：${USERS.map(u => u.name).join(' / ')}`);
