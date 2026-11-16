/* 修改既有檔案：重新部署即可，手機在下次開啟時自動換新。
   新增、改名或刪除檔案：同步更新 ASSETS，並把 VERSION 加一。 */
const VERSION = 'ynh-v2';
const FONT_CACHE = 'ynh-fonts';
const ASSETS = [
  './', 'index.html', 'styles.css', 'app.js', 'data.js', 'manifest.webmanifest',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/icon-maskable-512.png', 'assets/icons/apple-touch-icon.png',
  'assets/img/hero.webp',
  ...[1, 2, 3, 4, 5, 6, 7, 8].map(n => `assets/img/d${n}.webp`),
  ...['passport', 'jacket', 'oxygen', 'glasses', 'power', 'brush'].map(n => `assets/img/obj-${n}.webp`)
];

self.addEventListener('install', e => {
  // cache: 'reload' 繞過瀏覽器的 HTTP 快取，避免把舊檔案存進新版本
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('ynh-v') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 同源檔案：先回快取（山上網路慢也秒開），背景再向伺服器確認；更新內容在下次開啟時生效
  if (url.origin === self.location.origin) {
    // 導覽一律對應 index.html；查詢字串（例如 ?now=）不分開快取
    const key = req.mode === 'navigate' ? 'index.html' : url.origin + url.pathname;
    e.respondWith(caches.open(VERSION).then(async cache => {
      const hit = await cache.match(key);
      const net = fetch(key, { cache: 'no-cache' })
        .then(res => { if (res.ok) cache.put(key, res.clone()); return res; });
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      return net;
    }));
    return;
  }

  // 字型：頁面會主動把子集存進 FONT_CACHE；這裡負責離線時從快取回應
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(FONT_CACHE).then(c => c.put(req, copy)); }
        return res;
      }))
    );
  }
  // 天氣與匯率 API 直接走網路，失敗時由頁面改用 localStorage 的上次結果
});
