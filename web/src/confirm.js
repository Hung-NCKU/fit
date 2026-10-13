import { reactive } from 'vue';

export const confirmation = reactive({ open: false, message: '', title: '確認操作' });
let resolvePending;
export function confirmAction(message, title = '確認操作') {
  resolvePending?.(false);
  confirmation.message = message;
  confirmation.title = title;
  confirmation.open = true;
  return new Promise(resolve => { resolvePending = resolve; });
}
export function finishConfirmation(accepted) {
  confirmation.open = false;
  const resolve = resolvePending;
  resolvePending = null;
  resolve?.(accepted);
}
