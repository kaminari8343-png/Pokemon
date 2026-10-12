'use strict';
// オリジナルのイラスト(SVG)。絵文字の代わりに、街に立つ物・名所・コイン・キャラを描く。
window.ART = (function () {
  const O = '#4a3424';
  const S = `stroke="${O}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`;
  const SW = w => `stroke="${O}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
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
  // ---- 名所(15種類。光と影・ツヤのある絵で、一部は動く) ----
  const O2 = '#3b2a3a', S2 = `stroke="${O2}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"`;
  const LG = (id, top, bot) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient>`;
  const LGH = (id, l, r) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${l}"/><stop offset="1" stop-color="${r}"/></linearGradient>`;
  const df = (...s) => `<defs>${s.join('')}</defs>`;
  const sh2 = (cx = 32, cy = 58, rx = 22, ry = 4) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="rgba(20,10,30,.3)"/>`;
  const r2 = (x, y, w, h, f, rd = 1.5) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rd}" fill="${f}" ${S2}/>`;
  const p2 = (pts, f) => `<polygon points="${pts}" fill="${f}" ${S2}/>`;
  const d2 = (d, f) => `<path d="${d}" fill="${f}" ${S2}/>`;
  const c2 = (x, y, r, f) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${f}" ${S2}/>`;
  const hi = (d, c = 'rgba(255,255,255,.6)', w = 1.4) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
  const an = (attr, values, dur) => `<animate attributeName="${attr}" values="${values}" dur="${dur}s" repeatCount="indefinite"/>`;
  const mv = (values, dur) => `<animateTransform attributeName="transform" type="translate" values="${values}" dur="${dur}s" repeatCount="indefinite"/>`;
  const star4 = (x, y, s, dur = 2) => `<polygon points="${starPts(x, y, 4 * s, 1.1 * s, 4)}" fill="#fff6b0">${an('opacity', '1;.2;1', dur)}</polygon>`;
  const stoneLamp = (x, id) => `<g transform="translate(${x} 0)">` + r2(-4, 53, 8, 4, `url(#${id})`) + r2(-1.6, 45, 3.2, 8, `url(#${id})`) + r2(-4, 38, 8, 7, '#ffd26e') + `<rect x="-2.4" y="39.6" width="4.8" height="4" fill="#fff3b0" stroke="none">${an('opacity', '1;.55;1;.8;1', 1.6)}</rect>` + p2('-6,38 6,38 0,31', `url(#${id})`) + '</g>';
  const POI = {
    'ほこら': () => df(LG('sh1', '#ff8a66', '#c63a2a'), LG('sh2', '#e2dccb', '#9c9484'), LG('sh3', '#8d2b21', '#5a1812')) + glow('shg', 32, 36, 30, '#ffd98a', 0.4) + sh2() +
      stoneLamp(9, 'sh2') + stoneLamp(55, 'sh2') + r2(16.5, 22, 5, 35, 'url(#sh1)') + r2(42.5, 22, 5, 35, 'url(#sh1)') + hi('M18.5 24 V54') + hi('M44.5 24 V54') +
      r2(12, 30, 40, 4, 'url(#sh1)') + d2('M6 18 Q32 9 58 18 L56 24 Q32 17 8 24 Z', 'url(#sh3)') + hi('M10 19 Q32 12 54 19', 'rgba(255,200,170,.6)') + r2(29, 25, 6, 6, '#2a2430', 1) +
      r2(20, 55, 24, 3, 'url(#sh2)') + star4(32, 10, 1, 2.6),
    '古刹': () => df(LG('tp1', '#e2574c', '#a82e26'), LG('tp2', '#5d6b80', '#38445a'), LG('tp3', '#d9d2c0', '#9c9484')) + glow('tpg', 32, 30, 30, '#ffe08a', 0.3) + sh2() + r2(16, 54, 32, 4, 'url(#tp3)') +
      [0, 1, 2].map(i => { const y = 52 - i * 14, w = 15 - i * 3; return r2(32 - w + 3, y - 10, 2 * (w - 3), 10, 'url(#tp1)') + r2(30, y - 8, 4, 8, '#ffcf6e', 1) + p2(`${32 - w - 3},${y - 8} ${32 - w + 2},${y - 14} ${32 + w - 2},${y - 14} ${32 + w + 3},${y - 8}`, 'url(#tp2)') + hi(`M${32 - w} ${y - 9} H${32 + w}`, 'rgba(255,255,255,.35)', 1.2); }).join('') +
      `<line x1="32" y1="11" x2="32" y2="2" stroke="${O2}" stroke-width="2"/>` + [4, 6.5, 9].map(y => `<ellipse cx="32" cy="${y}" rx="2.6" ry="1" fill="#ffd24a" ${S2}/>`).join('') + `<circle cx="32" cy="52" r="1.6" fill="#fff3b0">${an('opacity', '1;.5;1', 2)}</circle>`,
    '礼拝堂': () => df(LG('ch1', '#fff8e8', '#e6d6b4'), LG('ch2', '#7a96c8', '#4a6498')) + glow('chg', 32, 38, 30, '#cfe0ff', 0.4) + sh2() + r2(14, 34, 36, 23, 'url(#ch1)') + p2('9,36 32,21 55,36', 'url(#ch2)') + hi('M13 36 L32 24 L51 36', 'rgba(255,255,255,.4)') +
      r2(27, 9, 10, 15, 'url(#ch1)') + p2('26,10 38,10 32,0', 'url(#ch2)') + `<path d="M32 -1 V-6 M29 -4 H35" stroke="#ffd24a" stroke-width="1.6"/>` +
      `<circle cx="32" cy="30" r="4.4" fill="#ffd26e" ${S2}>${an('fill-opacity', '1;.6;1', 3)}</circle>` + hi('M32 26 V34 M28 30 H36', '#8a5a1a', 1) + d2('M27 57 V47 Q32 41 37 47 V57 Z', '#6a4a3a') + r2(16, 42, 6, 9, '#9fd0ff', 3) + r2(42, 42, 6, 9, '#9fd0ff', 3),
    '古城': () => df(LG('cs1', '#ffffff', '#e4dccb'), LG('cs2', '#6b7a8e', '#3e495a'), LG('cs3', '#b3ad9c', '#7c7766')) + glow('csg', 32, 28, 32, '#fff0b0', 0.3) + sh2() + d2('M6 58 L13 40 H51 L58 58 Z', 'url(#cs3)') +
      hi('M10 50 H54 M12 45 H52', 'rgba(60,50,40,.4)', 1) + r2(15, 30, 34, 10, 'url(#cs1)') + [20, 28, 36].map(x => `<rect x="${x}" y="33" width="4" height="4" fill="#3a3a4a"/>`).join('') + p2('9,31 55,31 49,25 15,25', 'url(#cs2)') +
      r2(20, 19, 24, 6, 'url(#cs1)') + p2('15,20 49,20 43,14 21,14', 'url(#cs2)') + r2(26, 9, 12, 5, 'url(#cs1)') + p2('22,10 42,10 32,2', 'url(#cs2)') + `<circle cx="22" cy="10" r="1.6" fill="#ffd24a"/><circle cx="42" cy="10" r="1.6" fill="#ffd24a"/>` +
      `<line x1="32" y1="2" x2="32" y2="-4" stroke="${O2}" stroke-width="1.6"/><polygon points="32,-4 40,-2 32,0" fill="#e2574c">${an('opacity', '1;.7;1', 1.5)}</polygon>` + d2('M29 58 V48 Q32 44 35 48 V58 Z', '#3a2a2a'),
    '古い遺跡': () => df(LG('ru1', '#e9e2d0', '#a8a08c'), LG('ru2', '#d5ccb6', '#8e8672')) + glow('rug', 34, 40, 28, '#8ff0c0', 0.3) + sh2() +
      r2(9, 24, 10, 33, 'url(#ru1)') + p2('9,24 12,19 15,23 19,20 19,24', 'url(#ru1)') + hi('M12 26 V54 M16 26 V54', 'rgba(60,50,40,.3)', 1) +
      r2(25, 12, 11, 45, 'url(#ru1)') + p2('25,12 28,6 32,11 36,8 36,12', 'url(#ru1)') + hi('M28 14 V55 M32 14 V55', 'rgba(60,50,40,.3)', 1) +
      d2('M40 57 V42 Q40 34 47 34 Q54 34 54 42 V57 Z', 'url(#ru2)') + r2(35, 49, 10, 8, 'url(#ru2)') +
      `<rect x="41" y="40" width="9" height="7" rx="1.5" fill="#7ff0b0" stroke="${O2}" stroke-width="1.2">${an('fill-opacity', '1;.35;1', 2.4)}</rect>` + hi('M43 44 H48 M45.5 41.5 V46', '#205a40', 1) +
      c2(11, 56, 3.2, '#62b350') + c2(34, 57, 2.6, '#62b350') + hi('M19 30 Q22 38 18 46', '#4aa040', 1.6) + star4(48, 22, 0.9, 3),
    '森の広場': () => df(LG('fo1', '#8fd873', '#4a9d4a'), LG('fo2', '#a56a3a', '#6a4220')) + glow('fog', 32, 30, 30, '#d8ffb0', 0.35) + sh2() +
      r2(28, 34, 8, 23, 'url(#fo2)') + c2(32, 24, 16, 'url(#fo1)') + c2(20, 32, 10.5, 'url(#fo1)') + c2(44, 32, 10.5, 'url(#fo1)') + hi('M22 18 Q28 12 36 14', 'rgba(255,255,255,.45)', 2) +
      r2(42, 47, 16, 3.5, '#c98a4b', 1) + r2(43.5, 50.5, 2.5, 6, '#8b5a2b', 0.5) + r2(54, 50.5, 2.5, 6, '#8b5a2b', 0.5) + c2(12, 55, 3.4, '#ff9ec7') + c2(18, 56.5, 2.6, '#ffd24a') + c2(8, 57, 2.4, '#fff') +
      `<g><ellipse cx="14" cy="14" rx="2.4" ry="1.2" fill="#a6e07a">${an('opacity', '1;0;1', 4)}</ellipse>${mv('0 0;-6 30;-10 44', 4)}</g>`,
    '花の庭園': () => df(LG('ga1', '#ff9ec7', '#e0558f'), LG('ga2', '#c98a4b', '#8b5a2b')) + glow('gag', 32, 34, 30, '#ffd0e8', 0.4) + sh2() +
      r2(10, 20, 4, 37, 'url(#ga2)') + r2(50, 20, 4, 37, 'url(#ga2)') + `<path d="M12 22 Q32 -4 52 22" fill="none" stroke="#8b5a2b" stroke-width="4.2" stroke-linecap="round"/><path d="M12 22 Q32 -4 52 22" fill="none" stroke="#b9774a" stroke-width="1.6" stroke-linecap="round"/>` +
      [[14, 30], [12, 40], [14, 50], [50, 30], [52, 40], [50, 50], [20, 12], [32, 7], [44, 12], [26, 9], [38, 9]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${3.2 - (i % 2) * 0.5}" fill="${i % 3 ? 'url(#ga1)' : '#fff3c0'}" stroke="#a02a5a" stroke-width="1"/>`).join('') +
      [20, 28, 36, 44].map((x, i) => c2(x, 55, 3, ['#ff6b8a', '#ffd24a', '#b79bff', '#6ec6ff'][i])).join('') + hi('M16 57 H48', '#4a8a3a', 2.4) +
      `<g><path d="M30 22 Q26 18 28 15 Q31 17 31 22 Q34 17 37 15 Q38 18 33 22 Z" fill="#ffb347" stroke="${O2}" stroke-width=".8">${an('opacity', '1;.6;1', .8)}</path>${mv('0 0;6 -6;14 2;0 0', 6)}</g>`,
    '星見台': () => df(LG('ob1', '#f1e3c8', '#bba98a'), LG('ob2', '#8fa6ff', '#4a5ec8')) + glow('obg', 32, 20, 32, '#a0b4ff', 0.5) + sh2() + d2('M23 58 L27 24 H37 L41 58 Z', 'url(#ob1)') + hi('M28 30 L25 56', 'rgba(255,255,255,.5)') +
      r2(21, 55, 22, 3, '#8f8368', 1) + d2('M21 26 A11 11 0 0 1 43 26 Z', 'url(#ob2)') + hi('M24 22 A8 8 0 0 1 32 17', 'rgba(255,255,255,.55)', 1.6) + `<rect x="31" y="13" width="2.4" height="12" fill="#1a1a3a"/>` +
      `<line x1="34" y1="19" x2="50" y2="5" stroke="${O2}" stroke-width="4" stroke-linecap="round"/><line x1="34" y1="19" x2="50" y2="5" stroke="#cfd8ff" stroke-width="1.8" stroke-linecap="round"/>` +
      r2(31, 40, 4, 8, '#ffd26e', 1) + star4(10, 12, 1.3, 2.2) + star4(54, 30, 1, 1.7) + star4(14, 32, 0.9, 2.9) + `<path d="M52 14 A6 6 0 1 0 56 24 A4.6 4.6 0 1 1 52 14 Z" fill="#fff3b0" stroke="none"/>`,
    'ふしぎな石像': () => df(LG('st1', '#b8c4b0', '#7a8a78'), LG('st2', '#d9d2c0', '#9c9484')) + glow('stg', 32, 30, 30, '#7fe0c0', 0.4) + sh2() + r2(16, 46, 32, 11, 'url(#st2)') + r2(12, 54, 40, 4, 'url(#st2)') +
      `<ellipse cx="32" cy="38" rx="12" ry="9" fill="url(#st1)" ${S2}/>` + [0, 1, 2, 3, 4, 5, 6].map(i => { const a = Math.PI + i * Math.PI / 6; return c2((32 + Math.cos(a) * 12).toFixed(1), (24 + Math.sin(a) * 9 * 0.9).toFixed(1), 3.6, 'url(#st1)'); }).join('') + c2(32, 26, 9, 'url(#st1)') +
      `<circle cx="28" cy="25" r="2" fill="#7fffd0">${an('fill-opacity', '1;.4;1', 2.2)}</circle><circle cx="36" cy="25" r="2" fill="#7fffd0">${an('fill-opacity', '1;.4;1', 2.2)}</circle>` + d2('M28 31 Q32 34 36 31', '#5a6a58') + hi('M24 40 Q30 36 38 40', 'rgba(255,255,255,.4)') + c2(20, 49, 2.6, '#62b350') + c2(46, 51, 2.2, '#62b350') + star4(52, 14, 1, 2.8),
    'ふしぎな水晶': () => df(LG('cr1', '#f1e8ff', '#8a6ae8'), LG('cr2', '#d5c4ff', '#6a48c8'), LG('cr3', '#ffffff', '#c9a8ff')) + glow('crg', 32, 32, 31, '#c9a8ff', 0.75) + sh2(32, 58, 18, 3.4) +
      p2('13,32 20,26 22,57 8,57', 'url(#cr2)') + p2('51,34 57,40 56,57 44,57', 'url(#cr2)') + p2('32,3 44,23 40,57 24,57 20,23', 'url(#cr1)') + p2('32,3 44,23 32,27', 'url(#cr3)') + hi('M26 26 L27 52', 'rgba(255,255,255,.7)', 1.8) +
      `<polygon points="32,12 38,26 35,50 29,50 26,26" fill="#fff" fill-opacity=".35">${an('fill-opacity', '.15;.6;.15', 2.6)}</polygon>` + `<g>${star4(10, 18, 1.2, 2.1)}${mv('0 0;0 -4;0 0', 3)}</g><g>${star4(54, 14, 1.4, 1.8)}${mv('0 0;0 -5;0 0', 3.6)}</g>`,
    '知の殿堂': () => df(LG('mu1', '#fff6e0', '#d9c9a0'), LG('mu2', '#e2d8bc', '#a8996c')) + glow('mug', 32, 30, 30, '#ffe08a', 0.35) + sh2() + r2(8, 54, 48, 4, 'url(#mu2)') + r2(11, 51, 42, 3.4, 'url(#mu2)') + p2('7,24 32,8 57,24', 'url(#mu1)') + r2(9, 24, 46, 4, 'url(#mu2)') +
      [14, 24, 36, 46].map(x => r2(x, 28, 5, 23, 'url(#mu1)', 1) + hi(`M${x + 1.6} 30 V49`, 'rgba(120,100,60,.35)', 1)).join('') + `<circle cx="32" cy="19" r="3.2" fill="#ffd24a" ${S2}>${an('fill-opacity', '1;.6;1', 3)}</circle>` + r2(28, 38, 8, 13, '#ffd26e', 1) + hi('M32 38 V51', '#a8782a', 1) + star4(10, 10, 1, 2.4) + star4(54, 10, 1, 3),
    '旅の門': () => df(LG('pt1', '#c9c2b0', '#8a8472'), `<radialGradient id="ptl2"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#9fb8ff"/><stop offset="1" stop-color="#6a4ad8"/></radialGradient>`, `<clipPath id="ptc"><ellipse cx="32" cy="36" rx="13" ry="19"/></clipPath>`) + glow('ptg', 32, 36, 31, '#8fb2ff', 0.7) + sh2() +
      `<ellipse cx="32" cy="36" rx="13" ry="19" fill="url(#ptl2)"/><g clip-path="url(#ptc)"><g><animateTransform attributeName="transform" type="rotate" from="0 32 36" to="360 32 36" dur="5s" repeatCount="indefinite"/><path d="M32 36 Q46 30 40 18 M32 36 Q18 42 24 54 M32 36 Q42 48 54 42 M32 36 Q22 24 10 30" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".85"/></g></g>` +
      d2('M7 58 V30 Q7 5 32 5 Q57 5 57 30 V58 H46 V31 Q46 16 32 16 Q18 16 18 31 V58 Z', 'url(#pt1)') + hi('M10 30 Q10 9 32 8', 'rgba(255,255,255,.5)', 1.6) + p2('28,5 36,5 34,13 30,13', '#e8dcc0') + star4(32, 36, 1.3, 1.6) + hi('M12 40 H15 M49 48 H52 M11 50 H14', '#6f6a5a', 1.3),
    '癒しの泉': () => df(LG('sp1', '#9ff0e8', '#3fb8c8'), LG('sp2', '#b5b0a2', '#78746a')) + glow('spg', 32, 38, 30, '#bff8f0', 0.4) + sh2(32, 58, 26, 4) + `<ellipse cx="32" cy="46" rx="26" ry="11" fill="url(#sp2)" ${S2}/><ellipse cx="32" cy="45" rx="21" ry="8.5" fill="url(#sp1)" stroke="#2a8a98" stroke-width="1.2"/>` +
      hi('M16 44 Q24 41 32 44 Q40 47 48 44', 'rgba(255,255,255,.6)', 1.4) + [[8, 52], [18, 55], [47, 55], [56, 51], [12, 40], [52, 40]].map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="${5 - (i % 2)}" ry="3.4" fill="url(#sp2)" ${S2}/>`).join('') +
      [22, 32, 42].map((x, i) => `<g><path d="M${x} 38 Q${x - 4} 30 ${x} 22 Q${x + 4} 14 ${x} 6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".7">${an('opacity', '.15;.8;.15', 2.8 + i * 0.5)}</path>${mv('0 4;0 -4;0 4', 3 + i * 0.4)}</g>`).join('') + r2(48, 28, 8, 8, '#c98a4b', 2),
    '旅人の宿': () => df(LG('in1', '#fff1d6', '#e0c590'), LG('in2', '#8a5a3a', '#523420')) + glow('ing', 32, 36, 30, '#ffb27a', 0.4) + sh2() + r2(11, 30, 42, 27, 'url(#in1)') + [18, 32, 46].map(x => `<line x1="${x}" y1="30" x2="${x}" y2="57" stroke="#7a4a2a" stroke-width="1.8"/>`).join('') + `<line x1="11" y1="44" x2="53" y2="44" stroke="#7a4a2a" stroke-width="1.8"/>` +
      d2('M6 32 Q8 24 20 20 L44 20 Q56 24 58 32 Z', 'url(#in2)') + hi('M10 31 Q12 25 22 22', 'rgba(255,220,180,.5)') + r2(40, 6, 5, 12, '#8a5a3a', 1) +
      `<g><circle cx="42.5" cy="4" r="2.6" fill="#fff" opacity=".7">${an('opacity', '.7;0;.7', 3)}</circle>${mv('0 0;3 -6;0 0', 3)}</g>` +
      [14, 40].map(x => `<rect x="${x}" y="34" width="8" height="8" rx="1.5" fill="#ffd26e" stroke="${O2}" stroke-width="1.2">${an('fill-opacity', '1;.6;1;.85;1', 2 + x / 40)}</rect>`).join('') +
      r2(26, 40, 12, 17, '#6a3a2a', 1.5) + [0, 1, 2].map(i => `<path d="M${27 + i * 4} 39 V47 L${29 + i * 4} 45 L${31 + i * 4} 47 V39 Z" fill="#2a3a6a" ${S2.replace('1.5', '.8')}/>`).join('') +
      `<line x1="9" y1="30" x2="9" y2="36" stroke="${O2}" stroke-width="1.4"/><ellipse cx="9" cy="39" rx="3.4" ry="4.4" fill="#e2574c" ${S2}>${an('fill-opacity', '1;.7;1', 1.8)}</ellipse>`,
    '知恵の書庫': () => df(LG('li1', '#8a6ae0', '#4a3aa0'), LG('li2', '#e8d9b0', '#b39a60')) + glow('lig', 32, 30, 31, '#ffe08a', 0.45) + sh2() + r2(12, 26, 40, 31, 'url(#li2)') + p2('8,28 32,12 56,28', 'url(#li1)') + hi('M12 28 L32 15', 'rgba(255,255,255,.4)') +
      d2('M24 57 V42 Q32 34 40 42 V57 Z', '#3a2a5a') + `<path d="M26 56 V44 Q32 38 38 44 V56" fill="#ffd26e" fill-opacity=".5">${an('fill-opacity', '.25;.65;.25', 2.4)}</path>` +
      [['#d9544a', 17], ['#4a7fd9', 21], ['#3fa76a', 25]].map(([c, x]) => `<rect x="${x - 3}" y="31" width="3.4" height="9" fill="${c}" stroke="${O2}" stroke-width=".8"/>`).join('') + [['#e0a93a', 41], ['#d9544a', 45], ['#4a7fd9', 49]].map(([c, x]) => `<rect x="${x - 3}" y="31" width="3.4" height="9" fill="${c}" stroke="${O2}" stroke-width=".8"/>`).join('') +
      `<g><path d="M24 12 Q32 8 40 12 V20 Q32 16 24 20 Z" fill="#fff8e0" ${S2}/><line x1="32" y1="10" x2="32" y2="18" stroke="${O2}" stroke-width="1"/>${mv('0 0;0 -3;0 0', 2.8)}</g>` + star4(14, 14, 1.2, 2) + star4(52, 12, 1.2, 2.6) + c2(12, 56, 3, '#62b350'),
  };
  const POI_COLOR = { 'ほこら': '#ff9a6a', '古刹': '#ffc36a', '礼拝堂': '#bcd6ff', '古城': '#fff0a0', '古い遺跡': '#9fe8c0', '森の広場': '#a8f070', '花の庭園': '#ff9ec7', '星見台': '#a0b4ff', 'ふしぎな石像': '#7fe0c0', 'ふしぎな水晶': '#c9a8ff', '知の殿堂': '#ffd98a', '旅の門': '#8fb2ff', '癒しの泉': '#8fe8e0', '旅人の宿': '#ffb27a', '知恵の書庫': '#ffe08a' };
  // まだ見つけていない名所: 光る謎の宝珠(周りを光の粒がまわる)
  const UNKNOWN = () => df(`<radialGradient id="uo1" cx=".35" cy=".3"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#d4c2ff"/><stop offset="1" stop-color="#6a3fd0"/></radialGradient>`) + glow('ug', 32, 32, 31, '#b79bff', 0.8) +
    `<g><animateTransform attributeName="transform" type="rotate" from="0 32 32" to="360 32 32" dur="6s" repeatCount="indefinite"/><circle cx="32" cy="6" r="2.4" fill="#fff6c8"/><circle cx="58" cy="32" r="1.7" fill="#ffe08a"/><circle cx="8" cy="40" r="2" fill="#fff6c8"/><circle cx="46" cy="55" r="1.5" fill="#ffe08a"/></g>` +
    `<circle cx="32" cy="32" r="16" fill="url(#uo1)" stroke="#3b1f7a" stroke-width="1.6"/><path d="M25.5 27 Q25.5 19.5 32 19.5 Q39 19.5 39 26 Q39 30.5 34 32.5 Q32 33.5 32 37.5" fill="none" stroke="#ffd24a" stroke-width="3.4" stroke-linecap="round"/><circle cx="32" cy="43.5" r="2.3" fill="#ffd24a"/><path d="M22 24 Q24 19 29 17" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="1.8" stroke-linecap="round"/>`;
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
  const BUTTERFLY = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><path d="M16 16 Q4 2 3 12 Q3 20 16 17Z" fill="#ff9a3d" ${SW(1.4)}/><path d="M16 16 Q28 2 29 12 Q29 20 16 17Z" fill="#ff9a3d" ${SW(1.4)}/><path d="M16 17 Q6 20 8 27 Q14 28 16 18Z" fill="#ffd24a" ${SW(1.4)}/><path d="M16 17 Q26 20 24 27 Q18 28 16 18Z" fill="#ffd24a" ${SW(1.4)}/><rect x="15" y="9" width="2" height="14" rx="1" fill="${O}"/></svg>`;
  // ---- 地面の飾り(キャンバス用) ----
  const DECOR = [
    () => bloom(32, 32, 8, '#ff9ec7', '#ffd24a') + line(32, 40, 32, 58, '#4a8a3a', 3),
    () => bloom(32, 32, 8, '#ffe05a', '#e2862a', 8) + line(32, 40, 32, 58, '#4a8a3a', 3),
    () => rect(28, 36, 8, 20, '#fff1d6') + path('M10 38 Q32 4 54 38 Z', '#e2574c') + circ(24, 30, 3, '#fff', false) + circ(38, 24, 3.4, '#fff', false) + circ(46, 33, 2.4, '#fff', false),
    () => circ(24, 40, 9, '#6fbf5a') + circ(40, 40, 9, '#6fbf5a') + circ(32, 28, 9, '#7fcf6a') + line(32, 38, 32, 58, '#4a8a3a', 3),
    () => `<path d="M12 58 Q16 34 20 22 Q22 40 26 58Z M26 58 Q30 28 34 14 Q38 38 40 58Z M40 58 Q46 36 52 26 Q52 44 54 58Z" fill="#7fcf6a" ${SW(1.6)}/>`,
  ];

  const mini = (inner, px) => svg(inner, px);
  return {
    item: (id, lv, px = 64) => svg(ITEMS[id][Math.min(3, Math.max(1, lv || 1)) - 1](), px),
    poi: (kind, px = 64) => svg((POI[kind] || POI['森の広場'])(), px),
    unknown: (px = 56) => svg(UNKNOWN(), px),
    poiColor: kind => POI_COLOR[kind] || '#ffd873',
    poiKinds: () => Object.keys(POI),
    coin: (kind, px = 40) => svg(COIN[kind || 'coin'](), px),
    hero: (px = 56) => svg(HERO(), px),
    butterfly: BUTTERFLY,
    decorSvgs: DECOR.map(f => svg(f(), 64)),
    sheet: () => Object.keys(ITEMS).map(id => [1, 2, 3].map(l => svg(ITEMS[id][l - 1](), 72)).join('')).join('<br>') + '<br>' +
      Object.keys(POI).map(k => svg(POI[k](), 72)).join('') + svg(UNKNOWN(), 72) + '<br>' + Object.keys(COIN).map(k => svg(COIN[k](), 72)).join('') + svg(HERO(), 72) + DECOR.map(f => svg(f(), 72)).join('') + BUTTERFLY(),
  };
})();
