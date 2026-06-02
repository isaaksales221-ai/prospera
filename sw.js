/* ============================================================
   PROSPERA — Service Worker (offline-first app shell)
   ============================================================ */
const CACHE = 'prospera-v16';
const ASSETS = [
  './',
  'index.html',
  'styles.css?v=16',
  'js/config.js?v=16',
  'js/icons.js?v=16',
  'js/cloud.js?v=16',
  'js/store.js?v=16',
  'js/auth.js?v=16',
  'js/charts.js?v=16',
  'js/insights.js?v=16',
  'js/finance.js?v=16',
  'js/bank.js?v=16',
  'js/advisor.js?v=16',
  'js/reports.js?v=16',
  'js/app.js?v=16',
  'hero.svg',
  'manifest.json',
  'icon.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// stale-while-revalidate para GETs same-origin; fontes do Google em cache-first
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com/.test(url.host);

  if (!sameOrigin && !isFont) return; // deixa o navegador lidar com o resto

  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
