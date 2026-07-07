// TRAINR Service Worker v3
const CACHE_NAME = 'trainr-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/apple-touch-icon.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  console.log('[SW] Installing v3');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v3');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
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
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(cached => cached || caches.match('/index.html'))
      )
  );
});

// ── PUSH: show notification and increment badge ───────────────────────────────
self.addEventListener('push', (event) => {
  console.log('[SW] Push received');
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'TRAINR', body: event.data ? event.data.text() : 'New notification' };
  }

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
    Promise.all([
      self.registration.showNotification(title, options),
      // Increment badge count
      self.registration.getNotifications().then(notifications => {
        const count = notifications.length + 1;
        if ('setAppBadge' in navigator) {
          return navigator.setAppBadge(count);
        }
      })
    ])
  );
});

// ── NOTIFICATION CLICK: open app and clear badge ─────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    Promise.all([
      // Clear badge when user taps notification
      'clearAppBadge' in navigator ? navigator.clearAppBadge() : Promise.resolve(),
      // Open or focus the app
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
    ])
  );
});

// ── MESSAGE: clear badge when app is opened ───────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'clearBadge') {
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge();
    }
  }
});
