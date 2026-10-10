'use strict';
// ---- 設定 ----
const CELL = 20;            // 1マスの大きさ(m)
const REVEAL = 70;          // 霧が晴れる半径(m)
const FOUND_RANGE = 60;     // 名所を発見できる距離(m)
const MIN_STEP = 3;         // これ未満の移動は無視(m)
const MAX_SPEED = 12;       // m/s これ超は車・GPS飛びとして歩行距離に加算しない
const R_EARTH = 6378137;

// ---- 保存データ ----
const KEY = 'sanpo-world';
const save = Object.assign({ cells: [], found: [], today: 0, day: '' }, JSON.parse(localStorage.getItem(KEY) || '{}'));
const explored = new Set(save.cells), found = new Set(save.found);
const todayStr = () => new Date().toISOString().slice(0, 10);
if (save.day !== todayStr()) { save.day = todayStr(); save.today = 0; }
const persist = () => { save.cells = [...explored]; save.found = [...found]; localStorage.setItem(KEY, JSON.stringify(save)); };

// ---- 座標変換: 緯度経度 -> ワールド座標(メートル, Webメルカトル) ----
const toWorld = (lat, lng) => ({
  x: R_EARTH * lng * Math.PI / 180,
  y: R_EARTH * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)),
});
const haversine = (a, b) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
};

// ---- 世界の生成(同じ場所は常に同じ地形) ----
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s) {
  return (vnoise(x, y, s) * 0.55 + vnoise(x * 2, y * 2, s + 1) * 0.3 + vnoise(x * 4, y * 4, s + 2) * 0.15);
}
const LANDMARKS = [
  { emoji: '🏰', name: '古い城あと' }, { emoji: '⛲', name: '光の泉' }, { emoji: '🗿', name: '石の守り神' },
  { emoji: '🏕️', name: '旅人のキャンプ' }, { emoji: '🌳', name: '大樹' }, { emoji: '⛩️', name: 'ほこら' },
  { emoji: '🔮', name: '不思議な水晶' }, { emoji: '🛖', name: '森の小屋' },
];
const terrainCache = new Map();
function terrain(i, j) {
  const k = i + ',' + j;
  let t = terrainCache.get(k);
  if (t) return t;
  const e = fbm(i / 45, j / 45, 1), m = fbm(i / 28 + 50, j / 28 + 50, 7);
  let biome;
  if (e < 0.30) biome = 'deep';
  else if (e < 0.36) biome = 'shallow';
  else if (e < 0.39) biome = 'sand';
  else if (e > 0.70) biome = e > 0.78 ? 'snow' : 'rock';
  else biome = m > 0.52 ? 'forest' : 'grass';
  const land = biome !== 'deep' && biome !== 'shallow';
  let lm = null;
  if (land && biome !== 'snow' && hash(i, j, 99) < 0.006) lm = LANDMARKS[Math.floor(hash(i, j, 5) * LANDMARKS.length)];
  t = { biome, lm, v: hash(i, j, 3) };
  if (terrainCache.size > 20000) terrainCache.clear();
  terrainCache.set(k, t);
  return t;
}
const COLORS = {
  deep: [30, 70, 130], shallow: [60, 130, 190], sand: [225, 205, 150],
  grass: [110, 170, 80], forest: [60, 125, 70], rock: [130, 125, 120], snow: [235, 240, 245],
};

// ---- 描画 ----
const cv = document.getElementById('world'), ctx = cv.getContext('2d');
let W = 0, H = 0, dpr = 1, px = 22;           // px: 1マスの画面ピクセル数(CSS px)
function resize() {
  dpr = devicePixelRatio || 1; W = innerWidth; H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
}
addEventListener('resize', resize); resize();

let target = null;         // 現実の現在地 {lat,lng,x,y}
let view = { x: 0, y: 0 }; // 画面中心のワールド座標(滑らかに追従)
let avatar = { x: 0, y: 0 };
let follow = true, debug = false, last = null;
const mpc = () => CELL / Math.cos(lastLat * Math.PI / 180);   // メルカトル上の1マスの長さ
let lastLat = 35.68;

function draw(now) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#101820'; ctx.fillRect(0, 0, W, H);
  if (target) {
    avatar.x += (target.x - avatar.x) * 0.08; avatar.y += (target.y - avatar.y) * 0.08;
    if (follow) { view.x = avatar.x; view.y = avatar.y; }
    const cm = mpc();
    const i0 = Math.floor((view.x - W / 2 / px * cm) / cm), i1 = Math.ceil((view.x + W / 2 / px * cm) / cm);
    const j0 = Math.floor((view.y - H / 2 / px * cm) / cm), j1 = Math.ceil((view.y + H / 2 / px * cm) / cm);
    const sx = i => (i * cm - view.x) / cm * px + W / 2;
    const sy = j => H / 2 - (j * cm - view.y) / cm * px - px;
    const t = now / 1000;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = sx(i), y = sy(j);
      if (!explored.has(i + ',' + j)) { ctx.fillStyle = '#1b2631'; ctx.fillRect(x, y, px + 1, px + 1); continue; }
      const tr = terrain(i, j), c = COLORS[tr.biome], shade = (tr.v - 0.5) * 14;
      let r = c[0] + shade, g = c[1] + shade, b = c[2] + shade;
      if (tr.biome === 'shallow' || tr.biome === 'deep') { const w = Math.sin(t * 1.5 + i * 0.7 + j * 0.5) * 8; r += w; g += w; b += w; }
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`; ctx.fillRect(x, y, px + 1, px + 1);
      ctx.font = `${px * 0.8}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (tr.lm) { ctx.globalAlpha = found.has(i + ',' + j) ? 1 : 0.55; ctx.font = `${px * 1.3}px serif`; ctx.fillText(tr.lm.emoji, x + px / 2, y + px / 2); ctx.globalAlpha = 1; }
      else if (tr.biome === 'forest' && tr.v > 0.35) ctx.fillText('🌲', x + px / 2, y + px / 2);
      else if (tr.biome === 'rock' && tr.v > 0.5) ctx.fillText('⛰️', x + px / 2, y + px / 2);
      else if (tr.biome === 'grass' && tr.v > 0.93) ctx.fillText('🌼', x + px / 2, y + px / 2);
    }
    // アバター
    ctx.font = `${px * 1.5}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🚶', (avatar.x - view.x) / cm * px + W / 2, H / 2 - (avatar.y - view.y) / cm * px - px * 0.2);
    // 現実の時刻に合わせた昼夜
    const hr = new Date().getHours() + new Date().getMinutes() / 60;
    const night = Math.max(0, Math.min(1, hr < 5 ? 1 : hr < 7 ? (7 - hr) / 2 : hr < 17 ? 0 : hr < 19 ? (hr - 17) / 2 : 1));
    if (night > 0) { ctx.fillStyle = `rgba(10,15,50,${0.4 * night})`; ctx.fillRect(0, 0, W, H); }
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// ---- 探索・発見 ----
function revealAround(p) {
  const cm = mpc(), n = Math.ceil(REVEAL / CELL), ci = Math.floor(p.x / cm), cj = Math.floor(p.y / cm);
  for (let j = cj - n; j <= cj + n; j++) for (let i = ci - n; i <= ci + n; i++) {
    if (Math.hypot(i - p.x / cm, j - p.y / cm) * CELL <= REVEAL) explored.add(i + ',' + j);
  }
  const m = Math.ceil(FOUND_RANGE / CELL);
  for (let j = cj - m; j <= cj + m; j++) for (let i = ci - m; i <= ci + m; i++) {
    const k = i + ',' + j;
    if (found.has(k) || Math.hypot(i + 0.5 - p.x / cm, j + 0.5 - p.y / cm) * CELL > FOUND_RANGE) continue;
    const lm = terrain(i, j).lm;
    if (lm) { found.add(k); toast(`${lm.emoji} ${lm.name} を発見！`); }
  }
}

// ---- 表示 ----
const $ = id => document.getElementById(id);
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 3000);
}
const fmt = m => m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
function updateHud() {
  $('s-today').textContent = fmt(save.today);
  $('s-area').textContent = (explored.size * CELL * CELL / 1e6).toFixed(3) + ' km²';
  $('s-found').textContent = found.size;
}

// ---- 位置更新 ----
function updatePosition(lat, lng, accuracy) {
  lastLat = lat;
  const w = toWorld(lat, lng), first = !target;
  target = { lat, lng, x: w.x, y: w.y };
  if (first) { avatar = { x: w.x, y: w.y }; view = { x: w.x, y: w.y }; }
  const now = Date.now();
  if (last) {
    const d = haversine(last, target);
    if (d >= MIN_STEP) {
      if (d / Math.max((now - last.t) / 1000, 1) <= MAX_SPEED && !debug) {
        if (save.day !== todayStr()) { save.day = todayStr(); save.today = 0; }
        save.today += d;
      }
      last = { lat, lng, t: now };
    }
  } else last = { lat, lng, t: now };
  revealAround(target); persist(); updateHud();
  $('status').textContent = debug ? 'テスト移動中(画面をタップで移動)' : `位置取得OK (精度 ${Math.round(accuracy || 0)}m)`;
}

// ---- 操作 ----
$('btn-zoom-in').onclick = () => px = Math.min(48, px * 1.25);
$('btn-zoom-out').onclick = () => px = Math.max(8, px / 1.25);
$('btn-locate').onclick = () => { follow = true; };
$('btn-debug').onclick = () => {
  debug = !debug; $('btn-debug').classList.toggle('on', debug);
  if (debug && !target) updatePosition(35.681236, 139.767125, 0);   // GPSなしでも東京駅から開始
  if (!debug) $('status').textContent = '位置情報を取得中…';
};
// ドラッグで世界を見渡す / テスト移動中はタップでワープ
let drag = null;
cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: false }; });
cv.addEventListener('pointermove', e => {
  if (!drag || !target) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
  if (drag.moved) { follow = false; const cm = mpc(); view.x -= dx / px * cm; view.y += dy / px * cm; drag.x = e.clientX; drag.y = e.clientY; }
});
cv.addEventListener('pointerup', e => {
  if (drag && !drag.moved && debug && target) {
    const cm = mpc(), wx = view.x + (e.clientX - W / 2) / px * cm, wy = view.y - (e.clientY - H / 2) / px * cm;
    const lng = wx / R_EARTH * 180 / Math.PI, lat = (2 * Math.atan(Math.exp(wy / R_EARTH)) - Math.PI / 2) * 180 / Math.PI;
    updatePosition(lat, lng, 0);
  }
  drag = null;
});

// ---- GPS ----
if (!navigator.geolocation) {
  $('status').textContent = '位置情報に未対応 → 🧪をONに';
} else {
  navigator.geolocation.watchPosition(
    p => { if (!debug) updatePosition(p.coords.latitude, p.coords.longitude, p.coords.accuracy); },
    err => { $('status').textContent = '位置情報を取得できません: ' + err.message + ' (🧪でテスト)'; },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
  );
}
updateHud();
