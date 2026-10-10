'use strict';
// ---- 設定 ----
const SPAWN_RADIUS = 120;     // プレイヤー周囲に出現させる半径(m)
const CATCH_RANGE = 40;       // 捕獲できる距離(m)
const MAX_MONS = 8;           // 同時に出現する数
const MON_TTL = 5 * 60e3;     // 出現時間(ms)
const MIN_STEP = 3;           // これ未満の移動はノイズとして無視(m)
const MAX_SPEED = 12;         // m/s これ超は車・GPS飛びとして歩行距離に加算しない

// オリジナルのモンスター定義 (rarity: 出現重み, difficulty: 捕獲の難しさ)
const SPECIES = [
  { id: 'leafy',  name: 'リーフィ',   emoji: '🌱', weight: 40, difficulty: 0.2 },
  { id: 'aqua',   name: 'アクア',     emoji: '💧', weight: 30, difficulty: 0.3 },
  { id: 'flare',  name: 'フレア',     emoji: '🔥', weight: 20, difficulty: 0.45 },
  { id: 'volt',   name: 'ボルト',     emoji: '⚡', weight: 8,  difficulty: 0.6 },
  { id: 'lunar',  name: 'ルナ',       emoji: '🌙', weight: 2,  difficulty: 0.8 },
];

// ---- 状態(localStorage に保存) ----
const save = JSON.parse(localStorage.getItem('walkmon') || '{"caught":{},"walked":0}');
const persist = () => localStorage.setItem('walkmon', JSON.stringify(save));

// ---- 地図 ----
const map = L.map('map', { zoomControl: false }).setView([35.681236, 139.767125], 17); // 初期値: 東京駅
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '© OpenStreetMap contributors'
}).addTo(map);

const $ = id => document.getElementById(id);
const icon = (emoji, cls) => L.divIcon({ html: emoji, className: cls, iconSize: [36, 36] });
let me = null, meMarker = null, lastPos = null, debug = false;
const mons = []; // {species, latlng, marker, expires}

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2500);
}
const dist = (a, b) => map.distance(a, b);

// ---- 位置更新 ----
function updatePosition(latlng, accuracy) {
  me = latlng;
  if (!meMarker) {
    meMarker = L.marker(latlng, { icon: icon('🚶', 'mon me'), zIndexOffset: 1000 }).addTo(map);
    map.setView(latlng, 17);
  } else meMarker.setLatLng(latlng);

  if (lastPos) {
    const d = dist(lastPos, latlng);
    if (d >= MIN_STEP) {
      const dt = (Date.now() - lastPos.t) / 1000;
      if (d / Math.max(dt, 1) <= MAX_SPEED) { save.walked += d; persist(); }
      lastPos = Object.assign(L.latLng(latlng), { t: Date.now() });
    }
  } else lastPos = Object.assign(L.latLng(latlng), { t: Date.now() });

  $('status').textContent = debug ? 'テスト移動中(地図タップで移動)'
    : `位置取得OK (精度 ${Math.round(accuracy || 0)}m)`;
  $('walked').textContent = save.walked >= 1000 ? (save.walked / 1000).toFixed(2) + ' km' : Math.round(save.walked) + ' m';
  maintainSpawns();
  if (!debug) map.panTo(latlng, { animate: true });
}

// ---- 出現 ----
function pickSpecies() {
  const total = SPECIES.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  return SPECIES.find(s => (r -= s.weight) < 0) || SPECIES[0];
}
function randomNear(center, minR, maxR) {
  const r = minR + Math.random() * (maxR - minR), th = Math.random() * 2 * Math.PI;
  const dLat = (r * Math.cos(th)) / 111320;
  const dLng = (r * Math.sin(th)) / (111320 * Math.cos(center.lat * Math.PI / 180));
  return L.latLng(center.lat + dLat, center.lng + dLng);
}
function maintainSpawns() {
  const now = Date.now();
  for (let i = mons.length - 1; i >= 0; i--) {
    const m = mons[i];
    if (m.expires < now || dist(m.latlng, me) > SPAWN_RADIUS * 2) { map.removeLayer(m.marker); mons.splice(i, 1); }
  }
  while (mons.length < MAX_MONS) {
    const species = pickSpecies(), latlng = randomNear(me, 20, SPAWN_RADIUS);
    const marker = L.marker(latlng, { icon: icon(species.emoji, 'mon') }).addTo(map);
    const mon = { species, latlng, marker, expires: now + MON_TTL * (0.5 + Math.random()) };
    marker.on('click', () => onMonClick(mon));
    mons.push(mon);
  }
}
setInterval(() => me && maintainSpawns(), 10000);

// ---- 捕獲 ----
let current = null, raf = 0;
function onMonClick(mon) {
  const d = dist(mon.latlng, me);
  if (d > CATCH_RANGE) return toast(`遠すぎる！あと ${Math.round(d - CATCH_RANGE)}m 近づこう`);
  current = mon;
  $('c-emoji').textContent = mon.species.emoji;
  $('c-name').textContent = mon.species.name;
  $('c-msg').textContent = 'タイミングよくボールを投げよう！';
  $('c-throw').disabled = false;
  $('catch').hidden = false;
  // 緑ゾーン: 難しいほど狭い
  const w = Math.round(30 - mon.species.difficulty * 20);
  Object.assign($('c-ring').style, { width: w + '%', left: (50 - w / 2) + '%' });
  const start = performance.now();
  (function loop(t) {
    const pos = (Math.sin((t - start) / 350) + 1) * 50; // 0..100 を往復
    $('c-bar').style.setProperty('--pos', pos + '%');
    $('c-bar').dataset.pos = pos;
    raf = requestAnimationFrame(loop);
  })(start);
}
function closeCatch() { cancelAnimationFrame(raf); $('catch').hidden = true; current = null; }
$('c-throw').onclick = () => {
  const bar = $('c-bar'), pos = +bar.dataset.pos, ring = $('c-ring');
  const lo = parseFloat(ring.style.left), hi = lo + parseFloat(ring.style.width);
  const hit = pos >= lo && pos <= hi;
  const ok = hit ? Math.random() > current.species.difficulty * 0.5 : Math.random() < 0.1;
  const mon = current;
  if (ok) {
    save.caught[mon.species.id] = (save.caught[mon.species.id] || 0) + 1; persist();
    map.removeLayer(mon.marker); mons.splice(mons.indexOf(mon), 1);
    toast(`${mon.species.name} をつかまえた！`); closeCatch();
  } else {
    $('c-msg').textContent = hit ? 'おしい！ボールから出てきた！' : 'はずれ！';
    if (Math.random() < 0.25) { // 逃げられる
      map.removeLayer(mon.marker); mons.splice(mons.indexOf(mon), 1);
      toast(`${mon.species.name} は逃げてしまった…`); closeCatch();
    }
  }
};
$('c-run').onclick = closeCatch;

// ---- 図鑑 ----
$('btn-dex').onclick = () => {
  $('dex-list').innerHTML = SPECIES.map(s => {
    const n = save.caught[s.id] || 0;
    return `<li>${n ? s.emoji + ' ' + s.name : '❓ ？？？'} <span style="float:right">×${n}</span></li>`;
  }).join('');
  $('dex').hidden = false;
};
$('dex-close').onclick = () => $('dex').hidden = true;

// ---- テスト移動(PCで動作確認用): 地図タップで現在地をワープ ----
$('btn-debug').onclick = () => {
  debug = !debug;
  $('btn-debug').textContent = 'テスト移動: ' + (debug ? 'ON' : 'OFF');
  if (debug && !me) updatePosition(map.getCenter(), 0);
};
map.on('click', e => { if (debug) updatePosition(e.latlng, 0); });

// ---- GPS ----
if (!navigator.geolocation) {
  $('status').textContent = '位置情報に未対応 → テスト移動をONに';
} else {
  navigator.geolocation.watchPosition(
    p => { if (!debug) updatePosition(L.latLng(p.coords.latitude, p.coords.longitude), p.coords.accuracy); },
    err => { $('status').textContent = '位置情報を取得できません: ' + err.message + ' (テスト移動をON)'; },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
  );
}
