'use strict';
// ---- 設定 ----
const CELL = 20;            // 探索マスの1辺(m)
const REVEAL = 70;          // 現在地から霧が晴れる半径(m)
const MIN_STEP = 3;         // これ未満の移動はノイズとして無視(m)
const MAX_SPEED = 12;       // m/s これ超は車・GPS飛びとして歩行距離に加算しない
const FOG_COLOR = '#d9d0b8';
const FOG_ALPHA = 0.93;

// ---- 保存データ ----
const KEY = 'sanpo-map';
const save = Object.assign({ cells: [], total: 0, day: '', today: 0 }, JSON.parse(localStorage.getItem(KEY) || '{}'));
const explored = new Set(save.cells);
const persist = () => { save.cells = [...explored]; localStorage.setItem(KEY, JSON.stringify(save)); };
const todayStr = () => new Date().toISOString().slice(0, 10);
if (save.day !== todayStr()) { save.day = todayStr(); save.today = 0; }

// ---- 地図 ----
const map = L.map('map', { zoomControl: false }).setView([35.681236, 139.767125], 17);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  subdomains: 'abcd', maxZoom: 19,
  attribution: '© OpenStreetMap contributors © CARTO'
}).addTo(map);

const $ = id => document.getElementById(id);
let me = null, meMarker = null, last = null, debug = false, follow = true;

// ---- 探索マス ----
const dLat = CELL / 111320;
const dLng = lat => CELL / (111320 * Math.cos(lat * Math.PI / 180));
const key = (i, j) => i + ',' + j;
const cellCenter = (i, j) => {
  const lat = (i + 0.5) * dLat;
  return L.latLng(lat, (j + 0.5) * dLng(lat));
};
function reveal(p) {
  let added = 0;
  const di = Math.ceil(REVEAL / CELL), i0 = Math.floor(p.lat / dLat);
  for (let i = i0 - di; i <= i0 + di; i++) {
    const rowLat = (i + 0.5) * dLat, w = dLng(rowLat), j0 = Math.floor(p.lng / w);
    for (let j = j0 - di - 1; j <= j0 + di + 1; j++) {
      if (map.distance(cellCenter(i, j), p) <= REVEAL && !explored.has(key(i, j))) {
        explored.add(key(i, j)); added++;
      }
    }
  }
  return added;
}

// ---- 霧の描画 ----
const fog = $('fog'), ctx = fog.getContext('2d');
function resizeFog() {
  const r = devicePixelRatio || 1;
  fog.width = innerWidth * r; fog.height = innerHeight * r;
  drawFog();
}
function drawFog() {
  const r = devicePixelRatio || 1, W = fog.width, H = fog.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, W, H);
  ctx.globalAlpha = FOG_ALPHA; ctx.fillStyle = FOG_COLOR; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-out';
  const c = map.getCenter();
  const mpp = 40075016.686 * Math.cos(c.lat * Math.PI / 180) / (256 * Math.pow(2, map.getZoom()));
  const rad = (CELL * 1.6 / mpp) * r;               // マスより少し大きく描いて繋げる
  const b = map.getBounds().pad(0.2);
  const iMin = Math.floor(b.getSouth() / dLat), iMax = Math.floor(b.getNorth() / dLat);
  for (let i = iMin; i <= iMax; i++) {
    const w = dLng((i + 0.5) * dLat);
    const jMin = Math.floor(b.getWest() / w), jMax = Math.floor(b.getEast() / w);
    for (let j = jMin; j <= jMax; j++) {
      if (!explored.has(key(i, j))) continue;
      const pt = map.latLngToContainerPoint(cellCenter(i, j));
      const x = pt.x * r, y = pt.y * r;
      const g = ctx.createRadialGradient(x, y, rad * 0.35, x, y, rad);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
    }
  }
}
map.on('move zoom viewreset', drawFog);
addEventListener('resize', resizeFog);

// ---- 表示 ----
const fmtDist = m => m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
function updateHud() {
  $('s-today').textContent = fmtDist(save.today);
  $('s-total').textContent = fmtDist(save.total);
  $('s-area').textContent = (explored.size * CELL * CELL / 1e6).toFixed(3) + ' km²';
}

// ---- 位置更新 ----
function updatePosition(latlng, accuracy) {
  me = latlng;
  if (!meMarker) {
    meMarker = L.marker(latlng, { icon: L.divIcon({ html: '🚶', className: 'me', iconSize: [30, 30] }), zIndexOffset: 1000 }).addTo(map);
    map.setView(latlng, 17);
  } else meMarker.setLatLng(latlng);

  const now = Date.now();
  if (last) {
    const d = map.distance(last.p, latlng);
    if (d >= MIN_STEP) {
      if (d / Math.max((now - last.t) / 1000, 1) <= MAX_SPEED) {
        if (save.day !== todayStr()) { save.day = todayStr(); save.today = 0; }
        save.today += d; save.total += d;
      }
      last = { p: latlng, t: now };
    }
  } else last = { p: latlng, t: now };

  reveal(latlng); persist(); updateHud();
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

// ---- GPS ----
if (!navigator.geolocation) {
  $('status').textContent = '位置情報に未対応 → 🧪をONに';
} else {
  navigator.geolocation.watchPosition(
    p => { if (!debug) updatePosition(L.latLng(p.coords.latitude, p.coords.longitude), p.coords.accuracy); },
    err => { $('status').textContent = '位置情報を取得できません: ' + err.message + ' (🧪でテスト)'; },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
  );
}
updateHud(); resizeFog();
