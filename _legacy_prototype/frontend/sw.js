// Offline shell cache so inspectors can open the app in low-connectivity field sites. API calls always go to the network.
const CACHE = 'sakshya360-v2';
const ASSETS = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.json', '/icon.svg'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
