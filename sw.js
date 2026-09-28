/* 離線快取：讓網頁安裝成 App 後，沒有網路也能開啟 */
const VERSION = '4.1.1';
const SHELL = 'shell-' + VERSION;
const RUNTIME = 'runtime-v1';           // 程式庫（transformers.js、onnxruntime 等），版本固定，長期保存
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest', './icons/icon-32.png', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  // 網頁本身：有網路就拿最新版（並更新快取），沒網路就用快取
  if (url.origin === location.origin){
    if (req.mode === 'navigate'){
      e.respondWith((async () => {
        const cache = await caches.open(SHELL);
        try {
          const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 5000);
          const res = await fetch(req, { signal: ctl.signal }); clearTimeout(timer);
          if (res.ok) cache.put('./index.html', res.clone());
          return res;
        } catch {
          return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
        }
      })());
      return;
    }
    e.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
    return;
  }

  // CDN 上的程式庫：版本固定，先用快取
  if (url.hostname === 'cdn.jsdelivr.net'){
    e.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone()).catch(() => {});
      return res;
    })());
  }
  // 模型檔（huggingface）由 transformers.js 自己快取，這裡不處理
});
