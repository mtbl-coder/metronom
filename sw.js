// Service worker: aplikacja działa offline po pierwszym uruchomieniu.
const CACHE = 'stroik-v4';
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/notes.js',
  'js/pitch.js',
  'js/tuner.js',
  'js/metronome.js',
  'fonts/fonts.css',
  'fonts/jetbrains-mono-latin-500-normal.woff2',
  'fonts/jetbrains-mono-latin-700-normal.woff2',
  'fonts/jetbrains-mono-latin-ext-500-normal.woff2',
  'fonts/jetbrains-mono-latin-ext-700-normal.woff2',
  'fonts/space-grotesk-latin-400-normal.woff2',
  'fonts/space-grotesk-latin-500-normal.woff2',
  'fonts/space-grotesk-latin-600-normal.woff2',
  'fonts/space-grotesk-latin-700-normal.woff2',
  'fonts/space-grotesk-latin-ext-400-normal.woff2',
  'fonts/space-grotesk-latin-ext-500-normal.woff2',
  'fonts/space-grotesk-latin-ext-600-normal.woff2',
  'fonts/space-grotesk-latin-ext-700-normal.woff2',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Najpierw sieć (świeże wersje), przy braku połączenia – kopia z pamięci.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
