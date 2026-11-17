-- =====================================================================
-- DawaDhoondo — 08_search_safety_areas.sql   (run once; safe to re-run)
--  1. Better ranking: typed-prefix + first-word spelling distance first
--     ("pandol" → Panadol, not Andol/tramadol)
--  2. Rx / controlled-medicine flags; controlled medicines can't be ordered online
--  3. Pharmacy area names that match where each pin actually is
--  4. Rate limiting table for the AI functions
-- =====================================================================

create extension if not exists fuzzystrmatch with schema extensions;

-- ---------- 2. Prescription status ----------
alter table public.medicines add column if not exists is_controlled boolean not null default false;

-- Controlled (narcotic / psychotropic) — prescription + in-person only
update public.medicines set is_controlled = (
  coalesce(formula_key, '') || ' ' || lower(product_name)) ~
  '(tramadol|tapentadol|codeine|morphine|pethidine|meperidine|nalbuphine|buprenorphine|fentanyl|methadone|pentazocine|oxycodone|hydrocodone|dextropropoxyphene|alprazolam|bromazepam|clonazepam|diazepam|lorazepam|midazolam|chlordiazepoxide|oxazepam|temazepam|nitrazepam|clobazam|zolpidem|zopiclone|phenobarbit|ketamine|methylphenidate)';

-- OTC allow-list (common self-care medicines); everything else is Rx.
-- Injections/infusions and controlled medicines are always Rx.
update public.medicines set rx_status = case
  when is_controlled then 'Rx'
  when coalesce(dosage_form, '') in ('Injection', 'Infusion', 'Vaccine') then 'Rx'
  when coalesce(formula_key, '') <> '' and formula_key !~
    '(amoxicillin|azithromycin|cipro|levoflox|cef|metronidazole|clarithro|doxy|predniso|dexameth|betameth|insulin|metformin|amlodipine|losartan|atorvastatin|warfarin|clopidogrel)'
   and formula_key ~
    '^((paracetamol|ibuprofen|aspirin|caffeine|cetirizine|levocetirizine|loratadine|desloratadine|fexofenadine|chlorpheniramine|pheniramine|pseudoephedrine|phenylephrine|dextromethorphan|guaifenesin|ambroxol|bromhexine|xylometazoline|oxymetazoline|simethicone|aluminium hydroxide|magnesium hydroxide|magnesium trisilicate|sodium bicarbonate|calcium carbonate|loperamide|bisacodyl|lactulose|ispaghula|glycerin|oral rehydration|sodium chloride|potassium chloride|glucose|dextrose anhydrous|zinc|vitamin|ascorbic|cholecalciferol|calcium|folic|ferrous|iron|multivitamin|cyanocobalamin|thiamine|pyridoxine|clotrimazole|miconazole|permethrin|zinc oxide|menthol|camphor|benzocaine|lidocaine|chlorhexidine|povidone)[a-z0-9 \-]*)( \+ (paracetamol|ibuprofen|aspirin|caffeine|cetirizine|chlorpheniramine|pheniramine|pseudoephedrine|phenylephrine|dextromethorphan|guaifenesin|ambroxol|bromhexine|simethicone|aluminium hydroxide|magnesium hydroxide|menthol|vitamin|zinc|calcium|folic|ferrous|iron|cholecalciferol)[a-z0-9 \-]*)*$'
  then 'OTC'
  else 'Rx'
end;

-- ---------- 1. Search ranking ----------
drop function if exists public.search_medicines(text, int);
create function public.search_medicines(q text, lim int default 12)
returns table (
  id bigint, product_name text, generic_composition text, company text,
  pack_size text, mrp_pkr numeric, score real,
  generic_name text, strength text, dosage_form text, rx_status text, price_per_unit numeric,
  is_controlled boolean
)
language sql stable
set search_path = public, extensions
set pg_trgm.similarity_threshold = 0.2
set pg_trgm.word_similarity_threshold = 0.35
as $$
  with qq as (
    select lower(trim(q)) as t,
           split_part(lower(trim(q)), ' ', 1) as w
  ),
  cand as (
    select m.*,
           greatest(word_similarity(qq.t, m.name_lc), similarity(qq.t, m.name_lc),
                    word_similarity(qq.t, m.generic_lc) * 0.9)::real as base,
           (m.name_lc like qq.w || '%')                                 as prefix,
           (left(m.name_lc, 1) = left(qq.w, 1))                          as same_first,
           (dmetaphone(split_part(m.name_lc, ' ', 1)) = dmetaphone(qq.w))  as sounds_like,
           1 - levenshtein(left(split_part(m.name_lc, ' ', 1), 60), left(qq.w, 60))::real
             / greatest(length(split_part(m.name_lc, ' ', 1)), length(qq.w), 1) as lev
    from public.medicines m, qq
    where length(qq.t) >= 2
      and (qq.t <% m.name_lc or qq.t % m.name_lc or qq.t <% m.generic_lc
           or m.name_lc like qq.w || '%'
           or (length(qq.w) >= 4 and dmetaphone(split_part(m.name_lc, ' ', 1)) = dmetaphone(qq.w)))
  ),
  ranked as (
    select c.*,
           c.base * 0.45 + greatest(c.lev, 0) * 0.30
             + case when c.prefix then 0.25 else 0 end
             + case when c.same_first then 0.10 else 0 end
             + case when c.sounds_like then 0.15 else 0 end
             + case when c.is_common then 0.05 else 0 end
             - case when c.is_controlled then 0.10 else 0 end as rnk
    from cand c
  ),
  one_per_brand as (
    select distinct on (r.name_lc) r.*
    from ranked r
    order by r.name_lc, r.mrp_pkr nulls last
  )
  select h.id, h.product_name, h.generic_name, h.company, h.pack_size, h.mrp_pkr,
         greatest(h.base, case when h.prefix then 0.8 else 0 end, h.lev * 0.9)::real as score,
         h.generic_name, h.strength, h.dosage_form, h.rx_status, h.price_per_unit, h.is_controlled
  from one_per_brand h
  order by h.rnk desc,
           coalesce(h.dosage_form in ('Tablet', 'Capsule'), false) desc,
           length(h.product_name), h.product_name
  limit least(greatest(lim, 1), 50);
$$;
grant execute on function public.search_medicines(text, int) to anon, authenticated;

-- Controlled medicines cannot be ordered online
create or replace function public.block_controlled_orders()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.medicines where id = new.medicine_id and is_controlled) then
    raise exception 'This is a controlled medicine. It can only be bought in person at the pharmacy with a valid prescription.';
  end if;
  return new;
end $$;
drop trigger if exists orders_block_controlled on public.orders;
create trigger orders_block_controlled before insert on public.orders
  for each row execute function public.block_controlled_orders();

-- ---------- 3. Area names that match the pin ----------
create table if not exists public.areas (
  city text not null, name text not null,
  lat double precision not null, lng double precision not null,
  primary key (city, name)
);
alter table public.areas enable row level security;
insert into public.areas (city, name, lat, lng) values
  ('Lahore','Gulberg III',31.5120,74.3450), ('Lahore','Liberty / Gulberg',31.5104,74.3416),
  ('Lahore','Model Town',31.4840,74.3240), ('Lahore','Garden Town',31.5020,74.3230),
  ('Lahore','Faisal Town',31.4790,74.3060), ('Lahore','Johar Town',31.4697,74.2728),
  ('Lahore','Allama Iqbal Town',31.5100,74.2900), ('Lahore','Shadman',31.5390,74.3290),
  ('Lahore','Township',31.4520,74.3080), ('Lahore','DHA',31.4730,74.4000),
  ('Lahore','Cantt',31.5230,74.3900), ('Lahore','Anarkali',31.5650,74.3100),
  ('Lahore','Mall Road',31.5580,74.3260), ('Lahore','Samanabad',31.5340,74.2980),
  ('Lahore','Walled City',31.5820,74.3180), ('Lahore','Mughalpura',31.5690,74.3740),
  ('Lahore','Ichhra',31.5290,74.3120), ('Lahore','Kot Lakhpat',31.4690,74.3320),
  ('Lahore','Shadbagh',31.5790,74.3420), ('Lahore','Garhi Shahu',31.5560,74.3480),
  ('Lahore','Askari / Walton',31.4980,74.3640), ('Lahore','Barki Road',31.5000,74.4300),
  ('Lahore','Harbanspura',31.5700,74.4100), ('Lahore','Wahdat Road',31.5180,74.2920)
on conflict do nothing;

-- Lahore: nearest neighbourhood. Other cities: city name only (honest, no fake areas).
update public.pharmacies p
   set address = coalesce((
     select 'Near ' || a.name || ', ' || p.city
     from public.areas a
     where a.city = p.city
       and (6371 * 2 * asin(sqrt(power(sin(radians(a.lat - p.lat) / 2), 2) +
            cos(radians(p.lat)) * cos(radians(a.lat)) * power(sin(radians(a.lng - p.lng) / 2), 2)))) <= 2.5
     order by power(a.lat - p.lat, 2) + power((a.lng - p.lng) * cos(radians(p.lat)), 2)
     limit 1), p.city)
 where p.is_demo;

-- ---------- 4. Rate limiting for AI endpoints ----------
create table if not exists public.api_hits (
  key text not null,
  at  timestamptz not null default now()
);
create index if not exists api_hits_key_at on public.api_hits (key, at);
alter table public.api_hits enable row level security;  -- no public access

-- true = allowed. Only callable with the service-role key (edge functions).
create or replace function public.rate_ok(p_key text, p_per_min int, p_per_day int)
returns boolean language plpgsql security definer set search_path = public as $$
declare n_min int; n_day int;
begin
  delete from public.api_hits where at < now() - interval '1 day';
  select count(*) filter (where at > now() - interval '1 minute'), count(*)
    into n_min, n_day from public.api_hits where key = p_key;
  if n_min >= p_per_min or n_day >= p_per_day then return false; end if;
  insert into public.api_hits (key) values (p_key);
  return true;
end $$;
revoke all on function public.rate_ok(text, int, int) from public, anon, authenticated;

analyze public.medicines;
select
  (select count(*) from public.medicines where is_controlled) as controlled,
  (select count(*) from public.medicines where rx_status = 'OTC') as otc,
  (select count(*) from public.medicines where rx_status = 'Rx') as rx;
