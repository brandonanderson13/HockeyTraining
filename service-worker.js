// TRAINR Service Worker v6
const SW_VERSION = 'v6';
const CACHE_NAME = 'trainr-v6';
const BADGE_CACHE = 'trainr-badge';
const BADGE_KEY = 'badge-count';
const STATIC_ASSETS = ['/', '/index.html', '/apple-touch-icon.png', '/manifest.json'];

self.addEventListener('install', (event) => {
  console.log('[SW] Installing', SW_VERSION);
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating', SW_VERSION);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== BADGE_CACHE).map(k => caches.delete(k)))
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
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(c => c || caches.match('/index.html')))
  );
});

async function getBadgeCount() {
  try {
    const cache = await caches.open(BADGE_CACHE);
    const resp = await cache.match(BADGE_KEY);
    if (!resp) return 0;
    return parseInt(await resp.text()) || 0;
  } catch (e) { return 0; }
}

async function saveBadgeCount(count) {
  try {
    const cache = await caches.open(BADGE_CACHE);
    await cache.put(BADGE_KEY, new Response(String(count)));
  } catch (e) {}
}

async function updateBadge(count) {
  await saveBadgeCount(count);
  console.log('[SW] Badge count:', count);

  // Try self.setAppBadge (SW context)
  try {
    if (count === 0) {
      if ('clearAppBadge' in self) await self.clearAppBadge();
    } else {
      if ('setAppBadge' in self) await self.setAppBadge(count);
    }
  } catch(e) { console.warn('[SW] self badge failed:', e.message); }

  // Also message any open clients to set badge via navigator (page context)
  try {
    const allClients = await clients.matchAll({ includeUncontrolled: true });
    for (const client of allClients) {
      client.postMessage(count === 0
        ? { type: 'clearBadge' }
        : { type: 'setBadge', count }
      );
    }
  } catch(e) {}
}

// ── PUSH ──────────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  console.log('[SW] Push received', SW_VERSION);
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { title: 'TRAINR', body: '' }; }

  event.waitUntil(
    getBadgeCount().then(async count => {
      const newCount = count + 1;
      await self.registration.showNotification(data.title || 'TRAINR', {
        body: data.body || '',
        icon: '/apple-touch-icon.png',
        badge: '/apple-touch-icon.png',
        tag: data.tag || 'trainr-notification',
        data: { url: data.url || '/' }
      });
      await updateBadge(newCount);
    })
  );
});

// ── NOTIFICATION CLICK ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    Promise.all([
      updateBadge(0),
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
        for (const c of list) {
          if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
    ])
  );
});

// ── MESSAGE ───────────────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'clearBadge') updateBadge(0);
});
