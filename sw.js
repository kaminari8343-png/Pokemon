// ① 他のアプリから「共有」されたGPSログ(GPXなど)を受け取って、ゲーム側の取り込みに渡す
// ② アプリ本体と外部ライブラリをキャッシュして、起動を速くする(電波が弱くても画面は出る)
const CACHE = 'shared-v1';
const APP = 'app-v1';                                    // アプリ本体・ライブラリのキャッシュ(?v= つきのURLは中身が変わるたびに別URLになる)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE && k !== APP) await caches.delete(k);
  await self.clients.claim();
})()));
const LIBS = /^https:\/\/(unpkg\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;
async function cacheFirst(req) {
  const c = await caches.open(APP), hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') c.put(req, res.clone());
  return res;
}
async function swr(req) {                             // 保存ずみをすぐ返し、裏で最新に更新(?v= を上げ忘れても、次の起動で新しくなる)
  const c = await caches.open(APP), hit = await c.match(req);
  const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
  if (hit) { net.catch(() => {}); return hit; }
  return (await net) || fetch(req);
}
async function networkFirst(req, ms) {                 // ページ本体は、まず最新を取る(遅いときは保存ずみを使う)
  const c = await caches.open(APP);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(rej, ms))]);
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch (e) { const hit = await c.match(req); if (hit) return hit; return fetch(req); }
}
self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  if (req.method === 'GET') {
    if (LIBS.test(req.url)) { event.respondWith(cacheFirst(req)); return; }
    if (url.origin === self.location.origin) {
      if (req.mode === 'navigate') { event.respondWith(networkFirst(req, 4000)); return; }
      if (/\.(js|css|png|webmanifest)$/.test(url.pathname)) { event.respondWith(swr(req)); return; }
    }
    return;
  }
  if (req.method !== 'POST' || !url.pathname.endsWith('/share-target')) return;   // それ以外は何もしない(通常どおり読み込む)
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
