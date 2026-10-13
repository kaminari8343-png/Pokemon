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
