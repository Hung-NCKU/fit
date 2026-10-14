import { session } from './auth.js';
export function recordFeedback(kind) {
  if (typeof window === 'undefined') return;
  const feedback = { kind, at: Date.now() };
  try { sessionStorage.setItem(`fit.pet.feedback.${session.user}`, JSON.stringify(feedback)); } catch {}
  window.dispatchEvent(new CustomEvent('fit-record-saved', { detail: feedback }));
}
export function consumeFeedback() {
  try {
    const key = `fit.pet.feedback.${session.user}`;
    const value = JSON.parse(sessionStorage.getItem(key) || 'null');
    sessionStorage.removeItem(key);
    return value && Date.now() - value.at < 300_000 ? value : null;
  } catch { return null; }
}
