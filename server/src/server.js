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
import petRoutes from './routes/pet.js';
import mealPlanRoutes from './routes/meal-plan.js';
import expenseRoutes from './routes/expenses.js';
import { readPhoto } from './uploads.js';
import { readThumb } from './thumbs.js';
import { initAllDatabases } from './db.js';
import { startScheduler } from './scheduler.js';
import { startAutoBackup } from './autobackup.js';
import { USERS, getUser, passwordOf, sweepGuests, touch } from './users.js';

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
  // 還在試用的訪客只要有動靜就續命；閒置太久才會被掃掉（見 guests.js）
  if (req.userId) touch(req.userId);
  if (!authRequired() || isPublicPath(req.url) || req.userId) return;
  return reply.code(401).send({ error: '請先登入' });
});

// 個人資料一律不快取。沒有這行的話，瀏覽器或中間節點有機會把
// ?user=martina 的回應留著，切換使用者時看到上一個人的紀錄。
// （/uploads/:id 不在此列：照片 id 是 uuid，內容不會變，故意要快取）
app.addHook('onSend', async (req, reply) => {
  if (req.url.startsWith('/api/')) reply.header('cache-control', 'no-store');
});

/**
 * 統一的錯誤格式：{ error: 訊息 }，前端只看這個欄位。
 *
 * **必須寫在 app.register(路由) 之前。** await register() 當下就把插件
 * 建成一個封裝環境，並且沿用「那一刻」的錯誤處理器；寫在後面只會套用到
 * 根環境。症狀是所有 throw 出來的訊息都被換成 Fastify 預設的
 * { statusCode, error: 'Bad Request', message }，使用者看到的是「Bad Request」，
 * 而不是「目標體重要在 25~250 之間」。
 */
app.setErrorHandler((err, req, reply) => {
  req.log.error({ err }, 'request failed');
  reply.code(err.status || err.statusCode || 500).send({ error: err.message || '伺服器錯誤' });
});

await app.register(authRoutes, { prefix: '/api' });
await app.register(apiRoutes, { prefix: '/api' });
await app.register(chatRoutes, { prefix: '/api' });
await app.register(pushRoutes, { prefix: '/api' });
await app.register(petRoutes, { prefix: '/api' });
await app.register(mealPlanRoutes, { prefix: '/api' });
await app.register(expenseRoutes, { prefix: '/api' });

/**
 * 餐點照片。?user=eli 可以看對方的照片，因為訓練與飲食紀錄本來就互看得到，
 * 照片是飲食紀錄的一部分。
 */
app.get('/uploads/:id', async (req, reply) => {
  const owner = req.query.user && getUser(req.query.user) ? req.query.user : req.userId;
  // ?size=thumb：飲食清單用的小圖。算不出縮圖時 readThumb 會退回原圖。
  const photo = req.query.size === 'thumb'
    ? readThumb(owner, req.params.id)
    : readPhoto(owner, req.params.id);
  if (!photo) return reply.code(404).send({ error: '找不到照片' });
  return reply
    .header('content-type', photo.mime)
    .header('cache-control', 'private, max-age=604800, immutable')  // id 是 uuid，內容不會變
    .send(photo.buf);
});

// 正式模式：直接由 Fastify 提供打包好的 Vue 前端
if (existsSync(WEB_DIST)) {
  // preCompressed：有 .br / .gz 就直接送那一份。
  // Godot 的 index.wasm 有 38 MB，不壓縮的話光是開寵物頁就得吃掉這麼多流量；
  // 壓過之後約 9 MB。檔案由 web/tools/build-petgame.sh 一併產生。
  await app.register(fastifyStatic, { root: WEB_DIST, preCompressed: true });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/uploads')) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return reply.sendFile('index.html'); // SPA fallback
  });
}

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

/**
 * 定期清掉「試用過但沒建帳號」的訪客，連同他們的資料庫。
 *
 * 關掉瀏覽器沒有可靠的事件可以聽（beacon 不保證送達），所以用閒置時間判斷。
 * 開機先掃一次：服務重啟期間關掉視窗的人，不掃就會一直留著。
 */
const sweep = () => {
  const gone = sweepGuests();
  if (gone.length) app.log.info(`清掉沒建帳號的訪客：${gone.join('、')}`);
};
sweep();
setInterval(sweep, 10 * 60 * 1000).unref();
app.log.info(`✅ http://localhost:${port}  使用者：${USERS.map(u => u.name).join(' / ')}`);
