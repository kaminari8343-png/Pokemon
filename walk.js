'use strict';
// 「今日の散歩」: 今日歩いた距離で、3つの宝箱が開く。GPSLoggerなどの記録を取り込んだあとは、「今日のまとめ」を出す。
// ※ game.js より先に読み込む。ここは定義だけで、game.js の変数は「呼ばれたとき」に使う。

const WALK_TIERS = [
  { m: 500, gold: 30, shards: 0, name: '小さな箱' },
  { m: 1500, gold: 80, shards: 1, name: '中くらいの箱' },
  { m: 3000, gold: 200, shards: 3, name: '大きな箱' },
];
let walkSummary = null;                    // 取り込み直後の結果(画面に出すだけ。保存しない)
function walkState() {                     // 日付がかわったら、新しい1日にする
  const t = todayStr();
  if (!save.walk || typeof save.walk !== 'object' || save.walk.day !== t) save.walk = { day: t, imp: 0, opened: [] };
  if (!Array.isArray(save.walk.opened)) save.walk.opened = [];
  return save.walk;
}
// 今日の距離: アプリで歩いた分と、取り込んだ記録の今日の分の、多いほう(同じ散歩を二重に数えない)
const walkToday = () => Math.max(save.today || 0, walkState().imp || 0);
function walkOpen(i, quiet) {
  const w = walkState(), t = WALK_TIERS[i]; if (w.opened.includes(i)) return;
  w.opened.push(i); addGold(t.gold); if (t.shards) addShard(t.shards); addXp(40 * (i + 1)); persist();
  if (!quiet) { celebrate(ART.chest(104), `${t.name}が開いた! +${t.gold}🪙${t.shards ? ` +${t.shards}🔮` : ''}`); }
}
function walkCheck(quiet) {
  const w = walkState(), d = walkToday(); let n = 0;
  WALK_TIERS.forEach((t, i) => { if (d >= t.m && !w.opened.includes(i)) { walkOpen(i, quiet && n > 0); n++; } });
  updateHud(); if (!$('walk').hidden) walkRender();
  return n;
}
function walkBar() {                       // 画面上の「今日の散歩」の下に、次の宝箱までの進みぐあい
  const el = $('s-wbar'); if (!el) return;
  const d = walkToday(), i = WALK_TIERS.findIndex(t => d < t.m), prev = i > 0 ? WALK_TIERS[i - 1].m : 0;
  el.style.width = (i < 0 ? 100 : Math.min(100, (d - prev) / (WALK_TIERS[i].m - prev) * 100)) + '%';
  const box = $('s-wbox'); if (box) box.textContent = i < 0 ? '🎁 ぜんぶ開いた!' : `🎁 あと ${fmt(WALK_TIERS[i].m - d)}`;
}
function walkAddImported(meters) {         // 取り込んだ記録の、今日の分
  const w = walkState(); w.imp = Math.max(w.imp || 0, Math.round(meters || 0)); persist(); return walkCheck();
}
function walkAfterImport(info) { walkSummary = info; walkCheck(true); walkOpenSheet(); }
function walkRender() {
  const w = walkState(), d = walkToday(), body = $('walk-body'); if (!body) return;
  let h = '';
  if (walkSummary) {
    const s = walkSummary;
    h += `<div class="ol-box walk-sum"><b>📥 今日のまとめ(取り込んだ記録)</b><div class="walk-grid">` +
      `<div><b>${s.km.toFixed(1)}km</b><small>取り込んだ距離</small></div><div><b>${s.today >= 1 ? (s.today / 1000).toFixed(1) + 'km' : '0km'}</b><small>うち、今日の分</small></div>` +
      `<div><b>+${s.poi}</b><small>見つけた名所</small></div><div><b>${s.fog.toFixed(3)}km²</b><small>はれた霧</small></div>` +
      `<div><b>${s.pref}県 ${s.city}市区町村</b><small>新しい地域</small></div><div><b>${s.chests}個</b><small>開いた宝箱</small></div></div></div>`;
  }
  h += `<div class="walk-today"><b>${fmt(d)}</b><small>今日歩いた距離</small></div><div class="walk-chests">` +
    WALK_TIERS.map((t, i) => { const open = w.opened.includes(i), ready = d >= t.m;
      return `<div class="wc ${open ? 'open' : ready ? 'ready' : 'lock'}"><span>${ART.chest(52)}</span><b>${t.m >= 1000 ? t.m / 1000 + 'km' : t.m + 'm'}</b><small>${open ? '✅ 開けた' : ready ? '開けます' : 'あと ' + fmt(t.m - d)}</small><em>${t.gold}🪙${t.shards ? ' ' + t.shards + '🔮' : ''}</em></div>`; }).join('') + '</div>';
  const next = WALK_TIERS.findIndex(t => d < t.m);
  h += `<p class="note">${next < 0 ? '今日の宝箱は、ぜんぶ開きました。また明日!' : `つぎの宝箱(${WALK_TIERS[next].name})まで、あと ${fmt(WALK_TIERS[next].m - d)}。`}</p>`;
  h += `<p class="note">宝箱は、毎日0時に新しくなります。散歩のあいだにアプリを開けなかった日は、GPSLoggerなどの記録を、☰メニューの「GPSログの取り込み」から入れると、今日の分がまとめて数えられます(同じ散歩は、二重には数えません)。</p>`;
  body.innerHTML = h;
}
function walkOpenSheet() { $('walk').hidden = false; walkRender(); }
function walkInit() {
  walkState(); walkBar();
  const s = $('walk-stat'); if (s) s.onclick = () => { walkSummary = null; walkOpenSheet(); };
  const c = $('walk-close'); if (c) c.onclick = () => { $('walk').hidden = true; walkSummary = null; };
  const sh = $('walk'); if (sh) sh.addEventListener('click', e => { if (e.target === sh) { sh.hidden = true; walkSummary = null; } });
  setInterval(() => { walkState(); walkBar(); }, 60000);          // 0時をまたいだら、表示を新しい1日にする
}
