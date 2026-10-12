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

-- テーブルには、直接さわれないようにする(下の関数を通してだけ読み書きできる)
alter table public.players enable row level security;
alter table public.friends enable row level security;
alter table public.shared enable row level security;
alter table public.cheers enable row level security;
alter table public.gifts enable row level security;
revoke all on public.players, public.friends, public.shared, public.cheers, public.gifts from anon, authenticated;

-- ===== 関数(ここが、ゲームから呼ばれる窓口) =====
-- 自分のプレイヤーを作る/更新して、招待コードを返す
create or replace function public.ensure_player(p_name text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); nm text := left(coalesce(nullif(trim(p_name), ''), 'たびびと'), 14); c text; i int := 0;
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  select code into c from players where id = uid;
  if c is null then
    loop
      c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
      begin
        insert into players (id, name, code) values (uid, nm, c); exit;
      exception when unique_violation then
        i := i + 1; if i > 8 then raise exception 'コードを作れませんでした'; end if;
      end;
    end loop;
  else
    update players set name = nm, last_seen = now() where id = uid;
  end if;
  return json_build_object('id', uid, 'code', c);
end $$;

-- 招待コードで友だちになる(おたがいに)
create or replace function public.add_friend(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t players;
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  select * into t from players where code = upper(trim(p_code));
  if not found then raise exception 'そのコードの人が見つかりません'; end if;
  if t.id = uid then raise exception '自分のコードです'; end if;
  insert into friends (a, b) values (uid, t.id), (t.id, uid) on conflict do nothing;
  return json_build_object('id', t.id, 'name', t.name);
end $$;

create or replace function public.remove_friend(p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  delete from friends where (a = uid and b = p_id) or (a = p_id and b = uid);
  return json_build_object('ok', true);
end $$;

-- 自分の成績を送る(ランキング用)
create or replace function public.publish_stats(p_km numeric, p_found int, p_builds int, p_level int) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  update players set km = least(greatest(coalesce(p_km, 0), 0), 1000000), found = least(greatest(coalesce(p_found, 0), 0), 1000000),
    builds = least(greatest(coalesce(p_builds, 0), 0), 1000000), level = least(greatest(coalesce(p_level, 1), 1), 100000), last_seen = now()
  where id = uid;
  return json_build_object('ok', true);
end $$;

-- 自分の公開するオブジェクト・ゲートを、まるごと置きかえる(座標は約11mにまるめる)
create or replace function public.publish_items(p_items jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then p_items := '[]'::jsonb; end if;
  delete from shared where owner = uid;
  insert into shared (id, owner, kind, t, lv, name, lat, lng)
  select left(x.id, 40), uid, x.kind, left(coalesce(x.t, ''), 20), least(greatest(coalesce(x.lv, 1), 1), 3), left(coalesce(x.name, ''), 20),
         round(x.lat::numeric, 4)::double precision, round(x.lng::numeric, 4)::double precision
  from jsonb_to_recordset(p_items) as x(id text, kind text, t text, lv int, name text, lat double precision, lng double precision)
  where x.kind in ('obj', 'gate') and x.id is not null and x.lat between -90 and 90 and x.lng between -180 and 180
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

-- 友だちが公開しているオブジェクト・ゲート
create or replace function public.friends_shared() returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  return coalesce((select json_agg(json_build_object('id', s.id, 'owner', s.owner, 'owner_name', p.name, 'kind', s.kind, 't', s.t, 'lv', s.lv,
    'name', s.name, 'lat', s.lat, 'lng', s.lng))
    from (select s2.* from shared s2 where s2.owner in (select b from friends where a = uid) limit 600) s
    join players p on p.id = s.owner), '[]'::json);
end $$;

-- 友だちのオブジェクトを応援する(1日10回まで。同じ物には1日1回)
create or replace function public.cheer(p_owner uuid, p_item text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); today int; ins int;
begin
  if uid is null then raise exception 'ログインしていません'; end if;
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
  with u as (update cheers set claimed = true where to_p = uid and not claimed returning 1) select count(*) into n from u;
  return json_build_object('n', n);
end $$;

-- 友だちに贈り物(コイン: 1回200まで・1日500まで / かけら: 1回3個・1日5個まで)
create or replace function public.send_gift(p_to uuid, p_kind text, p_amount int) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); sent int; per int; cap int;
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  if p_kind not in ('coin', 'shard') then raise exception '贈れない物です'; end if;
  per := case p_kind when 'coin' then 200 else 3 end; cap := case p_kind when 'coin' then 500 else 5 end;
  if p_amount is null or p_amount < 1 or p_amount > per then raise exception '1回に贈れるのは % までです', per; end if;
  if not exists (select 1 from friends where a = uid and b = p_to) then raise exception '友だちではありません'; end if;
  select coalesce(sum(amount), 0) into sent from gifts where from_p = uid and kind = p_kind and created_at::date = current_date;
  if sent + p_amount > cap then raise exception 'きょうは、あと % しか贈れません', greatest(0, cap - sent); end if;
  insert into gifts (from_p, to_p, kind, amount) values (uid, p_to, p_kind, p_amount);
  return json_build_object('ok', true);
end $$;

-- 自分への贈り物を受け取る
create or replace function public.claim_gifts() returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r json;
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  with u as (update gifts set claimed = true where to_p = uid and not claimed returning from_p, kind, amount)
  select coalesce(json_agg(json_build_object('kind', u.kind, 'amount', u.amount, 'from', p.name)), '[]'::json) into r from u left join players p on p.id = u.from_p;
  return r;
end $$;

-- 関数は、ログインずみの人(匿名ログイン含む)だけが呼べる
revoke all on function public.ensure_player(text), public.add_friend(text), public.remove_friend(uuid), public.publish_stats(numeric, int, int, int),
  public.publish_items(jsonb), public.list_friends(), public.friends_shared(), public.cheer(uuid, text), public.claim_cheers(),
  public.send_gift(uuid, text, int), public.claim_gifts() from public, anon;
grant execute on function public.ensure_player(text), public.add_friend(text), public.remove_friend(uuid), public.publish_stats(numeric, int, int, int),
  public.publish_items(jsonb), public.list_friends(), public.friends_shared(), public.cheer(uuid, text), public.claim_cheers(),
  public.send_gift(uuid, text, int), public.claim_gifts() to authenticated;
