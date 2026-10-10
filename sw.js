const BUILD_VERSION = '__BUILD_VERSION__';
const SOURCE_MODE = BUILD_VERSION.startsWith('__');
const VERSION = SOURCE_MODE ? 'source-v4' : BUILD_VERSION;
const PREFIX = 'prompt-ai-' + new URL(self.registration.scope).pathname + '-';
const CACHE = PREFIX + VERSION;
const DEMO_CACHE = PREFIX + 'demo-images';
const ROOT = new URL('./', self.registration.scope);
const ASSETS = ['./', './index.html', './style.css', './app.js', './core.js', './catalog.js', './manifest.webmanifest', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map(path => new URL(path, ROOT).href));
    // Bản xuất thẳng main chưa có danh mục build; không để 404 làm hỏng cài ngoại tuyến.
    await Promise.allSettled(['./prompts.json', './version.json', './Prompt-AI.mobileconfig'].map(async path => {
      const url = new URL(path, ROOT).href;
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) await cache.put(url, response);
    }));
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE && key !== DEMO_CACHE).map(key => caches.delete(key)));
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
async function demoResponse(request, event) {
  const cache = await caches.open(DEMO_CACHE);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
    else if (response.status === 404) event.waitUntil(cache.delete(request));
    return response;
  } catch {
    return (await cache.match(request)) || Response.error();
  }
}
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  if (url.pathname.startsWith(new URL('./Demo/', ROOT).pathname)) {
    event.respondWith(demoResponse(event.request, event)); return;
  }
  if (['./prompts.json', './version.json'].some(path => url.pathname === new URL(path, ROOT).pathname)) {
    event.respondWith(networkFirst(event.request)); return;
  }
  // Một bộ HTML/CSS/JS cùng phiên bản; phiên bản mới kích hoạt khi người dùng chọn Cập nhật.
  if (event.request.mode === 'navigate') {
    if (SOURCE_MODE) {
      event.respondWith(networkFirst(new Request(new URL('./index.html', ROOT).href))); return;
    }
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(new URL('./index.html', ROOT).href)) || fetch(event.request))); return;
  }
  if (SOURCE_MODE) { event.respondWith(networkFirst(event.request)); return; }
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request)) || fetch(event.request)));
});
