// Service worker: makes Triage work with no internet after the first visit.
// It only ever answers requests for Triage's own files. It never calls any other site.

const VERSION = 'triage-v1';
const FILES = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/engine.js', 'js/time.js', 'js/parse.js', 'js/store.js', 'js/model.js', 'js/samples.js',
  'js/ui/dom.js', 'js/ui/map.js', 'js/ui/home.js', 'js/ui/setup.js', 'js/ui/plan.js', 'js/ui/study.js',
  'js/ui/beat.js', 'js/ui/tune.js', 'js/ui/sure.js', 'js/ui/after.js', 'js/ui/exams.js', 'js/ui/share.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

// Answer from the saved copy straight away, and refresh that copy in the background.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const saved = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      if (saved) { event.waitUntil(fresh); return saved; }
      const res = await fresh;
      if (res) return res;
      if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    }));
});
