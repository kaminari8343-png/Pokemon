'use strict';
// 街づくり(シムシティ風): 歩いて晴らした土地に、道路・住宅地・商業地・工業地・公共施設を置く。
// 区画は自然に育ち(人口・仕事・税収)、街は3Dで地図の上に立ち上がる。
// ※ game.js より先に読み込む。ここは関数と定数の定義だけで、game.js の変数は「呼ばれたとき」に使う。

const TILE = 40;                                   // 1区画の大きさ(m)
const T_DLAT = TILE / 111320, T_W = TILE / (111320 * Math.cos(36 * Math.PI / 180));   // 区画の緯度幅・経度幅(日本の中心あたりで正方形になるよう固定)
const GROW_MS = 15000, CITY_CAP_H = 8, SHARD_PRICE = 60;
const CITY_TOOLS = [
  { id: 'road', e: '🛣️', n: '道路', cost: 4, minLv: 1, help: '建物は道路に面していないと育ちません' },
  { id: 'R', e: '🏠', n: '住宅地', cost: 6, minLv: 1, help: '人が住む。人口が増えて、税収になる' },
  { id: 'C', e: '🏪', n: '商業地', cost: 8, minLv: 1, help: '店とオフィス。住人が増えると育つ' },
  { id: 'I', e: '🏭', n: '工業地', cost: 8, minLv: 1, help: '工場。仕事と税収は多いが、近くの住宅は住みにくくなる' },
  { id: 'park', e: '🌳', n: '公園', cost: 12, minLv: 1, up: 0.5, rad: 3, help: '近く(3区画)の住みやすさがアップ。コインのご利益も' },
  { id: 'power', e: '⚡', n: '発電所', cost: 120, minLv: 2, up: 4, rad: 8, help: '8区画まで電力が届く。電力がないと大きな建物は育たない' },
  { id: 'police', e: '🚓', n: '警察署', cost: 80, minLv: 3, up: 2, rad: 5, help: '5区画の安全。サービスが2種類そろうと高層に育つ' },
  { id: 'fire', e: '🚒', n: '消防署', cost: 80, minLv: 3, up: 2, rad: 5, help: '5区画の防災' },
  { id: 'school', e: '🏫', n: '学校', cost: 100, minLv: 5, up: 2, rad: 5, help: '5区画の教育' },
  { id: 'hospital', e: '🏥', n: '病院', cost: 140, minLv: 7, up: 3, rad: 5, help: '5区画の医療' },
  { id: 'stadium', e: '🏟️', n: 'スタジアム', cost: 300, minLv: 10, up: 5, rad: 6, help: '広い範囲が大にぎわい(サービス2つ分)' },
  { id: 'bulldoze', e: '🧹', n: '撤去', cost: 0, help: 'なぞった区画をさら地にする(施設は半額もどる)' },
  { id: 'info', e: '🔍', n: 'しらべる', cost: 0, help: '区画をタップして、育たない理由などを見る' },
];
const TOOL = Object.fromEntries(CITY_TOOLS.map(t => [t.id, t]));
const SERVICES = ['police', 'fire', 'school', 'hospital', 'stadium'];
const ZONE = {
  R: { name: '住宅地', pop: [0, 10, 30, 70], inc: [0, 2, 6, 14], lot: '#7fcf8a', plate: '#d3ebb8' },
  C: { name: '商業地', jobs: [0, 6, 18, 40], inc: [0, 5, 14, 32], lot: '#6fa8e0', plate: '#cbdaec' },
  I: { name: '工業地', jobs: [0, 8, 22, 48], inc: [0, 6, 16, 36], lot: '#e8c95a', plate: '#e8dfb6' },
};
const LV_NAME = { R: ['空き地', '小さな家', '集合住宅', 'タワーマンション'], C: ['空き地', 'お店', 'ビル', '高層ビル'], I: ['空き地', '倉庫', '工場', '大工場'] };
const tKey = (i, j) => i + ',' + j;
const tileOf = ll => [Math.floor(ll.lat / T_DLAT), Math.floor(ll.lng / T_W)];
const tCenter = (i, j) => ({ lat: (i + 0.5) * T_DLAT, lng: (j + 0.5) * T_W });
const tPoly = (i, j, u0, v0, u1, v1) => { const a = (i + v0) * T_DLAT, b = (i + v1) * T_DLAT, l = (j + u0) * T_W, r = (j + u1) * T_W; return [[[l, a], [r, a], [r, b], [l, b], [l, a]]]; };
let cityStat = { pop: 0, jobsC: 0, jobsI: 0, income: 0, upkeep: 0, hap: 1, dem: { R: 0, C: 0, I: 0 }, n: 0, counts: {}, lv3: 0, problems: {} };
let cityList = [], cityMode = false, cityTool = 'road', cityBrush = true, cityPainting = false, cityStroke = null, cityDrawQ = 0, cityMapReady = false;

function cityGet() { return save.city; }
function cityTile(i, j) { return save.city.tiles[tKey(i, j)]; }
const tVisited = (i, j) => visited(tCenter(i, j));

// ---- 計算: 道路・電力・サービス・住みやすさ・人口・収入 ----
function recalcCity() {
  const C = save.city.tiles, S = cityStat, list = [];
  for (const k in C) { const [i, j] = k.split(',').map(Number); list.push({ k, i, j, t: C[k] }); }
  cityList = list;
  const pw = list.filter(x => x.t.k === 'power'), sv = list.filter(x => SERVICES.includes(x.t.k)), parks = list.filter(x => x.t.k === 'park'), inds = list.filter(x => x.t.k === 'I' && x.t.lv >= 1);
  const near = (a, b, r) => Math.hypot(a.i - b.i, a.j - b.j) <= r;
  let pop = 0, jobsC = 0, jobsI = 0, income = 0, upkeep = 0, hapSum = 0, hapN = 0, lv3 = 0; const counts = {}, problems = { road: 0, power: 0, svc: 0 };
  for (const x of list) {
    const t = x.t; counts[t.k] = (counts[t.k] || 0) + 1;
    if (t.k === 'road') { upkeep += 0.15; continue; }
    if (TOOL[t.k].up) upkeep += TOOL[t.k].up;
    if (!ZONE[t.k]) continue;
    let acc = false;
    for (let a = -1; a <= 1 && !acc; a++) for (let b = -1; b <= 1; b++) { const q = C[tKey(x.i + a, x.j + b)]; if (q && q.k === 'road') { acc = true; break; } }
    const powered = pw.some(p => near(x, p, TOOL.power.rad)), svcSet = new Set(); let svcPts = 0;
    for (const s of sv) if (near(x, s, TOOL[s.t.k].rad)) { svcSet.add(s.t.k); svcPts += s.t.k === 'stadium' ? 2 : 1; }
    const parkNear = parks.some(p => near(x, p, TOOL.park.rad)), smog = x.t.k === 'R' && inds.some(p => near(x, p, 3));
    let hap = 0.7 + 0.1 * Math.min(4, svcPts) + (parkNear ? 0.1 : 0) - (smog ? (parkNear ? 0.1 : 0.22) : 0);
    hap = Math.max(0.5, Math.min(1.4, hap));
    Object.assign(t, { _acc: acc, _pw: powered, _svc: svcPts, _hap: hap, _park: parkNear, _smog: smog });
    if (t.lv === 0) { if (!acc) problems.road++; continue; }
    const z = ZONE[t.k], lm = 1 + 0.04 * Math.min(3, landmarkNear(x));
    income += z.inc[t.lv] * hap * (powered ? 1 : 0.6) * lm;
    if (t.k === 'R') { pop += z.pop[t.lv]; hapSum += hap * z.pop[t.lv]; hapN += z.pop[t.lv]; } else if (t.k === 'C') jobsC += z.jobs[t.lv]; else jobsI += z.jobs[t.lv];
    if (t.lv === 3) lv3++;
    if (!acc) problems.road++; if (!powered) problems.power++; if (t.lv < 3 && svcSet.size < 2) problems.svc++;
  }
  Object.assign(S, { pop, jobsC, jobsI, income, upkeep, hap: hapN ? hapSum / hapN : 1, n: list.length, counts, lv3, problems,
    dem: { R: jobsC + jobsI + 15 - pop, C: pop * 0.45 - jobsC + 6, I: pop * 0.35 - jobsI + 6 } });
  updateCityBadge();
}
let lmCache = new Map(), lmFound = -1;
function landmarkNear(x) {                         // 近くの発見ずみの名所が多いほど、地価が上がる(最大3つ)
  const nf = Object.keys(save.found).length;
  if (nf !== lmFound) { lmCache = new Map(); lmFound = nf; }
  let v = lmCache.get(x.k); if (v != null) return v;
  const c = tCenter(x.i, x.j); v = 0;
  for (const f of Object.values(save.found)) if (f.lat != null && Math.abs(f.lat - c.lat) < 0.0016 && Math.abs(f.lng - c.lng) < 0.002 && dist(f, c) <= 150) v++;
  lmCache.set(x.k, v); return v;
}

// ---- 成長 ----
function growTick(rand = Math.random) {
  const S = cityStat, grown = [];
  for (const z of ['R', 'C', 'I']) {
    if (S.dem[z] <= 0) continue;
    const cand = cityList.filter(x => x.t.k === z && x.t.lv < 3 && x.t._acc && (x.t.lv === 0 || x.t._pw) && (x.t.lv < 2 || (x.t._svc >= 2 && x.t._hap >= 0.95)));
    if (!cand.length || rand() > 0.7) continue;
    const x = cand[Math.floor(rand() * cand.length)]; x.t.lv++; grown.push(x);
  }
  for (const x of cityList) {                      // 道路や電力がなくなった区画は、さびれる
    const t = x.t; if (!ZONE[t.k] || t.lv === 0) continue;
    if (!t._acc && rand() < 0.3) { t.lv--; grown.push({ ...x, down: true }); } else if (t.lv >= 2 && !t._pw && rand() < 0.3) { t.lv--; grown.push({ ...x, down: true }); }
  }
  return grown;
}
function cityTick(silent) {
  const C = save.city, now = Date.now();
  let n = Math.min(200, Math.floor((now - C.last) / GROW_MS)); if (n < 1) return 0;
  C.last = Math.min(now, C.last + n * GROW_MS) ;
  if (n === 200) C.last = now;
  let ups = 0, popped = 0;
  recalcCity();
  for (let k = 0; k < n; k++) {
    const g = growTick(); if (g.length) { recalcCity(); for (const x of g) { if (x.down) continue; ups++; if (popped++ < 3 && !silent && n < 5) cityPop(x.i, x.j, '✨'); } }
  }
  if (ups) { save.stats.evos = (save.stats.evos || 0) + ups; D().evo += ups; addXp(ups * 8); }
  accrueTax(); drawCity(); persistSoon(); checkDaily();
  return ups;
}
function accrueTax() {
  const C = save.city, now = Date.now(), dh = Math.max(0, (now - C.inc) / 3600e3); C.inc = now;
  const net = cityStat.income - cityStat.upkeep, cap = Math.max(60, Math.max(0, net) * CITY_CAP_H + 50);
  C.stock = Math.max(0, Math.min(cap, C.stock + net * dh)); updateCityBadge();
}
function updateCityBadge() { const b = $('btn-build'); if (b) b.classList.toggle('ready', save.city && save.city.stock >= 20); if (cityMode) renderCityBar(); }
function collectTax() {
  const C = save.city, n = Math.floor(C.stock);
  if (n < 1) return toast('まだ税収がたまっていません');
  C.stock -= n; addGold(n); C.total = (C.total || 0) + n; D().harvest++; addXp(n / 4); checkDaily(); persistSoon(); updateCityBadge();
  celebrate('💰', `税収 +${n}🪙`);
}
function boostCity() {
  if (save.shards < 1) return toast('🔮進化のかけらが足りません(60🪙で買えます)');
  addShard(-1); recalcCity(); let ups = 0;
  for (let k = 0; k < 5; k++) { const g = growTick(); if (g.length) { recalcCity(); ups += g.filter(x => !x.down).length; } }
  if (ups) { save.stats.evos = (save.stats.evos || 0) + ups; D().evo += ups; addXp(ups * 8); }
  drawCity(); persist(); checkDaily(); toast(ups ? `🔮 街が一気に成長！ (${ups}区画)` : '🔮 成長できる区画がありません(道路・電力・需要を見てね)');
}

// ---- 描画: 地図の上に、3Dの街を立ち上げる ----
const FC = f => ({ type: 'FeatureCollection', features: f });
const flatF = (i, j, u0, v0, u1, v1, c, o) => ({ type: 'Feature', properties: { c, o }, geometry: { type: 'Polygon', coordinates: tPoly(i, j, u0, v0, u1, v1) } });
const boxF = (i, j, cx, cy, w, h, hgt, base, c) => ({ type: 'Feature', properties: { c, h: hgt, b: base }, geometry: { type: 'Polygon', coordinates: tPoly(i, j, cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2) } });
function tileShapes(x, F, B) {                       // F: 平らな面, B: 立体
  const { i, j, t } = x, k = t.k, lv = t.lv, r = hsh(i, j, 11), r2 = hsh(i, j, 12);
  if (k === 'road') { F.push(flatF(i, j, 0.02, 0.02, 0.98, 0.98, '#555a66', 1)); return; }
  if (ZONE[k]) {
    const z = ZONE[k];
    if (lv === 0) { F.push(flatF(i, j, 0.05, 0.05, 0.95, 0.95, z.lot, 0.6)); return; }
    F.push(flatF(i, j, 0.04, 0.04, 0.96, 0.96, z.plate, 0.95));
    if (k === 'R') {
      const roofs = ['#d9544a', '#e08a3c', '#4a8ad8', '#8a62d8'], roof = roofs[Math.floor(r * 4)];
      if (lv === 1) { B.push(boxF(i, j, 0.3, 0.3, 0.3, 0.3, 6, 0, '#f6e7c6'), boxF(i, j, 0.3, 0.3, 0.34, 0.34, 4, 6, roof), boxF(i, j, 0.7, 0.68, 0.3, 0.3, 6, 0, '#f6e7c6'), boxF(i, j, 0.7, 0.68, 0.34, 0.34, 4, 6, roofs[Math.floor(r2 * 4)]), boxF(i, j, 0.72, 0.3, 0.12, 0.12, 5, 0, '#4f9a4a')); }
      else if (lv === 2) B.push(boxF(i, j, 0.5, 0.5, 0.56, 0.5, 18, 0, '#eadcbc'), boxF(i, j, 0.5, 0.5, 0.6, 0.54, 2, 18, roof), boxF(i, j, 0.5, 0.5, 0.2, 0.2, 3, 20, '#bbb'), boxF(i, j, 0.14, 0.14, 0.12, 0.12, 6, 0, '#4f9a4a'), boxF(i, j, 0.86, 0.86, 0.12, 0.12, 6, 0, '#4f9a4a'));
      else B.push(boxF(i, j, 0.5, 0.5, 0.5, 0.5, 44, 0, '#cfd7e8'), boxF(i, j, 0.5, 0.5, 0.36, 0.36, 8, 44, '#8fa4c8'), boxF(i, j, 0.5, 0.5, 0.1, 0.1, 10, 52, '#e2574c'), boxF(i, j, 0.15, 0.85, 0.12, 0.12, 6, 0, '#4f9a4a'));
    } else if (k === 'C') {
      const cols = ['#6fa8e0', '#4a8ad8', '#e07aa8', '#f0a24a'], c = cols[Math.floor(r * 4)];
      if (lv === 1) B.push(boxF(i, j, 0.5, 0.52, 0.62, 0.5, 8, 0, c), boxF(i, j, 0.5, 0.52, 0.66, 0.54, 1.5, 8, '#fff'), boxF(i, j, 0.5, 0.14, 0.5, 0.1, 3, 0, '#e2574c'));
      else if (lv === 2) B.push(boxF(i, j, 0.5, 0.5, 0.64, 0.6, 22, 0, c), boxF(i, j, 0.5, 0.5, 0.68, 0.64, 2, 22, '#f1f6ff'), boxF(i, j, 0.5, 0.5, 0.2, 0.2, 5, 24, '#cfd8e8'));
      else B.push(boxF(i, j, 0.3, 0.5, 0.3, 0.34, 56, 0, '#3f6fc4'), boxF(i, j, 0.3, 0.5, 0.2, 0.24, 8, 56, '#9fc4f4'), boxF(i, j, 0.7, 0.55, 0.3, 0.3, 38, 0, '#5a86d0'), boxF(i, j, 0.7, 0.55, 0.2, 0.2, 5, 38, '#cfe0fa'), boxF(i, j, 0.5, 0.5, 0.14, 0.9, 5, 0, '#8fa0b8'));
    } else {
      if (lv === 1) B.push(boxF(i, j, 0.45, 0.55, 0.66, 0.46, 8, 0, '#d9b84a'), boxF(i, j, 0.45, 0.55, 0.7, 0.5, 1.2, 8, '#b8a060'), boxF(i, j, 0.82, 0.25, 0.1, 0.1, 18, 0, '#7d7d86'));
      else if (lv === 2) B.push(boxF(i, j, 0.4, 0.4, 0.58, 0.4, 10, 0, '#d9b84a'), boxF(i, j, 0.4, 0.74, 0.58, 0.3, 8, 0, '#c9a63a'), boxF(i, j, 0.82, 0.3, 0.1, 0.1, 28, 0, '#7d7d86'), boxF(i, j, 0.82, 0.3, 0.12, 0.12, 2, 28, '#e2574c'));
      else B.push(boxF(i, j, 0.45, 0.5, 0.76, 0.56, 14, 0, '#caa83c'), boxF(i, j, 0.45, 0.5, 0.8, 0.6, 1.5, 14, '#9a8a60'), boxF(i, j, 0.82, 0.2, 0.1, 0.1, 36, 0, '#7d7d86'), boxF(i, j, 0.82, 0.2, 0.12, 0.12, 2, 36, '#e2574c'), boxF(i, j, 0.82, 0.5, 0.1, 0.1, 30, 0, '#7d7d86'), boxF(i, j, 0.82, 0.8, 0.1, 0.1, 24, 0, '#7d7d86'));
    }
    return;
  }
  if (k === 'park') {
    F.push(flatF(i, j, 0.04, 0.04, 0.96, 0.96, '#9fd88a', 1), flatF(i, j, 0.3, 0.42, 0.7, 0.58, '#8fd3e8', 0.95));
    [[0.16, 0.16], [0.82, 0.2], [0.2, 0.82], [0.8, 0.8], [0.5, 0.15], [0.5, 0.86]].forEach(([u, v], n) => B.push(boxF(i, j, u, v, 0.1, 0.1, 5, 0, '#6a4a2a'), boxF(i, j, u, v, 0.22, 0.22, 7, 4 + (n % 2), n % 3 === 0 ? '#3f9a4a' : '#5cb85c'), boxF(i, j, u, v, 0.12, 0.12, 4, 10, '#7fd47a')));
    return;
  }
  F.push(flatF(i, j, 0.04, 0.04, 0.96, 0.96, '#dcd6c6', 1));
  if (k === 'power') B.push(boxF(i, j, 0.4, 0.62, 0.6, 0.36, 12, 0, '#8a8f9c'), boxF(i, j, 0.75, 0.3, 0.2, 0.2, 38, 0, '#d8d8e0'), boxF(i, j, 0.75, 0.3, 0.22, 0.22, 3, 38, '#e2574c'), boxF(i, j, 0.3, 0.25, 0.16, 0.16, 26, 0, '#d8d8e0'), boxF(i, j, 0.3, 0.25, 0.18, 0.18, 2, 26, '#e2574c'));
  else if (k === 'police') B.push(boxF(i, j, 0.5, 0.5, 0.66, 0.52, 14, 0, '#3a5aa8'), boxF(i, j, 0.5, 0.5, 0.7, 0.56, 2, 14, '#fff'), boxF(i, j, 0.5, 0.5, 0.14, 0.14, 6, 16, '#ffd24a'));
  else if (k === 'fire') B.push(boxF(i, j, 0.5, 0.55, 0.7, 0.5, 12, 0, '#d9443a'), boxF(i, j, 0.5, 0.55, 0.74, 0.54, 2, 12, '#fff'), boxF(i, j, 0.82, 0.2, 0.12, 0.12, 24, 0, '#d9443a'), boxF(i, j, 0.82, 0.2, 0.14, 0.14, 2, 24, '#ffd24a'));
  else if (k === 'school') B.push(boxF(i, j, 0.45, 0.55, 0.72, 0.4, 11, 0, '#f2c94c'), boxF(i, j, 0.45, 0.55, 0.76, 0.44, 1.5, 11, '#d9a72c'), boxF(i, j, 0.82, 0.25, 0.12, 0.12, 22, 0, '#f2c94c'), boxF(i, j, 0.82, 0.25, 0.14, 0.14, 3, 22, '#e2574c'));
  else if (k === 'hospital') B.push(boxF(i, j, 0.5, 0.5, 0.62, 0.56, 24, 0, '#f4f4f8'), boxF(i, j, 0.5, 0.5, 0.3, 0.08, 2, 24, '#e2574c'), boxF(i, j, 0.5, 0.5, 0.08, 0.3, 2.2, 24, '#e2574c'));
  else if (k === 'stadium') {
    const ring = (u0, v0, u1, v1, w) => [tPoly(i, j, u0, v0, u1, v1)[0], tPoly(i, j, u0 + w, v0 + w, u1 - w, v1 - w)[0]];
    B.push({ type: 'Feature', properties: { c: '#c9c9d6', h: 14, b: 0 }, geometry: { type: 'Polygon', coordinates: ring(0.06, 0.12, 0.94, 0.88, 0.16) } });
    F.push(flatF(i, j, 0.24, 0.28, 0.76, 0.72, '#6cc46a', 1));
  }
}
function drawCity() {
  const F = [], B = [], L = [];
  for (const x of cityList) {
    tileShapes(x, F, B);
    if (x.t.k === 'road') for (const [a, b] of [[0, 1], [1, 0]]) { const q = cityTile(x.i + a, x.j + b); if (q && q.k === 'road') { const c1 = tCenter(x.i, x.j), c2 = tCenter(x.i + a, x.j + b); L.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[c1.lng, c1.lat], [c2.lng, c2.lat]] } }); } }
  }
  setSrc('cityflat', FC(F)); setSrc('city3d', FC(B)); setSrc('citylane', FC(L));
  if (cityMapReady) try { map.setPaintProperty('building', 'fill-extrusion-opacity', cityList.length ? 0.4 : 0.95); } catch (e) {}
}
function drawGrid() {                              // 建てられる場所(歩いて霧が晴れた所)を、格子で見せる
  if (!cityMode) { setSrc('citygrid', EMPTY); return; }
  const c = map.getCenter(), [ci, cj] = tileOf({ lat: c.lat, lng: c.lng }), L = [], R = 14;
  for (let i = ci - R; i <= ci + R; i++) for (let j = cj - R; j <= cj + R; j++) if (tVisited(i, j)) L.push({ type: 'Feature', properties: { b: cityTile(i, j) ? 0 : 1 }, geometry: { type: 'Polygon', coordinates: tPoly(i, j, 0, 0, 1, 1) } });
  setSrc('citygrid', FC(L));
}
function drawCursor(i, j) { setSrc('citycur', i == null ? EMPTY : FC([{ type: 'Feature', properties: { ok: tVisited(i, j) ? 1 : 0 }, geometry: { type: 'Polygon', coordinates: tPoly(i, j, 0, 0, 1, 1) } }])); }
function cityPop(i, j, text) {
  const c = tCenter(i, j), m = addPin(c, '', `<div class="cpop">${text}</div>`); setTimeout(() => m.remove(), 1500);
}
const drawCitySoon = () => { if (!cityDrawQ) cityDrawQ = requestAnimationFrame(() => { cityDrawQ = 0; recalcCity(); drawCity(); }); };

// ---- 区画をぬる ----
function applyTool(i, j) {
  const tool = TOOL[cityTool], key = tKey(i, j), cur = save.city.tiles[key];
  if (tool.id === 'info') { if (cur) openTile(i, j); else toast('ここは空き地です'); return; }
  if (tool.id === 'bulldoze') {
    if (!cur) return;
    const refund = TOOL[cur.k].up ? Math.floor(TOOL[cur.k].cost / 2) : 0;
    delete save.city.tiles[key]; if (refund) { save.gold += refund; if (cityStroke) cityStroke.spent -= refund; } updateWallet(); drawCitySoon(); return;
  }
  if (cur && cur.k === tool.id) return;
  if (!tVisited(i, j)) { if (!cityStroke || !cityStroke.warned) toast('🌫️ まだ歩いていない土地です\n歩いて霧を晴らすと建てられます'); if (cityStroke) cityStroke.warned = true; return; }
  if (curLevel() < tool.minLv) return toast(`🔒 ${tool.n} は Lv.${tool.minLv} で解放`);
  if (save.gold < tool.cost) { if (cityStroke) cityStroke.broke = true; return toast('コインが足りません'); }
  const wasService = cur && TOOL[cur.k].up;
  save.gold -= tool.cost; if (cityStroke) cityStroke.spent += tool.cost; if (wasService) save.gold += Math.floor(TOOL[cur.k].cost / 2);
  save.city.tiles[key] = { k: tool.id, lv: ZONE[tool.id] ? 0 : 1, t: Date.now() };
  save.stats.builds = (save.stats.builds || 0) + 1; D().built++; addXp(tool.cost / 4 + 1);
  updateWallet(); drawCitySoon();
}
function paintAt(ll) {
  const [i, j] = tileOf(ll); drawCursor(i, j);
  if (!cityPainting) return;
  const key = tKey(i, j); if (cityStroke.last === key) return; cityStroke.last = key; applyTool(i, j);
}
function endStroke() {
  if (!cityPainting) return; cityPainting = false;
  const s = cityStroke; cityStroke = null; recalcCity(); drawCity(); persist(); checkDaily(); renderCityBar();
  if (s && s.spent > 0) floatText(`-${s.spent}🪙`);
}
function openTile(i, j) {
  const t = cityTile(i, j); if (!t) return;
  const tool = TOOL[t.k], z = ZONE[t.k]; recalcCity();
  let title = `${tool.e} ${tool.n}`, html = `<div>${tool.help}</div>`;
  if (z) {
    title = `${tool.e} ${LV_NAME[t.k][t.lv]}(${tool.n})`;
    const why = [];
    if (!t._acc) why.push('🛣️ 道路に面していません(となりに道路を置こう)');
    if (t.lv >= 1 && !t._pw) why.push('⚡ 電力が届いていません(発電所を置こう)');
    if (t.lv >= 2 && t._svc < 2) why.push('🚓 サービス(警察・消防・学校・病院・スタジアム)が2つ以上必要です');
    if (t._smog) why.push('🏭 近くの工場で住みにくくなっています(公園で和らぎます)');
    if (cityStat.dem[t.k] <= 0) why.push(`📉 いまは${z.name}の需要がありません`);
    html += `<div>レベル ${t.lv}/3 ・ 住みやすさ ${Math.round(t._hap * 100)}%${t._park ? ' ・ 🌳公園の近く' : ''}</div>` + (t.lv ? `<div>収入: 1時間に約 ${(z.inc[t.lv] * t._hap * (t._pw ? 1 : 0.6)).toFixed(1)}🪙 ・ ${t.k === 'R' ? '住人 ' + z.pop[t.lv] + '人' : '仕事 ' + z.jobs[t.lv] + '人分'}</div>` : '') +
      (why.length && t.lv < 3 ? `<div><b>育たない理由</b><br>${why.map(esc).join('<br>')}</div>` : t.lv === 3 ? '<div>✨ 最高に育っています</div>' : '');
  } else if (tool.up) html += `<div>維持費 1時間に ${tool.up}🪙${tool.rad ? ` ・ 範囲 ${tool.rad}区画` : ''}</div>`;
  $('obj-title').innerHTML = esc(title); $('obj-sub').innerHTML = html;
  $('obj-evo').hidden = true; $('obj-del').hidden = false; $('obj-del').textContent = '🧹 さら地にする';
  $('obj-del').onclick = () => { delete save.city.tiles[tKey(i, j)]; recalcCity(); drawCity(); persist(); $('obj').hidden = true; };
  $('obj').hidden = false;
}

// ---- 操作パネル ----
function renderCityBar() {
  const tool = TOOL[cityTool], C = save.city;
  $('cb-info').innerHTML = `<b>${tool.e} ${tool.n}</b>${tool.cost ? ` ${tool.cost}🪙` : ''} <small>${esc(tool.help)}</small>`;
  $('cb-coins').textContent = `🪙${save.gold}`;
  $('cb-collect').textContent = `💰${Math.floor(C.stock)}`;
  $('cb-brush').textContent = cityBrush ? '🖌️ぬる' : '✋うごかす';
  $('cb-tools').innerHTML = CITY_TOOLS.map(t => { const lock = t.minLv && curLevel() < t.minLv; return `<button data-t="${t.id}" class="${t.id === cityTool ? 'on' : ''}" ${lock ? 'disabled' : ''}><span>${t.e}</span><small>${lock ? 'Lv' + t.minLv : t.cost ? t.cost : t.n}</small></button>`; }).join('');
  $('cb-tools').querySelectorAll('button').forEach(b => b.onclick = () => { cityTool = b.dataset.t; renderCityBar(); });
}
function openCity() {
  if (cityMode) return closeCity();
  cityMode = true; follow = false; document.body.classList.add('citymode'); $('citybar').hidden = false;
  setBrush(true); recalcCity(); renderCityBar(); drawGrid();
  if (!save.city.seen) { save.city.seen = true; toast('🏙️ 街づくり\n道路をひいて、住宅地・商業地・工業地をぬろう。歩いて霧を晴らした所に建てられます'); }
}
function closeCity() {
  cityMode = false; cityPainting = false; document.body.classList.remove('citymode'); $('citybar').hidden = true;
  try { map.dragPan.enable(); } catch (e) {} drawGrid(); drawCursor(); persist();
}
function setBrush(on) {
  cityBrush = on; try { on ? map.dragPan.disable() : map.dragPan.enable(); } catch (e) {}
  if ($('cb-brush')) renderCityBar();
}

// ---- 冒険の書「街」タブ ----
function cityRank(p) { return p >= 30000 ? '首都' : p >= 8000 ? '大都市' : p >= 2000 ? '市' : p >= 500 ? '町' : p >= 100 ? '村' : '開拓地'; }
function townHtml() {
  recalcCity();
  const S = cityStat, C = save.city, net = S.income - S.upkeep, P = S.problems;
  if (!S.n) return '<div class="empty">まだ街がありません。🔨を押して、道路と住宅地をぬってみよう！<br>歩いて霧を晴らした所に建てられます。</div>';
  const bar = (label, v) => { const w = Math.max(0, Math.min(100, 50 + v * 2)); return `<div class="dem"><span>${label}</span><div><i style="width:${w}%;background:${v >= 0 ? '#4fb06a' : '#d9544a'}"></i></div></div>`; };
  const tips = [];
  if (P.road) tips.push(`🛣️ 道路につながっていない区画が ${P.road} あります`);
  if (S.counts.R && !S.counts.power) tips.push('⚡ 発電所を置くと、建物が大きく育ちます(Lv.2で解放)');
  else if (P.power) tips.push(`⚡ 電力が届かない区画が ${P.power} あります(発電所を近くに)`);
  if (S.lv3 < 1 && (S.counts.police || 0) + (S.counts.fire || 0) + (S.counts.school || 0) + (S.counts.hospital || 0) + (S.counts.stadium || 0) < 2) tips.push('🚓🚒🏫🏥 サービス施設を2種類以上そろえると、高層に育ちます');
  if (S.dem.R <= 0) tips.push('🏠 住宅地を増やしたいところです(仕事が余っています)');
  if (S.dem.C <= 0 && S.dem.I > 0) tips.push('🏭 工業地を増やすと、仕事と税収が増えます');
  if (S.dem.C > 8) tips.push('🏪 商業地の需要があります');
  if (net < 0) tips.push('📉 維持費が収入を上回っています(施設を減らすか、住宅・商業を育てよう)');
  if (S.hap < 0.85) tips.push('🌳 住みやすさが低めです(公園・サービス施設を増やそう)');
  tips.push('👣 歩いて霧を晴らすと、街を広げられます');
  return `<div class="city-head"><b>🏙️ ${esc(C.name)}</b> <small>${cityRank(S.pop)}</small> <button id="city-rn" class="tinybtn">✏️</button></div>` +
    `<div class="city-grid"><div><small>人口</small><b>${S.pop.toLocaleString()}</b></div><div><small>住みやすさ</small><b>${Math.round(S.hap * 100)}%</b></div><div><small>仕事</small><b>${S.jobsC + S.jobsI}</b></div><div><small>区画</small><b>${S.n}</b></div></div>` +
    `<div class="city-money">税収 +${S.income.toFixed(1)}/時 − 維持費 ${S.upkeep.toFixed(1)}/時 = <b style="color:${net >= 0 ? '#2f7d4f' : '#b3402a'}">${net >= 0 ? '+' : ''}${net.toFixed(1)}🪙/時</b></div>` +
    `<div class="city-btns"><button id="city-collect">💰 税収を受け取る (${Math.floor(C.stock)}🪙)</button><button id="city-boost">🔮 成長を加速 (かけら1個) 所持${save.shards}</button><button id="city-buyshard">🔮 かけらを買う (${SHARD_PRICE}🪙)</button></div>` +
    `<div class="dem-box"><small>街の需要(右が「もっと欲しい」)</small>${bar('🏠住宅', S.dem.R)}${bar('🏪商業', S.dem.C)}${bar('🏭工業', S.dem.I)}</div>` +
    `<div class="city-tips"><b>街づくりのヒント</b><ul>${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`;
}
function wireTown() {
  const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
  on('city-collect', () => { collectTax(); renderBook(); });
  on('city-boost', () => { boostCity(); renderBook(); });
  on('city-buyshard', () => { if (save.gold < SHARD_PRICE) return toast('コインが足りません'); addGold(-SHARD_PRICE); addShard(1); persist(); renderBook(); });
  on('city-rn', () => { const nm = prompt('街の名前', save.city.name); if (nm && nm.trim()) { save.city.name = nm.trim().slice(0, 14); persist(); renderBook(); } });
}

// ---- 他のしくみとのつながり(コインの出方・ご利益) ----
function cityCoinBonus() { return Math.min(10, Math.floor(cityStat.pop / 150)); }              // 人が増えると、コインがたくさん出る
function cityLuck(p) {                                                                       // 公園・スタジアムの近くのコインは、2倍になることがある
  let l = 0;
  for (const x of cityList) if (x.t.k === 'park' || x.t.k === 'stadium') { const c = tCenter(x.i, x.j); if (dist(c, p) <= 200) l += x.t.k === 'stadium' ? 0.2 : 0.1; }
  return Math.min(0.6, l);
}
function cityUnlocks(from, to) { return CITY_TOOLS.filter(t => t.minLv && t.minLv > from + 1 && t.minLv <= to + 1).map(t => t.n); }

// ---- 起動 ----
function cityInit() {
  const C = save.city = Object.assign({ tiles: {}, stock: 0, last: Date.now(), inc: Date.now(), total: 0, name: 'ぼくの街', seen: false }, save.city || {});
  let note = '';
  if (save.built && save.built.length) {                    // 旧「つくる」の建物は、使ったコインを全額返して入れ替える
    const refund = save.built.reduce((s, o) => s + (o.spent || 0), 0);
    save.builtLegacy = (save.builtLegacy || []).concat(save.built); save.built = [];
    save.gold += refund; note = `🏙️ 街づくりが新しくなりました!\n以前の建物は撤去して、使ったコイン ${refund}🪙 をお返ししました`;
  }
  recalcCity(); cityTick(true); accrueTax(); drawCity(); persist();
  setInterval(() => { cityTick(); }, GROW_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) cityTick(); });
  map.on('moveend', () => { if (cityMode) drawGrid(); });
  const onDown = e => { if (!cityMode || !cityBrush || cityTool === 'info' || (e.points && e.points.length > 1)) return; cityPainting = true; cityStroke = { spent: 0, last: null, warned: false }; paintAt(e.lngLat); };
  map.on('mousedown', onDown); map.on('touchstart', onDown);
  const onMove = e => { if (!cityMode) return; if (e.points && e.points.length > 1) return endStroke(); paintAt(e.lngLat); };
  map.on('mousemove', onMove); map.on('touchmove', onMove);
  for (const ev of ['mouseup', 'touchend', 'touchcancel']) map.on(ev, endStroke);
  map.on('click', e => { if (cityMode && (!cityBrush || cityTool === 'info')) { const [i, j] = tileOf(e.lngLat); applyTool(i, j); recalcCity(); drawCity(); persist(); renderCityBar(); } });
  $('cb-close').onclick = closeCity; $('cb-brush').onclick = () => setBrush(!cityBrush);
  $('cb-collect').onclick = collectTax; $('cb-stat').onclick = () => { closeCity(); bookTab = 'town'; bookFresh = true; renderBook(); $('book').hidden = false; };
  $('cb-loc').onclick = () => { follow = true; if (avatar) map.easeTo({ center: [avatar.lng, avatar.lat], zoom: CAM.zoom, duration: 600 }); };
  map.once('load', () => { cityMapReady = true; drawCity(); if (note) setTimeout(() => toast(note), 1200); });
  if (note) setTimeout(() => toast(note), 4000);
}
