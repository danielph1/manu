// Service worker basico - cache + push notifications
const CACHE = 'manu-v1';
const ASSETS = ['/', '/login', '/painel', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  // Network-first para rotas de API e HTML, cache fallback
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/') || request.mode === 'navigate') {
    e.respondWith(
      fetch(request).then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return r;
      }).catch(() => caches.match(request).then((r) => r || caches.match('/'))),
    );
    return;
  }
  // Cache-first para estaticos
  e.respondWith(caches.match(request).then((r) => r || fetch(request)));
});

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'Project Manu', body: 'Nova notificacao' };
  event.waitUntil(
    self.registration.showNotification(data.title || 'Project Manu', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil(clients.openWindow(target));
});
