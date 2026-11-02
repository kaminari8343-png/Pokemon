'use strict';
// ポケット散歩: 「散歩をはじめる」を押したら、ポケットに入れるだけ。歩いているあいだは、音と振動で知らせ、終わったら結果発表。
// 効果音は、ファイルを使わずにその場で合成する(読み込みが軽く、オフラインでも鳴る)。
// ※ game.js より先に読み込む。ここは定義だけで、game.js の変数は「呼ばれたとき」に使う。

// ---- 効果音 ----
let actx = null;
function audioUnlock() {                    // 音は、画面を触ったあとでないと鳴らせない(ブラウザの決まり)
  try {
    if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; actx = new AC(); }
    if (actx.state === 'suspended') actx.resume();
  } catch (e) { actx = null; }
}
const soundOn = () => save.sound !== false;
function tone(freq, at, dur, type = 'triangle', vol = 0.16) {
  const t0 = actx.currentTime + at, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}
const N = { C5: 523, D5: 587, E5: 659, F5: 698, G5: 784, A5: 880, B5: 988, C6: 1047, D6: 1175, E6: 1319, G6: 1568, C7: 2093 };
const SOUNDS = {
  coin: () => { tone(N.B5, 0, 0.07, 'square', 0.07); tone(N.E6, 0.06, 0.22, 'square', 0.07); },
  step: () => { tone(N.G5, 0, 0.12, 'sine', 0.12); tone(N.C6, 0.09, 0.16, 'sine', 0.1); },
  mission: () => [N.E5, N.G5, N.C6].forEach((f, i) => tone(f, i * 0.09, 0.25)),
  chest: () => { [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => tone(f, i * 0.08, 0.3)); [N.E6, N.G6, N.C7].forEach((f, i) => tone(f, 0.38 + i * 0.05, 0.4, 'sine', 0.06)); },
  poi: () => { [N.G5, N.C6, N.E6].forEach((f, i) => tone(f, i * 0.12, 0.35)); [N.C5, N.E5, N.G5, N.C6].forEach(f => tone(f, 0.42, 0.9, 'triangle', 0.08)); },
  level: () => { [N.C5, N.C5, N.C5, N.C6].forEach((f, i) => tone(f, i * 0.13, i === 3 ? 0.7 : 0.11, 'square', 0.08)); [N.E5, N.G5].forEach(f => tone(f, 0.39, 0.7, 'square', 0.05)); },
  start: () => { tone(N.C5, 0, 0.12); tone(N.G5, 0.1, 0.25); },
  end: () => { tone(N.G5, 0, 0.14); tone(N.E5, 0.12, 0.14); tone(N.C6, 0.24, 0.5); },
  count: () => tone(N.A5, 0, 0.03, 'square', 0.03),
};
const BUZZ = { coin: [35], step: [20, 70, 20], mission: [60, 40, 60], chest: [120, 60, 120, 60, 220], poi: [300, 100, 300], level: [90, 50, 90, 50, 90, 50, 400], start: [60], end: [60, 60, 200] };
function gameFx(kind) {                     // ゲームの出来事を、音と振動で知らせる(画面を見ていなくても分かるように)
  if (soundOn() && actx && actx.state === 'running' && SOUNDS[kind]) { try { SOUNDS[kind](); } catch (e) {} }
  if (BUZZ[kind] && save.buzz !== false) { try { navigator.vibrate && navigator.vibrate(BUZZ[kind]); } catch (e) {} }
  if (save.walkSession && save.walkSession.on) {
    const s = save.walkSession;
    if (kind === 'chest') s.chests = (s.chests || 0) + 1;
    if (kind === 'poi' || kind === 'chest' || kind === 'level') pocketFlash(kind);
  }
}

// ---- ポケット散歩 ----
let pocketLock = null, pocketTick = 0;
const ws = () => save.walkSession && save.walkSession.on ? save.walkSession : null;
function pocketStart() {
  if (mode !== 'real') return toast('ポケット散歩は、現実モードで使えます(🗺️冒険モードを、リアルにもどしてね)');
  audioUnlock();
  save.walkSession = { on: true, start: Date.now(), dist: 0, next100: 100, gold0: save.gold, shards0: save.shards, xp0: xpNow(), found0: Object.keys(save.found).length,
    cells0: explored.size, chests: 0, coins: 0, lv0: levelInfo().lv };
  persist(); gameFx('start'); pocketLockOn(); pocketUi();
}
function pocketDist(d) {                    // 現実で歩いた距離が増えるたびに、game.js から呼ばれる
  const s = ws(); if (!s) return;
  s.dist += d;
  if (s.dist >= s.next100) { s.next100 = Math.floor(s.dist / 100) * 100 + 100; gameFx('step'); }
  pocketRender();
}
function pocketFound(name) { const s = ws(); if (s) (s.names = s.names || []).push(String(name || '')); gameFx('poi'); }
function pocketCoin(n) { const s = ws(); if (s) s.coins = (s.coins || 0) + n; gameFx('coin'); }
async function pocketLockOn() {             // 画面を暗くして、ポケットの中で触っても反応しないようにする
  $('pocket').hidden = false; pocketRender();
  try { if ('wakeLock' in navigator && !pocketLock) { pocketLock = await navigator.wakeLock.request('screen'); pocketLock.addEventListener('release', () => { pocketLock = null; }); } } catch (e) { pocketLock = null; }
  clearInterval(pocketTick); pocketTick = setInterval(pocketRender, 1000);
}
function pocketLockOff() { $('pocket').hidden = true; clearInterval(pocketTick); pocketUi(); }
const hm = ms => { const m = Math.floor(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60}分` : `${m}分`; };
function pocketRender() {
  const s = ws(); if (!s || $('pocket').hidden) return;
  $('pk-dist').textContent = fmt(s.dist);
  $('pk-sub').textContent = `${hm(Date.now() - s.start)} ・ 🪙 +${Math.max(0, save.gold - s.gold0)} ・ 名所 +${Math.max(0, Object.keys(save.found).length - s.found0)}`;
  const d = typeof walkToday === 'function' ? walkToday() : 0, t = typeof WALK_TIERS !== 'undefined' ? WALK_TIERS.find(x => d < x.m) : null;
  $('pk-next').textContent = t ? `🎁 つぎの宝箱まで あと ${fmt(t.m - d)}` : '🎁 今日の宝箱は、ぜんぶ開いた!';
  $('pk-gps').textContent = typeof gpsInfo !== 'undefined' && gpsInfo.at && Date.now() - gpsInfo.at < 30000 ? `GPS OK(精度 ${Math.round(gpsInfo.acc)}m)` : 'GPSを探しています…';
}
function pocketFlash(kind) {                // 暗い画面でも、何が起きたか分かるように、少しだけ光らせる
  const el = $('pk-flash'); if (!el || $('pocket').hidden) return;
  el.textContent = kind === 'poi' ? '⛩️ 名所を発見!' : kind === 'chest' ? '🎁 宝箱が開いた!' : '🎖️ レベルアップ!';
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
}
function pocketUi() {                       // 地図の上の「はじめる / 散歩中」ボタン
  const go = $('pocket-go'), bar = $('pocket-bar'), s = ws();
  if (!go) return;
  go.hidden = !!s || mode !== 'real'; bar.hidden = !s;
  if (s) $('pb-text').textContent = `🚶 散歩中 ${fmt(s.dist)}`;
}
async function pocketEnd() {
  const s = ws(); if (!s) return;
  s.on = false; pocketLockOff();
  if (pocketLock && !save.awake) { try { await pocketLock.release(); } catch (e) {} pocketLock = null; }
  const li = levelInfo(), r = {
    dist: s.dist, time: Date.now() - s.start, gold: Math.max(0, save.gold - s.gold0), shards: Math.max(0, save.shards - s.shards0),
    fog: Math.max(0, explored.size - s.cells0) * CELL * CELL / 1e6, found: (s.names || []).slice(0, 30),
    chests: s.chests || 0, xp: Math.max(0, xpNow() - s.xp0), lvUp: li.lv > s.lv0, lv: li.lv, prev: save.lastWalk || null,
  };
  save.lastWalk = { dist: r.dist, date: todayStr() };
  save.walkSession = null; persist(); pocketUi();
  gameFx('end'); setTimeout(() => showResult(r), 400);
}
function showResult(r) {
  const li = levelInfo(), pct = Math.min(100, (li.xp - li.cur) / (li.next - li.cur) * 100);
  const cmp = r.prev && r.prev.dist > 0 ? (r.dist >= r.prev.dist ? `前回より +${fmt(r.dist - r.prev.dist)} 🔥` : `前回は ${fmt(r.prev.dist)}`) : 'はじめての記録!';
  const rows = [
    ['🚶', '歩いた距離', r.dist, v => fmt(v)], ['⏱️', '時間', r.time, v => hm(v)], ['🪙', '手に入れたコイン', r.gold, v => '+' + Math.round(v)],
    ['🔮', '進化のかけら', r.shards, v => '+' + Math.round(v)], ['🌫️', '晴れた霧', r.fog, v => v.toFixed(3) + ' km²'], ['⛩️', '見つけた名所', r.found.length, v => Math.round(v) + 'か所'],
    ['🎁', '開いた宝箱', r.chests, v => Math.round(v) + '個'], ['✨', '経験値', r.xp, v => '+' + Math.round(v)],
  ];
  $('result-body').innerHTML = `<div class="rs-head"><b>おつかれさま!</b><small>${esc(cmp)}</small></div>` +
    rows.map((x, i) => `<div class="rs-row" style="animation-delay:${i * 0.18}s"><span>${x[0]}</span><small>${x[1]}</small><b data-i="${i}">0</b></div>`).join('') +
    (r.found.length ? `<div class="rs-found">${r.found.map(n => `<span>⛩️ ${esc(n)}</span>`).join('')}</div>` : '') +
    `<div class="rs-lv"><small>Lv.${li.lv + 1} ${esc(lvName(li.lv))}${r.lvUp ? ' 🎉レベルアップ!' : ''}</small><div class="rs-bar"><i style="width:0"></i></div></div>`;
  $('result').hidden = false;
  rows.forEach((x, i) => {                  // 数字が、順番にカウントアップする
    const el = $('result-body').querySelector(`b[data-i="${i}"]`), t0 = performance.now() + i * 180, dur = 700;
    const step = now => { const k = Math.min(1, Math.max(0, (now - t0) / dur)); el.textContent = x[3](x[2] * (1 - Math.pow(1 - k, 3)));
      if (k > 0 && k < 1 && Math.random() < 0.25) gameFx('count'); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
  setTimeout(() => { const b = $('result-body').querySelector('.rs-bar i'); if (b) b.style.width = pct + '%'; if (r.lvUp) gameFx('level'); else gameFx('chest'); }, rows.length * 180 + 700);
}
function longPress(el, fn, ms = 700) {      // ポケットの中で、まちがって押さないように、長押しにする
  let t = 0;
  const down = e => { e.preventDefault(); el.classList.add('holding'); t = setTimeout(() => { el.classList.remove('holding'); fn(); }, ms); };
  const up = () => { clearTimeout(t); el.classList.remove('holding'); };
  el.addEventListener('pointerdown', down); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, up);
}
function pocketInit() {
  if (save.sound === undefined) save.sound = true;
  addEventListener('pointerdown', audioUnlock, { passive: true });
  $('pocket-go').onclick = pocketStart;
  $('pb-lock').onclick = () => { audioUnlock(); pocketLockOn(); };
  $('pb-end').onclick = () => { if (confirm('散歩をおわりにして、結果を見ますか?')) pocketEnd(); };
  longPress($('pk-map'), pocketLockOff); longPress($('pk-end'), pocketEnd);
  $('result-close').onclick = () => { $('result').hidden = true; };
  const sd = $('sound'); if (sd) { sd.checked = save.sound !== false; sd.onchange = () => { save.sound = sd.checked; persist(); audioUnlock(); if (sd.checked) gameFx('coin'); }; }
  document.addEventListener('visibilitychange', async () => {      // 戻ってきたら、画面ロックをかけ直す
    if (!document.hidden && ws() && !$('pocket').hidden && !pocketLock) { try { pocketLock = await navigator.wakeLock.request('screen'); } catch (e) {} }
  });
  if (ws()) { if (Date.now() - save.walkSession.start > 8 * 3600e3) pocketEnd(); else pocketLockOn(); }      // 途中で再読み込みされても、散歩を続ける(8時間以上前なら、終わりにする)
  pocketUi();
}
