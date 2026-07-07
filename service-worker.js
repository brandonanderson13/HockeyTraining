// TRAINR Service Worker v3
const CACHE_NAME = 'trainr-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/apple-touch-icon.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('supabase.co')) return;
  if (event.request.url.includes('stripe.com')) return;
  if (event.request.url.includes('/api/')) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match('/index.html')))
  );
});

// ── PUSH: show notification + set badge ──────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { title: 'TRAINR', body: event.data ? event.data.text() : '' }; }

  const title = data.title || 'TRAINR';
  const options = {
    body: data.body || '',
    icon: '/apple-touch-icon.png',
    badge: '/apple-touch-icon.png',
    tag: data.tag || 'trainr-notification',
    data: { url: data.url || '/' },
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.getNotifications().then(existing => {
      const count = existing.length + 1;
      const tasks = [self.registration.showNotification(title, options)];
      // setAppBadge lives on self in service worker context
      if ('setAppBadge' in self) tasks.push(self.setAppBadge(count));
      return Promise.all(tasks);
    })
  );
});

// ── NOTIFICATION CLICK: open app + clear badge ───────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    Promise.all([
      'clearAppBadge' in self ? self.clearAppBadge() : Promise.resolve(),
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
        for (const client of list) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
    ])
  );
});

// ── MESSAGE FROM APP: clear badge when app opened ────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'clearBadge') {
    if ('clearAppBadge' in self) self.clearAppBadge();
  }
});
