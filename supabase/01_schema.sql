-- =====================================================================
-- DawaDhoondo — 01_schema.sql  (v2: Pakistan clean dataset)
-- Run FIRST in Supabase SQL Editor. Safe to re-run.
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- 1) Import landing table — headers match pakistan_medicines_supabase.csv
--    exactly. All text, so the dashboard CSV import never fails on types.
-- ---------------------------------------------------------------------
create table if not exists public.medicines_import (
  product_name text, generic_name text, generic_composition text, formula_key text,
  strength text, dosage_form text, company text, licence text, reg_no text,
  category text, pack_size text, pack_units text, mrp_pkr text, price_per_unit text,
  effective_from text, rx_status text, indication text, is_common text,
  source text, search_text text
);
alter table public.medicines_import enable row level security; -- not public

-- ---------------------------------------------------------------------
-- 2) Medicines (typed, indexed)
-- ---------------------------------------------------------------------
drop table if exists public.orders cascade;
drop table if exists public.inventory cascade;
drop table if exists public.medicines cascade;
drop table if exists public.medicines_raw cascade; -- v1 table, no longer used

create table public.medicines (
  id                  bigint generated always as identity primary key,
  product_name        text not null,
  generic_name        text,
  generic_composition text,
  formula_key         text,
  strength            text,
  dosage_form         text,
  company             text,
  licence             text,
  reg_no              text,
  category            text,
  pack_size           text,
  pack_units          int,
  mrp_pkr             numeric(12,2),
  price_per_unit      numeric(12,2),
  effective_from      date,
  rx_status           text,
  indication          text,
  is_common           boolean not null default false,
  source              text,
  search_text         text,
  name_lc             text generated always as (lower(product_name)) stored,
  generic_lc          text generated always as (lower(coalesce(generic_name, ''))) stored
);
create index medicines_name_trgm    on public.medicines using gin (name_lc extensions.gin_trgm_ops);
create index medicines_generic_trgm on public.medicines using gin (generic_lc extensions.gin_trgm_ops);
create index medicines_formula      on public.medicines (formula_key, dosage_form);

-- ---------------------------------------------------------------------
-- 3) Pharmacies (DEMO)
-- ---------------------------------------------------------------------
create table if not exists public.pharmacies (
  id        bigint generated always as identity primary key,
  name      text not null,
  city      text not null,
  address   text,
  lat       double precision not null,
  lng       double precision not null,
  rating    numeric(2,1),
  open_24h  boolean not null default false,
  delivery  boolean not null default true,
  is_demo   boolean not null default true
);
create index if not exists pharmacies_city on public.pharmacies (city);

-- ---------------------------------------------------------------------
-- 4) Inventory (DEMO) + 5) Orders
-- ---------------------------------------------------------------------
create table public.inventory (
  pharmacy_id bigint not null references public.pharmacies(id) on delete cascade,
  medicine_id bigint not null references public.medicines(id)  on delete cascade,
  stock       int not null check (stock >= 0),
  price       numeric(12,2),
  primary key (pharmacy_id, medicine_id)
);
create index inventory_medicine on public.inventory (medicine_id);

create table public.orders (
  id            uuid primary key default gen_random_uuid(),
  pharmacy_id   bigint not null references public.pharmacies(id),
  medicine_id   bigint not null references public.medicines(id),
  qty           int not null check (qty between 1 and 20),
  customer_name text not null,
  phone         text not null,
  address       text,
  mode          text not null check (mode in ('delivery','pickup')),
  total         numeric(12,2),
  status        text not null default 'placed',
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6) Row Level Security
-- ---------------------------------------------------------------------
alter table public.medicines  enable row level security;
alter table public.pharmacies enable row level security;
alter table public.inventory  enable row level security;
alter table public.orders     enable row level security;

drop policy if exists "public read medicines"  on public.medicines;
drop policy if exists "public read pharmacies" on public.pharmacies;
drop policy if exists "public read inventory"  on public.inventory;
create policy "public read medicines"  on public.medicines  for select to anon, authenticated using (true);
create policy "public read pharmacies" on public.pharmacies for select to anon, authenticated using (true);
create policy "public read inventory"  on public.inventory  for select to anon, authenticated using (true);

-- =====================================================================
-- RPC FUNCTIONS
-- =====================================================================
drop function if exists public.search_medicines(text, int);
drop function if exists public.medicine_alternatives(bigint, int);

-- Fuzzy search on brand + generic ("panadoll", "augmantin", "paracetamol")
-- generic_composition is returned = generic_name so the v1 frontend keeps working.
create function public.search_medicines(q text, lim int default 12)
returns table (
  id bigint, product_name text, generic_composition text, company text,
  pack_size text, mrp_pkr numeric, score real,
  generic_name text, strength text, dosage_form text, rx_status text, price_per_unit numeric
)
language sql stable
set search_path = public, extensions
set pg_trgm.similarity_threshold = 0.2
set pg_trgm.word_similarity_threshold = 0.35
as $$
  with qq as (select lower(trim(q)) as t),
  hits as (
    select distinct on (m.name_lc)
           m.id, m.product_name, m.generic_name, m.company, m.pack_size, m.mrp_pkr,
           greatest(
             word_similarity(qq.t, m.name_lc),
             similarity(qq.t, m.name_lc),
             word_similarity(qq.t, m.generic_lc) * 0.9
           )::real as score,
           m.strength, m.dosage_form, m.rx_status, m.price_per_unit
    from public.medicines m, qq
    where length(qq.t) >= 2
      and (qq.t <% m.name_lc or qq.t % m.name_lc or qq.t <% m.generic_lc)
    order by m.name_lc, m.mrp_pkr nulls last   -- one row per brand (smallest pack)
  )
  select h.id, h.product_name, h.generic_name, h.company, h.pack_size, h.mrp_pkr, h.score,
         h.generic_name, h.strength, h.dosage_form, h.rx_status, h.price_per_unit
  from hits h
  order by h.score desc,
           coalesce(h.dosage_form in ('Tablet','Capsule'), false) desc,   -- adult oral forms first on ties
           length(h.product_name), h.product_name
  limit least(greatest(lim, 1), 50);
$$;

create or replace function public.nearby_pharmacies(
  p_medicine_id bigint,
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 10,
  p_limit int default 30
)
returns table (
  pharmacy_id bigint, name text, address text, city text,
  lat double precision, lng double precision, rating numeric,
  open_24h boolean, delivery boolean, stock int, price numeric,
  distance_km double precision
)
language sql stable
set search_path = public
as $$
  select * from (
    select p.id, p.name, p.address, p.city, p.lat, p.lng, p.rating,
           p.open_24h, p.delivery, i.stock, i.price,
           6371 * 2 * asin(sqrt(
             power(sin(radians(p.lat - p_lat) / 2), 2) +
             cos(radians(p_lat)) * cos(radians(p.lat)) *
             power(sin(radians(p.lng - p_lng) / 2), 2)
           )) as distance_km
    from public.inventory i
    join public.pharmacies p on p.id = i.pharmacy_id
    where i.medicine_id = p_medicine_id and i.stock > 0
  ) x
  where x.distance_km <= p_radius_km
  order by x.distance_km
  limit least(greatest(p_limit, 1), 100);
$$;

-- Same formula + same dosage form, one row per brand.
-- Same strength first, then cheapest per unit.
create function public.medicine_alternatives(p_medicine_id bigint, lim int default 8)
returns table (
  id bigint, product_name text, company text, pack_size text,
  mrp_pkr numeric, price_per_unit numeric, pharmacies_count bigint, strength text
)
language sql stable
set search_path = public
as $$
  with me as (select formula_key, dosage_form, name_lc,
                     lower(replace(coalesce(strength, ''), ' ', '')) as st
              from public.medicines where id = p_medicine_id),
  alts as (
    select distinct on (m.name_lc) m.*,
           (lower(replace(coalesce(m.strength, ''), ' ', '')) = me.st and me.st <> '') as same_strength
    from public.medicines m, me
    where m.formula_key = me.formula_key
      and coalesce(m.dosage_form, '') = coalesce(me.dosage_form, '')
      and coalesce(me.formula_key, '') <> ''
      and m.name_lc <> me.name_lc
    order by m.name_lc,
             (lower(replace(coalesce(m.strength, ''), ' ', '')) = me.st) desc,
             m.price_per_unit nulls last, m.mrp_pkr nulls last
  )
  select a.id, a.product_name, a.company, a.pack_size, a.mrp_pkr, a.price_per_unit,
         (select count(*) from public.inventory i where i.medicine_id = a.id and i.stock > 0),
         a.strength
  from alts a
  order by a.same_strength desc, a.price_per_unit nulls last, a.mrp_pkr nulls last
  limit least(greatest(lim, 1), 20);
$$;

create or replace function public.place_order(
  p_pharmacy_id bigint, p_medicine_id bigint, p_qty int,
  p_name text, p_phone text, p_address text, p_mode text
)
returns table (order_id uuid, total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price numeric;
  v_id uuid;
begin
  if p_qty is null or p_qty < 1 or p_qty > 20 then raise exception 'Quantity must be 1-20'; end if;
  if coalesce(length(trim(p_name)), 0) < 2 or length(p_name) > 80 then raise exception 'Invalid name'; end if;
  if p_phone !~ '^\+?[0-9 \-]{10,15}$' then raise exception 'Invalid phone number'; end if;
  if p_mode not in ('delivery','pickup') then raise exception 'Invalid mode'; end if;
  if p_mode = 'delivery' and coalesce(length(trim(p_address)), 0) < 5 then raise exception 'Address required for delivery'; end if;

  update public.inventory
     set stock = stock - p_qty
   where pharmacy_id = p_pharmacy_id and medicine_id = p_medicine_id and stock >= p_qty
  returning price into v_price;
  if not found then raise exception 'Not enough stock at this pharmacy'; end if;

  insert into public.orders (pharmacy_id, medicine_id, qty, customer_name, phone, address, mode, total)
  values (p_pharmacy_id, p_medicine_id, p_qty, trim(p_name), p_phone, left(p_address, 300), p_mode, v_price * p_qty)
  returning id into v_id;

  return query select v_id, v_price * p_qty;
end;
$$;

grant execute on function public.search_medicines(text, int) to anon, authenticated;
grant execute on function public.nearby_pharmacies(bigint, double precision, double precision, double precision, int) to anon, authenticated;
grant execute on function public.medicine_alternatives(bigint, int) to anon, authenticated;
grant execute on function public.place_order(bigint, bigint, int, text, text, text, text) to anon, authenticated;
