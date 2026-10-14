'use strict';
// データのバックアップ(端末の外へ): ① 合言葉で暗号化してクラウドへ(自動) ② ファイルに書き出し(共有で、Googleドライブ・LINEなどへ)
// ブラウザの保存データが消えても、ここにあれば、取りもどせる。サーバーには「暗号化された中身」しか置かない(合言葉を知らないと、誰も読めない)。
// ※ game.js より先に読み込む。ここは定義だけで、game.js の変数は「呼ばれたとき」に使う。

const BK_KEY = 'sanpo-quest-bk';                 // 端末内: { id, key, at, size }(合言葉から作った「あいことば鍵」。合言葉そのものは保存しない)
const BK_EVERY = 6 * 3600e3;
const hex = u8 => [...u8].map(b => b.toString(16).padStart(2, '0')).join('');
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function bkDerive(pass) {                  // 合言葉 → (サーバー上の名前 id, 暗号の鍵)。時間をかけて計算するので、総当たりされにくい
  const enc = new TextEncoder(), base = await crypto.subtle.importKey('raw', enc.encode(pass.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode('sanpo-quest-backup-v1'), iterations: 200000, hash: 'SHA-256' }, base, 512));
  return { id: hex(bits.slice(0, 32)), key: bits.slice(32, 64) };
}
const gz = async str => new Uint8Array(await new Response(new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
const gunz = async u8 => await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
async function bkSeal(keyBytes, str) {
  const iv = crypto.getRandomValues(new Uint8Array(12)), k = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, await gz(str)));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return b64(out);
}
async function bkOpen(keyBytes, s) {
  const u = unb64(s), k = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  return await gunz(new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, k, u.slice(12))));
}
const bkState = () => { try { return JSON.parse(localStorage.getItem(BK_KEY) || 'null'); } catch (e) { return null; } };
const bkWorth = () => Object.keys(save.found).length + save.gates.length + save.built.length >= 5 || save.total > 5000;

async function bkSaveNow(manual) {               // クラウドへ、暗号化してバックアップ
  const st = bkState(); if (!st) { if (manual) toast('先に「合言葉」を入れて、バックアップを始めてください'); return false; }
  if (typeof olConfigured !== 'function' || !olConfigured()) { if (manual) toast('クラウドバックアップは、まだ使えません(オンラインの設定が必要です)'); return false; }
  try {
    const payload = await bkSeal(unb64(st.key), saveJSON());
    await olConnect(); await olRpc('put_backup', { p_id: st.id, p_data: payload });
    st.at = Date.now(); st.size = payload.length; localStorage.setItem(BK_KEY, JSON.stringify(st));
    if (manual) toast(`☁️ バックアップしました(${Math.round(payload.length / 1024)}KB・暗号化ずみ)`); renderBk(); return true;
  } catch (e) { if (manual) toast('バックアップできませんでした: ' + (e.message || e)); return false; }
}
async function bkStart(pass) {
  if (!pass || pass.length < 10) return toast('合言葉は、10文字以上にしてください(忘れない言葉で。あとで復元するときに使います)');
  toast('合言葉から鍵を作っています…(数秒)');
  const d = await bkDerive(pass); localStorage.setItem(BK_KEY, JSON.stringify({ id: d.id, key: b64(d.key), at: 0, size: 0 }));
  if (await bkSaveNow(true)) alert('バックアップを始めました。\n\n【大切】合言葉は、メモなどに必ず控えてください。データが消えたとき、この合言葉が無いと復元できません(私たちも読めません)。');
}
async function bkRestoreFromCloud(pass) {
  if (!pass || pass.length < 10) return toast('バックアップのときに決めた合言葉を、入れてください');
  if (typeof olConfigured !== 'function' || !olConfigured()) return toast('クラウドバックアップは、まだ使えません');
  try {
    toast('合言葉から鍵を作っています…(数秒)'); const d = await bkDerive(pass);
    await olConnect(); const r = await olRpc('get_backup', { p_id: d.id });
    if (!r || !r.ok) return toast('その合言葉のバックアップは、見つかりませんでした');
    let json; try { json = await bkOpen(d.key, r.data); } catch (e) { return toast('読み出せませんでした(合言葉がちがう可能性があります)'); }
    await bkApply(json, `クラウドのバックアップ(${new Date(r.updated_at).toLocaleString('ja-JP')})`);
  } catch (e) { toast('復元できませんでした: ' + (e.message || e)); }
}
async function bkApply(json, label) {            // 内容を確認して、いまのデータを控えてから、入れかえる
  let o; try { o = JSON.parse(json); } catch (e) { return toast('データが読み取れませんでした'); }
  if (!o || typeof o !== 'object' || (o.found === undefined && o.regions === undefined && o.total === undefined)) return toast('ゲームのデータではありません');
  const f = Object.keys(o.found || {}).length, g = (o.gates || []).length, km = Math.round((o.total || 0) / 100) / 10;
  if (!confirm(`${label}\n\n名所 ${f}件 ・ ワープゲート ${g}個 ・ 歩いた距離 ${km}km\n\nこの内容に入れかえます。いまのデータは、控えとして残します。よろしいですか?`)) return;
  try { await snapNow('復元の直前のデータ'); } catch (e) {}
  restoring = true; localStorage.setItem(KEY, json); location.reload();
}
async function bkExport() {                      // ファイルに書き出し(共有シートがあれば、Googleドライブ・LINE などへ送れる)
  const text = saveJSON(), name = `sanpo-quest-backup-${todayStr()}.json`, file = new File([text], name, { type: 'application/json' });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Sanpo Quest バックアップ' }); localStorage.setItem(BK_KEY + '-file', String(Date.now())); return toast('📤 共有しました。Googleドライブなどに、保存してください'); } } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click(); localStorage.setItem(BK_KEY + '-file', String(Date.now())); toast('📤 ファイルを書き出しました(ダウンロードに保存)');
}
function bkImportFile(file) {
  const r = new FileReader(); r.onload = () => bkApply(String(r.result), `ファイル「${file.name}」`); r.readAsText(file);
}
function renderBk() {
  const st = bkState(), el = $('bk-status'); if (!el) return;
  const file = +(localStorage.getItem(BK_KEY + '-file') || 0);
  el.innerHTML = (st && st.at ? `☁️ 最後のクラウドバックアップ: ${new Date(st.at).toLocaleString('ja-JP')}(${Math.round(st.size / 1024)}KB・自動で6時間ごと)` : '☁️ クラウドバックアップは、まだです') + '<br>' + (file ? `📤 最後のファイル書き出し: ${new Date(file).toLocaleString('ja-JP')}` : '📤 ファイルの書き出しは、まだです');
  $('bk-start').textContent = st ? '合言葉をかえて、バックアップ' : 'この合言葉で、バックアップを始める'; $('bk-now').hidden = !st;
}
function backupInit() {
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* 消されにくい保存を、お願いする */ }
  $('bk-start').onclick = () => bkStart($('bk-pass').value);
  $('bk-now').onclick = () => bkSaveNow(true);
  $('bk-restore').onclick = () => bkRestoreFromCloud($('bk-pass').value);
  $('bk-export').onclick = bkExport;
  $('bk-import').onchange = e => { const f = e.target.files[0]; if (f) bkImportFile(f); e.target.value = ''; };
  renderBk();
  setInterval(() => { const st = bkState(); if (st && !document.hidden && bkWorth() && Date.now() - (st.at || 0) > BK_EVERY) bkSaveNow(false); }, 10 * 60e3);
  setTimeout(() => { const st = bkState(); if (st && bkWorth() && Date.now() - (st.at || 0) > BK_EVERY) bkSaveNow(false); }, 30000);
  setTimeout(() => {                             // バックアップが、長くないときは、お知らせ
    const lastFile = +(localStorage.getItem(BK_KEY + '-file') || 0), lastCloud = (bkState() || {}).at || 0, rem = +(localStorage.getItem(BK_KEY + '-remind') || 0);
    if (bkWorth() && Date.now() - Math.max(lastFile, lastCloud) > 7 * 864e5 && Date.now() - rem > 864e5) { localStorage.setItem(BK_KEY + '-remind', String(Date.now())); toast('💾 バックアップが、7日以上ありません\n☰メニューの「バックアップ」から、保存してください'); }
  }, 25000);
}
