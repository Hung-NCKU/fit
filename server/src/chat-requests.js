import { getDb } from './db.js';
import { createHash } from 'node:crypto';

// Persist the receipt before any model/tool work. A restart never replays a
// running receipt: tool writes may already have happened before the crash.
const active = new Map();
const key = (user, id) => `${user}:${id}`;
const parse = row => row && ({ ...row, actions: JSON.parse(row.actions), result: row.result ? JSON.parse(row.result) : null });
export function requestStatus(user, id) {
  const db = getDb(user);
  let row = db.prepare('SELECT * FROM chat_requests WHERE request_id = ?').get(id);
  if (row?.state === 'running' && !active.has(key(user, id))) {
    db.prepare("UPDATE chat_requests SET state='interrupted', phase='處理已中斷', error=? WHERE request_id=?")
      .run('服務重新啟動，請先查看紀錄；為避免重複記錄，不會自動重送這則訊息。', id);
    row = db.prepare('SELECT * FROM chat_requests WHERE request_id = ?').get(id);
  }
  if (!row) return null;
  const { fingerprint, ...status } = parse(row);
  return { ...status, canRetry: row.state === 'failed' && !JSON.parse(row.actions).some(a => a.tool !== 'get_records') };
}
export function beginRequest(user, id, body, retry = false) {
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(id)) throw Object.assign(new Error('訊息識別碼無效'), { status: 400 });
  const db = getDb(user);
  const fingerprint = createHash('sha256').update(JSON.stringify([body.message || '', body.image || '', body.model || 'auto'])).digest('hex');
  const row = db.prepare('SELECT * FROM chat_requests WHERE request_id=?').get(id);
  const status = row ? requestStatus(user, id) : null;
  if (row && row.fingerprint !== fingerprint) throw Object.assign(new Error('同一訊息識別碼不可更換內容'), { status: 409 });
  if (status && !(retry && status.canRetry)) return { existing: status };
  if ([...active.keys()].some(k => k.startsWith(`${user}:`))) throw Object.assign(new Error('上一則訊息仍在處理，請先等待或取消'), { status: 409 });
  const controller = new AbortController();
  if (row) db.prepare("UPDATE chat_requests SET state='running', phase='重新處理訊息', error='', result=NULL, actions='[]' WHERE request_id=?").run(id);
  else db.prepare('INSERT INTO chat_requests(request_id,fingerprint) VALUES (?,?)').run(id, fingerprint);
  active.set(key(user, id), controller);
  return { signal: controller.signal, retrying: Boolean(row) };
}
export function updateRequest(user, id, phase, actions) {
  const db = getDb(user);
  if (phase) db.prepare('UPDATE chat_requests SET phase=? WHERE request_id=?').run(phase, id);
  if (actions) db.prepare('UPDATE chat_requests SET actions=? WHERE request_id=?').run(JSON.stringify(actions), id);
}
export function finishRequest(user, id, state, result, error = '') {
  try {
    getDb(user).prepare('UPDATE chat_requests SET state=?, phase=?, result=?, error=? WHERE request_id=?')
      .run(state, state === 'done' ? '回覆完成' : state === 'cancelled' ? '已取消' : '處理失敗', result ? JSON.stringify(result) : null, error, id);
  } finally { active.delete(key(user, id)); }
  return requestStatus(user, id);
}
export function cancelRequest(user, id) {
  const controller = active.get(key(user, id));
  if (controller) {
    updateRequest(user, id, '正在停止；已儲存的紀錄會保留');
    controller.abort(Object.assign(new Error('已取消回覆；已儲存的紀錄會保留。'), { status: 499 }));
  }
  return requestStatus(user, id);
}
