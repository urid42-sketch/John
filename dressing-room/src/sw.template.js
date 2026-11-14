// Service worker, emitted as /sw.js by the build (see vite.config.ts) with the asset list filled in.
const VERSION = '__VERSION__';
const SHELL = `shell-${VERSION}`;
const RUNTIME = 'runtime-v1'; // big, rarely changing downloads: background-removal model and wasm
const PRECACHE = __ASSETS__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== SHELL && key !== RUNTIME) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone()).catch(() => undefined); // never keep errors or opaque responses
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) return; // never cache AI calls
    if (req.mode === 'navigate') {
      // App shell: try the network for a fresh version, fall back to the cached page offline.
      event.respondWith((async () => {
        const cached = () => caches.match('/index.html', { cacheName: SHELL });
        try {
          const res = await Promise.race([
            fetch(req),
            new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 3500)),
          ]);
          return res.ok ? res : (await cached()) ?? res;
        } catch {
          return (await cached()) ?? Response.error();
        }
      })());
      return;
    }
    const big = url.pathname.endsWith('.wasm');
    event.respondWith(cacheFirst(req, big ? RUNTIME : SHELL));
    return;
  }
  // The background-removal model is fetched from its CDN once and then served from the phone.
  if (url.hostname === 'staticimgly.com') event.respondWith(cacheFirst(req, RUNTIME));
});
