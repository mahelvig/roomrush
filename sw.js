// Offline support: always try the network first (so updates show up), fall back to the cache.
const CACHE = 'roomrush-v5';
const FILES = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/util.js', 'js/config.js', 'js/save.js', 'js/audio.js', 'js/input.js', 'js/room.js', 'js/art.js',
  'js/scenery.js', 'js/effects.js', 'js/perks.js', 'js/player.js', 'js/enemies.js', 'js/affixes.js', 'js/abilities.js', 'js/depths.js', 'js/bosses.js',
  'js/game.js', 'js/ui.js', 'js/main.js', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
