-- DawaDhoondo database schema
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run

create extension if not exists pg_trgm;

-- ---------- Tables ----------

create table if not exists pharmacies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text,
  phone       text,
  lat         double precision not null,
  lng         double precision not null,
  osm_id      text unique,
  owner_id    uuid references auth.users(id) on delete set null,
  is_verified boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists pharmacies_name_trgm on pharmacies using gin (name gin_trgm_ops);
create index if not exists pharmacies_owner_idx on pharmacies (owner_id);

create table if not exists medicines (
  id         uuid primary key default gen_random_uuid(),
  brand      text not null,
  generic    text not null,
  strength   text not null default '',
  form       text not null default '',
  created_at timestamptz not null default now(),
  unique (brand, strength, form)
);
create index if not exists medicines_brand_trgm on medicines using gin (brand gin_trgm_ops);
create index if not exists medicines_generic_trgm on medicines using gin (generic gin_trgm_ops);

create table if not exists stock (
  pharmacy_id uuid not null references pharmacies(id) on delete cascade,
  medicine_id uuid not null references medicines(id) on delete cascade,
  quantity    int not null default 0 check (quantity >= 0),
  price       numeric(10,2),
  updated_at  timestamptz not null default now(),
  primary key (pharmacy_id, medicine_id)
);
create index if not exists stock_medicine_idx on stock (medicine_id) where quantity > 0;

-- Anonymous demand log: powers the shortage radar. Location rounded (~1 km) for privacy.
create table if not exists search_log (
  id          bigserial primary key,
  medicine_id uuid references medicines(id) on delete set null,
  found       boolean not null,
  lat         numeric(6,2),
  lng         numeric(6,2),
  created_at  timestamptz not null default now()
);
create index if not exists search_log_created_idx on search_log (created_at);

-- ---------- Row Level Security ----------

alter table pharmacies enable row level security;
alter table medicines  enable row level security;
alter table stock      enable row level security;
alter table search_log enable row level security;

drop policy if exists "pharmacies readable" on pharmacies;
create policy "pharmacies readable" on pharmacies for select using (true);

drop policy if exists "register own pharmacy" on pharmacies;
create policy "register own pharmacy" on pharmacies for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "claim or edit own pharmacy" on pharmacies;
create policy "claim or edit own pharmacy" on pharmacies for update to authenticated
  using (owner_id is null or owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Owners may not mark themselves verified
revoke update on pharmacies from authenticated, anon;
grant update (name, address, phone, lat, lng, owner_id) on pharmacies to authenticated;

drop policy if exists "medicines readable" on medicines;
create policy "medicines readable" on medicines for select using (true);

drop policy if exists "pharmacists add medicines" on medicines;
create policy "pharmacists add medicines" on medicines for insert to authenticated
  with check (exists (select 1 from pharmacies p where p.owner_id = auth.uid()));

drop policy if exists "stock readable" on stock;
create policy "stock readable" on stock for select using (true);

drop policy if exists "owner writes stock" on stock;
create policy "owner writes stock" on stock for all to authenticated
  using (exists (select 1 from pharmacies p where p.id = pharmacy_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from pharmacies p where p.id = pharmacy_id and p.owner_id = auth.uid()));

drop policy if exists "anyone logs searches" on search_log;
create policy "anyone logs searches" on search_log for insert to anon, authenticated with check (true);

-- ---------- Functions ----------

-- Typo-tolerant medicine search ("pandol" -> Panadol)
create or replace function search_medicines(q text, lim int default 8)
returns table (id uuid, brand text, generic text, strength text, form text, score real)
language sql stable as $$
  select m.id, m.brand, m.generic, m.strength, m.form,
         greatest(
           similarity(m.brand, q),
           similarity(m.brand || ' ' || m.strength, q),
           word_similarity(q, m.brand || ' ' || m.strength),
           similarity(m.generic, q) * 0.9
         ) as score
  from medicines m
  where length(trim(q)) > 0
    and (m.brand ilike trim(q) || '%'
         or m.brand % q
         or (m.brand || ' ' || m.strength) % q
         or q <% (m.brand || ' ' || m.strength)
         or m.generic % q
         or m.generic ilike '%' || trim(q) || '%')
  order by (m.brand ilike trim(q) || '%') desc, score desc, m.brand
  limit lim;
$$;

-- Pharmacies that have the requested medicines in stock, nearest first
create or replace function find_stock_nearby(
  med_ids uuid[], user_lat double precision, user_lng double precision, radius_km double precision default 15)
returns table (
  pharmacy_id uuid, pharmacy_name text, address text, phone text,
  p_lat double precision, p_lng double precision, is_verified boolean,
  medicine_id uuid, brand text, generic text, strength text,
  quantity int, price numeric, updated_at timestamptz, distance_km double precision)
language sql stable as $$
  select * from (
    select p.id, p.name, p.address, p.phone, p.lat, p.lng, p.is_verified,
           m.id, m.brand, m.generic, m.strength, s.quantity, s.price, s.updated_at,
           6371 * 2 * asin(sqrt(
             power(sin(radians(p.lat - user_lat) / 2), 2) +
             cos(radians(user_lat)) * cos(radians(p.lat)) *
             power(sin(radians(p.lng - user_lng) / 2), 2))) as distance_km
    from stock s
    join pharmacies p on p.id = s.pharmacy_id
    join medicines m on m.id = s.medicine_id
    where s.medicine_id = any(med_ids) and s.quantity > 0
  ) t
  where t.distance_km <= radius_km
  order by t.distance_km;
$$;

-- Nearest pharmacies regardless of stock (to call when nothing is listed)
create or replace function nearest_pharmacies(
  user_lat double precision, user_lng double precision, lim int default 10, only_unclaimed boolean default false)
returns table (id uuid, name text, address text, phone text, lat double precision, lng double precision,
               is_listed boolean, distance_km double precision)
language sql stable as $$
  select p.id, p.name, p.address, p.phone, p.lat, p.lng, p.owner_id is not null,
         6371 * 2 * asin(sqrt(
           power(sin(radians(p.lat - user_lat) / 2), 2) +
           cos(radians(user_lat)) * cos(radians(p.lat)) *
           power(sin(radians(p.lng - user_lng) / 2), 2))) as distance_km
  from pharmacies p
  where (not only_unclaimed or p.owner_id is null)
  order by distance_km
  limit lim;
$$;

-- Same salt + same strength, different brand
create or replace function same_salt_alternatives(med_ids uuid[])
returns table (id uuid, brand text, generic text, strength text, form text, for_medicine_id uuid)
language sql stable as $$
  select distinct m2.id, m2.brand, m2.generic, m2.strength, m2.form, m1.id
  from medicines m1
  join medicines m2
    on lower(m2.generic) = lower(m1.generic)
   and lower(m2.strength) = lower(m1.strength)
   and m2.id <> m1.id
  where m1.id = any(med_ids) and not (m2.id = any(med_ids)) and m1.generic <> '';
$$;

-- Add or set stock lines in one call (runs with the caller's permissions, so RLS applies)
create or replace function apply_stock_items(p_pharmacy uuid, p_items jsonb, p_mode text default 'add')
returns int language plpgsql as $$
declare
  n int := 0;
  it jsonb;
begin
  if p_mode not in ('add', 'set') then
    raise exception 'invalid mode';
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    insert into stock (pharmacy_id, medicine_id, quantity, price, updated_at)
    values (p_pharmacy, (it->>'medicine_id')::uuid,
            greatest(coalesce((it->>'quantity')::int, 0), 0),
            nullif(it->>'price', '')::numeric, now())
    on conflict (pharmacy_id, medicine_id) do update set
      quantity   = case when p_mode = 'set' then excluded.quantity
                        else stock.quantity + excluded.quantity end,
      price      = coalesce(excluded.price, stock.price),
      updated_at = now();
    n := n + 1;
  end loop;
  return n;
end $$;

-- Shortage radar: medicines people searched for but could not find
create or replace function shortage_signals(days int default 7)
returns table (medicine_id uuid, brand text, generic text, strength text,
               searches bigint, not_found bigint, miss_rate numeric)
language sql stable security definer set search_path = public as $$
  select m.id, m.brand, m.generic, m.strength,
         count(*) as searches,
         count(*) filter (where not l.found) as not_found,
         round(100.0 * count(*) filter (where not l.found) / count(*), 0) as miss_rate
  from search_log l
  join medicines m on m.id = l.medicine_id
  where l.created_at > now() - make_interval(days => days)
  group by m.id, m.brand, m.generic, m.strength
  order by not_found desc, searches desc
  limit 20;
$$;

grant execute on function search_medicines, find_stock_nearby, nearest_pharmacies,
  same_salt_alternatives, shortage_signals to anon, authenticated;
grant execute on function apply_stock_items to authenticated;
