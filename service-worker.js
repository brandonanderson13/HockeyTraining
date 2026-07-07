// TRAINR Service Worker v5
const SW_VERSION = 'v5';
const CACHE_NAME = 'trainr-v5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/apple-touch-icon.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  console.log('[SW] Installing', SW_VERSION);
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating', SW_VERSION);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== 'trainr-badge').map(k => caches.delete(k)))
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

// Persist badge count in Cache Storage
const BADGE_CACHE = 'trainr-badge';
const BADGE_KEY = 'badge-count';

async function getBadgeCount() {
  try {
    const cache = await caches.open(BADGE_CACHE);
    const resp = await cache.match(BADGE_KEY);
    if (!resp) return 0;
    const text = await resp.text();
    return parseInt(text) || 0;
  } catch (e) { return 0; }
}

async function setBadgeCount(count) {
  try {
    const cache = await caches.open(BADGE_CACHE);
    await cache.put(BADGE_KEY, new Response(String(count)));
    console.log('[SW] Setting badge to', count);
    if (count === 0) {
      if ('clearAppBadge' in self) await self.clearAppBadge();
    } else {
      if ('setAppBadge' in self) await self.setAppBadge(count);
    }
  } catch (e) { console.warn('[SW] setBadgeCount error:', e); }
}

// ── PUSH ──────────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  console.log('[SW] Push received', SW_VERSION);
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
    getBadgeCount().then(async count => {
      const newCount = count + 1;
      console.log('[SW] Incrementing badge to', newCount);
      await self.registration.showNotification(title, options);
      await setBadgeCount(newCount);
    })
  );
});

// ── NOTIFICATION CLICK ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    Promise.all([
      setBadgeCount(0),
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

// ── MESSAGE ───────────────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'clearBadge') setBadgeCount(0);
  if (event.data === 'getVersion') {
    event.source?.postMessage({ type: 'version', version: SW_VERSION });
    console.log('[SW] Version:', SW_VERSION);
  }
});
