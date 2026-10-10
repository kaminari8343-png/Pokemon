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
const save = Object.assign({ cells: [], found: {}, trail: [], today: 0, total: 0, day: '' }, JSON.parse(localStorage.getItem(KEY) || '{}'));
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
const trailLine = L.polyline([], { color: '#ffd873', weight: 7, opacity: 1, dashArray: '1 14', lineCap: 'round', className: 'trail' }).addTo(map);
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
const fog = $('fog'), ctx = fog.getContext('2d'), fx = $('fx'), fctx = fx.getContext('2d');
let stars = [], decor = [];
const hsh = (i, j, s) => { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(s, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const DECOR = ['🌸', '🌼', '🍄', '🌿', '🍀', '🐞', '🌷'];
function resizeFog() { const r = devicePixelRatio || 1; for (const c of [fog, fx]) { c.width = innerWidth * r; c.height = innerHeight * r; } drawFog(); }
function drawFog() {
  const r = devicePixelRatio || 1, W = fog.width, H = fog.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, W, H);
  const g0 = ctx.createLinearGradient(0, 0, W, H); g0.addColorStop(0, '#1d2a5c'); g0.addColorStop(1, '#3a2263');
  ctx.globalAlpha = 0.86; ctx.fillStyle = g0; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-out';
  const c = map.getCenter();
  const mpp = 40075016.686 * Math.cos(c.lat * Math.PI / 180) / (256 * Math.pow(2, map.getZoom()));
  const rad = (CELL * 1.6 / mpp) * r, cellPx = CELL / mpp;
  const b = map.getBounds().pad(0.2);
  stars = []; decor = [];
  const iMin = Math.floor(b.getSouth() / dLat), iMax = Math.floor(b.getNorth() / dLat);
  for (let i = iMin; i <= iMax; i++) {
    const w = dLng((i + 0.5) * dLat), jMin = Math.floor(b.getWest() / w), jMax = Math.floor(b.getEast() / w);
    for (let j = jMin; j <= jMax; j++) {
      const pt = map.latLngToContainerPoint(cellCenter(i, j));
      if (explored.has(key(i, j))) {
        const x = pt.x * r, y = pt.y * r;
        const g = ctx.createRadialGradient(x, y, rad * 0.35, x, y, rad);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
        if (hsh(i, j, 1) < 0.02) decor.push({ x: pt.x + (hsh(i, j, 2) - 0.5) * cellPx, y: pt.y + (hsh(i, j, 3) - 0.5) * cellPx,
          e: DECOR[Math.floor(hsh(i, j, 4) * DECOR.length)], p: hsh(i, j, 5) * 6.28 });
      } else if (hsh(i, j, 6) < 0.06) {
        stars.push({ x: pt.x + (hsh(i, j, 7) - 0.5) * cellPx, y: pt.y + (hsh(i, j, 8) - 0.5) * cellPx, s: 1 + hsh(i, j, 9) * 2, p: hsh(i, j, 10) * 6.28 });
      }
    }
  }
}
// 星のまたたき・花ゆれ・ちょうちょ
function fxLoop(t) {
  const r = devicePixelRatio || 1;
  fctx.setTransform(r, 0, 0, r, 0, 0); fctx.clearRect(0, 0, innerWidth, innerHeight);
  fctx.textAlign = 'center'; fctx.textBaseline = 'middle'; fctx.fillStyle = '#fff6c8';
  for (const s of stars) { fctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t / 700 + s.p)); fctx.beginPath(); fctx.arc(s.x, s.y, s.s, 0, 7); fctx.fill(); }
  fctx.globalAlpha = 1; fctx.font = '18px serif';
  for (const d of decor) fctx.fillText(d.e, d.x + Math.sin(t / 900 + d.p) * 2, d.y + Math.cos(t / 1100 + d.p) * 1.5);
  if (me) {
    const c = map.latLngToContainerPoint(me); fctx.font = '17px serif';
    for (let k = 0; k < 3; k++) { const a = t / 1000 * (0.8 + k * 0.3) + k * 2.1, rr = 36 + k * 12; fctx.fillText('🦋', c.x + Math.cos(a) * rr, c.y - 10 + Math.sin(a * 1.3) * rr * 0.6); }
  }
  requestAnimationFrame(fxLoop);
}
requestAnimationFrame(fxLoop);
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
        p.marker.on('click', () => {
          if (!me) return;
          if (save.found[id]) toast(`${p.e} ${p.name}\n${flavor(p)}`);
          else { const d = map.distance(p.latlng, me); toast(`❓ まだ見ぬ名所…あと ${Math.round(d)}m`); }
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
  if (!poiCenter || map.distance(poiCenter, me) > POI_RADIUS * 0.45) fetchPois(me);
}

// ---- 発見 / ヒント ----
function checkFound() {
  for (const p of pois.values()) {
    if (save.found[p.id] || map.distance(p.latlng, me) > FOUND_RANGE) continue;
    save.found[p.id] = { name: p.name, e: p.e, k: p.k, date: todayStr() };
    p.marker.setIcon(poiIcon(p, true));
    celebrate(p.e, `${p.k}「${p.name}」を発見！`); toast(flavor(p));
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
  if (lastLv !== null && lv > lastLv) celebrate('🎖️', `レベルアップ！ ${LEVELS[lv][1]}`);
  lastLv = lv;
}
function updateTint() {
  const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
  $('tint').style.background = h < 5 || h >= 20 ? 'rgba(20,30,90,.35)' : h < 7 ? 'rgba(255,170,120,.22)'
    : h < 16 ? 'rgba(255,255,255,0)' : h < 19 ? 'rgba(255,150,70,.22)' : 'rgba(90,50,130,.28)';
}
updateTint(); setInterval(updateTint, 60000);

// ---- 表示 ----
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.style.whiteSpace = 'pre-line'; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 4000);
}
const fmt = m => m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
function updateHud() {
  $('s-today').textContent = fmt(save.today);
  $('s-area').textContent = (explored.size * CELL * CELL / 1e6).toFixed(3) + ' km²';
  $('s-found').textContent = Object.keys(save.found).length;
  updateLevel();
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
    meMarker = L.marker(latlng, { icon: L.divIcon({ html: '<span class="bob">🧙</span>', className: 'me', iconSize: [30, 30] }), zIndexOffset: 1000 }).addTo(map);
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
        save.today += d; save.total += d;
        save.trail.push([latlng.lat, latlng.lng]);
        if (save.trail.length > TRAIL_MAX) save.trail.splice(0, save.trail.length - TRAIL_MAX);
        drawTrail();
      }
      last = { p: latlng, t: now };
    }
  }
  revealAround(latlng); maybeFetchPois(); checkFound(); updateHint(); persist(); updateHud();
  $('status').textContent = debug ? 'テスト移動中(地図タップで移動)' : `位置取得OK (精度 ${Math.round(accuracy || 0)}m)`;
  drawFog();
  if (follow) map.panTo(latlng, { animate: true });
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
