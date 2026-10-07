import {
  publicKey, pushEnabled, saveSubscription, removeSubscription,
  countSubscriptions, checkProgress, buildMessage, sendToUser, notifyHours,
} from '../push.js';

export default async function pushRoutes(app) {
  app.get('/push/config', async (req) => ({
    enabled: pushEnabled(),
    publicKey: publicKey(),
    hours: notifyHours(),
    devices: pushEnabled() ? countSubscriptions(req.userId) : 0,
  }));

  app.post('/push/subscribe', async (req, reply) => {
    if (!pushEnabled()) return reply.code(503).send({ error: '伺服器沒有設定推播金鑰' });
    try {
      const devices = saveSubscription(req.userId, req.body?.subscription, req.headers['user-agent']);
      return { ok: true, devices };
    } catch (err) {
      return reply.code(err.status || 400).send({ error: err.message });
    }
  });

  app.post('/push/unsubscribe', async (req) => {
    const endpoint = req.body?.endpoint;
    const removed = endpoint ? removeSubscription(req.userId, endpoint) : false;
    return { ok: true, removed, devices: countSubscriptions(req.userId) };
  });

  // 「立刻測試一次」：用現在的時間點算一次並推播，不用等到 12 點
  app.post('/push/test', async (req, reply) => {
    if (!pushEnabled()) return reply.code(503).send({ error: '伺服器沒有設定推播金鑰' });
    const hour = Number(req.body?.hour ?? new Date().getHours());
    const p = checkProgress(req.userId, hour);
    const msg = buildMessage('', p);
    const result = await sendToUser(req.userId, { ...msg, url: '/today', hour });
    return { ...result, status: p.status, eaten: p.eaten, expected: p.expected, target: p.target, preview: msg };
  });
}
