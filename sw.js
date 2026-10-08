const VERSION = '__BUILD_VERSION__';
const PREFIX = 'prompt-ai-' + new URL(self.registration.scope).pathname + '-';
const CACHE = PREFIX + VERSION;
const ROOT = new URL('./', self.registration.scope);
const ASSETS = ['./', './index.html', './style.css', './app.js', './core.js', './manifest.webmanifest', './prompts.json', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png', './Prompt-AI.mobileconfig'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(path => new URL(path, ROOT).href))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
    if (response.ok) { await cache.put(request, response.clone()); return response; }
    const cached = await cache.match(request);
    return cached || response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error('Offline cache miss');
  }
}
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  if (url.pathname === new URL('./prompts.json', ROOT).pathname) {
    event.respondWith(networkFirst(event.request)); return;
  }
  // Một bộ HTML/CSS/JS cùng phiên bản; phiên bản mới kích hoạt khi người dùng chọn Cập nhật.
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(new URL('./index.html', ROOT).href)) || fetch(event.request))); return;
  }
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request)) || fetch(event.request)));
});
