// Kanshō service worker: works offline, keeps posters, picks up new versions automatically.
const SHELL_CACHE = 'kansho-shell-v3.5';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'qrcode.js', 'jsqr.js'];
const IMG_CACHE = 'kansho-img', API_CACHE = 'kansho-api', FONT_CACHE = 'kansho-font', KEEP = [SHELL_CACHE, IMG_CACHE, API_CACHE, FONT_CACHE];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trim(name, max) {
  const c = await caches.open(name), keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}
async function networkFirst(req, cacheName, key) {
  const c = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) c.put(key || req, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(key || req);
    if (hit) return hit;
    throw err;
  }
}
async function cacheFirst(req, cacheName, max) {
  const c = await caches.open(cacheName), hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); if (max && Math.random() < 0.05) trim(cacheName, max); }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html')) {
      e.respondWith(networkFirst(req, SHELL_CACHE, 'index.html'));
    } else if (!url.pathname.endsWith('sw.js')) {
      e.respondWith(caches.open(SHELL_CACHE).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }))));
    }
    return;
  }
  const h = url.hostname;
  if (h === 'cdn.myanimelist.net' || h === 's4.anilist.co' || h === 'img.anili.st') e.respondWith(cacheFirst(req, IMG_CACHE, 900));
  else if (h === 'fonts.googleapis.com' || h === 'fonts.gstatic.com') e.respondWith(cacheFirst(req, FONT_CACHE));
  else if (h === 'api.jikan.moe') e.respondWith(networkFirst(req, API_CACHE).then(r => { if (Math.random() < 0.03) trim(API_CACHE, 400); return r; }));
  // everything else (sync / friend storage, AniList) always goes to the network
});
