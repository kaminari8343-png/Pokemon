-- Sanpo Quest オンライン(友だち限定)用のデータベース設定
-- Supabase の「SQL Editor」に、この中身を全部貼り付けて「Run」を押す(何度実行しても大丈夫)

-- ===== テーブル =====
create table if not exists public.players (
  id uuid primary key,
  name text not null default 'たびびと',
  code text not null unique,
  km numeric not null default 0,
  found int not null default 0,
  builds int not null default 0,
  level int not null default 1,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table if not exists public.friends (
  a uuid not null references public.players(id) on delete cascade,
  b uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (a, b)
);
create table if not exists public.shared (
  id text not null,
  owner uuid not null references public.players(id) on delete cascade,
  kind text not null check (kind in ('obj', 'gate')),
  t text not null default '',
  lv int not null default 1,
  name text not null default '',
  lat double precision not null,
  lng double precision not null,
  primary key (owner, id)
);
create table if not exists public.cheers (
  id bigserial primary key,
  from_p uuid not null references public.players(id) on delete cascade,
  to_p uuid not null references public.players(id) on delete cascade,
  item_id text not null,
  day date not null default current_date,
  claimed boolean not null default false,
  unique (from_p, to_p, item_id, day)
);
create table if not exists public.gifts (
  id bigserial primary key,
  from_p uuid not null references public.players(id) on delete cascade,
  to_p uuid not null references public.players(id) on delete cascade,
  kind text not null check (kind in ('coin', 'shard')),
  amount int not null check (amount > 0),
  created_at timestamptz not null default now(),
  claimed boolean not null default false
);

create table if not exists public.friend_req (
  from_p uuid not null references public.players(id) on delete cascade,
  to_p uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_p, to_p)
);
alter table public.players add column if not exists bad_tries int not null default 0;
alter table public.players add column if not exists bad_since timestamptz;
create index if not exists cheers_to_open on public.cheers (to_p) where not claimed;
create index if not exists gifts_to_open on public.gifts (to_p) where not claimed;
create index if not exists gifts_from_day on public.gifts (from_p, created_at);
create index if not exists friend_req_to on public.friend_req (to_p);

-- テーブルには、直接さわれないようにする(下の関数を通してだけ読み書きできる)
alter table public.players enable row level security;
alter table public.friends enable row level security;
alter table public.shared enable row level security;
alter table public.cheers enable row level security;
alter table public.gifts enable row level security;
alter table public.friend_req enable row level security;
revoke all on public.players, public.friends, public.shared, public.cheers, public.gifts, public.friend_req from anon, authenticated;

-- ===== 関数(ここが、ゲームから呼ばれる窓口) =====
-- 自分のプレイヤーを作る/更新して、招待コード(10文字)を返す
create or replace function public.ensure_player(p_name text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); nm text := left(coalesce(nullif(trim(p_name), ''), 'たびびと'), 14); c text; i int := 0;
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  select code into c from players where id = uid;
  if c is null then
    loop
      begin
        insert into players (id, name, code) values (uid, nm, upper(substr(md5(random()::text || clock_timestamp()::text || uid::text), 1, 10))) on conflict (id) do nothing;
        exit;
      exception when unique_violation then
        i := i + 1; if i > 8 then raise exception 'コードを作れませんでした'; end if;
      end;
    end loop;
    select code into c from players where id = uid;
  else
    update players set name = nm, last_seen = now() where id = uid;
  end if;
  if length(c) < 10 then       -- 以前の短いコードは、推測されにくい10文字に作りかえる
    i := 0;
    loop
      begin
        update players set code = upper(substr(md5(random()::text || clock_timestamp()::text || uid::text), 1, 10)) where id = uid returning code into c;
        exit;
      exception when unique_violation then
        i := i + 1; if i > 8 then raise exception 'コードを作れませんでした'; end if;
      end;
    end loop;
  end if;
  return json_build_object('id', uid, 'code', c);
end $$;

-- 招待コードで、友だち申請を出す(相手も自分のコードを入れていれば、すぐ友だちになる)。まちがいが多いと、1時間とめる
create or replace function public.add_friend(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me players; t players; sent int;
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  select * into me from players where id = uid for update;
  if not found then raise exception 'はじめに、オンラインの登録が必要です'; end if;
  if coalesce(me.bad_tries, 0) >= 10 and me.bad_since > now() - interval '1 hour' then
    return json_build_object('ok', false, 'err', 'まちがいが多いため、しばらくしてからためしてね');
  end if;
  select * into t from players where code = upper(trim(p_code));
  if not found then
    update players set bad_tries = case when bad_since > now() - interval '1 hour' then bad_tries + 1 else 1 end,
      bad_since = case when bad_since > now() - interval '1 hour' then bad_since else now() end where id = uid;
    return json_build_object('ok', false, 'err', 'そのコードの人が見つかりません');
  end if;
  if t.id = uid then return json_build_object('ok', false, 'err', '自分のコードです'); end if;
  if exists (select 1 from friends where a = uid and b = t.id) then return json_build_object('ok', true, 'state', 'friend', 'id', t.id, 'name', t.name); end if;
  if exists (select 1 from friend_req where from_p = t.id and to_p = uid) then
    insert into friends (a, b) values (uid, t.id), (t.id, uid) on conflict do nothing;
    delete from friend_req where (from_p = uid and to_p = t.id) or (from_p = t.id and to_p = uid);
    return json_build_object('ok', true, 'state', 'friend', 'id', t.id, 'name', t.name);
  end if;
  select count(*) into sent from friend_req where from_p = uid;
  if sent >= 30 then return json_build_object('ok', false, 'err', '申請の出しすぎです(相手の承認をまってね)'); end if;
  insert into friend_req (from_p, to_p) values (uid, t.id) on conflict do nothing;
  return json_build_object('ok', true, 'state', 'pending', 'id', t.id, 'name', t.name);
end $$;

-- 自分あての友だち申請の一覧
create or replace function public.list_requests() returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  return coalesce((select json_agg(json_build_object('id', p.id, 'name', p.name) order by r.created_at)
    from friend_req r join players p on p.id = r.from_p where r.to_p = uid), '[]'::json);
end $$;

create or replace function public.accept_friend(p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  if not exists (select 1 from friend_req where from_p = p_id and to_p = uid) then raise exception '申請が見つかりません'; end if;
  insert into friends (a, b) values (uid, p_id), (p_id, uid) on conflict do nothing;
  delete from friend_req where (from_p = uid and to_p = p_id) or (from_p = p_id and to_p = uid);
  return json_build_object('ok', true);
end $$;

create or replace function public.decline_request(p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  delete from friend_req where from_p = p_id and to_p = uid;
  return json_build_object('ok', true);
end $$;

create or replace function public.remove_friend(p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  delete from friends where (a = uid and b = p_id) or (a = p_id and b = uid);
  delete from friend_req where (from_p = uid and to_p = p_id) or (from_p = p_id and to_p = uid);
  return json_build_object('ok', true);
end $$;

-- 自分のデータを、すべて消す(成績・公開した物・友だち関係・応援・贈り物)
create or replace function public.delete_me() returns json
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'ログインしていません'; end if;
  delete from players where id = auth.uid();
  return json_build_object('ok', true);
end $$;

-- 自分の成績を送る(ランキング用)
create or replace function public.publish_stats(p_km numeric, p_found int, p_builds int, p_level int) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  update players set km = least(greatest(coalesce(p_km, 0), 0), 100000), found = least(greatest(coalesce(p_found, 0), 0), 100000),
    builds = least(greatest(coalesce(p_builds, 0), 0), 100000), level = least(greatest(coalesce(p_level, 1), 1), 1000), last_seen = now()
  where id = uid;
  return json_build_object('ok', true);
end $$;

-- 自分の公開するオブジェクト・ゲートを、まるごと置きかえる(座標は約11mにまるめる。知らない種類の物は受け付けない)
create or replace function public.publish_items(p_items jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then p_items := '[]'::jsonb; end if;
  if jsonb_array_length(p_items) > 500 then raise exception '数が多すぎます'; end if;
  delete from shared where owner = uid;
  insert into shared (id, owner, kind, t, lv, name, lat, lng)
  select left(x.id, 40), uid, x.kind, case when x.kind = 'gate' then '' else x.t end, least(greatest(coalesce(x.lv, 1), 1), 3), left(coalesce(x.name, ''), 20),
         round(x.lat::numeric, 4)::double precision, round(x.lng::numeric, 4)::double precision
  from jsonb_to_recordset(p_items) as x(id text, kind text, t text, lv int, name text, lat double precision, lng double precision)
  where x.id is not null and x.lat between -90 and 90 and x.lng between -180 and 180
    and (x.kind = 'gate' or (x.kind = 'obj' and x.t in ('flower','tree','rest','lantern','fountain','shrine','house','tower','monument','rainbow','farm','ranch','windmill','lighthouse','funfair','castle','market','onsen','library','harbor','observatory')))
  limit 150
  on conflict (owner, id) do nothing;
  get diagnostics n = row_count;
  return json_build_object('n', n);
end $$;

-- 友だち一覧(ランキング用の成績つき)
create or replace function public.list_friends() returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  return coalesce((select json_agg(json_build_object('id', p.id, 'name', p.name, 'km', p.km, 'found', p.found, 'builds', p.builds, 'level', p.level,
    'days', greatest(0, current_date - p.last_seen::date)) order by p.name)
    from friends f join players p on p.id = f.b where f.a = uid), '[]'::json);
end $$;

-- 友だちが公開しているオブジェクト・ゲート(60日以上こない人のものは出さない)
create or replace function public.friends_shared() returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  return coalesce((select json_agg(json_build_object('id', s.id, 'owner', s.owner, 'owner_name', p.name, 'kind', s.kind, 't', s.t, 'lv', s.lv,
    'name', s.name, 'lat', s.lat, 'lng', s.lng) order by s.owner, s.id)
    from shared s join players p on p.id = s.owner
    where s.owner in (select b from friends where a = uid) and p.last_seen > now() - interval '60 days'), '[]'::json);
end $$;

-- 友だちのオブジェクトを応援する(1日10回まで。同じ物には1日1回)
create or replace function public.cheer(p_owner uuid, p_item text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); today int; ins int;
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  perform 1 from players where id = uid for update;      -- 同時に何回も呼ばれても、回数制限をすりぬけられないように
  if not exists (select 1 from friends where a = uid and b = p_owner) then raise exception '友だちではありません'; end if;
  if not exists (select 1 from shared where owner = p_owner and id = p_item and kind = 'obj') then raise exception 'その物は見つかりません'; end if;
  select count(*) into today from cheers where from_p = uid and day = current_date;
  if today >= 10 then raise exception 'きょうの応援は10回までです'; end if;
  insert into cheers (from_p, to_p, item_id) values (uid, p_owner, p_item) on conflict do nothing;
  get diagnostics ins = row_count;
  if ins = 0 then raise exception 'きょうは、もう応援ずみです'; end if;
  return json_build_object('ok', true, 'left', 9 - today);
end $$;

-- 自分への応援を受け取る(件数を返す)
create or replace function public.claim_cheers() returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  delete from cheers where to_p = uid and claimed and day < current_date - 30;
  with u as (update cheers set claimed = true where to_p = uid and not claimed returning 1) select count(*) into n from u;
  return json_build_object('n', n);
end $$;

-- 友だちに贈り物(コイン: 1回200まで・1日500まで / かけら: 1回3個・1日5個まで。もらう側も、1日にコイン1000・かけら10まで)
create or replace function public.send_gift(p_to uuid, p_kind text, p_amount int) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); sent int; got int; per int; cap int; rcap int;
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  if p_kind not in ('coin', 'shard') then raise exception '贈れない物です'; end if;
  per := case p_kind when 'coin' then 200 else 3 end; cap := case p_kind when 'coin' then 500 else 5 end; rcap := case p_kind when 'coin' then 1000 else 10 end;
  if p_amount is null or p_amount < 1 or p_amount > per then raise exception '1回に贈れるのは % までです', per; end if;
  perform 1 from players where id = uid for update;      -- 同時に何回も呼ばれても、上限をすりぬけられないように
  if not exists (select 1 from friends where a = uid and b = p_to) then raise exception '友だちではありません'; end if;
  select coalesce(sum(amount), 0) into sent from gifts where from_p = uid and kind = p_kind and created_at::date = current_date;
  if sent + p_amount > cap then raise exception 'きょうは、あと % しか贈れません', greatest(0, cap - sent); end if;
  select coalesce(sum(amount), 0) into got from gifts where to_p = p_to and kind = p_kind and created_at::date = current_date;
  if got + p_amount > rcap then raise exception 'その友だちは、きょうはもう受け取りいっぱいです'; end if;
  insert into gifts (from_p, to_p, kind, amount) values (uid, p_to, p_kind, p_amount);
  return json_build_object('ok', true);
end $$;

-- 自分への贈り物を受け取る
create or replace function public.claim_gifts() returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r json;
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  delete from gifts where to_p = uid and claimed and created_at < now() - interval '30 days';
  with u as (update gifts set claimed = true where to_p = uid and not claimed returning from_p, kind, amount)
  select coalesce(json_agg(json_build_object('kind', u.kind, 'amount', u.amount, 'from', p.name)), '[]'::json) into r from u left join players p on p.id = u.from_p;
  return r;
end $$;

-- 関数は、ログインずみの人(匿名ログイン含む)だけが呼べる
revoke all on function public.ensure_player(text), public.add_friend(text), public.list_requests(), public.accept_friend(uuid), public.decline_request(uuid),
  public.remove_friend(uuid), public.delete_me(), public.publish_stats(numeric, int, int, int), public.publish_items(jsonb), public.list_friends(),
  public.friends_shared(), public.cheer(uuid, text), public.claim_cheers(), public.send_gift(uuid, text, int), public.claim_gifts() from public, anon;
grant execute on function public.ensure_player(text), public.add_friend(text), public.list_requests(), public.accept_friend(uuid), public.decline_request(uuid),
  public.remove_friend(uuid), public.delete_me(), public.publish_stats(numeric, int, int, int), public.publish_items(jsonb), public.list_friends(),
  public.friends_shared(), public.cheer(uuid, text), public.claim_cheers(), public.send_gift(uuid, text, int), public.claim_gifts() to authenticated;

-- ===== 暗号化バックアップ(合言葉で復元。サーバーには、暗号化された中身しか置かない) =====
create table if not exists public.backups (
  id text primary key,
  data text not null,
  size int not null,
  updated_at timestamptz not null default now()
);
alter table public.backups enable row level security;
revoke all on public.backups from anon, authenticated;

create or replace function public.put_backup(p_id text, p_data text) returns json
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'ログインしていません'; end if;
  if p_id is null or length(p_id) < 32 or length(p_id) > 128 then raise exception 'idが正しくありません'; end if;
  if p_data is null or length(p_data) < 16 or length(p_data) > 8000000 then raise exception 'データの大きさが正しくありません'; end if;
  insert into backups (id, data, size, updated_at) values (p_id, p_data, length(p_data), now())
    on conflict (id) do update set data = excluded.data, size = excluded.size, updated_at = now();
  return json_build_object('ok', true, 'size', length(p_data));
end $$;

create or replace function public.get_backup(p_id text) returns json
language plpgsql security definer set search_path = public as $$
declare r backups;
begin
  if auth.uid() is null then raise exception 'ログインしていません'; end if;
  if p_id is null or length(p_id) < 32 or length(p_id) > 128 then return json_build_object('ok', false); end if;
  select * into r from backups where id = p_id;
  if not found then return json_build_object('ok', false); end if;
  return json_build_object('ok', true, 'data', r.data, 'updated_at', r.updated_at);
end $$;

revoke all on function public.put_backup(text, text), public.get_backup(text) from public, anon;
grant execute on function public.put_backup(text, text), public.get_backup(text) to authenticated;

-- ===== 家族イベント(最大4人の家族グループ。宝箱の集計と「いっしょにいる」確認) =====
-- 位置は「いっしょにいる確認」のときだけ送り、10分で使い終わります。ほかの人には、返しません。
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.family_members (
  player_id uuid primary key references public.players(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  joined_at timestamptz not null default now(),
  ck_lat double precision, ck_lng double precision, ck_at timestamptz
);
create table if not exists public.family_events (
  family_id uuid not null references public.families(id) on delete cascade,
  event_id text not null,
  day date not null,
  clat double precision not null, clng double precision not null,
  created_at timestamptz not null default now(),
  primary key (family_id, event_id, day)
);
create table if not exists public.family_progress (
  family_id uuid not null references public.families(id) on delete cascade,
  event_id text not null,
  day date not null,
  player_id uuid not null references public.players(id) on delete cascade,
  mask int not null default 0,
  together boolean not null default false,
  primary key (family_id, event_id, day, player_id)
);
create index if not exists family_members_fam on public.family_members (family_id);
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_events enable row level security;
alter table public.family_progress enable row level security;
revoke all on public.families, public.family_members, public.family_events, public.family_progress from anon, authenticated;

create or replace function public.family_create() returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); fid uuid; c text; i int := 0;
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  if not exists (select 1 from players where id = uid) then raise exception 'はじめに、オンラインの登録が必要です'; end if;
  if exists (select 1 from family_members where player_id = uid) then return json_build_object('ok', false, 'err', 'もう家族グループに入っています'); end if;
  loop
    begin
      insert into families (code) values (upper(substr(md5(random()::text || clock_timestamp()::text || uid::text), 1, 8))) returning id, code into fid, c;
      exit;
    exception when unique_violation then
      i := i + 1; if i > 8 then raise exception 'コードを作れませんでした'; end if;
    end;
  end loop;
  insert into family_members (player_id, family_id) values (uid, fid);
  return json_build_object('ok', true, 'code', c);
end $$;

create or replace function public.family_join(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me players; f families; n int;
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  select * into me from players where id = uid for update;
  if not found then raise exception 'はじめに、オンラインの登録が必要です'; end if;
  if exists (select 1 from family_members where player_id = uid) then return json_build_object('ok', false, 'err', 'もう家族グループに入っています'); end if;
  if coalesce(me.bad_tries, 0) >= 10 and me.bad_since > now() - interval '1 hour' then
    return json_build_object('ok', false, 'err', 'まちがいが多いため、しばらくしてからためしてね');
  end if;
  select * into f from families where code = upper(trim(p_code));
  if not found then
    update players set bad_tries = case when bad_since > now() - interval '1 hour' then bad_tries + 1 else 1 end,
      bad_since = case when bad_since > now() - interval '1 hour' then bad_since else now() end where id = uid;
    return json_build_object('ok', false, 'err', 'そのコードの家族が見つかりません');
  end if;
  select count(*) into n from family_members where family_id = f.id;
  if n >= 4 then return json_build_object('ok', false, 'err', '家族は、4人までです'); end if;
  insert into family_members (player_id, family_id) values (uid, f.id);
  return json_build_object('ok', true, 'code', f.code);
end $$;

create or replace function public.family_leave() returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); fid uuid;
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  select family_id into fid from family_members where player_id = uid;
  delete from family_members where player_id = uid;
  if fid is not null and not exists (select 1 from family_members where family_id = fid) then delete from families where id = fid; end if;
  return json_build_object('ok', true);
end $$;

-- 今日のイベントを、はじめる(家族の最初のひとりが押した場所が、宝さがしの中心になる。約110mにまるめる)
create or replace function public.family_start(p_event text, p_lat double precision, p_lng double precision) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); fid uuid; d date := (now() at time zone 'Asia/Tokyo')::date;
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  select family_id into fid from family_members where player_id = uid;
  if fid is null then return json_build_object('ok', false, 'err', '先に家族グループに入ってください'); end if;
  if p_event is null or p_event !~ '^[a-z0-9-]{1,40}$' then raise exception 'イベントが正しくありません'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception '位置が正しくありません'; end if;
  insert into family_events (family_id, event_id, day, clat, clng) values (fid, p_event, d, round(p_lat::numeric, 3), round(p_lng::numeric, 3)) on conflict do nothing;
  insert into family_progress (family_id, event_id, day, player_id) values (fid, p_event, d, uid) on conflict do nothing;
  return json_build_object('ok', true);
end $$;

-- 自分が開けた宝箱(ビット)を送る。ふやすことだけできる
create or replace function public.family_report(p_event text, p_mask int) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); fid uuid; d date := (now() at time zone 'Asia/Tokyo')::date;
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  select family_id into fid from family_members where player_id = uid;
  if fid is null then return json_build_object('ok', false); end if;
  update family_progress set mask = mask | (coalesce(p_mask, 0) & 65535) where family_id = fid and event_id = p_event and day = d and player_id = uid;
  return json_build_object('ok', true);
end $$;

-- 「いっしょにいる」確認: 10分いない・150m以内に、家族のだれかが確認していれば、おたがい「いっしょ」になる
create or replace function public.family_together(p_event text, p_lat double precision, p_lng double precision) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); fid uuid; d date := (now() at time zone 'Asia/Tokyo')::date; o record; hit boolean := false; dm double precision;
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  select family_id into fid from family_members where player_id = uid;
  if fid is null then return json_build_object('ok', false, 'err', '先に家族グループに入ってください'); end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception '位置が正しくありません'; end if;
  update family_members set ck_lat = p_lat, ck_lng = p_lng, ck_at = now() where player_id = uid;
  for o in select player_id, ck_lat, ck_lng from family_members where family_id = fid and player_id <> uid and ck_at > now() - interval '10 minutes' loop
    dm := sqrt(power((o.ck_lat - p_lat) * 111320, 2) + power((o.ck_lng - p_lng) * 111320 * cos(radians(p_lat)), 2));
    if dm <= 150 then
      hit := true;
      update family_progress set together = true where family_id = fid and event_id = p_event and day = d and player_id in (uid, o.player_id);
    end if;
  end loop;
  if hit then update family_members set ck_lat = null, ck_lng = null, ck_at = null where family_id = fid; end if;
  return json_build_object('ok', true, 'together', hit);
end $$;

-- 家族と、今日のイベントの進みぐあい(位置は、返さない)
create or replace function public.family_status(p_event text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); fid uuid; fc text; d date := (now() at time zone 'Asia/Tokyo')::date; ev family_events; mem json; u int := 0; tg boolean := false; r record;
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  select m.family_id, f.code into fid, fc from family_members m join families f on f.id = m.family_id where m.player_id = uid;
  if fid is null then return json_build_object('ok', true, 'in_family', false); end if;
  select * into ev from family_events where family_id = fid and event_id = p_event and day = d;
  select json_agg(json_build_object('name', p.name, 'me', p.id = uid, 'mask', coalesce(g.mask, 0), 'together', coalesce(g.together, false)) order by m.joined_at)
    into mem from family_members m join players p on p.id = m.player_id
    left join family_progress g on g.family_id = m.family_id and g.event_id = p_event and g.day = d and g.player_id = m.player_id where m.family_id = fid;
  for r in select mask, together from family_progress where family_id = fid and event_id = p_event and day = d loop u := u | r.mask; tg := tg or r.together; end loop;
  return json_build_object('ok', true, 'in_family', true, 'code', fc, 'day', d, 'members', coalesce(mem, '[]'::json),
    'started', ev.family_id is not null, 'clat', ev.clat, 'clng', ev.clng, 'union', u, 'together', tg,
    'seed', case when ev.family_id is not null then md5(fid::text || p_event || d::text) end);
end $$;

revoke all on function public.family_create(), public.family_join(text), public.family_leave(), public.family_start(text, double precision, double precision),
  public.family_report(text, int), public.family_together(text, double precision, double precision), public.family_status(text) from public, anon;
grant execute on function public.family_create(), public.family_join(text), public.family_leave(), public.family_start(text, double precision, double precision),
  public.family_report(text, int), public.family_together(text, double precision, double precision), public.family_status(text) to authenticated;

-- ===== ゲートを友だちに送る(もらう側の、ゲートリストに入る) =====
create table if not exists public.gate_gifts (
  id bigserial primary key,
  from_p uuid not null references public.players(id) on delete cascade,
  to_p uuid not null references public.players(id) on delete cascade,
  name text not null default '',
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now(),
  claimed boolean not null default false
);
create index if not exists gate_gifts_to_open on public.gate_gifts (to_p) where not claimed;
create index if not exists gate_gifts_from_day on public.gate_gifts (from_p, created_at);
alter table public.gate_gifts enable row level security;
revoke all on public.gate_gifts from anon, authenticated;

create or replace function public.send_gate(p_to uuid, p_name text, p_lat double precision, p_lng double precision) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); sent int; pend int; nm text := left(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g'), 20);
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception '位置が正しくありません'; end if;
  perform 1 from players where id = uid for update;
  if not exists (select 1 from friends where a = uid and b = p_to) then raise exception '友だちではありません'; end if;
  select count(*) into sent from gate_gifts where from_p = uid and created_at > now() - interval '1 day';
  if sent >= 10 then raise exception 'きょうは、もうゲートを10個送りました'; end if;
  select count(*) into pend from gate_gifts where to_p = p_to and not claimed;
  if pend >= 20 then raise exception 'その友だちは、まだ受け取っていないゲートがたくさんあります'; end if;
  if exists (select 1 from gate_gifts where from_p = uid and to_p = p_to and not claimed and abs(lat - p_lat) < 0.0005 and abs(lng - p_lng) < 0.0005) then
    return json_build_object('ok', true, 'dup', true);
  end if;
  insert into gate_gifts (from_p, to_p, name, lat, lng) values (uid, p_to, nm, round(p_lat::numeric, 5), round(p_lng::numeric, 5));
  return json_build_object('ok', true);
end $$;

create or replace function public.claim_gate_gifts() returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r json;
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  delete from gate_gifts where to_p = uid and claimed and created_at < now() - interval '30 days';
  with u as (update gate_gifts set claimed = true where to_p = uid and not claimed returning from_p, name, lat, lng)
  select coalesce(json_agg(json_build_object('name', u.name, 'lat', u.lat, 'lng', u.lng, 'from', p.name)), '[]'::json) into r from u left join players p on p.id = u.from_p;
  return r;
end $$;

revoke all on function public.send_gate(uuid, text, double precision, double precision), public.claim_gate_gifts() from public, anon;
grant execute on function public.send_gate(uuid, text, double precision, double precision), public.claim_gate_gifts() to authenticated;
