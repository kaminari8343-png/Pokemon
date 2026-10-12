// 他のアプリから「共有」されたGPSログ(GPXなど)を受け取って、ゲーム側の取り込みに渡す
const CACHE = 'shared-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || !url.pathname.endsWith('/share-target')) return;   // それ以外は何もしない(通常どおり読み込む)
  event.respondWith((async () => {
    const back = n => Response.redirect(new URL('./?shared=' + n, self.registration.scope).href, 303);
    try {
      const files = (await event.request.formData()).getAll('file').filter(f => f && typeof f !== 'string');
      const cache = await caches.open(CACHE);
      let n = 0;
      for (const f of files) {
        await cache.put(new URL(`./shared/${Date.now()}-${n++}`, self.registration.scope).href,
          new Response(f, { headers: { 'x-filename': encodeURIComponent(f.name || 'shared.gpx') } }));
      }
      return back(n || 'err');
    } catch (e) { return back('err'); }
  })());
});
