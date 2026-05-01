// RodmanWord service worker — offline app shell cache
// Keep this in sync with RW_BUILD.cache in app.js so the About
// dialog displays the same version users actually have cached.
const VERSION = 'rwd-v8';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './docx.js',
  './pdfio.js',
  './interop.js',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML so updates land; cache-first for static assets.
  if (req.mode === 'navigate' ||
      req.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(req).then((r) => {
        const copy = r.clone();
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        return r;
      }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) =>
      cached || fetch(req).then((r) => {
        if (r.ok) {
          const copy = r.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return r;
      })
    )
  );
});
