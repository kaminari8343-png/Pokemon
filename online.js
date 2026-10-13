'use strict';
// オンライン(友だち限定): 招待コードで友だちになり、おたがいのオブジェクト・ゲートを見て、応援・贈り物・ランキングができる。
// データの置き場は Supabase(無料)。設定のしかたは ONLINE_SETUP.md を見てください。
// ※ game.js より先に読み込む。ここは定義だけで、game.js の変数は「呼ばれたとき」に使う。

const ONLINE_CFG = { url: 'https://btimkxagkkzzobzzkntq.supabase.co', key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0aW1reGFna2t6em9ienprbnRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MDE0NzUsImV4cCI6MjEwNzQ3NzQ3NX0.XnDV7RTpGtXLJNWhlr21F71hXQT39jef3WgUa39cnds' };            // ← Supabase の「Project URL」と「anon public key」を入れる(空のあいだは、オンライン機能はお休み)
const OL_HOME_R = 300, OL_CHEER_RANGE = 150, OL_CHEER_GOLD = 5, OL_SYNC_MS = 120000, OL_NEAR = 1500, OL_GATE_NEAR = 5000;
let sb = null, olMe = null, olFriends = [], olShared = [], olReqs = [], olBusy = false, olPending = false, olMsg = '', olSort = 'km';
const olPins = new Map();
const olConfigured = () => !!(ONLINE_CFG.url && ONLINE_CFG.key && window.supabase);
const olOn = () => olConfigured() && save.online && save.online.on;

async function olRpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args || {});
  if (error) throw new Error(error.message || String(error));
  return data;
}
async function olConnect() {
  if (!sb) sb = window.supabase.createClient(ONLINE_CFG.url, ONLINE_CFG.key, { auth: { persistSession: true, autoRefreshToken: true } });
  const { data } = await sb.auth.getSession();
  if (!data || !data.session) { const r = await sb.auth.signInAnonymously(); if (r.error) throw new Error('ログインできません: ' + r.error.message); }
}
// 公開するもの: 自宅のまわり(OL_HOME_R)は、ぜったいに公開しない
function olItems() {
  const home = save.online.home, out = [];
  if (!home) return out;                                   // 自宅を設定するまで、何も公開しない
  const okPos = p => dist(p, home) > OL_HOME_R;
  for (const g of save.gates) if (okPos(g)) out.push({ id: g.id, kind: 'gate', t: '', lv: 1, name: g.name, lat: g.lat, lng: g.lng });
  const objs = [...save.built].sort((a, b) => ITEM[b.t].cost - ITEM[a.t].cost);
  for (const o of objs) if (okPos(o)) out.push({ id: String(o.id), kind: 'obj', t: o.t, lv: lvOf(o), name: face(o)[1], lat: o.lat, lng: o.lng });
  return out.slice(0, 150);
}
async function olSync(manual) {
  if (!olOn()) return;
  if (olBusy) { olPending = true; return; }                 // 同期中に呼ばれたら、終わったあとにもう一度実行する
  olBusy = true;
  try {
    await olConnect();
    const O = save.online;
    olMe = await olRpc('ensure_player', { p_name: O.name || 'たびびと' }); O.code = olMe.code;
    await olRpc('publish_stats', { p_km: Math.round(save.total / 100) / 10, p_found: nFound(), p_builds: save.stats.builds || 0, p_level: curLevel() });
    if (!olOn()) return;
    await olRpc('publish_items', { p_items: O.share ? olItems() : [] });
    olFriends = await olRpc('list_friends'); olShared = await olRpc('friends_shared'); olReqs = await olRpc('list_requests').catch(() => []);      // 古いSQLのままでも動くように
    const ch = await olRpc('claim_cheers');
    if (ch && ch.n > 0) { const g = ch.n * OL_CHEER_GOLD; addGold(g); addXp(ch.n * 20); persist(); toast(`👍 友だちが応援してくれました ×${ch.n}\n+${g}🪙`); }
    const gifts = await olRpc('claim_gifts');
    if (gifts && gifts.length) {
      let c = 0, s = 0; for (const x of gifts) { if (x.kind === 'coin') c += x.amount; else s += x.amount; }
      if (c) addGold(c); if (s) addShard(s); persist();
      toast(`🎁 友だちから贈り物\n${gifts.map(x => `${x.from || '友だち'}: ${x.kind === 'coin' ? x.amount + '🪙' : x.amount + '🔮'}`).join('\n')}`);
    }
    olMsg = ''; olDrawPins(); persistSoon();
    if (manual && !$('book').hidden) renderBook();
  } catch (e) { olMsg = '⚠️ ' + (e.message || e); if (manual) toast('オンライン: ' + olMsg); }
  finally { olBusy = false; if (olPending) { olPending = false; setTimeout(() => olSync(), 300); } }
}

// ---- 地図に、友だちのオブジェクト・ゲートを出す ----
function olDrawPins() {
  const keep = new Set();
  if (olOn() && me) {
    const cand = olShared.filter(s => s.kind === 'gate' || ITEM[s.t]).map(s => ({ s, d: dist(s, me) })).filter(x => x.d <= (x.s.kind === 'gate' ? OL_GATE_NEAR : OL_NEAR)).sort((a, b) => a.d - b.d).slice(0, 60);
    for (const { s } of cand) {
      const key = [s.owner, s.id, s.lv, s.name, s.lat, s.lng, s.owner_name].join('/'); keep.add(key);   // 名前やレベルが変わったら、作り直す
      if (olPins.has(key)) continue;
      try {
        const html = s.kind === 'gate'
          ? `<div class="gate frgate">${gateHtml({ name: s.name }).replace(/^<div class="gate">|<\/div>$/g, '')}<i class="own">${esc(s.owner_name)}</i></div>`
          : `<div class="obj fr"><span class="sp">${ART.item(s.t, s.lv, 40)}</span><div class="base"></div><i class="own">${esc(s.owner_name)}</i></div>`;
        olPins.set(key, addPin(s, '', html, () => olOpen(s)));
      } catch (e) { /* 1つの不正なデータで、ほかの表示がこわれないように */ }
    }
  }
  for (const [k, m] of olPins) if (!keep.has(k)) { m.remove(); olPins.delete(k); }
}
function olOpen(s) {
  const ownerLine = `<div>👤 ${esc(s.owner_name)} さんの${s.kind === 'gate' ? 'ワープゲート' : esc(s.name)}</div>`;
  $('obj-title').innerHTML = s.kind === 'gate' ? `<span class="ic">🌀</span>${esc(s.name)}` : `<span class="ic">${ART.item(s.t, s.lv, 40)}</span>${esc(s.name)} ${'★'.repeat(s.lv - 1)}`;
  const eb = $('obj-evo'); eb.hidden = false; eb.disabled = false;
  $('obj-del').hidden = true;
  if (s.kind === 'gate') {
    $('obj-sub').innerHTML = ownerLine + '<div>友だちのゲートへ、冒険モードでワープできます。</div>';
    eb.textContent = '🌀 ここへワープする'; eb.onclick = () => { $('obj').hidden = true; warpTo({ lat: s.lat, lng: s.lng, name: `${s.owner_name}: ${s.name}` }); };
  } else {
    const pos = (typeof realPos !== 'undefined' && realPos) || null, far = pos ? dist(s, pos) : 1e9;      // 応援は、ワープではなく、現実の現在地が近いときだけ
    $('obj-sub').innerHTML = ownerLine + `<div>現実の現在地が近く(${OL_CHEER_RANGE}m以内)のとき応援できます。おたがいに コインが入ります(1日10回まで・同じ物は1日1回)。<br>あなたとの距離: ${far > 1e8 ? '現在地不明' : fmt(far)}</div>`;
    eb.textContent = far <= OL_CHEER_RANGE ? `👍 応援する (+${OL_CHEER_GOLD}🪙)` : `近づくと応援できます(あと${fmt(far - OL_CHEER_RANGE)})`;
    eb.disabled = far > OL_CHEER_RANGE;
    eb.onclick = async () => {
      eb.disabled = true;
      try { const r = await olRpc('cheer', { p_owner: s.owner, p_item: s.id }); addGold(OL_CHEER_GOLD); addXp(15); persist(); $('obj').hidden = true; celebrate('👍', `応援しました! +${OL_CHEER_GOLD}🪙`); toast(`${s.owner_name} さんにも、あなたの応援が届きます\n(今日あと${r.left}回)`); }
      catch (e) { toast('👍 ' + (e.message || e)); eb.disabled = false; }
    };
  }
  $('obj').hidden = false;
}
// 最初の「オンラインをはじめる」: 注意書きを読んでもらってから、はじめる
async function olStart(name) {
  if (!confirm('オンラインをはじめます。\n\n・友だちに見えるのは、あなたの「名前」「成績」「オブジェクトとゲートの場所」だけです(歩いた道すじは送りません)\n・招待コードを教えた人だけが友だちになれます\n・自宅のまわり300mは、公開されません(あとで設定できます)\n\nよろしいですか?')) return;
  save.online.on = true; save.online.name = (name || '').trim().slice(0, 14) || 'たびびと';
  if (!save.online.home && realPos) save.online.home = { lat: realPos.lat, lng: realPos.lng };      // 最初に、いまいる場所を自宅あつかいにして守る
  persist(); renderBook(); await olSync(true); renderBook();
  if (!save.online.home) toast('🔒 自宅の位置が未設定のため、オブジェクトとゲートは公開されません\n「公開の設定」の「いまの場所を自宅にする」を押してください');
}

// ---- 冒険の書「友だち」タブ ----
const OL_SORTS = { km: ['🚶 歩いた距離', f => f.km, v => v + 'km'], found: ['⛩️ 名所', f => f.found, v => v + '件'], builds: ['🔨 つくった数', f => f.builds, v => v + '回'], level: ['🎖️ レベル', f => f.level, v => 'Lv.' + v] };
function onlineHtml() {
  if (!olConfigured()) return `<div class="empty">🌐 オンライン機能は、まだ準備中です。<br><small>セットアップの手順は ONLINE_SETUP.md にあります。</small></div>`;
  const O = save.online;
  if (!O.on) return `<div class="ol-box"><b>🌐 友だちとオンラインで遊ぶ</b><p class="note">招待コードで友だちになると、おたがいのオブジェクトやゲートが地図に出て、👍応援・🎁贈り物・ランキング・🌀ワープができます。</p>` +
    `<input id="ol-name" maxlength="14" placeholder="表示する名前(本名は避けてね)" value="${esc(O.name || '')}"><button id="ol-start">オンラインをはじめる</button></div>`;
  const me = { name: (O.name || 'たびびと') + '(あなた)', km: Math.round(save.total / 100) / 10, found: nFound(), builds: save.stats.builds || 0, level: curLevel(), self: true };
  const [, val, fmtv] = OL_SORTS[olSort], rank = [me, ...olFriends].sort((a, b) => val(b) - val(a));
  const gatesOf = id => olShared.filter(s => s.owner === id && s.kind === 'gate');
  return `<div class="ol-box"><b>🌐 あなたの招待コード</b><div class="ol-code">${esc(O.code || '…')}</div><button id="ol-copy" class="tinybtn">コピー</button>` +
    `<p class="note">友だちにこのコードを教えて、相手のコードを下に入力します。相手もあなたのコードを入れると、すぐ友だちに。片方だけのときは、相手が承認すると友だちになります。</p>` +
    `<div class="ol-add"><input id="ol-code" maxlength="12" placeholder="友だちのコード(10文字)"><button id="ol-add">友だちになる</button></div></div>` +
    (olMsg ? `<div class="ol-err">${esc(olMsg)}</div>` : '') +
    (olReqs.length ? `<div class="ol-box"><b>🤝 友だち申請 ${olReqs.length}件</b>${olReqs.map(r => `<div class="ol-req"><span>${esc(r.name)}</span><button data-acc="${r.id}">承認</button><button data-dec="${r.id}" class="dim">断る</button></div>`).join('')}</div>` : '') +
    `<div class="ol-sorts">${Object.entries(OL_SORTS).map(([k, v]) => `<button data-s="${k}" class="${k === olSort ? 'on' : ''}">${v[0]}</button>`).join('')}</div>` +
    `<ol class="ol-rank">${rank.map((f, i) => { const gs = f.self ? [] : gatesOf(f.id);
      return `<li class="${f.self ? 'self' : ''}"><span class="no">${i + 1}</span><div><b>${esc(f.name)}</b><small>${esc(OL_SORTS[olSort][2](val(f)))} ・ Lv.${f.level}${f.self ? '' : ` ・ ${f.days ? f.days + '日前' : '今日'}`}</small>` +
        (f.self ? '' : `<span class="tbtn"><button data-gift="${f.id}|coin|50">🎁 🪙50</button><button data-gift="${f.id}|shard|1">🎁 🔮1</button>${gs.length ? `<button data-gates="${f.id}">🌀 ゲート${gs.length}</button>` : ''}<button data-rm="${f.id}" class="dim">✕</button></span>`) + `</div></li>`; }).join('')}</ol>` +
    (olFriends.length ? '' : '<div class="empty">まだ友だちがいません。招待コードを教え合おう!</div>') +
    `<div class="ol-box"><b>🔒 公開の設定</b><label class="awake"><input id="ol-share" type="checkbox" ${O.share ? 'checked' : ''}> オブジェクトとゲートを友だちに見せる</label>` +
    `<div class="note">自宅まわり${OL_HOME_R}mは公開しません: ${O.home ? '設定ずみ' : '<b>未設定(設定するまで、何も公開されません)</b>'}</div><button id="ol-home" class="tinybtn">いまの場所を自宅にする</button> ${O.home ? '<button id="ol-home-off" class="tinybtn">解除</button>' : ''}` +
    `<div class="ol-name"><input id="ol-name2" maxlength="14" value="${esc(O.name)}"><button id="ol-rename" class="tinybtn">名前を変える</button></div>` +
    `<button id="ol-off" class="tinybtn dim2">オンラインをやめる(自分のデータを削除)</button></div>`;
}
function wireOnline() {
  const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
  const O = save.online, again = async () => { await olSync(true); renderBook(); };
  on('ol-start', () => olStart($('ol-name').value));
  on('ol-copy', async () => { try { await navigator.clipboard.writeText(O.code); toast('コードをコピーしました'); } catch (e) { prompt('このコードをコピーして友だちに送ってね', O.code); } });
  on('ol-add', async () => {
    const c = $('ol-code').value.trim(); if (!c) return;
    try {
      await olConnect(); const r = await olRpc('add_friend', { p_code: c });
      if (r.ok === false) return toast('友だち追加: ' + r.err);
      toast(r.state === 'friend' || r.state === undefined ? `🤝 ${r.name} さんと友だちになりました` : `📨 ${r.name} さんに申請しました\n相手が承認すると、友だちになります(相手が あなたのコードを入れても、すぐ友だちになります)`);
      await again();
    } catch (e) { toast('友だち追加: ' + (e.message || e)); }
  });
  document.querySelectorAll('button[data-acc]').forEach(b => b.onclick = async () => { try { await olRpc('accept_friend', { p_id: b.dataset.acc }); toast('🤝 友だちになりました'); await again(); } catch (e) { toast(e.message || e); } });
  document.querySelectorAll('button[data-dec]').forEach(b => b.onclick = async () => { try { await olRpc('decline_request', { p_id: b.dataset.dec }); await again(); } catch (e) { toast(e.message || e); } });
  document.querySelectorAll('.ol-sorts button').forEach(b => b.onclick = () => { olSort = b.dataset.s; renderBook(); });
  document.querySelectorAll('button[data-gift]').forEach(b => b.onclick = async () => {
    if (b.disabled) return;
    const [id, kind, n] = b.dataset.gift.split('|'), amt = +n, spend = kind === 'coin' ? addGold : addShard;
    if (kind === 'coin' ? save.gold < amt : save.shards < amt) return toast('足りません');
    b.disabled = true; spend(-amt); persist();                 // 先に引いて保存する(送信のあとで閉じても、増殖しないように)
    try { await olRpc('send_gift', { p_to: id, p_kind: kind, p_amount: amt }); toast(`🎁 贈りました(${kind === 'coin' ? amt + '🪙' : amt + '🔮'})`); }
    catch (e) { spend(amt); persist(); toast('🎁 ' + (e.message || e)); }
    finally { b.disabled = false; }
  });
  document.querySelectorAll('button[data-gates]').forEach(b => b.onclick = () => {
    const gs = olShared.filter(s => s.owner === b.dataset.gates && s.kind === 'gate'); if (!gs.length) return;
    const list = gs.map((g, i) => `${i + 1}. ${g.name}`).join('\n'), n = parseInt(prompt(`ワープ先を番号で選んでね\n${list}`, '1'), 10);
    const g = gs[n - 1]; if (g) { $('book').hidden = true; warpTo({ lat: g.lat, lng: g.lng, name: `${g.owner_name}: ${g.name}` }); }
  });
  document.querySelectorAll('button[data-rm]').forEach(b => b.onclick = async () => { if (!confirm('この友だちを外しますか?')) return; try { await olRpc('remove_friend', { p_id: b.dataset.rm }); await again(); } catch (e) { toast(e.message || e); } });
  on('ol-home', () => { const p = realPos || me; if (!p) return toast('現在地を取得してから押してください'); O.home = { lat: p.lat, lng: p.lng }; persist(); again(); });
  on('ol-home-off', () => { O.home = null; persist(); again(); });
  on('ol-rename', () => { O.name = ($('ol-name2').value || '').trim().slice(0, 14) || 'たびびと'; persist(); again(); });
  const sh = $('ol-share'); if (sh) sh.onchange = () => { O.share = sh.checked; persist(); again(); };
  on('ol-off', async () => {
    if (!confirm('オンラインをやめて、サーバーにある自分の情報(名前・成績・公開した物・友だち関係)をすべて消します。よろしいですか?')) return;
    try {
      await olConnect(); await olRpc('delete_me');
      O.on = false; O.code = ''; olShared = []; olFriends = []; olReqs = []; olDrawPins(); persist(); renderBook(); toast('サーバーの自分の情報を消しました');
    } catch (e) { toast('削除できませんでした: ' + (e.message || e) + '\n通信を確認して、もう一度お試しください(オンラインは、まだオンのままです)'); }
  });
}
function onlineInit() {
  save.online = Object.assign({ on: false, name: '', share: true, home: null, code: '' }, save.online || {});
  if (!olConfigured()) return;
  if (olOn()) setTimeout(() => olSync(), 4000);
  setInterval(() => { if (!document.hidden && olOn()) olSync(); }, OL_SYNC_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && olOn()) olSync(); });
  setInterval(() => { if (olOn()) olDrawPins(); }, 20000);
}
