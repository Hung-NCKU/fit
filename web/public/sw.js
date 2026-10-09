/**
 * Service worker：讓 App 裝得起來、開得快。
 *
 * 重要原則：只快取「公開的靜態檔」。
 * /api 與 /uploads 是隨時在變的個人資料（飲食紀錄、餐點照片），
 * 一律不進快取，快取起來只會讀到舊的。
 */
const VERSION = 'fit-v5';   // 改版號會清掉所有舊快取（v4 以前的 API 回應可能被 HTTP 快取留著）
const SHELL = `${VERSION}-shell`;

const NEVER_CACHE = (url) =>
  url.pathname.startsWith('/api') || url.pathname.startsWith('/uploads');

/**
 * ngrok 免費方案會對「每一個路徑」回一個 HTTP 200 的警告頁 —— 連 .js、.css 都是。
 * 瀏覽器把那份 HTML 當 JavaScript 解析就是整頁空白（Unexpected token '<'）。
 * 這個 header 讓 ngrok 直接放行，不插警告頁。
 * （2026-10 已改用 Tailscale Funnel，沒有攔截頁；這行留著是為了切回 ngrok 時仍然正常，
 * 其他通道會直接忽略不認得的 header。）
 */
const SKIP_HEADER = { 'ngrok-skip-browser-warning': '1' };

const fetchDirect = (url, extra = {}) =>
  fetch(url, { headers: SKIP_HEADER, credentials: 'include', redirect: 'follow', ...extra });

/**
 * 回應是不是「這個請求本來該拿到的東西」。
 *
 * 不檢查的話，上面那個 200 + text/html 的警告頁會被當成 JS 存進快取；
 * 而靜態資源是 cache-first，於是之後每次都從快取拿到那份 HTML，
 * 就算使用者已經點過 Visit Site 也救不回來。
 */
function typeMatches(request, response) {
  const type = (response.headers.get('content-type') || '').toLowerCase();
  switch (request.destination) {
    case 'script':   return type.includes('javascript') || type.includes('ecmascript');
    case 'style':    return type.includes('css');
    case 'image':    return type.includes('image');
    case 'font':     return type.includes('font') || type.includes('octet-stream');
    case 'manifest': return type.includes('json') || type.includes('manifest');
    default:         return true;   // 文件與其他：交給下面的 isInterstitial 判斷
  }
}

/** 快取前的統一把關 */
const cacheable = (request, response) =>
  response && response.ok && response.type !== 'opaque' && typeMatches(request, response);

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // 不用 cache.addAll：它只看 HTTP 狀態，而警告頁是 200，會把 HTML 存成圖示與 manifest
    await Promise.all(['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'].map(async (path) => {
      try {
        const res = await fetchDirect(new URL(path, self.location.origin).href);
        if (res.ok) await cache.put(path, res);
      } catch { /* 離線安裝失敗不要卡住 */ }
    }));
    await self.skipWaiting();
  })());
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
  if (NEVER_CACHE(url)) {
    // 個人資料不進快取，但仍要帶上 skip header，否則 API 也會收到警告頁。
    // no-store 連 HTTP 快取也一併繞過：?user=別人 的回應絕對不能被留著。
    e.respondWith(fetchDirect(request.url, { cache: 'no-store' }));
    return;
  }

  // 換頁：優先拿新的，拿不到（離線）再用快取的殼
  if (request.mode === 'navigate') {
    e.respondWith(
      fetchDirect(request.url)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then(c => c.put('/', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('/').then(r => r || Response.error())),
    );
    return;
  }

  // 靜態資源：先用快取（Vite 的檔名帶 hash，內容不會變），背景更新
  e.respondWith((async () => {
    const cached = await caches.match(request);
    // 快取裡那份如果型別不對（舊版存過警告頁），直接當作沒有
    const usable = cached && typeMatches(request, cached) ? cached : null;

    const network = fetchDirect(request.url).then((res) => {
      if (cacheable(request, res)) {
        const copy = res.clone();
        caches.open(SHELL).then(c => c.put(request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => usable || Response.error());

    return usable || network;
  })());
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
