/* monchichi's world — Service Worker
 * App shell caching. Network-first for navigation (cloud sync + live quotes
 * need fresh data), cache-first for static assets with offline fallback.
 */
/* ⚠️ 缓存名必须与 index.html 里的 `const BUILD` 保持一致。
 * 原因：早先这里写死 'monchichi-v2' 从不变化，浏览器会把某次「会话中间态」的
 * index.html 缓存下来，造成「代码明明改了、页面还是旧的」，排查时极易误判为
 * 「改动没生效」或「接口坏了」。缓存名随构建号变化后，每次发布 = 新缓存 =
 * 旧缓存自动清空，从根上杜绝该问题。
 * 改 index.html 的 BUILD 时，这里必须同步改；_dev/_smoke.js 有门禁断言两者一致。 */
const CACHE = 'monchichi-2026-09-24.1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never cache cross-origin API / sync calls (JSONBin, eastmoney) — always go to network.
  const isCrossOrigin = url.origin !== self.location.origin;
  if (isCrossOrigin) return; // let the browser handle it normally

  // Navigation (HTML): network-first, fall back to cached app shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const cp = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', cp)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then((m) => m || caches.match('./')))
    );
    return;
  }

  // Daily briefs: always network-first (fresh, never cache stale briefs).
  if (url.pathname.endsWith('briefs.json')) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // Static assets: cache-first, then network (and cache the result).
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const cp = res.clone();
            caches.open(CACHE).then((c) => c.put(req, cp)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
