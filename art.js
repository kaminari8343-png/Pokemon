'use strict';
// オリジナルのイラスト(SVG)。絵文字の代わりに、街に立つ物・名所・コイン・キャラを描く。
window.ART = (function () {
  const O = '#4a3424';
  const S = `stroke="${O}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`;
  const rect = (x, y, w, h, f, r = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${f}" ${S}/>`;
  const circ = (x, y, r, f, st = true) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${f}" ${st ? S : ''}/>`;
  const ell = (x, y, rx, ry, f, st = true) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${f}" ${st ? S : ''}/>`;
  const poly = (pts, f) => `<polygon points="${pts}" fill="${f}" ${S}/>`;
  const path = (d, f) => `<path d="${d}" fill="${f}" ${S}/>`;
  const arc = (d, c, w = 3) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
  const line = (x1, y1, x2, y2, c = O, w = 2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
  const glow = (id, x, y, r, c, a = 0.85) => `<defs><radialGradient id="${id}"><stop offset="0" stop-color="${c}" stop-opacity="${a}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs><circle cx="${x}" cy="${y}" r="${r}" fill="url(#${id})"/>`;
  const grp = (x, y, s, inner) => `<g transform="translate(${x} ${y}) scale(${s})">${inner}</g>`;
  const svg = (inner, px = 64) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${px}" height="${px}">${inner}</svg>`;
  const starPts = (cx, cy, R, r, n = 5) => { const p = []; for (let k = 0; k < n * 2; k++) { const a = -Math.PI / 2 + k * Math.PI / n, d = k % 2 ? r : R; p.push((cx + Math.cos(a) * d).toFixed(1) + ',' + (cy + Math.sin(a) * d).toFixed(1)); } return p.join(' '); };
  const sparkle = (x, y, s = 1) => `<polygon points="${starPts(x, y, 4 * s, 1.2 * s, 4)}" fill="#fff6b0" stroke="none"/>`;

  // ---- 部品 ----
  const house = (roof, wall, door = '#9b6a3c') =>
    poly('7,35 32,11 57,35', roof) + rect(12, 33, 40, 24, wall) + rect(27, 41, 10, 16, door) + circ(34.5, 49.5, 1, '#ffd24a', false) +
    rect(15, 38, 8, 8, '#9fd8ff') + rect(41, 38, 8, 8, '#9fd8ff') + line(19, 38, 19, 46, O, 1.2) + line(15, 42, 23, 42, O, 1.2) + line(45, 38, 45, 46, O, 1.2) + line(41, 42, 49, 42, O, 1.2);
  const bloom = (x, y, r, pc, cc, n = 6) => { let s = ''; for (let k = 0; k < n; k++) { const a = k / n * 6.283; s += circ((x + Math.cos(a) * r).toFixed(1), (y + Math.sin(a) * r).toFixed(1), (r * 0.72).toFixed(1), pc); } return s + circ(x, y, (r * 0.62).toFixed(1), cc); };
  const tulip = (x, y, c) => path(`M${x - 8} ${y - 10} L${x - 8} ${y + 2} Q${x} ${y + 13} ${x + 8} ${y + 2} L${x + 8} ${y - 10} L${x + 4} ${y - 4} L${x} ${y - 11} L${x - 4} ${y - 4} Z`, c);
  const leaf = (x, y) => ell(x, y, 6, 3, '#6fbf5a');
  const tent = (c1, c2) => poly('6,57 32,12 58,57', c1) + poly('23,57 32,33 41,57', c2) + line(32, 12, 32, 4, O, 2) + poly('32,4 42,7 32,10', '#ffd24a');
  const torii = (c = '#e2574c', d = '#c0392b') =>
    rect(15, 24, 5, 33, c) + rect(44, 24, 5, 33, c) + path('M5 19 Q32 12 59 19 L57 26 L7 26 Z', c) + rect(11, 31, 42, 4, d) + rect(27, 26, 10, 5, '#3a3a3a', 1);
  const tower = (wall) => rect(25, 16, 14, 41, wall) + rect(25, 26, 14, 5, '#e2574c', 0) + rect(25, 40, 14, 5, '#e2574c', 0) + rect(21, 54, 22, 5, '#b8b2a4') + poly('23,16 41,16 32,3', '#7a8be0') + rect(29, 46, 6, 8, '#6a5a48', 1);
  const keep = (x, w, h, cone, wall = '#d9d2c0') => rect(x, 57 - h, w, h, wall) + poly(`${x - 2},${57 - h} ${x + w + 2},${57 - h} ${x + w / 2},${57 - h - 15}`, cone) + rect(x + w / 2 - 2, 57 - h + 6, 4, 6, '#3a3a3a', 1);

  // ---- 置ける物(9種 × 3段階) ----
  const ITEMS = {
    flower: [
      () => line(20, 34, 20, 57, '#4a8a3a', 3) + line(34, 28, 34, 57, '#4a8a3a', 3) + line(47, 37, 47, 57, '#4a8a3a', 3) + leaf(27, 50) + leaf(41, 48) +
        bloom(20, 32, 5, '#ff9ec7', '#ffd24a') + bloom(34, 25, 6, '#ffb3d9', '#ffd24a') + bloom(47, 36, 5, '#ff8fb8', '#ffd24a'),
      () => line(18, 30, 18, 57, '#4a8a3a', 3) + line(32, 22, 32, 57, '#4a8a3a', 3) + line(46, 32, 46, 57, '#4a8a3a', 3) + leaf(25, 50) + leaf(39, 46) + leaf(53, 50) +
        tulip(18, 26, '#ff5a5a') + tulip(32, 18, '#ffd23f') + tulip(46, 28, '#ff8fd0'),
      () => line(16, 28, 16, 57, '#4a8a3a', 4) + line(34, 22, 34, 57, '#4a8a3a', 4) + line(50, 32, 50, 57, '#4a8a3a', 4) + leaf(25, 52) + leaf(42, 50) +
        bloom(16, 24, 7, '#ffd23f', '#7a4a1e', 10) + bloom(34, 17, 9, '#ffd23f', '#7a4a1e', 12) + bloom(50, 29, 7, '#ffe05a', '#7a4a1e', 10) + sparkle(58, 12, 1.2)],
    tree: [
      () => rect(28, 38, 8, 19, '#9b6a3c') + circ(32, 26, 15, '#6fbf5a') + circ(21, 34, 10, '#62b350') + circ(43, 34, 10, '#62b350') + circ(28, 22, 5, '#8bd374', false) + circ(40, 30, 3, '#8bd374', false),
      () => rect(29, 48, 6, 10, '#9b6a3c') + poly('32,24 54,52 10,52', '#3f9e5a') + poly('32,14 49,38 15,38', '#4aae64') + poly('32,4 44,24 20,24', '#5cc072'),
      () => rect(29, 48, 6, 10, '#9b6a3c') + poly('32,24 54,52 10,52', '#3f9e5a') + poly('32,14 49,38 15,38', '#4aae64') + poly('32,6 44,24 20,24', '#5cc072') +
        circ(24, 44, 3, '#ff5a5a') + circ(40, 40, 3, '#ffd23f') + circ(32, 30, 3, '#6ec6ff') + circ(30, 18, 2.5, '#ff8fd0') + `<polygon points="${starPts(32, 4, 6, 2.6)}" fill="#ffe066" ${S}/>` + sparkle(52, 14, 1.2)],
    rest: [
      () => rect(8, 22, 48, 8, '#d99b5a') + rect(8, 34, 48, 8, '#c98a4b') + rect(12, 42, 5, 15, '#8b5a2b') + rect(47, 42, 5, 15, '#8b5a2b') + rect(10, 30, 4, 4, '#8b5a2b', 1) + rect(50, 30, 4, 4, '#8b5a2b', 1),
      () => tent('#ff9f4a', '#7a3b1d'),
      () => grp(-6, 4, 1, tent('#ff9f4a', '#7a3b1d')) + grp(34, 22, 0.55, tent('#6fbf8a', '#2f6a4a')) +
        path('M46 58 Q40 44 46 36 Q48 44 52 40 Q58 50 52 58 Z', '#ff9a3d') + path('M47 58 Q44 50 47 46 Q50 52 52 58 Z', '#ffe066') + line(38, 59, 58, 57, '#6a4a2a', 3) + sparkle(54, 28, 1)],
    lantern: [
      () => glow('lg1', 32, 32, 28, '#ffb347') + line(32, 3, 32, 12) + rect(24, 11, 16, 5, '#4a3424') + ell(32, 32, 16, 18, '#e2574c') +
        arc('M32 15 V49 M25 17 Q21 32 25 47 M39 17 Q43 32 39 47', '#b83a30', 1.6) + rect(26, 48, 12, 4, '#4a3424') + line(32, 52, 32, 59, '#ffd24a', 2) + circ(32, 60, 2, '#ffd24a'),
      () => glow('lg2', 32, 24, 28, '#ffcf5a') + path('M16 44 Q16 56 32 56 Q48 56 48 44 L42 36 L22 36 Z', '#f2b73d') + path('M46 42 Q58 40 54 50 Q52 54 46 52', '#f2b73d') +
        rect(26, 34, 12, 4, '#d99a2a', 1) + path('M32 8 Q41 22 32 34 Q23 22 32 8Z', '#ff9a3d') + path('M32 18 Q36 25 32 32 Q28 25 32 18Z', '#ffe066') + sparkle(12, 16, 1),
      () => glow('lg3', 32, 22, 30, '#ffe066') + rect(30, 28, 4, 30, '#7a6a58', 1) + rect(24, 54, 16, 5, '#6a5a48') +
        `<polygon points="${starPts(32, 22, 17, 7.5)}" fill="#ffe066" ${S}/>` + sparkle(10, 12, 1.3) + sparkle(54, 36, 1) + sparkle(8, 44, 0.9)],
    fountain: [
      () => ell(32, 46, 27, 12, '#8a7a62') + ell(32, 45, 24, 10, '#7cc8e8') + ell(32, 44, 17, 6, '#a5def3', false) + ell(22, 47, 7, 3, '#6fbf5a') + ell(43, 44, 6, 2.5, '#6fbf5a') + circ(43, 41, 2.4, '#ff9ec7') +
        `<ellipse cx="30" cy="46" rx="10" ry="3" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.5"/>`,
      () => ell(32, 50, 28, 9, '#cfc7b6') + ell(32, 49, 24, 6, '#7cc8e8') + rect(29, 22, 6, 26, '#cfc7b6') + path('M18 25 Q32 36 46 25 Z', '#dcd5c5') +
        arc('M32 20 Q18 8 12 30', '#7cc8e8') + arc('M32 20 Q46 8 52 30', '#7cc8e8') + arc('M32 20 V12', '#7cc8e8') + circ(12, 31, 1.8, '#bfe8f7', false) + circ(52, 31, 1.8, '#bfe8f7', false) + sparkle(32, 8, 1),
      () => glow('fg3', 32, 28, 30, '#7ff0e0') + ell(32, 52, 28, 8, '#cfc7b6') + ell(32, 51, 24, 5, '#7cc8e8') + ell(32, 46, 15, 7, '#8f8aa0') +
        path('M30 30 Q20 42 33 48 Q43 50 44 42 Q35 42 35 34 Z', '#3fd0c0') + poly('44,42 54,38 50,48', '#3fd0c0') + circ(33, 22, 5.5, '#ffd9b8') +
        path('M27 22 Q27 14 34 15 Q40 16 39 24 Q36 18 30 24 Z', '#a67cf0') + rect(30, 27, 6, 8, '#ffd9b8', 2) + sparkle(12, 20, 1.2) + sparkle(54, 18, 1) + circ(16, 46, 2, '#fff', false)],
    shrine: [
      () => torii() + rect(52, 48, 8, 10, '#b8b2a4') + poly('50,48 62,48 56,41', '#9c968a'),
      () => torii() + ell(32, 52, 9, 7, '#ff9a3d') + circ(32, 41, 7, '#ff9a3d') + poly('26,37 27,28 33,35', '#ff9a3d') + poly('38,37 37,28 31,35', '#ff9a3d') +
        ell(32, 44, 4.5, 3, '#fff', false) + circ(29.5, 40, 1.2, O, false) + circ(34.5, 40, 1.2, O, false) + ell(32, 53, 5, 5, '#fff', false) + path('M41 54 Q54 52 52 40 Q48 48 41 48 Z', '#ff9a3d'),
      () => glow('sg3', 32, 36, 30, '#ffe066', 0.55) + torii('#b8362c', '#962a22') +
        `<path d="M6 54 C 18 56, 18 34, 32 38 S 48 20, 56 26" fill="none" stroke="${O}" stroke-width="11" stroke-linecap="round"/><path d="M6 54 C 18 56, 18 34, 32 38 S 48 20, 56 26" fill="none" stroke="#3fbf8f" stroke-width="7" stroke-linecap="round"/>` +
        circ(57, 24, 6.5, '#3fbf8f') + line(54, 19, 51, 12, '#ffd24a', 2.4) + line(60, 19, 63, 12, '#ffd24a', 2.4) + circ(59, 23, 1.4, '#fff', false) + circ(59.4, 23, 0.7, O, false) + sparkle(14, 20, 1.2)],
    house: [
      () => house('#e2574c', '#fff1d6'),
      () => rect(40, 6, 6, 14, '#b9774a') + house('#d9544a', '#ffe9c2') + circ(10, 55, 6, '#62b350') + circ(54, 55, 6, '#62b350') + circ(10, 55, 2, '#ff9ec7', false) + circ(54, 55, 2, '#ffd24a', false) +
        rect(2, 49, 3, 9, '#fff', 1) + rect(59, 49, 3, 9, '#fff', 1),
      () => grp(0, 6, 0.6, house('#5a8de0', '#fff1d6')) + grp(34, 8, 0.6, house('#5fb36a', '#ffe9c2')) + grp(12, 4, 0.78, house('#e2574c', '#fff1d6')) + sparkle(56, 8, 1.1)],
    tower: [
      () => glow('tg1', 32, 6, 14, '#ffe066') + tower('#f1e3c8') + circ(32, 3, 3, '#ffe066'),
      () => rect(22, 30, 20, 27, '#f1e3c8') + rect(22, 40, 20, 4, '#7a8be0', 0) + path('M16 32 A16 16 0 0 1 48 32 Z', '#9fb2ff') + line(36, 24, 52, 10, O, 3.5) + circ(53, 9, 3, '#cfd8ff') + rect(28, 46, 8, 11, '#6a5a48', 1) + sparkle(12, 12, 1.1) + sparkle(56, 28, 0.9),
      () => glow('tg3', 32, 30, 30, '#a0b4ff', 0.6) + tower('#f1e3c8') + ell(32, 28, 28, 7, '#c9d2ff') + ell(32, 26, 14, 4, '#9fb2ff') + sparkle(8, 14, 1.2) + sparkle(56, 40, 1)],
    monument: [
      () => rect(14, 52, 36, 6, '#a8a190') + path('M21 54 V22 Q32 8 43 22 V54 Z', '#cfc8b4') + arc('M27 28 H37 M27 35 H37 M27 42 H34', '#8f897c', 2) + circ(24, 55, 2.4, '#62b350', false),
      () => rect(12, 52, 40, 6, '#a8a190') + path('M20 54 V22 Q32 6 44 22 V54 Z', '#d9d2c0') + arc('M26 28 H38 M26 35 H38 M26 42 H34', '#8f897c', 2) +
        line(50, 54, 50, 24, O, 2) + poly('50,24 60,28 50,32', '#e2574c') + circ(14, 55, 3.2, '#ff9ec7') + circ(22, 56, 2.6, '#ffd24a') + circ(8, 56, 2.4, '#fff', false),
      () => glow('mg3', 32, 28, 30, '#ffe066', 0.7) + rect(14, 46, 36, 12, '#d9d2c0') + rect(18, 40, 28, 6, '#bdb5a2') +
        path('M20 14 H44 Q44 30 32 34 Q20 30 20 14 Z', '#ffd24a') + path('M20 16 Q10 16 12 24 Q14 28 20 26', '#ffd24a') + path('M44 16 Q54 16 52 24 Q50 28 44 26', '#ffd24a') + rect(29, 34, 6, 6, '#e8b23a') +
        `<polygon points="${starPts(32, 22, 6, 2.6)}" fill="#fff3a0" stroke="none"/>` + sparkle(8, 10, 1.2) + sparkle(56, 12, 1.2)],
    rainbow: [
      () => ell(14, 52, 9, 5, '#fff') + ell(50, 52, 9, 5, '#fff') + arc('M12 52 A20 20 0 0 1 52 52', '#ff6b6b', 5) + arc('M17 52 A15 15 0 0 1 47 52', '#ffd23f', 5) + arc('M22 52 A10 10 0 0 1 42 52', '#6ec6ff', 5),
      () => ell(12, 54, 11, 6, '#fff') + ell(52, 54, 11, 6, '#fff') + ell(18, 50, 7, 5, '#fff') + ell(46, 50, 7, 5, '#fff') +
        arc('M8 54 A24 24 0 0 1 56 54', '#ff6b6b', 4.5) + arc('M12.5 54 A19.5 19.5 0 0 1 51.5 54', '#ffa94d', 4.5) + arc('M17 54 A15 15 0 0 1 47 54', '#ffd23f', 4.5) + arc('M21.5 54 A10.5 10.5 0 0 1 42.5 54', '#6fcf6a', 4.5) + arc('M26 54 A6 6 0 0 1 38 54', '#6ec6ff', 4.5),
      () => glow('rg3', 32, 36, 32, '#fff0b0', 0.6) + ell(12, 54, 11, 6, '#fff') + ell(52, 54, 11, 6, '#fff') +
        arc('M6 54 A26 26 0 0 1 58 54', '#ff6b6b', 4.5) + arc('M10.5 54 A21.5 21.5 0 0 1 53.5 54', '#ffa94d', 4.5) + arc('M15 54 A17 17 0 0 1 49 54', '#ffd23f', 4.5) + arc('M19.5 54 A12.5 12.5 0 0 1 44.5 54', '#6fcf6a', 4.5) + arc('M24 54 A8 8 0 0 1 40 54', '#6ec6ff', 4.5) +
        sparkle(32, 12, 1.5) + sparkle(10, 24, 1.1) + sparkle(54, 22, 1.1) + sparkle(32, 30, 0.9)],
    castle: [
      () => keep(8, 13, 36, '#e2574c') + keep(43, 13, 36, '#e2574c') + keep(19, 26, 32, '#d9544a') + path('M26 57 V45 Q32 38 38 45 V57 Z', '#6a4a2a') + line(14, 13, 14, 6, O, 2) + poly('14,6 22,8 14,11', '#ffd24a'),
      () => grp(2.5, 5, 0.92, keep(4, 13, 40, '#e2574c') + keep(47, 13, 40, '#e2574c') + keep(18, 28, 34, '#d9544a') + keep(26, 12, 46, '#e2574c', '#e0d9c8') + path('M26 57 V45 Q32 38 38 45 V57 Z', '#6a4a2a') + line(32, 0, 32, 8, O, 2) + poly('32,0 40,3 32,6', '#ffd24a')),
      () => glow('cg3', 32, 22, 32, '#ffe066', 0.6) + grp(2.5, 7, 0.92, keep(4, 13, 40, '#f5c542') + keep(47, 13, 40, '#f5c542') + keep(18, 28, 34, '#e8b23a') + keep(26, 12, 46, '#f5c542', '#f1ead8') + path('M26 57 V45 Q32 38 38 45 V57 Z', '#6a4a2a')) +
        path('M20 12 L24 3 L28 10 L32 1 L36 10 L40 3 L44 12 Z', '#ffd24a') + sparkle(10, 8, 1.1) + sparkle(54, 10, 1.1)],
  };
  // ---- 名所 ----
  const POI = {
    'ほこら': () => ITEMS.shrine[0](),
    '古い遺跡': () => rect(8, 26, 11, 31, '#cfc7b6') + poly('8,26 12,20 15,25 19,22 19,26', '#cfc7b6') + rect(26, 14, 11, 43, '#d9d2c0') + poly('26,14 30,9 33,13 37,10 37,14', '#d9d2c0') +
      rect(42, 44, 16, 13, '#bdb5a2') + rect(46, 36, 9, 8, '#cfc7b6') + circ(10, 55, 4, '#62b350') + circ(40, 56, 3.5, '#62b350') + circ(30, 40, 2, '#62b350', false) + sparkle(50, 22, 1),
    '森の広場': () => ITEMS.tree[0]() + circ(12, 54, 7, '#62b350') + circ(52, 54, 7, '#62b350') + circ(12, 52, 2, '#ff9ec7', false) + circ(52, 52, 2, '#ffd24a', false),
    'ふしぎな水晶': () => glow('pg1', 32, 32, 30, '#c9a8ff', 0.7) + poly('32,4 43,24 39,56 25,56 21,24', '#b79bff') + poly('32,4 43,24 32,27', '#e3d6ff') + poly('15,32 22,26 24,56 10,56', '#9a7bf0') + poly('49,34 55,40 54,56 42,56', '#a98af7') + sparkle(54, 16, 1.4) + sparkle(10, 18, 1.1),
    '旅の門': () => glow('pg2', 32, 36, 28, '#8fb2ff', 0.7) + `<defs><radialGradient id="ptl"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#9fb8ff"/><stop offset="1" stop-color="#7a5ae0"/></radialGradient></defs>` +
      ell(32, 38, 13, 19, 'url(#ptl)') + path('M8 58 V30 Q8 6 32 6 Q56 6 56 30 V58 H46 V32 Q46 16 32 16 Q18 16 18 32 V58 Z', '#b8b2a4') + sparkle(32, 36, 1.4) + line(12, 36, 15, 36, '#8f897c', 1.5) + line(49, 46, 52, 46, '#8f897c', 1.5),
    '癒しの泉': () => ITEMS.fountain[0]() + arc('M22 36 Q18 28 24 22 Q28 16 24 10', '#fff', 2.5) + arc('M38 34 Q34 26 40 20 Q44 14 40 8', '#fff', 2.5),
    '旅人の宿': () => house('#6a8fe0', '#ffe9c2', '#8b5a2b') + line(50, 22, 50, 32, O, 2) + rect(46, 22, 14, 9, '#c98a4b') + rect(49, 24, 6, 5, '#fff', 1) + arc('M55 25 Q58 26 55 28', '#fff', 1.4) + sparkle(8, 12, 1),
    '知恵の書庫': () => rect(10, 45, 44, 11, '#d9544a') + rect(14, 35, 38, 10, '#4a7fd9') + rect(8, 25, 42, 10, '#3fa76a') + rect(16, 15, 34, 10, '#e0a93a') +
      line(14, 50, 50, 50, '#fff', 1.4) + line(18, 40, 48, 40, '#fff', 1.4) + line(12, 30, 46, 30, '#fff', 1.4) + sparkle(54, 12, 1.2) + sparkle(8, 12, 0.9),
  };
  // ---- コイン類 ----
  const COIN = {
    coin: () => glow('cn1', 32, 32, 30, '#ffe066', 0.6) + circ(32, 32, 21, '#ffd24a') + `<circle cx="32" cy="32" r="15" fill="none" stroke="#d9a000" stroke-width="2.4"/>` + `<polygon points="${starPts(32, 32, 9, 4)}" fill="#fff0a0" stroke="#d9a000" stroke-width="1.5"/>` + arc('M18 24 Q22 16 30 14', '#fff', 2.4),
    bag: () => glow('cn2', 32, 36, 30, '#ffe066', 0.5) + path('M22 20 Q32 12 42 20 Q58 36 52 50 Q50 58 32 58 Q14 58 12 50 Q6 36 22 20Z', '#e0a93a') + rect(23, 14, 18, 7, '#7a4a1e', 3) + circ(32, 40, 8, '#ffd24a') + `<polygon points="${starPts(32, 40, 5, 2.2)}" fill="#fff0a0" stroke="none"/>`,
    gem: () => glow('cn3', 32, 32, 30, '#7fd3ff', 0.7) + poly('32,57 8,27 19,9 45,9 56,27', '#6ec6ff') + poly('19,9 32,27 45,9', '#bfe8ff') + poly('8,27 32,27 32,57', '#4aa7e8') + line(8, 27, 56, 27, O, 1.4) + sparkle(50, 12, 1.3),
    shard: () => glow('cn4', 32, 32, 30, '#c9a8ff', 0.8) + poly('32,3 44,22 38,58 26,58 20,22', '#b79bff') + poly('32,3 44,22 32,26', '#e8dcff') + poly('13,34 20,28 22,58 8,58', '#9a7bf0') + sparkle(52, 14, 1.5) + sparkle(12, 18, 1.1),
  };
  // ---- 主人公(魔法使い) ----
  const HERO = () => glow('hg', 32, 34, 30, '#ffd873', 0.35) +
    rect(46, 12, 3, 46, '#8b5a2b', 1) + circ(47.5, 11, 5, '#ffe066') + sparkle(55, 4, 1) +
    path('M18 58 L22 34 Q32 30 42 34 L46 58 Z', '#6a4ab8') + path('M24 40 L40 40 L41 46 L23 46 Z', '#8a6ad8') +
    circ(32, 28, 9, '#ffd9b8') + path('M24 31 Q32 46 40 31 Q36 36 32 36 Q28 36 24 31Z', '#f4f4f4') + circ(28.5, 27, 1.4, O, false) + circ(35.5, 27, 1.4, O, false) +
    ell(32, 20, 17, 5, '#5a3aa8') + poly('19,20 32,-2 45,20', '#6a4ab8') + `<polygon points="${starPts(34, 10, 4.5, 1.8)}" fill="#ffe066" stroke="none"/>`;
  const BUTTERFLY = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><path d="M16 16 Q4 2 3 12 Q3 20 16 17Z" fill="#ff9a3d" ${S} stroke-width="1.4"/><path d="M16 16 Q28 2 29 12 Q29 20 16 17Z" fill="#ff9a3d" ${S} stroke-width="1.4"/><path d="M16 17 Q6 20 8 27 Q14 28 16 18Z" fill="#ffd24a" ${S} stroke-width="1.4"/><path d="M16 17 Q26 20 24 27 Q18 28 16 18Z" fill="#ffd24a" ${S} stroke-width="1.4"/><rect x="15" y="9" width="2" height="14" rx="1" fill="${O}"/></svg>`;
  // ---- 地面の飾り(キャンバス用) ----
  const DECOR = [
    () => bloom(32, 32, 8, '#ff9ec7', '#ffd24a') + line(32, 40, 32, 58, '#4a8a3a', 3),
    () => bloom(32, 32, 8, '#ffe05a', '#e2862a', 8) + line(32, 40, 32, 58, '#4a8a3a', 3),
    () => rect(28, 36, 8, 20, '#fff1d6') + path('M10 38 Q32 4 54 38 Z', '#e2574c') + circ(24, 30, 3, '#fff', false) + circ(38, 24, 3.4, '#fff', false) + circ(46, 33, 2.4, '#fff', false),
    () => circ(24, 40, 9, '#6fbf5a') + circ(40, 40, 9, '#6fbf5a') + circ(32, 28, 9, '#7fcf6a') + line(32, 38, 32, 58, '#4a8a3a', 3),
    () => `<path d="M12 58 Q16 34 20 22 Q22 40 26 58Z M26 58 Q30 28 34 14 Q38 38 40 58Z M40 58 Q46 36 52 26 Q52 44 54 58Z" fill="#7fcf6a" ${S} stroke-width="1.6"/>`,
  ];

  const mini = (inner, px) => svg(inner, px);
  return {
    item: (id, lv, px = 64) => svg(ITEMS[id][Math.min(3, Math.max(1, lv || 1)) - 1](), px),
    poi: (kind, px = 64) => svg((POI[kind] || POI['森の広場'])(), px),
    coin: (kind, px = 40) => svg(COIN[kind || 'coin'](), px),
    hero: (px = 56) => svg(HERO(), px),
    butterfly: BUTTERFLY,
    decorSvgs: DECOR.map(f => svg(f(), 64)),
    sheet: () => Object.keys(ITEMS).map(id => [1, 2, 3].map(l => svg(ITEMS[id][l - 1](), 72)).join('')).join('<br>') + '<br>' +
      Object.keys(POI).map(k => svg(POI[k](), 72)).join('') + '<br>' + Object.keys(COIN).map(k => svg(COIN[k](), 72)).join('') + svg(HERO(), 72) + DECOR.map(f => svg(f(), 72)).join('') + BUTTERFLY(),
  };
})();
