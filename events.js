'use strict';
// 家族イベント(「今日はやろう!」で始める、みんなで宝さがし)。家族グループは最大4人。
// 4歳など端末のない子は、大人の端末といっしょに遊べば大丈夫。位置は「いっしょにいる確認」のときだけ送ります。
// ※ game.js より先に読み込む。ここは定義だけで、game.js の変数は「呼ばれたとき」に使う。
// 新しいイベントは、EVENTS に足すだけ(ごほうびのキャラ・ステッカーの絵は art.js に足す)。

const EVENTS = [
  { id: 'autumn-2026', title: '秋の宝さがし', icon: '🍂', from: '2026-09-20', to: '2026-12-06', chests: 8, goal: 6,
    blurb: '家族みんなで、まちに隠れた宝箱をさがそう! 8つのうち6つ見つけて、いっしょにいる確認をすると、クリア。',
    reward: { hero: 'fox', sticker: 'autumn', gold: 500, shards: 5 } },
];
const EVT_RANGE = 30, EVT_POLL_MS = 30000;
let evtSt = null, evtBusy = false, evtMsg = '', evtChestPos = [], evtMarkers = [];
const evtNow = () => EVENTS.find(e => todayStr() >= e.from && todayStr() <= e.to) || null;
const evtBits = n => { let c = 0; for (let m = n | 0; m; m &= m - 1) c++; return c; };
const evtConf = () => typeof olConfigured === 'function' && olConfigured();
const evtMine = () => (evtSt && evtSt.members || []).find(m => m.me);
function evtDone(ev, st) {
  st = st || evtSt; if (!st || !st.started) return false;
  const solo = (st.members || []).length < 2;
  return evtBits(st.union) >= ev.goal && (st.together || solo);
}
async function evtCall(fn, args) {
  await olConnect();
  if (!evtCall.ready) { await olRpc('ensure_player', { p_name: (save.online && save.online.name) || 'たびびと' }); evtCall.ready = true; }
  return olRpc(fn, args);
}
// 宝箱の場所: 家族ぜんいんで同じになる(今日の「たね」と中心の場所から決める)
function evtLayout(ev, st) {
  let a = parseInt(String(st.seed).slice(0, 8), 16) >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = [];
  for (let k = 0; k < ev.chests; k++) {
    const ang = (k + rnd() * 0.6) / ev.chests * Math.PI * 2, r = 120 + rnd() * 330;
    out.push({ k, lat: st.clat + Math.sin(ang) * r / 111320, lng: st.clng + Math.cos(ang) * r / (111320 * Math.cos(st.clat * Math.PI / 180)) });
  }
  return out;
}
function evtLocalMask(ev) { return save.evt && save.evt.id === ev.id && evtSt && save.evt.day === evtSt.day ? save.evt.mask | 0 : 0; }
function evtDrawChests(ev) {
  for (const m of evtMarkers) m.remove(); evtMarkers = [];
  if (!evtSt || !evtSt.started || typeof map === 'undefined' || !map) return;
  evtChestPos = evtLayout(ev, evtSt);
  const mine = evtLocalMask(ev) | ((evtMine() || {}).mask | 0), all = evtSt.union | mine;
  for (const c of evtChestPos) {
    if (all & (1 << c.k)) continue;          // 家族のだれかが、もう開けた宝箱は出さない
    evtMarkers.push(addPin(c, 'chestpin', `<span class="sp">${ART.chest(46)}</span>`, () => toast(`🎁 宝箱だよ! 近くまで行くと開けられる(あと約${Math.round(me ? dist(me, c) : 0)}m)`)));
  }
}
async function evtRefresh(manual) {
  const ev = evtNow(); if (!ev || !evtConf() || evtBusy) return;
  evtBusy = true;
  try {
    const st = await evtCall('family_status', { p_event: ev.id });
    evtSt = st; evtMsg = '';
    if (st.started) {
      if (!save.evt || save.evt.id !== ev.id || save.evt.day !== st.day) { save.evt = { id: ev.id, day: st.day, mask: (evtMine() || {}).mask | 0 }; persist(); }
      const mine = (evtMine() || {}).mask | 0;
      if ((save.evt.mask & ~mine) !== 0) { evtCall('family_report', { p_event: ev.id, p_mask: save.evt.mask }).catch(() => {}); }
      evtDrawChests(ev);
      if (evtDone(ev) && !(save.evtDone || {})[ev.id]) evtClaim(ev);
    }
  } catch (e) { evtMsg = '⚠️ ' + (e.message || e); if (manual) toast('イベント: ' + evtMsg); }
  finally { evtBusy = false; if (!$('evt').hidden) evtRender(); evtBadge(); }
}
function evtClaim(ev) {                       // クリアのごほうび(1回だけ)。限定キャラとステッカーは、ずっと残る
  const r = ev.reward; save.evtDone = save.evtDone || {};
  if (save.evtDone[ev.id]) return;
  save.evtDone[ev.id] = todayStr();
  save.unlocked = save.unlocked || {}; if (r.hero) save.unlocked[r.hero] = ev.id;
  save.stickers = save.stickers || []; if (r.sticker && !save.stickers.some(s => s.id === r.sticker && s.event === ev.id)) save.stickers.push({ id: r.sticker, event: ev.id, date: todayStr() });
  if (r.gold) addGold(r.gold); if (r.shards) addShard(r.shards);
  persist();
  celebrate(ART.hero(110, r.hero), `${ev.title} クリア!`);
  toast(`${ev.icon} ${ev.title} クリア!\n限定キャラ「${(ART.heroes().find(h => h.id === r.hero) || {}).name}」とステッカーを手に入れた!\n+${r.gold || 0}🪙 +${r.shards || 0}🔮`);
  if (typeof renderAdvPanel === 'function') renderAdvPanel();
}
function evtTick() {                          // 位置が動くたびに呼ばれる: 近くの宝箱を開ける
  const ev = evtNow(); if (!ev || !evtSt || !evtSt.started || !evtChestPos.length || !me || mode !== 'real') return;
  let mask = evtLocalMask(ev), got = 0;
  const all = evtSt.union | mask | ((evtMine() || {}).mask | 0);
  for (const c of evtChestPos) {
    const bit = 1 << c.k; if ((all & bit) || (mask & bit) || dist(me, c) > EVT_RANGE) continue;
    mask |= bit; got++;
  }
  if (!got) return;
  save.evt = { id: ev.id, day: evtSt.day, mask }; persist();
  addGold(30 * got); addXp(20 * got);
  celebrate(ART.chest(100), `宝箱を${got}つ開けた!`); toast(`🎁 宝箱を開けた! +${30 * got}🪙`);
  evtSt.union |= mask; evtDrawChests(ev);
  evtCall('family_report', { p_event: ev.id, p_mask: mask }).then(() => evtRefresh()).catch(() => {});
}
function evtBadge() {
  const b = $('btn-event'); if (!b) return;
  const ev = evtNow(); b.hidden = !ev || !evtConf();
  const done = ev && (save.evtDone || {})[ev.id];
  b.classList.toggle('dot', !!ev && !done);
}
function evtPos() { return realPos && Date.now() - realPos.t < 120000 ? realPos : null; }
async function evtStart() {
  const ev = evtNow(), p = evtPos() || (mode === 'real' ? me : null);
  if (!p) return toast('現在地を取得してから、押してね(📍ボタン)');
  try { const r = await evtCall('family_start', { p_event: ev.id, p_lat: p.lat, p_lng: p.lng }); if (r.ok === false) return toast(r.err); toast(`${ev.icon} ${ev.title}、スタート!`); await evtRefresh(true); }
  catch (e) { toast('はじめられません: ' + (e.message || e)); }
}
async function evtTogether() {
  const ev = evtNow(), p = evtPos(); if (!p) return toast('現在地を取得してから、押してね(📍ボタン)');
  try {
    const r = await evtCall('family_together', { p_event: ev.id, p_lat: p.lat, p_lng: p.lng });
    if (r.ok === false) return toast(r.err);
    toast(r.together ? '👨‍👩‍👧 いっしょにいることを確認したよ!' : '📨 確認を送ったよ!\n10分いないに、家族の別の端末でも「いっしょにいるよ」を押してね');
    await evtRefresh(true);
  } catch (e) { toast('確認できません: ' + (e.message || e)); }
}
function evtAlbumHtml() {
  const st = save.stickers || [], un = Object.keys(save.unlocked || {});
  const heroes = ART.heroes().filter(h => h.limited);
  return `<div class="ol-box"><b>🏆 思い出アルバム</b><div class="evt-album">` +
    heroes.map(h => `<div class="${un.includes(h.id) ? '' : 'lock'}"><span>${ART.hero(52, h.id)}</span><small>${un.includes(h.id) ? esc(h.name) : '？？？'}<br>${esc(h.limited)}限定</small></div>`).join('') +
    EVENTS.map(e => `<div class="${st.some(s => s.event === e.id) ? '' : 'lock'}"><span>${ART.sticker(e.reward.sticker, 52)}</span><small>${st.some(s => s.event === e.id) ? esc(e.title) : '？？？'}<br>ステッカー</small></div>`).join('') +
    `</div></div>`;
}
function evtRender() {
  const ev = evtNow(), box = $('evt-body'); if (!box) return;
  if (!ev) { box.innerHTML = '<div class="empty">いまは、開催中のイベントはありません。</div>' + evtAlbumHtml(); return; }
  if (!evtConf()) { box.innerHTML = '<div class="empty">オンラインの準備が必要です。</div>' + evtAlbumHtml(); return; }
  const st = evtSt, done = (save.evtDone || {})[ev.id];
  let h = `<div class="evt-head"><span class="evt-ic">${ev.icon}</span><div><b>${esc(ev.title)}</b><small>${esc(ev.from.slice(5).replace('-', '/'))} 〜 ${esc(ev.to.slice(5).replace('-', '/'))}</small></div></div><p class="note">${esc(ev.blurb)}</p>` +
    `<div class="evt-reward"><span>${ART.hero(60, ev.reward.hero)}</span><div><b>クリアのごほうび</b><small>限定キャラ「${esc((ART.heroes().find(x => x.id === ev.reward.hero) || {}).name)}」・ステッカー・${ev.reward.gold}🪙・${ev.reward.shards}🔮<br>このイベントでしか、手に入りません</small></div></div>`;
  if (evtMsg) h += `<div class="ol-err">${esc(evtMsg)}</div>`;
  if (!st) h += `<div class="empty">読み込み中…</div>`;
  else if (!st.in_family) {
    h += `<div class="ol-box"><b>👨‍👩‍👧 家族グループ(最大4人)</b><p class="note">家族の1人がグループを作り、できた「家族コード」を、ほかの家族の端末に入力します。端末のない子は、大人といっしょに遊べば大丈夫。</p>` +
      `<button id="fam-create">家族グループを作る</button><div class="ol-add"><input id="fam-code" maxlength="10" placeholder="家族コード(8文字)"><button id="fam-join">参加する</button></div></div>`;
  } else {
    const n = (st.members || []).length;
    h += `<div class="ol-box"><b>👨‍👩‍👧 家族 ${n}/4人</b> <span class="famcode">家族コード <b>${esc(st.code)}</b></span><div class="evt-mem">${(st.members || []).map(m => `<span class="${m.me ? 'me' : ''}">${esc(m.name)}${m.me ? '(あなた)' : ''}</span>`).join('')}</div></div>`;
    if (!st.started) h += `<button id="evt-start" class="evt-go">${ev.icon} 今日のイベントを はじめる!</button><p class="note">押した場所のまわりに、宝箱が現れます。家族みんなで、その近くまで行こう。</p>`;
    else {
      const got = evtBits(st.union), solo = n < 2;
      h += `<div class="ol-box"><b>${ev.icon} 今日の進みぐあい</b><div class="evt-bar"><i style="width:${Math.min(100, got / ev.goal * 100)}%"></i></div>` +
        `<div class="evt-row">🎁 宝箱 <b>${got}</b> / ${ev.goal}<small>(全部で${ev.chests}つ)</small></div>` +
        (solo ? '' : `<div class="evt-row">👨‍👩‍👧 いっしょにいる確認 <b>${st.together ? '✅ OK' : 'まだ'}</b></div>`) +
        (done || evtDone(ev) ? `<div class="evt-clear">🎉 クリア!</div>` : '') + `</div>` +
        (solo || st.together ? '' : `<button id="evt-together" class="evt-go">👨‍👩‍👧 いっしょにいるよ!</button><p class="note">家族が近くにそろったら、それぞれの端末でこれを押します(10分以内・150m以内)。位置は、この確認のときだけ送り、ほかの人には見えません。</p>`) +
        `<button id="evt-map" class="sub2">🗺️ 宝箱を地図で見る</button>`;
    }
    h += `<button id="fam-leave" class="sub2">家族グループを抜ける</button>`;
  }
  box.innerHTML = h + evtAlbumHtml();
  const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
  on('fam-create', async () => { try { const r = await evtCall('family_create'); if (r.ok === false) toast(r.err); else toast('家族グループを作りました。家族コードを家族に教えてね'); await evtRefresh(true); } catch (e) { toast(e.message || e); } });
  on('fam-join', async () => { const c = ($('fam-code').value || '').trim(); if (!c) return; try { const r = await evtCall('family_join', { p_code: c }); if (r.ok === false) toast(r.err); else toast('家族グループに入りました'); await evtRefresh(true); } catch (e) { toast(e.message || e); } });
  on('fam-leave', async () => { if (!confirm('家族グループを抜けますか?')) return; try { await evtCall('family_leave'); evtSt = null; evtDrawChests(ev); await evtRefresh(true); } catch (e) { toast(e.message || e); } });
  on('evt-start', evtStart); on('evt-together', evtTogether);
  on('evt-map', () => { $('evt').hidden = true; if (evtSt && evtSt.clat != null && typeof map !== 'undefined') { follow = false; map.flyTo({ center: [evtSt.clng, evtSt.clat], zoom: 16 }); } });
}
function evtOpen() { $('evt').hidden = false; evtRender(); evtRefresh(true); }
function eventsInit() {
  if (!Array.isArray(save.stickers)) save.stickers = [];
  for (const k of ['unlocked', 'evtDone']) if (!save[k] || typeof save[k] !== 'object' || Array.isArray(save[k])) save[k] = {};
  evtBadge();
  const b = $('btn-event'); if (b) b.onclick = evtOpen;
  const c = $('evt-close'); if (c) c.onclick = () => { $('evt').hidden = true; };
  const s = $('evt'); if (s) s.addEventListener('click', e => { if (e.target === s) s.hidden = true; });
  if (!evtNow() || !evtConf()) return;
  setTimeout(() => { if (save.evt && save.evt.id === evtNow().id && save.evt.day === todayStr()) evtRefresh(); }, 5000);      // 今日はじめていたら、宝箱を地図に出す
  setInterval(() => { if (!document.hidden && save.evt && save.evt.day === todayStr()) evtRefresh(); }, EVT_POLL_MS);
}
