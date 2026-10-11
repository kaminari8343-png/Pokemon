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
const START = { lat: 35.681236, lng: 139.767125 };   // GPSが無いときの開始地点(東京駅)
const CAM = { zoom: 16.6, pitch: 58 };
const RAD = Math.PI / 180, R_EARTH = 6378137;

// ---- 共通 ----
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const todayStr = () => new Date().toISOString().slice(0, 10);
function dist(a, b) {                       // a,b = {lat,lng}  (m)
  const dLat = (b.lat - a.lat) * RAD, dLng = (b.lng - a.lng) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}
const hourNow = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
const isNight = () => { const h = hourNow(); return h < 5 || h >= 19; };

// ---- 保存データ ----
const KEY = 'sanpo-quest';
const save = Object.assign({ cells: [], found: {}, trail: [], today: 0, total: 0, day: '', gold: 0, shards: 0, coins: [], built: [] },
  JSON.parse(localStorage.getItem(KEY) || '{}'));
save.coins = save.coins.filter(c => c.exp > Date.now());
if (save.day !== todayStr()) { save.day = todayStr(); save.today = 0; }
const explored = new Set(), expI = [], expJ = [];
let expVer = 0;
function markCell(i, j) {
  const k = i + ',' + j;
  if (explored.has(k)) return false;
  explored.add(k); expI.push(i); expJ.push(j); expVer++; return true;
}
save.cells.forEach(k => { const [i, j] = k.split(',').map(Number); markCell(i, j); });
function persist() { save.cells = [...explored]; try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }
let persistTimer = 0;
function persistSoon() { if (!persistTimer) persistTimer = setTimeout(() => { persistTimer = 0; persist(); }, 2000); }
addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

// ---- 地図スタイル(現実の街を、絵本のような冒険の世界の色と立体で描く) ----
const EMPTY = { type: 'FeatureCollection', features: [] };
function buildStyle() {
  const S = { source: 'ofm' };
  const wRoad = (a, b, c, d) => ['interpolate', ['exponential', 1.4], ['zoom'], 12, a, 15, b, 17, c, 19.5, d];
  return {
    version: 8, name: 'sanpo-quest',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    light: { anchor: 'map', color: '#fff1d6', intensity: 0.5, position: [1.2, 205, 40] },
    sources: {
      ofm: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
      trail: { type: 'geojson', data: EMPTY }, place: { type: 'geojson', data: EMPTY },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#eadcb6' } },
      { id: 'landcover', type: 'fill', ...S, 'source-layer': 'landcover', paint: { 'fill-color': ['match', ['get', 'class'],
        'grass', '#c4dd93', 'wood', '#8dc07a', 'farmland', '#dbdf9d', 'sand', '#f3e3aa', 'wetland', '#a8d3b2', 'ice', '#f6faff', 'rock', '#d8cbb2', '#cfe1a2'] } },
      { id: 'landuse', type: 'fill', ...S, 'source-layer': 'landuse', paint: { 'fill-opacity': 0.85, 'fill-color': ['match', ['get', 'class'],
        'residential', '#f0e1be', 'commercial', '#eed9b3', 'industrial', '#e2d3c0', 'cemetery', '#b8d3a4', 'hospital', '#f4d3d3',
        'school', '#f2e7b6', 'pitch', '#b6dc8e', 'playground', '#cfe5a2', 'stadium', '#dad4c1', 'railway', '#e0d4c2', '#eadcb6'] } },
      { id: 'park', type: 'fill', ...S, 'source-layer': 'park', paint: { 'fill-color': '#a6d68a', 'fill-opacity': 0.92 } },
      { id: 'water', type: 'fill', ...S, 'source-layer': 'water', paint: { 'fill-color': '#6cc1dc' } },
      { id: 'water-edge', type: 'line', ...S, 'source-layer': 'water', paint: { 'line-color': '#4aa3c8', 'line-width': 1.4, 'line-opacity': 0.8 } },
      { id: 'waterway', type: 'line', ...S, 'source-layer': 'waterway', paint: { 'line-color': '#6cc1dc', 'line-width': wRoad(0.6, 2, 4, 8) } },
      { id: 'road-minor-casing', type: 'line', ...S, 'source-layer': 'transportation', minzoom: 13,
        filter: ['all', ['in', 'class', 'minor', 'service', 'tertiary'], ['!=', 'brunnel', 'tunnel']],
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#d6c196', 'line-width': wRoad(1, 4.5, 11, 28) } },
      { id: 'road-major-casing', type: 'line', ...S, 'source-layer': 'transportation', minzoom: 10,
        filter: ['all', ['in', 'class', 'motorway', 'trunk', 'primary', 'secondary'], ['!=', 'brunnel', 'tunnel']],
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#c8964a', 'line-width': wRoad(2, 7, 16, 40) } },
      { id: 'road-minor', type: 'line', ...S, 'source-layer': 'transportation', minzoom: 13,
        filter: ['all', ['in', 'class', 'minor', 'service', 'tertiary'], ['!=', 'brunnel', 'tunnel']],
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fffaf0', 'line-width': wRoad(0.5, 3, 8.5, 24) } },
      { id: 'road-major', type: 'line', ...S, 'source-layer': 'transportation', minzoom: 10,
        filter: ['all', ['in', 'class', 'motorway', 'trunk', 'primary', 'secondary'], ['!=', 'brunnel', 'tunnel']],
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffd98c', 'line-width': wRoad(1.2, 5, 13, 34) } },
      { id: 'road-path', type: 'line', ...S, 'source-layer': 'transportation', minzoom: 14, filter: ['in', 'class', 'path', 'track', 'pedestrian'],
        layout: { 'line-cap': 'round' }, paint: { 'line-color': '#b98a56', 'line-width': wRoad(0.5, 1.2, 2.4, 6), 'line-dasharray': [1.5, 1.5] } },
      { id: 'rail', type: 'line', ...S, 'source-layer': 'transportation', minzoom: 12, filter: ['==', 'class', 'rail'],
        paint: { 'line-color': '#8d7c6c', 'line-width': wRoad(0.6, 1.4, 2.6, 6), 'line-dasharray': [3, 2] } },
      { id: 'building', type: 'fill-extrusion', ...S, 'source-layer': 'building', minzoom: 14, paint: {
        'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8],
          0, '#f7d5b0', 15, '#f1b59d', 40, '#d2a6d8', 100, '#9faae9'],
        'fill-extrusion-height': ['*', 1.25, ['coalesce', ['get', 'render_height'], 8]],
        'fill-extrusion-base': ['*', 1.25, ['coalesce', ['get', 'render_min_height'], 0]],
        'fill-extrusion-opacity': 0.95, 'fill-extrusion-vertical-gradient': true } },
      { id: 'road-label', type: 'symbol', ...S, 'source-layer': 'transportation_name', minzoom: 15,
        layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:ja'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 11 },
        paint: { 'text-color': '#6a4a22', 'text-halo-color': 'rgba(255,246,222,.95)', 'text-halo-width': 1.4 } },
      { id: 'place', type: 'symbol', ...S, 'source-layer': 'place', filter: ['in', 'class', 'city', 'town', 'village', 'suburb', 'neighbourhood', 'quarter'],
        layout: { 'text-field': ['coalesce', ['get', 'name:ja'], ['get', 'name']], 'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 12, 17, 17], 'text-max-width': 8 },
        paint: { 'text-color': '#5a3e1b', 'text-halo-color': 'rgba(255,244,216,.96)', 'text-halo-width': 1.8 } },
      { id: 'trail-glow', type: 'line', source: 'trail', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffd873', 'line-width': 12, 'line-blur': 7, 'line-opacity': 0.7 } },
      { id: 'trail-dots', type: 'line', source: 'trail', layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#fffbe6', 'line-width': 4, 'line-dasharray': [0.1, 2.2] } },
      { id: 'place-fill', type: 'fill', source: 'place', paint: { 'fill-color': '#ffd873', 'fill-opacity': 0.18 } },
      { id: 'place-line', type: 'line', source: 'place', paint: { 'line-color': '#ffd873', 'line-width': 3, 'line-dasharray': [2, 2] } },
    ],
  };
}

// ---- 地図 ----
const map = new maplibregl.Map({
  container: 'map', style: buildStyle(), center: [START.lng, START.lat], zoom: CAM.zoom, pitch: CAM.pitch,
  minZoom: 14.5, maxZoom: 19.5, maxPitch: 68, attributionControl: false, fadeDuration: 0, dragRotate: true, pitchWithRotate: true,
});
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
let mapReady = false;
function setSrc(id, data) { try { const s = map.getSource(id); if (s) s.setData(data); } catch (e) {} }
map.on('load', () => { mapReady = true; drawTrail(); showPlaceCircle(); });
// ベクター地図が読み込めないときは、簡易な画像の地図に切り替える
setTimeout(() => {
  try {
    if (!map.getSource('ofm') || map.isSourceLoaded('ofm')) return;
    map.addSource('osm', { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap contributors' });
    map.addLayer({ id: 'osm', type: 'raster', source: 'osm' }, 'trail-glow');
    toast('立体地図を読み込めないため、簡易地図で表示しています');
  } catch (e) {}
}, 14000);

let me = null, target = null, avatar = null, last = null, meMarker = null, debug = false, follow = true;

// ---- 立体地図の上に立つピン ----
function addPin(o, cls, html, onClick, anchor) {
  const el = document.createElement('div'); el.className = 'pin ' + cls; el.innerHTML = html;
  if (onClick) el.addEventListener('click', e => { e.stopPropagation(); onClick(); });
  return new maplibregl.Marker({ element: el, anchor: anchor || 'bottom' }).setLngLat([o.lng, o.lat]).addTo(map);
}

// ---- 霧 ----
const dLat = CELL / 111320;
const dLng = lat => CELL / (111320 * Math.cos(lat * RAD));
const fog = $('fog'), fctxFog = fog.getContext('2d'), fx = $('fx'), fctx = fx.getContext('2d');
let dpr = 1, cssW = 0, cssH = 0, lastSig = '';
function resize() {
  dpr = devicePixelRatio || 1; cssW = innerWidth; cssH = innerHeight;
  for (const c of [fog, fx]) { c.width = cssW * dpr; c.height = cssH * dpr; }
  lastSig = '';
}
addEventListener('resize', resize); resize();
// 霧に穴をあけるやわらかい円
const hole = document.createElement('canvas'); hole.width = hole.height = 64;
{ const h = hole.getContext('2d'), g = h.createRadialGradient(32, 32, 11, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); h.fillStyle = g; h.fillRect(0, 0, 64, 64); }
const BOX = 900;   // 描画する範囲(カメラ中心から±m)
function revealAround(p) {
  const n = Math.ceil(REVEAL / CELL), i0 = Math.floor(p.lat / dLat);
  for (let i = i0 - n; i <= i0 + n; i++) {
    const w = dLng((i + 0.5) * dLat), j0 = Math.floor(p.lng / w);
    for (let j = j0 - n - 1; j <= j0 + n + 1; j++) {
      const c = { lat: (i + 0.5) * dLat, lng: (j + 0.5) * w };
      if (dist(c, p) <= REVEAL) markCell(i, j);
    }
  }
}
function drawFog() {
  const c = map.getCenter();
  const sig = [c.lng.toFixed(6), c.lat.toFixed(6), map.getZoom().toFixed(3), map.getBearing().toFixed(2), map.getPitch().toFixed(2), expVer, cssW, cssH].join();
  if (sig === lastSig) return; lastSig = sig;
  const r = dpr, g = fctxFog;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, fog.width, fog.height);
  const grad = g.createLinearGradient(0, 0, fog.width, fog.height); grad.addColorStop(0, '#1d2a5c'); grad.addColorStop(1, '#3a2263');
  g.globalAlpha = 0.86; g.fillStyle = grad; g.fillRect(0, 0, fog.width, fog.height);
  g.globalAlpha = 1; g.globalCompositeOperation = 'destination-out';
  const latSpan = BOX / 111320, lngSpan = BOX / (111320 * Math.cos(c.lat * RAD));
  for (let k = 0; k < expI.length; k++) {
    const lat = (expI[k] + 0.5) * dLat; if (Math.abs(lat - c.lat) > latSpan) continue;
    const dl = dLng(lat), lng = (expJ[k] + 0.5) * dl; if (Math.abs(lng - c.lng) > lngSpan) continue;
    const p = map.project([lng, lat]); if (p.x < -90 || p.x > cssW + 90 || p.y < -90 || p.y > cssH + 90) continue;
    const pe = map.project([lng + dl * 1.7, lat]), pn = map.project([lng, lat + dLat * 1.7]);
    const rx = Math.max(Math.abs(pe.x - p.x), Math.abs(pn.x - p.x)), ry = Math.max(Math.abs(pe.y - p.y), Math.abs(pn.y - p.y));
    g.drawImage(hole, (p.x - rx) * r, (p.y - ry) * r, 2 * rx * r, 2 * ry * r);
  }
}

// ---- 星・花・ちょうちょ・舞う花びら/ほたる ----
const hsh = (i, j, s) => { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(s, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const DECOR = ['🌸', '🌼', '🍄', '🌿', '🍀', '🐞', '🌷'];
let stars = [], decor = [], fxCenter = null, fxVer = -1, fxAt = 0;
function rebuildFx() {
  const c = map.getCenter(), now = performance.now();
  if (fxCenter && fxVer === expVer && dist(c, fxCenter) < 30) return;
  if (now - fxAt < 400) return;
  fxAt = now; fxVer = expVer; fxCenter = { lat: c.lat, lng: c.lng };
  stars = []; decor = [];
  const R = 500, i0 = Math.floor((c.lat - R / 111320) / dLat), i1 = Math.floor((c.lat + R / 111320) / dLat);
  for (let i = i0; i <= i1; i++) {
    const lat = (i + 0.5) * dLat, dl = dLng(lat), j0 = Math.floor((c.lng - R / (111320 * Math.cos(c.lat * RAD))) / dl), j1 = Math.floor((c.lng + R / (111320 * Math.cos(c.lat * RAD))) / dl);
    for (let j = j0; j <= j1; j++) {
      const a = hsh(i, j, 1), b = hsh(i, j, 6);
      if (a < 0.02) { if (explored.has(i + ',' + j)) decor.push({ lat: lat + (hsh(i, j, 2) - 0.5) * dLat, lng: (j + 0.5) * dl + (hsh(i, j, 3) - 0.5) * dl, e: DECOR[Math.floor(hsh(i, j, 4) * DECOR.length)], p: hsh(i, j, 5) * 6.28 }); }
      else if (b < 0.06 && !explored.has(i + ',' + j)) stars.push({ lat: lat + (hsh(i, j, 8) - 0.5) * dLat, lng: (j + 0.5) * dl + (hsh(i, j, 7) - 0.5) * dl, s: 1 + hsh(i, j, 9) * 2, p: hsh(i, j, 10) * 6.28 });
    }
  }
}
const parts = Array.from({ length: 26 }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, vx: (Math.random() - 0.3) * 0.4, vy: 0.3 + Math.random() * 0.5, p: Math.random() * 6.28, s: 2 + Math.random() * 3 }));
function drawFx(t) {
  const r = dpr; fctx.setTransform(r, 0, 0, r, 0, 0); fctx.clearRect(0, 0, cssW, cssH);
  fctx.textAlign = 'center'; fctx.textBaseline = 'middle'; fctx.fillStyle = '#fff6c8';
  for (const s of stars) {
    const p = map.project([s.lng, s.lat]); if (p.x < 0 || p.x > cssW || p.y < 0 || p.y > cssH) continue;
    fctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t / 700 + s.p)); fctx.beginPath(); fctx.arc(p.x, p.y, s.s, 0, 7); fctx.fill();
  }
  fctx.globalAlpha = 1; fctx.font = '17px serif';
  for (const d of decor) {
    const p = map.project([d.lng, d.lat]); if (p.x < -20 || p.x > cssW + 20 || p.y < -20 || p.y > cssH + 20) continue;
    fctx.fillText(d.e, p.x + Math.sin(t / 900 + d.p) * 2, p.y - 8 + Math.cos(t / 1100 + d.p) * 1.5);
  }
  if (avatar) {
    const c = map.project([avatar.lng, avatar.lat]); fctx.font = '17px serif';
    for (let k = 0; k < 3; k++) { const a = t / 1000 * (0.8 + k * 0.3) + k * 2.1, rr = 38 + k * 12; fctx.fillText('🦋', c.x + Math.cos(a) * rr, c.y - 30 + Math.sin(a * 1.3) * rr * 0.5); }
  }
  const night = isNight();
  for (const q of parts) {
    if (night) { q.x += Math.sin(t / 900 + q.p) * 0.4; q.y += Math.cos(t / 1100 + q.p) * 0.3; }
    else { q.x += q.vx + Math.sin(t / 700 + q.p) * 0.3; q.y += q.vy; }
    if (q.y > cssH + 10) { q.y = -10; q.x = Math.random() * cssW; }
    if (q.x < -10) q.x = cssW + 10; if (q.x > cssW + 10) q.x = -10;
    if (night) {
      fctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t / 500 + q.p)); fctx.shadowColor = '#fff27a'; fctx.shadowBlur = 12; fctx.fillStyle = '#fff6a0';
      fctx.beginPath(); fctx.arc(q.x, q.y, q.s * 0.7, 0, 7); fctx.fill(); fctx.shadowBlur = 0;
    } else {
      fctx.globalAlpha = 0.8; fctx.fillStyle = q.p > 3.4 ? 'rgba(255,182,203,.9)' : 'rgba(190,230,150,.9)';
      fctx.beginPath(); fctx.ellipse(q.x, q.y, q.s, q.s * 0.55, q.p + t / 600, 0, 7); fctx.fill();
    }
  }
  fctx.globalAlpha = 1;
}

// ---- メインループ(なめらかな移動・カメラ追従・描画) ----
function frame(t) {
  if (target && avatar) {
    const far = dist(avatar, target) > 1500, k = far ? 1 : 0.1;
    avatar.lat += (target.lat - avatar.lat) * k; avatar.lng += (target.lng - avatar.lng) * k;
    if (meMarker) meMarker.setLngLat([avatar.lng, avatar.lat]);
    if (follow) { const c = map.getCenter(); if (Math.abs(c.lat - avatar.lat) > 1e-8 || Math.abs(c.lng - avatar.lng) > 1e-8) map.jumpTo({ center: [avatar.lng, avatar.lat] }); }
  }
  try { drawFog(); rebuildFx(); drawFx(t); } catch (e) {}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

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
const FLAVOR = {
  'ほこら': ['静かな祈りの気配がする…', '古い鈴の音が聞こえた気がする。'],
  '古い遺跡': ['むかしの物語が眠っている。', '石に刻まれた文字が光った！'],
  '森の広場': ['木もれ日がきれいだ。', '小鳥たちが歌っている。'],
  'ふしぎな水晶': ['水晶が淡く光っている。', '見たことのない景色が映った。'],
  '旅の門': ['遠くの街へ続く門だ。', '旅人たちの足音が響く。'],
  '癒しの泉': ['疲れがすうっと消えていく。'],
  '旅人の宿': ['あたたかい香りがただよう。', 'ひと休みして冒険に備えよう。'],
  '知恵の書庫': ['古い本のにおいがする。'],
};
const flavor = p => { const l = FLAVOR[p.k] || ['不思議な気配がする。']; let h = 0; for (const ch of p.id) h += ch.charCodeAt(0); return l[h % l.length]; };
const pois = new Map();          // id -> {id,e,k,name,lat,lng,marker}
let poiCenter = null, poiFetching = false, poiFailedAt = 0;
const poiHtml = (p, found) => found
  ? `<div class="obj found"><span class="sp">${p.e}</span><div class="base"></div><span class="nm">${esc(p.name)}</span></div>`
  : `<div class="obj unk"><span class="sp">❓</span><div class="base"></div></div>`;
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
        const p = { id, e: c.e, k: c.k, name: t['name:ja'] || t.name, lat, lng };
        p.marker = addPin(p, '', poiHtml(p, !!save.found[id]), () => {
          if (!me) return;
          if (save.found[id]) toast(`${p.e} ${p.name}\n${flavor(p)}`);
          else toast(`❓ まだ見ぬ名所…あと ${Math.round(dist(p, me))}m`);
        });
        pois.set(id, p);
      }
      poiCenter = center; poiFetching = false; updateHint(); return;
    } catch (e) { /* 次のサーバーへ */ }
  }
  poiFailedAt = Date.now(); poiFetching = false;
}
function maybeFetchPois() {
  if (!me || poiFetching || Date.now() - poiFailedAt < 60000) return;
  if (!poiCenter || dist(poiCenter, me) > POI_RADIUS * 0.45) fetchPois(me);
}
function checkFound() {
  for (const p of pois.values()) {
    if (save.found[p.id] || dist(p, me) > FOUND_RANGE) continue;
    save.found[p.id] = { name: p.name, e: p.e, k: p.k, date: todayStr() };
    p.marker.getElement().innerHTML = poiHtml(p, true);
    celebrate(p.e, `${p.k}「${p.name}」を発見！`); toast(flavor(p) + '\nボーナス +20🪙 +1🔮'); addGold(20); addShard(1);
  }
}
const DIRS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
function bearing(a, b) {
  const y = Math.sin((b.lng - a.lng) * RAD) * Math.cos(b.lat * RAD);
  const x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lng - a.lng) * RAD);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}
function updateHint() {
  if (!me) return;
  let best = null, bd = Infinity;
  for (const p of pois.values()) { if (save.found[p.id]) continue; const d = dist(p, me); if (d < bd) { bd = d; best = p; } }
  const h = $('hint');
  if (!best) { h.hidden = !pois.size; h.textContent = pois.size ? '近くの名所はすべて発見済み！' : ''; return; }
  h.hidden = false;
  h.textContent = `❓ 次の名所まで ${bd >= 1000 ? (bd / 1000).toFixed(1) + 'km' : Math.round(bd) + 'm'} ${DIRS[Math.round(bearing(me, best) / 45) % 8]}の方角`;
}

// ---- 演出・レベル・時間帯 ----
function celebrate(emoji, text) {
  const box = document.createElement('div'); box.className = 'pop';
  box.innerHTML = `<div class="big">${emoji}</div><div class="txt">${esc(text)}</div>`;
  const EM = ['✨', '🎉', '⭐', '🌸', '💫'];
  for (let k = 0; k < 18; k++) {
    const s = document.createElement('span'); s.className = 'cf'; s.textContent = EM[k % EM.length];
    const a = Math.random() * 6.28, d = 90 + Math.random() * 130;
    s.style.setProperty('--dx', Math.cos(a) * d + 'px'); s.style.setProperty('--dy', Math.sin(a) * d + 'px'); box.appendChild(s);
  }
  document.body.appendChild(box); setTimeout(() => box.remove(), 2600);
  try { navigator.vibrate && navigator.vibrate([80, 40, 80]); } catch (e) {}
}
const LEVELS = [[0, '見習い冒険者'], [500, '駆け出しの旅人'], [2000, '街道の旅人'], [6000, '熟練の冒険者'], [15000, '伝説の散歩家']];
let lastLv = null;
function updateLevel() {
  const xp = save.total + Object.keys(save.found).length * 300;
  let lv = 0; for (let k = 0; k < LEVELS.length; k++) if (xp >= LEVELS[k][0]) lv = k;
  const next = LEVELS[lv + 1];
  $('lvl-name').textContent = `Lv.${lv + 1} ${LEVELS[lv][1]}`;
  $('lvl-fill').style.width = (next ? (xp - LEVELS[lv][0]) / (next[0] - LEVELS[lv][0]) * 100 : 100) + '%';
  $('lvl-next').textContent = next ? `次まで${Math.ceil(next[0] - xp)}pt` : 'MAX';
  const up = lastLv !== null && lv > lastLv; lastLv = lv;
  if (up) { celebrate('🎖️', `レベルアップ！ ${LEVELS[lv][1]}`); addGold(50); addShard(1); }
}
function updateTint() {
  const h = hourNow();
  $('tint').style.background = h < 5 || h >= 20 ? 'rgba(20,30,90,.35)' : h < 7 ? 'rgba(255,170,120,.22)'
    : h < 16 ? 'rgba(255,255,255,0)' : h < 19 ? 'rgba(255,150,70,.22)' : 'rgba(90,50,130,.28)';
}
updateTint(); setInterval(updateTint, 60000);
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 4000);
}
const fmt = m => m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
function updateHud() {
  $('s-today').textContent = fmt(save.today);
  $('s-area').textContent = (explored.size * CELL * CELL / 1e6).toFixed(3) + ' km²';
  $('s-found').textContent = Object.keys(save.found).length;
  updateLevel();
}

// ---- 歩いた道(足あと) ----
function drawTrail() {
  const segs = []; let cur = [];
  for (const p of save.trail) {
    if (cur.length && dist({ lat: cur[cur.length - 1][1], lng: cur[cur.length - 1][0] }, { lat: p[0], lng: p[1] }) > 150) { if (cur.length > 1) segs.push(cur); cur = []; }
    cur.push([p[1], p[0]]);
  }
  if (cur.length > 1) segs.push(cur);
  setSrc('trail', { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'MultiLineString', coordinates: segs }, properties: {} }] });
}

// ---- コイン(歩いて拾う) ----
const COIN_RANGE = 100, COIN_COUNT = 14, COIN_TTL = 30 * 60e3;
const coinMarkers = new Map();
const coinHtml = c => `<div class="coin"><span class="c">${c.k === 'shard' ? '🔮' : c.v >= 10 ? '💎' : c.v >= 3 ? '💰' : '🪙'}</span><i class="sh"></i></div>`;
function addCoinMarker(c) { coinMarkers.set(c.id, addPin(c, '', coinHtml(c))); }
function removeCoinMarker(id) { const m = coinMarkers.get(id); if (m) { m.remove(); coinMarkers.delete(id); } }
function randomNear(p, minR, maxR) {
  const r = minR + Math.random() * (maxR - minR), th = Math.random() * 2 * Math.PI;
  return { lat: p.lat + r * Math.cos(th) / 111320, lng: p.lng + r * Math.sin(th) / (111320 * Math.cos(p.lat * RAD)) };
}
const MAGNET_LV = [1, 1.5, 2];
function maintainCoins() {
  const now = Date.now();
  save.coins = save.coins.filter(c => {
    const gone = c.exp < now || dist(c, me) > 600;
    if (gone) removeCoinMarker(c.id);
    return !gone;
  });
  const mg = save.built.filter(o => ITEM[o.t].magnet && dist(o, me) < 450);
  const power = mg.reduce((s, o) => s + ITEM[o.t].magnet * MAGNET_LV[lvOf(o) - 1], 0);
  const targetN = COIN_COUNT + Math.min(10, Math.floor(power * 2));
  while (save.coins.length < targetN) {
    const q = mg.length && Math.random() < Math.min(0.7, 0.25 * power)
      ? randomNear(mg[Math.floor(Math.random() * mg.length)], 15, 110) : randomNear(me, 30, 220);
    const r = Math.random();
    const c = { id: now + '-' + Math.random().toString(36).slice(2, 7), lat: q.lat, lng: q.lng,
      k: r > 0.94 ? 'shard' : undefined, v: r < 0.05 ? 10 : r < 0.25 ? 3 : 1, exp: now + COIN_TTL * (0.5 + Math.random()) };
    save.coins.push(c); addCoinMarker(c);
  }
}
function pickCoins(accuracy) {
  const range = COIN_RANGE + Math.min(accuracy || 0, 30);   // GPS誤差が大きいときはさらにゆるめる
  for (const c of [...save.coins]) {
    if (dist(c, me) > range) continue;
    save.coins.splice(save.coins.indexOf(c), 1); removeCoinMarker(c.id);
    if (c.k === 'shard') { addShard(1); continue; }
    const luck = Math.min(0.9, save.built.filter(o => ITEM[o.t].lucky && dist(o, c) <= 200).reduce((s, o) => s + 0.15 * lvOf(o), 0));
    if (Math.random() < luck) { floatText('🍀ご利益 2倍！'); addGold(c.v * 2); } else addGold(c.v);
  }
}
function floatText(text) {
  const p = avatar ? map.project([avatar.lng, avatar.lat]) : { x: innerWidth / 2, y: innerHeight / 2 };
  const d = document.createElement('div'); d.className = 'float'; d.textContent = text;
  d.style.left = p.x + 'px'; d.style.top = (p.y - 50) + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 1200);
}
const updateWallet = () => { $('coins').textContent = `🪙 ${save.gold}  🔮 ${save.shards}`; };
function addShard(n) { save.shards += n; updateWallet(); floatText(`${n > 0 ? '+' : ''}${n}🔮`); if (n > 0) try { navigator.vibrate && navigator.vibrate(30); } catch (e) {} }
function addGold(n) {
  save.gold += n; updateWallet();
  floatText((n > 0 ? '+' : '') + n + '🪙');
  if (n > 0) try { navigator.vibrate && navigator.vibrate(30); } catch (e) {}
}

// ---- つくる ----
// どのオブジェクトもコインを生産し、進化する
const LV_RATE = [1, 2.2, 4.5];     // 進化ごとの収穫倍率
const HARVEST_CAP_H = 8;           // 何時間分までためられるか
const ITEMS = [
  { id: 'flower', cost: 5, rate: 1.5, role: '花が咲いて、コインが実る', chain: [['🌸', '花畑'], ['🌷', 'チューリップ畑'], ['🌻', 'ひまわり畑']] },
  { id: 'tree', cost: 10, rate: 3, role: '実をつけて、コインに変わる', chain: [['🌳', '木'], ['🌲', '大樹'], ['🎄', '聖なる樹']] },
  { id: 'rest', cost: 15, rate: 2, role: '休憩所。立ち寄るとコインがたまる', chain: [['🪑', 'ベンチ'], ['⛺', 'テント'], ['🏕️', 'キャンプ場']] },
  { id: 'lantern', cost: 20, rate: 1, magnet: 1, role: '灯りにコインが集まってくる', chain: [['🏮', 'ちょうちん'], ['🪔', 'ランプ'], ['🌟', 'ほしの灯']] },
  { id: 'fountain', cost: 50, rate: 5, role: '湧き出るコインをためる', chain: [['💧', '小さな池'], ['⛲', '噴水'], ['🧜', '人魚の泉']] },
  { id: 'shrine', cost: 60, rate: 2, lucky: 1, role: 'ご利益で、近くのコインが2倍になることがある', chain: [['⛩️', 'ちいさなほこら'], ['🦊', 'きつねの社'], ['🐉', 'りゅうの社']] },
  { id: 'house', cost: 80, rate: 8, role: '家賃がたまる', chain: [['🏠', 'おうち'], ['🏡', '庭つきの家'], ['🏘️', '小さな村']] },
  { id: 'tower', cost: 150, rate: 3, magnet: 2, role: '遠くからコインを呼び寄せる', chain: [['🗼', 'ひかりの塔'], ['🔭', '星見の塔'], ['🛸', '天空港']] },
  { id: 'castle', cost: 300, rate: 20, role: '税収がたっぷりたまる', chain: [['🏰', 'おしろ'], ['🏯', '大きなおしろ'], ['👑', '王国']] },
];
const ITEM = Object.fromEntries(ITEMS.map(i => [i.id, i]));
const lvOf = o => o.lv || 1;
const face = o => ITEM[o.t].chain[lvOf(o) - 1];                 // [絵文字, 名前]
const rateOf = o => ITEM[o.t].rate * LV_RATE[lvOf(o) - 1];
const evoCost = o => ITEM[o.t].cost * (lvOf(o) === 1 ? 2 : 4);
const accrued = o => Math.min(HARVEST_CAP_H, (Date.now() - o.last) / 3600e3) * rateOf(o);
const BUILD_RANGE = 40, MAX_BUILT = 300, SHARD_PRICE = 60;
const SIZE = { flower: 28, tree: 36, rest: 32, lantern: 32, fountain: 38, shrine: 40, house: 42, tower: 48, castle: 52 };
const builtMarkers = new Map();
let placing = null;

const builtHtml = o => {
  const lv = lvOf(o), sz = (SIZE[o.t] || 36) + (lv - 1) * 4;
  return `<div class="obj"><span class="sp" style="font-size:${sz}px">${face(o)[0]}</span><div class="base"></div>${lv > 1 ? `<i class="st">${'★'.repeat(lv - 1)}</i>` : ''}</div>`;
};
function addBuiltMarker(o, fresh) {
  const m = addPin(o, '', builtHtml(o), () => openObj(o));
  const el = m.getElement(); el.classList.toggle('ready', accrued(o) >= 8);
  if (fresh) el.firstChild.classList.add('fresh');
  builtMarkers.set(o.id, m);
}
function refreshBuilt() {
  for (const o of save.built) { const m = builtMarkers.get(o.id); if (!m) continue; const el = m.getElement(); el.innerHTML = builtHtml(o); el.classList.toggle('ready', accrued(o) >= 8); }
}
setInterval(refreshBuilt, 60000);

function openBuildMenu() {
  $('build-gold').textContent = '🪙 ' + save.gold;
  $('build-list').innerHTML = ITEMS.map(i =>
    `<button data-id="${i.id}" ${save.gold < i.cost ? 'disabled' : ''}><b>${i.chain[0][0]}</b>${i.chain[0][1]}` +
    `<small>${i.cost}🪙 ・ ${i.rate}🪙/時</small><small>${i.chain.map(c => c[0]).join('→')}</small></button>`).join('') +
    `<button id="buy-shard" ${save.gold < SHARD_PRICE ? 'disabled' : ''}><b>🔮</b>進化のかけら<small>${SHARD_PRICE}🪙</small><small>所持 ${save.shards}</small></button>`;
  $('build-list').querySelectorAll('button[data-id]').forEach(b => b.onclick = () => startPlacing(ITEM[b.dataset.id]));
  $('buy-shard').onclick = () => { if (save.gold < SHARD_PRICE) return; addGold(-SHARD_PRICE); addShard(1); persist(); openBuildMenu(); };
  $('build').hidden = false;
}
function circlePoly(c, r) {
  const pts = [];
  for (let k = 0; k <= 64; k++) { const th = k / 64 * 2 * Math.PI; pts.push([c.lng + r * Math.sin(th) / (111320 * Math.cos(c.lat * RAD)), c.lat + r * Math.cos(th) / 111320]); }
  return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] }, properties: {} }] };
}
function showPlaceCircle() { setSrc('place', placing && me ? circlePoly(me, BUILD_RANGE) : EMPTY); }
function startPlacing(it) {
  if (!me) return toast('現在地を取得してからつくれます');
  placing = it; $('build').hidden = true;
  $('place-text').textContent = `${it.chain[0][0]} ${it.chain[0][1]}(${it.cost}🪙)を置く場所をタップ — 円の中だけ置けます`;
  $('placebar').hidden = false; showPlaceCircle();
}
function stopPlacing() { placing = null; $('placebar').hidden = true; showPlaceCircle(); }
function placeAt(ll) {
  if (!placing || !me) return;
  if (dist(ll, me) > BUILD_RANGE) return toast(`遠すぎます。あなたの周り${BUILD_RANGE}m以内に置こう`);
  if (save.built.length >= MAX_BUILT) return toast('これ以上は置けません');
  if (save.gold < placing.cost) return toast('コインが足りません');
  const it = placing;
  const o = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 6), t: it.id, lat: ll.lat, lng: ll.lng, d: todayStr(),
    lv: 1, last: Date.now(), days: 1, lastDay: todayStr(), spent: it.cost };
  save.built.push(o); addBuiltMarker(o, true); addGold(-it.cost);
  toast(`${face(o)[0]} ${face(o)[1]}をつくった！\n歩いて通うと育って、進化します`); stopPlacing(); persist(); updateHud();
}
// 近くに行くと、たまったコインを収穫する
function visitBuilt() {
  let got = 0; const parts = [];
  for (const o of save.built) {
    if (dist(o, me) > COIN_RANGE) continue;
    const a = accrued(o);
    if (a >= 1) { const n = Math.floor(a); o.last = Date.now() - (a - n) / rateOf(o) * 3600e3; got += n; parts.push(`${face(o)[0]}+${n}`); }
  }
  if (parts.length) { if (got) addGold(got); toast('🌾 ' + parts.join('  ')); refreshBuilt(); }
}
// 進化: 「進化のかけら」と「コイン」が必要(場所は問わない)
const EVO_SHARDS = [0, 1, 2];   // Lv1→2は1個、Lv2→3は2個
function evolveCheck(o) {
  const lv = lvOf(o);
  if (lv >= 3) return { ok: false, why: '最高の姿です' };
  if (save.shards < EVO_SHARDS[lv]) return { ok: false, why: `🔮かけらが足りません (必要${EVO_SHARDS[lv]} / 所持${save.shards})` };
  if (save.gold < evoCost(o)) return { ok: false, why: `コインが足りません (${evoCost(o)}🪙)` };
  return { ok: true };
}
function openObj(o) {
  if (placing) return;
  const it = ITEM[o.t], lv = lvOf(o), refund = Math.floor(o.spent / 2);
  $('obj-title').textContent = `${face(o)[0]} ${face(o)[1]} ${'★'.repeat(lv - 1)}`;
  let html = `<div>${it.role}</div><div>収穫: 1時間に ${rateOf(o).toFixed(1)}🪙 (最大${HARVEST_CAP_H}時間分)<br>たまっているコイン: <b>${Math.floor(accrued(o))}🪙</b>` +
    `<br>つくった日: ${o.d}</div>`;
  if (it.magnet) html += `<div>🧲 近くにコインを呼ぶ力あり</div>`;
  if (it.lucky) html += `<div>🍀 近くのコインが2倍になることがある</div>`;
  if (lv < 3) html += `<div>進化先: ${it.chain[lv][0]} ${it.chain[lv][1]}<br>必要: 🔮×${EVO_SHARDS[lv]} ＋ 🪙${evoCost(o)}</div>`;
  $('obj-sub').innerHTML = html;
  const ev = evolveCheck(o), eb = $('obj-evo');
  eb.hidden = lv >= 3; eb.disabled = !ev.ok; eb.textContent = ev.ok ? `進化させる (🔮×${EVO_SHARDS[lv]} ＋ ${evoCost(o)}🪙)` : ev.why;
  eb.onclick = () => {
    if (!evolveCheck(o).ok) return;
    const cost = evoCost(o); addGold(-cost); addShard(-EVO_SHARDS[lv]); o.spent += cost; o.lv = lv + 1;
    refreshBuilt(); celebrate(face(o)[0], `${face(o)[1]}に進化！`); persist(); updateHud(); $('obj').hidden = true;
  };
  $('obj-del').textContent = `とりこわす (+${refund}🪙)`;
  $('obj-del').onclick = () => {
    const m = builtMarkers.get(o.id); if (m) m.remove(); builtMarkers.delete(o.id);
    save.built.splice(save.built.indexOf(o), 1); addGold(refund); persist(); updateHud(); $('obj').hidden = true;
  };
  $('obj').hidden = false;
}
// 以前の保存データを新しい形式へ
for (const o of save.built) {
  if (o.t === 'bench') o.t = 'rest'; else if (o.t === 'tent') { o.t = 'rest'; o.lv = 2; }
  o.lv = o.lv || 1; o.last = o.last || Date.now(); o.days = o.days || 1; o.lastDay = o.lastDay || o.d; o.spent = o.spent || ITEM[o.t].cost;
}

// ---- 操作 ----
map.on('dragstart', () => { follow = false; });
map.on('click', e => {
  const ll = { lat: e.lngLat.lat, lng: e.lngLat.lng };
  if (placing) return placeAt(ll);
  if (debug) updatePosition(ll.lat, ll.lng, 0);
});
$('btn-locate').onclick = () => { follow = true; if (avatar) map.easeTo({ center: [avatar.lng, avatar.lat], zoom: CAM.zoom, pitch: map.getPitch(), duration: 600 }); };
$('btn-view').onclick = () => { follow = true; map.easeTo({ pitch: map.getPitch() > 20 ? 0 : CAM.pitch, bearing: 0, duration: 700 }); };
$('btn-debug').onclick = () => {
  debug = !debug; $('btn-debug').classList.toggle('on', debug);
  if (debug && !me) updatePosition(START.lat, START.lng, 0);
  if (!debug) $('status').textContent = '位置情報を取得中…';
};
$('btn-build').onclick = openBuildMenu;
$('build-close').onclick = () => { $('build').hidden = true; };
$('obj-close').onclick = () => { $('obj').hidden = true; };
$('place-cancel').onclick = stopPlacing;
$('place-here').onclick = () => placeAt(me);
$('btn-book').onclick = () => {
  const items = Object.values(save.found).sort((a, b) => b.date.localeCompare(a.date));
  $('book-list').innerHTML = items.length
    ? items.map(f => `<li>${f.e} <b>${esc(f.name)}</b><small>${f.k} ・ ${f.date}</small></li>`).join('')
    : '<li>まだ何も発見していません。❓を目指して歩こう！</li>';
  $('book-list').insertAdjacentHTML('afterbegin', `<li>🏗️ つくったもの ${save.built.length}個 ／ 🪙 ${save.gold} ／ 🔮 ${save.shards}</li>`);
  $('book').hidden = false;
};
$('book-close').onclick = () => { $('book').hidden = true; };

// ---- 位置更新 ----
function updatePosition(lat, lng, accuracy) {
  const ll = { lat, lng }; me = ll;
  if (!target) {
    avatar = { lat, lng };
    meMarker = addPin(ll, '', '<div class="hero"><i class="ring"></i><span class="sp">🧙</span><i class="sh"></i></div>');
    map.jumpTo({ center: [lng, lat] });
  }
  target = ll;
  const now = Date.now();
  if (!last) last = { p: ll, t: now };
  else {
    const d = dist(last.p, ll);
    if (d >= MIN_STEP) {
      const walking = d / Math.max((now - last.t) / 1000, 1) <= MAX_SPEED;
      if (walking && !debug) {
        if (save.day !== todayStr()) { save.day = todayStr(); save.today = 0; }
        save.today += d; save.total += d;
        save.trail.push([lat, lng]);
        if (save.trail.length > TRAIL_MAX) save.trail.splice(0, save.trail.length - TRAIL_MAX);
        drawTrail();
      }
      last = { p: ll, t: now };
    }
  }
  revealAround(ll); maintainCoins(); pickCoins(accuracy); visitBuilt(); maybeFetchPois(); checkFound(); updateHint(); persistSoon(); updateHud();
  if (placing) showPlaceCircle();
  $('status').textContent = debug ? 'テスト移動中(地図タップで移動)' : `位置取得OK (精度 ${Math.round(accuracy || 0)}m)`;
}

// ---- GPS (取れないときは東京駅からプレビュー) ----
function startPreview(reason) {
  if (me) return;
  debug = true; $('btn-debug').classList.add('on');
  updatePosition(START.lat, START.lng, 0);
  $('status').textContent = reason + ' → プレビュー中(地図タップで移動)';
}
if (!navigator.geolocation) startPreview('位置情報に未対応');
else {
  navigator.geolocation.watchPosition(
    p => { if (!debug) updatePosition(p.coords.latitude, p.coords.longitude, p.coords.accuracy); },
    err => startPreview('位置情報を取得できません(' + err.message + ')'),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
  );
  setTimeout(() => startPreview('位置情報の取得に時間がかかっています'), 8000);
}
save.coins.forEach(addCoinMarker);
save.built.forEach(o => addBuiltMarker(o, false));
updateWallet(); updateHud();
