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
const save = Object.assign({ cells: [], found: {}, trail: [], today: 0, total: 0, day: '', gold: 0, coins: [], built: [] }, JSON.parse(localStorage.getItem(KEY) || '{}'));
save.coins = save.coins.filter(c => c.exp > Date.now());
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
    celebrate(p.e, `${p.k}「${p.name}」を発見！`); toast(flavor(p) + '\nボーナス +20🪙'); addGold(20);
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
  const up = lastLv !== null && lv > lastLv; lastLv = lv;
  if (up) { celebrate('🎖️', `レベルアップ！ ${LEVELS[lv][1]}`); addGold(50); }
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
    meMarker = L.marker(latlng, { icon: L.divIcon({ html: '<span class="bob">🧙</span>', className: 'me', iconSize: [30, 30] }), zIndexOffset: 1000, interactive: false }).addTo(map);
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
  revealAround(latlng); maintainCoins(); pickCoins(accuracy); visitBuilt(); maybeFetchPois(); checkFound(); updateHint(); persist(); updateHud();
  $('status').textContent = debug ? 'テスト移動中(地図タップで移動)' : `位置取得OK (精度 ${Math.round(accuracy || 0)}m)`;
  drawFog();
  if (follow) map.panTo(latlng, { animate: true });
}

// ---- コイン(歩いて拾う) ----
const COIN_RANGE = 100, COIN_COUNT = 14, COIN_TTL = 30 * 60e3;
const coinMarkers = new Map();
const coinIcon = c => L.divIcon({ className: 'coin', html: `<span>${c.v >= 10 ? '💎' : c.v >= 3 ? '💰' : '🪙'}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
function addCoinMarker(c) { coinMarkers.set(c.id, L.marker([c.lat, c.lng], { icon: coinIcon(c), zIndexOffset: 500 }).addTo(map)); }
function removeCoinMarker(id) { const m = coinMarkers.get(id); if (m) { map.removeLayer(m); coinMarkers.delete(id); } }
function randomNear(p, minR, maxR) {
  const r = minR + Math.random() * (maxR - minR), th = Math.random() * 2 * Math.PI;
  return { lat: p.lat + r * Math.cos(th) / 111320, lng: p.lng + r * Math.sin(th) / (111320 * Math.cos(p.lat * Math.PI / 180)) };
}
const MAGNET_LV = [1, 1.5, 2];
function maintainCoins() {
  const now = Date.now();
  save.coins = save.coins.filter(c => {
    const gone = c.exp < now || map.distance([c.lat, c.lng], me) > 600;
    if (gone) removeCoinMarker(c.id);
    return !gone;
  });
  const mg = save.built.filter(o => ITEM[o.t].magnet && map.distance([o.lat, o.lng], me) < 450);
  const power = mg.reduce((s, o) => s + ITEM[o.t].magnet * MAGNET_LV[lvOf(o) - 1], 0);
  const target = COIN_COUNT + Math.min(10, Math.floor(power * 2));
  while (save.coins.length < target) {
    const q = mg.length && Math.random() < Math.min(0.7, 0.25 * power)
      ? randomNear(mg[Math.floor(Math.random() * mg.length)], 15, 110) : randomNear(me, 30, 220);
    const r = Math.random();
    const c = { id: now + '-' + Math.random().toString(36).slice(2, 7), lat: q.lat, lng: q.lng,
      v: r < 0.05 ? 10 : r < 0.25 ? 3 : 1, exp: now + COIN_TTL * (0.5 + Math.random()) };
    save.coins.push(c); addCoinMarker(c);
  }
}
function pickCoins(accuracy) {
  const range = COIN_RANGE + Math.min(accuracy || 0, 30);   // GPS誤差が大きいときはさらにゆるめる
  for (const c of [...save.coins]) {
    if (map.distance([c.lat, c.lng], me) > range) continue;
    save.coins.splice(save.coins.indexOf(c), 1); removeCoinMarker(c.id);
    const luck = Math.min(0.9, save.built.filter(o => ITEM[o.t].lucky && map.distance([o.lat, o.lng], [c.lat, c.lng]) <= 200)
      .reduce((s, o) => s + 0.15 * lvOf(o), 0));
    if (Math.random() < luck) { floatText('🍀ご利益 2倍！'); addGold(c.v * 2); } else addGold(c.v);
  }
}
function floatText(text) {
  const p = me ? map.latLngToContainerPoint(me) : { x: innerWidth / 2, y: innerHeight / 2 };
  const d = document.createElement('div'); d.className = 'float'; d.textContent = text;
  d.style.left = p.x + 'px'; d.style.top = (p.y - 30) + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 1200);
}
function addGold(n) {
  save.gold += n; $('coins').textContent = '🪙 ' + save.gold;
  floatText((n > 0 ? '+' : '') + n + '🪙');
  if (n > 0) try { navigator.vibrate && navigator.vibrate(30); } catch (e) {}
}

// ---- つくる ----
// どのオブジェクトもコインを生産し、歩いて訪れると育ち、進化する
const LV_RATE = [1, 2.2, 4.5];     // 進化ごとの収穫倍率
const EVO_DAYS = [0, 3, 7];        // 進化に必要な「来た日数」(Lv1→2は3日、Lv2→3は7日)
const HARVEST_CAP_H = 8;           // 何時間分までためられるか
const ITEMS = [
  { id: 'flower', cost: 5, size: 26, rate: 1.5, role: '花が咲いて、コインが実る', chain: [['🌸', '花畑'], ['🌷', 'チューリップ畑'], ['🌻', 'ひまわり畑']] },
  { id: 'tree', cost: 10, size: 32, rate: 3, role: '実をつけて、コインに変わる', chain: [['🌳', '木'], ['🌲', '大樹'], ['🎄', '聖なる樹']] },
  { id: 'rest', cost: 15, size: 28, rate: 2, role: '休憩所。立ち寄るとコインがたまる', chain: [['🪑', 'ベンチ'], ['⛺', 'テント'], ['🏕️', 'キャンプ場']] },
  { id: 'lantern', cost: 20, size: 30, rate: 1, magnet: 1, role: '灯りにコインが集まってくる', chain: [['🏮', 'ちょうちん'], ['🪔', 'ランプ'], ['🌟', 'ほしの灯']] },
  { id: 'fountain', cost: 50, size: 38, rate: 5, role: '湧き出るコインをためる', chain: [['💧', '小さな池'], ['⛲', '噴水'], ['🧜', '人魚の泉']] },
  { id: 'shrine', cost: 60, size: 40, rate: 2, lucky: 1, role: 'ご利益で、近くのコインが2倍になることがある', chain: [['⛩️', 'ちいさなほこら'], ['🦊', 'きつねの社'], ['🐉', 'りゅうの社']] },
  { id: 'house', cost: 80, size: 40, rate: 8, role: '家賃がたまる', chain: [['🏠', 'おうち'], ['🏡', '庭つきの家'], ['🏘️', '小さな村']] },
  { id: 'tower', cost: 150, size: 46, rate: 3, magnet: 2, role: '遠くからコインを呼び寄せる', chain: [['🗼', 'ひかりの塔'], ['🔭', '星見の塔'], ['🛸', '天空港']] },
  { id: 'castle', cost: 300, size: 52, rate: 20, role: '税収がたっぷりたまる', chain: [['🏰', 'おしろ'], ['🏯', '大きなおしろ'], ['👑', '王国']] },
];
const ITEM = Object.fromEntries(ITEMS.map(i => [i.id, i]));
const lvOf = o => o.lv || 1;
const face = o => ITEM[o.t].chain[lvOf(o) - 1];                 // [絵文字, 名前]
const rateOf = o => ITEM[o.t].rate * LV_RATE[lvOf(o) - 1];
const evoCost = o => ITEM[o.t].cost * (lvOf(o) === 1 ? 2 : 4);
const accrued = o => Math.min(HARVEST_CAP_H, (Date.now() - o.last) / 3600e3) * rateOf(o);
const BUILD_RANGE = 40, MAX_BUILT = 300;
const builtMarkers = new Map();
let placing = null, placeCircle = null;

function builtIcon(o, fresh) {
  const sz = ITEM[o.t].size + (lvOf(o) - 1) * 6, s = sz + 14;
  return L.divIcon({
    className: 'built' + (fresh ? ' new' : '') + (accrued(o) >= 8 ? ' ready' : ''),
    html: `<span style="font-size:${sz}px">${face(o)[0]}</span><i>${'★'.repeat(lvOf(o) - 1 || 0)}</i>`,
    iconSize: [s, s + 10], iconAnchor: [s / 2, s / 2]
  });
}
function addBuiltMarker(o, fresh) {
  const m = L.marker([o.lat, o.lng], { icon: builtIcon(o, fresh), zIndexOffset: 200 }).addTo(map);
  m.on('click', () => openObj(o)); builtMarkers.set(o.id, m);
}
function refreshBuilt() { for (const o of save.built) { const m = builtMarkers.get(o.id); if (m) m.setIcon(builtIcon(o, false)); } }
setInterval(refreshBuilt, 60000);

function openBuildMenu() {
  $('build-gold').textContent = '🪙 ' + save.gold;
  $('build-list').innerHTML = ITEMS.map(i =>
    `<button data-id="${i.id}" ${save.gold < i.cost ? 'disabled' : ''}><b>${i.chain[0][0]}</b>${i.chain[0][1]}` +
    `<small>${i.cost}🪙 ・ ${i.rate}🪙/時</small><small>${i.chain.map(c => c[0]).join('→')}</small></button>`).join('');
  $('build-list').querySelectorAll('button').forEach(b => b.onclick = () => startPlacing(ITEM[b.dataset.id]));
  $('build').hidden = false;
}
function startPlacing(it) {
  if (!me) return toast('現在地を取得してからつくれます');
  placing = it; $('build').hidden = true;
  $('place-text').textContent = `${it.chain[0][0]} ${it.chain[0][1]}(${it.cost}🪙)を置く場所をタップ — 円の中だけ置けます`;
  $('placebar').hidden = false;
  if (placeCircle) map.removeLayer(placeCircle);
  placeCircle = L.circle(me, { radius: BUILD_RANGE, color: '#ffd873', weight: 2, dashArray: '6 6', fillColor: '#ffd873', fillOpacity: 0.12, interactive: false }).addTo(map);
}
function stopPlacing() { placing = null; $('placebar').hidden = true; if (placeCircle) { map.removeLayer(placeCircle); placeCircle = null; } }
function placeAt(ll) {
  if (!placing || !me) return;
  if (map.distance(ll, me) > BUILD_RANGE) return toast(`遠すぎます。あなたの周り${BUILD_RANGE}m以内に置こう`);
  if (save.built.length >= MAX_BUILT) return toast('これ以上は置けません');
  if (save.gold < placing.cost) return toast('コインが足りません');
  const it = placing;
  const o = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 6), t: it.id, lat: ll.lat, lng: ll.lng, d: todayStr(),
    lv: 1, last: Date.now(), days: 1, lastDay: todayStr(), spent: it.cost };
  save.built.push(o); addBuiltMarker(o, true); addGold(-it.cost);
  toast(`${face(o)[0]} ${face(o)[1]}をつくった！\n歩いて通うと育って、進化します`); stopPlacing(); persist(); updateHud();
}

// 近くに行くと「来た日数」が増え、たまったコインを収穫する
function visitBuilt() {
  let got = 0; const parts = [];
  for (const o of save.built) {
    if (map.distance([o.lat, o.lng], me) > COIN_RANGE) continue;
    if (o.lastDay !== todayStr()) { o.lastDay = todayStr(); o.days++; parts.push(`${face(o)[0]}${o.days}日目`); }
    const a = accrued(o);
    if (a >= 1) { const n = Math.floor(a); o.last = Date.now() - (a - n) / rateOf(o) * 3600e3; got += n; parts.push(`${face(o)[0]}+${n}`); }
  }
  if (parts.length) { if (got) addGold(got); toast('🌾 ' + parts.join('  ')); refreshBuilt(); }
}

// 進化: 「来た日数」と「コイン」と「近くにいること」が必要
function evolveCheck(o) {
  const lv = lvOf(o);
  if (lv >= 3) return { ok: false, why: '最高の姿です' };
  if (o.days < EVO_DAYS[lv]) return { ok: false, why: `あと${EVO_DAYS[lv] - o.days}日、ここに来よう (来た日数 ${o.days}/${EVO_DAYS[lv]})` };
  if (!me || map.distance([o.lat, o.lng], me) > COIN_RANGE) return { ok: false, why: '近くまで行くと進化できます' };
  if (save.gold < evoCost(o)) return { ok: false, why: `コインが足りません (${evoCost(o)}🪙)` };
  return { ok: true };
}
function openObj(o) {
  if (placing) return;
  const it = ITEM[o.t], lv = lvOf(o), refund = Math.floor(o.spent / 2);
  $('obj-title').textContent = `${face(o)[0]} ${face(o)[1]} ${'★'.repeat(lv - 1)}`;
  let html = `<div>${it.role}</div><div>収穫: 1時間に ${rateOf(o).toFixed(1)}🪙 (最大${HARVEST_CAP_H}時間分)<br>たまっているコイン: <b>${Math.floor(accrued(o))}🪙</b>` +
    `<br>来た日数: ${o.days}日 ／ つくった日: ${o.d}</div>`;
  if (it.magnet) html += `<div>🧲 近くにコインを呼ぶ力あり</div>`;
  if (it.lucky) html += `<div>🍀 近くのコインが2倍になることがある</div>`;
  if (lv < 3) html += `<div>進化先: ${it.chain[lv][0]} ${it.chain[lv][1]}</div>`;
  $('obj-sub').innerHTML = html;
  const ev = evolveCheck(o), eb = $('obj-evo');
  eb.hidden = lv >= 3; eb.disabled = !ev.ok; eb.textContent = ev.ok ? `進化させる (${evoCost(o)}🪙)` : ev.why;
  eb.onclick = () => {
    if (!evolveCheck(o).ok) return;
    const cost = evoCost(o); addGold(-cost); o.spent += cost; o.lv = lv + 1;
    refreshBuilt(); celebrate(face(o)[0], `${face(o)[1]}に進化！`); persist(); updateHud(); $('obj').hidden = true;
  };
  $('obj-del').textContent = `とりこわす (+${refund}🪙)`;
  $('obj-del').onclick = () => {
    const m = builtMarkers.get(o.id); if (m) map.removeLayer(m); builtMarkers.delete(o.id);
    save.built.splice(save.built.indexOf(o), 1); addGold(refund); persist(); updateHud(); $('obj').hidden = true;
  };
  $('obj').hidden = false;
}
// 以前の保存データを新しい形式へ
for (const o of save.built) {
  if (o.t === 'bench') o.t = 'rest'; else if (o.t === 'tent') { o.t = 'rest'; o.lv = 2; }
  o.lv = o.lv || 1; o.last = o.last || Date.now(); o.days = o.days || 1; o.lastDay = o.lastDay || o.d; o.spent = o.spent || ITEM[o.t].cost;
}
$('btn-build').onclick = openBuildMenu;
$('build-close').onclick = () => { $('build').hidden = true; };
$('obj-close').onclick = () => { $('obj').hidden = true; };
$('place-cancel').onclick = stopPlacing;
$('place-here').onclick = () => placeAt(me);
save.coins.forEach(addCoinMarker);
save.built.forEach(o => addBuiltMarker(o, false));
$('coins').textContent = '🪙 ' + save.gold;

// ---- 操作 ----
map.on('dragstart', () => { follow = false; });
$('btn-locate').onclick = () => { follow = true; if (me) map.setView(me, 17); };
$('btn-debug').onclick = () => {
  debug = !debug; $('btn-debug').classList.toggle('on', debug);
  if (debug) { follow = false; if (!me) updatePosition(map.getCenter(), 0); }
  else $('status').textContent = '位置情報を取得中…';
};
map.on('click', e => { if (placing) return placeAt(e.latlng); if (debug) updatePosition(e.latlng, 0); });
$('btn-book').onclick = () => {
  const items = Object.values(save.found).sort((a, b) => b.date.localeCompare(a.date));
  $('book-list').innerHTML = items.length
    ? items.map(f => `<li>${f.e} <b>${esc(f.name)}</b><small>${f.k} ・ ${f.date}</small></li>`).join('')
    : '<li>まだ何も発見していません。❓を目指して歩こう！</li>';
  $('book-list').insertAdjacentHTML('afterbegin', `<li>🏗️ つくったもの ${save.built.length}個 ／ 🪙 ${save.gold}</li>`);
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
