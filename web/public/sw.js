/**
 * Service worker：讓 App 裝得起來、開得快。
 *
 * 重要原則：只快取「公開的靜態檔」。
 * /api 與 /uploads 是隨時在變的個人資料（飲食紀錄、餐點照片），
 * 一律不進快取，快取起來只會讀到舊的。
 */
const VERSION = 'fit-v3';
const SHELL = `${VERSION}-shell`;

const NEVER_CACHE = (url) =>
  url.pathname.startsWith('/api') || url.pathname.startsWith('/uploads');

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll(['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']))
      .catch(() => {})       // 離線安裝失敗不要卡住
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE(url)) return;                     // 個人資料：直接走網路，不攔截

  // 換頁：優先拿新的，拿不到（離線）再用快取的殼
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/').then(r => r || Response.error())),
    );
    return;
  }

  // 靜態資源：先用快取（Vite 的檔名帶 hash，內容不會變），背景更新
  e.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put(request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached || Response.error());
      return cached || network;
    }),
  );
});

/* ---------------- 推播通知 ---------------- */

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: '增肌教練', body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(d.title || '增肌教練', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag || 'fit',          // 同一類的提醒會取代舊的，不會塞滿通知列
    renotify: true,
    data: { url: d.url || '/today' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/today';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // App 已經開著就直接跳到今日頁，不要再開一個分頁
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin) {
        await c.navigate(url).catch(() => {});
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
