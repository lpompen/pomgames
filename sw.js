/* PomGames service worker
   - Eigen bestanden: eerst van internet (iedereen heeft meteen de nieuwste versie), zonder internet uit de cache.
   - Bibliotheken en lettertypes: uit de cache (ze veranderen niet).
   - Pushmeldingen via Firebase Cloud Messaging: worden getoond als de app dicht is. */
const CACHE = 'pomgames-v1';
const CORE = ['./', './index.html', './config.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/badge-96.png'];
const FB_VER = '12.19.0';

try { importScripts('./config.js'); } catch (e) {}
const CFG = self.PG_CONFIG || {};
if (CFG.firebase && CFG.firebase.apiKey && CFG.vapidKey) {
  try {
    importScripts(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app-compat.js`, `https://www.gstatic.com/firebasejs/${FB_VER}/firebase-messaging-compat.js`);
    firebase.initializeApp(CFG.firebase);
    firebase.messaging(); // toont meldingen met een 'notification'-deel automatisch en opent de link bij een tik
  } catch (e) {}
}

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {}));
});
self.addEventListener('activate', e => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k.startsWith('pomgames-') && k !== CACHE).map(k => caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === self.location.origin) {
    if (u.pathname.endsWith('/sw.js')) return;
    e.respondWith(fetch(r.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r.mode === 'navigate' ? './index.html' : r, copy)); } return res; })
      .catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match('./index.html'))));
    return;
  }
  if (/^(www\.gstatic\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)$/.test(u.hostname) && !u.pathname.includes('/firestore') ) {
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); }
      return res;
    })));
  }
});
// Tik op een melding die niet van Firebase komt: open of focus de app.
self.addEventListener('notificationclick', e => {
  const link = (e.notification.data && e.notification.data.link) || './';
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) { c.navigate(link).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(link);
  }));
});
