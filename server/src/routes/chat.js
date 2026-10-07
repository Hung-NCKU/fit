import { chat, saveMessage, loadHistory, clearHistory } from '../coach.js';
import { saveDataUrl } from '../uploads.js';
import { listModels, selectableModels } from '../gemini.js';

export default async function chatRoutes(app) {
  // 對話是私人的，不開放跨帳號查看
  app.get('/chat/history', async (req) => loadHistory(req.userId, Number(req.query.limit || 50)));

  app.delete('/chat/history', async (req) => ({ ok: true, deleted: clearHistory(req.userId) }));

  // 輸入框旁的模型選單：每個模型的用途說明與今日額度狀態
  app.get('/models', async () => listModels());

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

    // 有照片就先存進自己的資料庫，之後紀錄與對話都指得到同一張
    let image = null;
    if (dataUrl) {
      try {
        image = saveDataUrl(userId, dataUrl);
      } catch (err) {
        return reply.code(err.status || 400).send({ error: err.message });
      }
    }

    const prompt = text || '這張照片裡有什麼食物？幫我估熱量並記錄下來。';

    // 只帶最近幾輪進 prompt，控制免費額度的 token 用量
    const history = loadHistory(userId, 12).map(m => ({ role: m.role, content: m.content }));
    saveMessage(userId, 'user', prompt, [], image?.file || '');

    try {
      const { reply: answer, actions, model: used } = await chat(userId, prompt, history, image, model);
      const id = saveMessage(userId, 'assistant', answer, actions, '', used);
      return {
        id, reply: answer, actions, model: used, requestedModel: model,
        // 指定的模型今天額度用完、被候補鏈接手時，讓前端提示使用者
        fellBack: Boolean(model && used && used !== model),
        image: image?.file || '',
      };
    } catch (err) {
      app.log.error({ err }, 'chat failed');
      const msg = err.message || 'AI 回覆失敗';
      saveMessage(userId, 'assistant', `⚠️ ${msg}`, []);
      return reply.code(err.status || 502).send({ error: msg });
    }
  });
}
