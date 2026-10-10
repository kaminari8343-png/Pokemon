'use strict';
// ---- 設定 ----
const CELL = 20;              // 霧のマスの大きさ(m)
const REVEAL = 70;            // 霧が晴れる半径(m)
const FOUND_RANGE = 50;       // 名所を発見できる距離(m)
const POI_RADIUS = 700;       // 名所を探す範囲(m)
const MIN_STEP = 3;           // これ未満の移動は無視(m)
const MAX_SPEED = 12;         // m/s これ超は車・GPS飛びとして歩行距離に加算しない
const TRAIL_MAX = 3000;
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

// ---- 保存データ ----
const KEY = 'sanpo-quest';
const save = Object.assign({ cells: [], found: {}, trail: [], today: 0, day: '' }, JSON.parse(localStorage.getItem(KEY) || '{}'));
const explored = new Set(save.cells);
const todayStr = () => new Date().toISOString().slice(0, 10);
if (save.day !== todayStr()) { save.day = todayStr(); save.today = 0; }
const persist = () => { save.cells = [...explored]; try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} };

// ---- 地図(現実の地図を古地図風に表示) ----
const map = L.map('map', { zoomControl: false }).setView([35.681236, 139.767125], 17);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '© OpenStreetMap contributors'
}).addTo(map);
const $ = id => document.getElementById(id);
const trailLine = L.polyline([], { color: '#ffcf4a', weight: 5, opacity: 0.95, className: 'trail' }).addTo(map);
let me = null, meMarker = null, last = null, debug = false, follow = true;

// ---- 霧 ----
const dLat = CELL / 111320;
const dLng = lat => CELL / (111320 * Math.cos(lat * Math.PI / 180));
const key = (i, j) => i + ',' + j;
const cellCenter = (i, j) => { const lat = (i + 0.5) * dLat; return L.latLng(lat, (j + 0.5) * dLng(lat)); };
function revealAround(p) {
  const n = Math.ceil(REVEAL / CELL), i0 = Math.floor(p.lat / dLat);
  for (let i = i0 - n; i <= i0 + n; i++) {
    const w = dLng((i + 0.5) * dLat), j0 = Math.floor(p.lng / w);
    for (let j = j0 - n - 1; j <= j0 + n + 1; j++) {
      if (map.distance(cellCenter(i, j), p) <= REVEAL) explored.add(key(i, j));
    }
  }
}
const fog = $('fog'), ctx = fog.getContext('2d');
function resizeFog() { const r = devicePixelRatio || 1; fog.width = innerWidth * r; fog.height = innerHeight * r; drawFog(); }
function drawFog() {
  const r = devicePixelRatio || 1, W = fog.width, H = fog.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, W, H);
  ctx.globalAlpha = 0.82; ctx.fillStyle = '#1b2433'; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-out';
  const c = map.getCenter();
  const mpp = 40075016.686 * Math.cos(c.lat * Math.PI / 180) / (256 * Math.pow(2, map.getZoom()));
  const rad = (CELL * 1.6 / mpp) * r;
  const b = map.getBounds().pad(0.2);
  const iMin = Math.floor(b.getSouth() / dLat), iMax = Math.floor(b.getNorth() / dLat);
  for (let i = iMin; i <= iMax; i++) {
    const w = dLng((i + 0.5) * dLat), jMin = Math.floor(b.getWest() / w), jMax = Math.floor(b.getEast() / w);
    for (let j = jMin; j <= jMax; j++) {
      if (!explored.has(key(i, j))) continue;
      const pt = map.latLngToContainerPoint(cellCenter(i, j)), x = pt.x * r, y = pt.y * r;
      const g = ctx.createRadialGradient(x, y, rad * 0.35, x, y, rad);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
    }
  }
}
map.on('move zoom viewreset', drawFog);
addEventListener('resize', resizeFog);

// ---- 名所: 現実の場所(OpenStreetMap)を冒険の名所に変換 ----
function classify(t) {
  if (t.amenity === 'place_of_worship' || t.shrine || t.historic === 'shrine') return { e: '⛩️', k: 'ほこら' };
  if (t.historic) return { e: '🏰', k: '古い遺跡' };
  if (/park|garden|nature_reserve/.test(t.leisure || '')) return { e: '🌳', k: '森の広場' };
  if (/viewpoint|attraction|artwork|museum|gallery/.test(t.tourism || '')) return { e: '🔮', k: 'ふしぎな水晶' };
  if (t.railway === 'station') return { e: '🚉', k: '旅の門' };
  if (t.amenity === 'public_bath') return { e: '♨️', k: '癒しの泉' };
  if (t.amenity === 'cafe') return { e: '☕', k: '旅人の宿' };
  if (t.amenity === 'library') return { e: '📚', k: '知恵の書庫' };
  return null;
}
const pois = new Map();          // id -> {id,e,k,name,latlng,marker}
let poiCenter = null, poiFetching = false, poiFailedAt = 0;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function poiIcon(p, isFound) {
  return L.divIcon({
    className: 'poi' + (isFound ? '' : ' unk'), iconSize: [90, 50], iconAnchor: [45, 25],
    html: isFound ? `<span class="e">${p.e}</span><span class="n">${esc(p.name)}</span>` : '<span class="e">❓</span>'
  });
}
async function fetchPois(center) {
  poiFetching = true;
  const a = `(around:${POI_RADIUS},${center.lat.toFixed(5)},${center.lng.toFixed(5)})`;
  const q = `[out:json][timeout:20];(nwr${a}["name"]["historic"];nwr${a}["name"]["amenity"~"place_of_worship|public_bath|cafe|library"];` +
    `nwr${a}["name"]["leisure"~"park|garden|nature_reserve"];nwr${a}["name"]["tourism"~"viewpoint|attraction|artwork|museum|gallery"];` +
    `nwr${a}["name"]["railway"="station"];);out center 120;`;
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url + '?data=' + encodeURIComponent(q));
      if (!res.ok) continue;
      const data = await res.json();
      for (const el of data.elements) {
        const id = el.type + el.id, t = el.tags || {}, c = classify(t);
        const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
        if (!c || lat == null || pois.has(id)) continue;
        const p = { id, e: c.e, k: c.k, name: t['name:ja'] || t.name, latlng: L.latLng(lat, lng) };
        p.marker = L.marker(p.latlng, { icon: poiIcon(p, !!save.found[id]) }).addTo(map);
        pois.set(id, p);
      }
      poiCenter = center; poiFetching = false; updateHint(); return;
    } catch (e) { /* 次のサーバーへ */ }
  }
  poiFailedAt = Date.now(); poiFetching = false;
}
function maybeFetchPois() {
  if (!me || poiFetching || Date.now() - poiFailedAt < 60000) return;
  if (!poiCenter || map.distance(poiCenter, me) > POI_RADIUS * 0.45) fetchPois(me);
}

// ---- 発見 / ヒント ----
function checkFound() {
  for (const p of pois.values()) {
    if (save.found[p.id] || map.distance(p.latlng, me) > FOUND_RANGE) continue;
    save.found[p.id] = { name: p.name, e: p.e, k: p.k, date: todayStr() };
    p.marker.setIcon(poiIcon(p, true));
    toast(`${p.e} ${p.k}「${p.name}」を発見！`);
  }
}
const DIRS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
function bearing(a, b) {
  const r = Math.PI / 180, y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}
function updateHint() {
  if (!me) return;
  let best = null, bd = Infinity;
  for (const p of pois.values()) {
    if (save.found[p.id]) continue;
    const d = map.distance(p.latlng, me); if (d < bd) { bd = d; best = p; }
  }
  const h = $('hint');
  if (!best) { h.hidden = !pois.size; h.textContent = pois.size ? '近くの名所はすべて発見済み！' : ''; return; }
  h.hidden = false;
  h.textContent = `❓ 次の名所まで ${bd >= 1000 ? (bd / 1000).toFixed(1) + 'km' : Math.round(bd) + 'm'} ${DIRS[Math.round(bearing(me, best.latlng) / 45) % 8]}の方角`;
}

// ---- 表示 ----
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 4000);
}
const fmt = m => m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
function updateHud() {
  $('s-today').textContent = fmt(save.today);
  $('s-area').textContent = (explored.size * CELL * CELL / 1e6).toFixed(3) + ' km²';
  $('s-found').textContent = Object.keys(save.found).length;
}
function drawTrail() {
  const segs = []; let cur = [];
  for (let i = 0; i < save.trail.length; i++) {
    const p = save.trail[i];
    if (cur.length && map.distance(cur[cur.length - 1], p) > 150) { segs.push(cur); cur = []; }
    cur.push(p);
  }
  if (cur.length) segs.push(cur);
  trailLine.setLatLngs(segs);
}

// ---- 位置更新 ----
function updatePosition(latlng, accuracy) {
  me = latlng;
  if (!meMarker) {
    meMarker = L.marker(latlng, { icon: L.divIcon({ html: '🧙', className: 'me', iconSize: [30, 30] }), zIndexOffset: 1000 }).addTo(map);
    map.setView(latlng, 17);
  } else meMarker.setLatLng(latlng);
  const now = Date.now();
  if (!last) last = { p: latlng, t: now };
  else {
    const d = map.distance(last.p, latlng);
    if (d >= MIN_STEP) {
      const walking = d / Math.max((now - last.t) / 1000, 1) <= MAX_SPEED;
      if (walking && !debug) {
        if (save.day !== todayStr()) { save.day = todayStr(); save.today = 0; }
        save.today += d;
        save.trail.push([latlng.lat, latlng.lng]);
        if (save.trail.length > TRAIL_MAX) save.trail.splice(0, save.trail.length - TRAIL_MAX);
        drawTrail();
      }
      last = { p: latlng, t: now };
    }
  }
  revealAround(latlng); maybeFetchPois(); checkFound(); updateHint(); persist(); updateHud();
  $('status').textContent = debug ? 'テスト移動中(地図タップで移動)' : `位置取得OK (精度 ${Math.round(accuracy || 0)}m)`;
  if (follow) map.panTo(latlng, { animate: true }); else drawFog();
}

// ---- 操作 ----
map.on('dragstart', () => { follow = false; });
$('btn-locate').onclick = () => { follow = true; if (me) map.setView(me, 17); };
$('btn-debug').onclick = () => {
  debug = !debug; $('btn-debug').classList.toggle('on', debug);
  if (debug) { follow = false; if (!me) updatePosition(map.getCenter(), 0); }
  else $('status').textContent = '位置情報を取得中…';
};
map.on('click', e => { if (debug) updatePosition(e.latlng, 0); });
$('btn-book').onclick = () => {
  const items = Object.values(save.found).sort((a, b) => b.date.localeCompare(a.date));
  $('book-list').innerHTML = items.length
    ? items.map(f => `<li>${f.e} <b>${esc(f.name)}</b><small>${f.k} ・ ${f.date}</small></li>`).join('')
    : '<li>まだ何も発見していません。❓を目指して歩こう！</li>';
  $('book').hidden = false;
};
$('book-close').onclick = () => { $('book').hidden = true; };

// ---- GPS (取れないときは東京駅からプレビュー) ----
function startPreview(reason) {
  if (me) return;
  debug = true; $('btn-debug').classList.add('on');
  updatePosition(L.latLng(35.681236, 139.767125), 0);
  $('status').textContent = reason + ' → プレビュー中(地図タップで移動)';
}
if (!navigator.geolocation) startPreview('位置情報に未対応');
else {
  navigator.geolocation.watchPosition(
    p => { if (!debug) updatePosition(L.latLng(p.coords.latitude, p.coords.longitude), p.coords.accuracy); },
    err => startPreview('位置情報を取得できません(' + err.message + ')'),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
  );
  setTimeout(() => startPreview('位置情報の取得に時間がかかっています'), 8000);
}
drawTrail(); updateHud(); resizeFog();
