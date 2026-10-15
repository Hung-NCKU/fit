import { ensureCoachMessages } from '../coach-plan.js';
import { chat, saveMessage, loadHistory, clearHistory } from '../coach.js';
import { saveDataUrl } from '../uploads.js';
import { listModels, selectableModels } from '../gemini.js';
import { randomUUID } from 'node:crypto';
import { beginRequest, requestStatus, updateRequest, finishRequest, cancelRequest } from '../chat-requests.js';

export default async function chatRoutes(app) {
  // 對話是私人的，不開放跨帳號查看
  app.get('/chat/plan', async req => ensureCoachMessages(req.userId).plan);
  app.get('/chat/history', async req => {
    ensureCoachMessages(req.userId);
    return loadHistory(req.userId, Math.min(200,Math.max(1,Number(req.query.limit) || 50)));
  });

  app.delete('/chat/history', async (req) => ({ ok: true, deleted: clearHistory(req.userId) }));

  // 輸入框旁的模型選單：每個模型的用途說明與今日額度狀態
  app.get('/models', async () => listModels());
  app.get('/chat/requests/:id', async (req, reply) => requestStatus(req.userId, req.params.id) || reply.code(404).send({ error: '找不到這則訊息' }));
  app.post('/chat/requests/:id/cancel', async (req, reply) => cancelRequest(req.userId, req.params.id) || reply.code(404).send({ error: '找不到這則訊息' }));

  app.post('/chat', async (req, reply) => {
    const userId = req.userId;
    const text = String(req.body?.message ?? '').trim();
    const dataUrl = req.body?.image;
    if (!text && !dataUrl) return reply.code(400).send({ error: '訊息不可為空' });

    // 'auto' 或沒給＝照候補鏈；給了但不在清單裡就拒絕，避免把任意字串送去 Gemini
    const asked = String(req.body?.model ?? '').trim();
    let model = null;
    if (asked && asked !== 'auto') {
      if (!selectableModels().includes(asked)) {
        return reply.code(400).send({ error: `不支援的模型：${asked}` });
      }
      model = asked;
    }
    const requestId = req.body?.requestId || randomUUID();
    const receipt = beginRequest(userId, requestId, req.body, req.body?.retry === true);
    if (receipt.existing) {
      if (receipt.existing.state === 'done') return receipt.existing.result;
      return reply.code(receipt.existing.state === 'running' ? 202 : 409).send(receipt.existing);
    }
    try {

      // 有照片就先存進自己的資料庫，之後紀錄與對話都指得到同一張
      let image = null;
      if (dataUrl) {
        try {
          image = saveDataUrl(userId, dataUrl);
        } catch (err) {
          finishRequest(userId, requestId, 'failed', null, err.message);
          return reply.code(err.status || 400).send({ error: err.message });
        }
      }

      const prompt = text || '這張照片裡有什麼食物？幫我估熱量並記錄下來。';

      // 只帶最近幾輪進 prompt，控制免費額度的 token 用量
      const history = loadHistory(userId, 12).map(m => ({ role: m.role, content: m.content }));
      if (!receipt.retrying) saveMessage(userId, 'user', prompt, [], image?.file || '');

      try {
        const { reply: answer, actions, model: used } = await chat(userId, prompt, history, image, model, {
          signal: receipt.signal,
          onProgress: phase => updateRequest(userId, requestId, phase),
          onActions: actions => updateRequest(userId, requestId, null, actions),
        });
        receipt.signal.throwIfAborted();
        const id = saveMessage(userId, 'assistant', answer, actions, '', used);
        const result = {
          id, reply: answer, actions, model: used, requestedModel: model,
          // 指定的模型今天額度用完、被候補鏈接手時，讓前端提示使用者
          fellBack: Boolean(model && used && used !== model),
          image: image?.file || '',
        };
        finishRequest(userId, requestId, 'done', result);
        return result;
      } catch (err) {
        app.log.error({ err }, 'chat failed');
        const msg = err.message || 'AI 回覆失敗';
        const actions = requestStatus(userId, requestId)?.actions || [];
        saveMessage(userId, 'assistant', `⚠️ ${msg}`, actions);
        finishRequest(userId, requestId, receipt.signal.aborted ? 'cancelled' : 'failed', null, msg);
        return reply.code(err.status || 502).send({ error: msg });
      }
    } catch (err) {
      finishRequest(userId, requestId, 'failed', null, err.message);
      throw err;
    }
  });
}
