// 离线：壳子（页面 / 脚本 / 样式 / 字体 / 牌背 / 边框）装机时预存；78 张牌面第一次看到时存起来。
// 改了代码记得把 VERSION 加一，老缓存才会换掉。
const VERSION = 'chambre-v11';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './css/app.css',
  './js/app.js', './js/reading.js', './js/decor.js', './js/store.js', './js/cards.js', './js/band.js', './js/ai.js', './js/ticket.js', './js/tarot-card.js',
  './js/data/deck.js', './js/data/text.js', './js/library.js',
  './data/library/normal/majors.json', './data/library/normal/wands.json', './data/library/normal/cups.json', './data/library/normal/swords.json', './data/library/normal/pents.json', './data/library/relation.json',
  './assets/back.webp', './assets/frame.webp', './assets/wallpaper-night.webp', './assets/wallpaper-day.webp', './assets/fonts/tanugo.woff2', './assets/fonts/akabara.woff2',
  './assets/icon.svg', './assets/icon-192.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;     // AI 接口之类的别碰
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok && (url.pathname.includes('/assets/') || SHELL.some((s) => url.pathname.endsWith(s.slice(1))))) {
      const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy));
    }
    return res;
  })));
});
