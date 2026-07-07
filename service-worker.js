// TRAINR Service Worker v8
const SW_VERSION = 'v8';
const CACHE_NAME = 'trainr-v8';
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
    fetch(event.request).then(response => {
      // Clone BEFORE doing anything else with the response
      const responseToCache = response.clone();
      if (response.ok) {
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
      }
      return response;
    }).catch(() =>
      caches.match(event.request).then(cached => cached || caches.match('/index.html'))
    )
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

async function broadcastBadge(count) {
  try {
    const allClients = await clients.matchAll({ includeUncontrolled: true });
    for (const client of allClients) {
      client.postMessage({ type: count > 0 ? 'setBadge' : 'clearBadge', count });
    }
  } catch(e) {}
  try {
    if (count > 0) { if ('setAppBadge' in self) self.setAppBadge(count); }
    else { if ('clearAppBadge' in self) self.clearAppBadge(); }
  } catch(e) {}
}

self.addEventListener('push', (event) => {
  console.log('[SW] Push received', SW_VERSION);
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { title: 'TRAINR', body: '' }; }

  event.waitUntil((async () => {
    const count = await getBadgeCount();
    const newCount = count + 1;
    await saveBadgeCount(newCount);
    await self.registration.showNotification(data.title || 'TRAINR', {
      body: data.body || '',
      icon: '/apple-touch-icon.png',
      badge: '/apple-touch-icon.png',
      tag: data.tag || 'trainr-notification',
      data: { url: data.url || '/' }
    });
    await broadcastBadge(newCount);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    await saveBadgeCount(0);
    await broadcastBadge(0);
    const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
    }
    if (clients.openWindow) return clients.openWindow(url);
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'clearBadge') {
    saveBadgeCount(0);
    broadcastBadge(0);
  }
  if (event.data === 'getBadgeCount') {
    getBadgeCount().then(count => {
      event.source?.postMessage({ type: 'badgeCount', count });
    });
  }
});
