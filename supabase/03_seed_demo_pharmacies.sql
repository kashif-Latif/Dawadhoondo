-- =====================================================================
-- DawaDhoondo — 03_seed_demo_pharmacies.sql
-- DEMO DATA: ~150 pharmacies across 15 Pakistani cities + stock.
-- Pharmacy names/locations are generated (is_demo = true).
-- Run AFTER 02_load_medicines.sql. Safe to re-run (wipes demo data).
-- =====================================================================

delete from public.orders;
delete from public.inventory;
delete from public.pharmacies where is_demo;

with cities(city, lat, lng, n, spread, areas) as (
  values
  ('Lahore',     31.5204, 74.3587, 30, 0.12, array['Gulberg','DHA','Johar Town','Model Town','Liberty','Iqbal Town','Township','Wapda Town','Bahria Town','Shadman','Garden Town','Faisal Town']),
  ('Karachi',    24.8607, 67.0011, 30, 0.16, array['Clifton','DHA','Gulshan-e-Iqbal','North Nazimabad','PECHS','Saddar','Gulistan-e-Johar','Tariq Road','Korangi','Bahadurabad']),
  ('Islamabad',  33.6844, 73.0479, 15, 0.08, array['F-6','F-7','F-10','G-9','G-11','I-8','Blue Area','E-11','DHA Phase 2']),
  ('Rawalpindi', 33.5651, 73.0169, 10, 0.07, array['Saddar','Satellite Town','Bahria Town','Chaklala','Committee Chowk','Westridge']),
  ('Faisalabad', 31.4504, 73.1350, 10, 0.07, array['D Ground','Madina Town','Peoples Colony','Susan Road','Jinnah Colony','Gulberg']),
  ('Multan',     30.1575, 71.5249,  8, 0.06, array['Cantt','Gulgasht','Bosan Road','Shah Rukn-e-Alam','New Multan']),
  ('Peshawar',   34.0151, 71.5249,  8, 0.06, array['University Town','Hayatabad','Saddar','Gulbahar','Ring Road']),
  ('Quetta',     30.1798, 66.9750,  6, 0.05, array['Jinnah Road','Satellite Town','Samungli Road','Cantt']),
  ('Sialkot',    32.4945, 74.5229,  5, 0.04, array['Cantt','Paris Road','Model Town','Kashmir Road']),
  ('Gujranwala', 32.1877, 74.1945,  6, 0.05, array['Satellite Town','Model Town','GT Road','Peoples Colony']),
  ('Hyderabad',  25.3960, 68.3578,  6, 0.05, array['Latifabad','Qasimabad','Saddar','Auto Bhan Road']),
  ('Bahawalpur', 29.3544, 71.6911,  4, 0.04, array['Model Town','Satellite Town','Cantt']),
  ('Sargodha',   32.0836, 72.6711,  4, 0.04, array['Satellite Town','University Road','Cantt']),
  ('Abbottabad', 34.1688, 73.2215,  4, 0.04, array['Mansehra Road','Jinnahabad','Supply Bazaar']),
  ('Sukkur',     27.7052, 68.8574,  4, 0.04, array['Military Road','Barrage Road','Minara Road'])
),
prefixes as (
  select array['Al-Shifa','Sehat','Care Plus','Hayat','Noor','Medicare','Green Cross','City',
               'Life Line','Rehmat','Prime','Wellness','Health Hub','Shifa Plus','Family',
               'Al-Rehman','Madina','Fazal','Ibn-e-Sina','Rahat'] as p
)
insert into public.pharmacies (name, city, address, lat, lng, rating, open_24h, delivery, is_demo)
select
  pr.p[1 + floor(random() * array_length(pr.p, 1))::int] || ' Pharmacy',
  c.city,
  c.areas[1 + floor(random() * array_length(c.areas, 1))::int] || ', ' || c.city,
  c.lat + (random() - 0.5) * c.spread,
  c.lng + (random() - 0.5) * c.spread,
  round((3.5 + random() * 1.5)::numeric, 1),
  random() < 0.3,
  random() < 0.75,
  true
from cities c
cross join lateral generate_series(1, c.n) g
cross join prefixes pr;

-- Stock: common medicines in ~35% of pharmacies, everything else ~3%.
insert into public.inventory (pharmacy_id, medicine_id, stock, price)
select p.id,
       m.id,
       1 + floor(random() * 80)::int,
       round(coalesce(m.mrp_pkr, 0) * (0.90 + random() * 0.10)::numeric, 2)
from public.pharmacies p
cross join public.medicines m
-- per (pharmacy, medicine) pseudo-random draw; plain random() here gets
-- pushed down by the planner and evaluated once per medicine.
where (abs(hashtext(p.id::text || ':' || m.id::text)) % 10000) <
      case when m.is_common then 3500 else 300 end;

analyze public.pharmacies;
analyze public.inventory;

-- Check
select (select count(*) from public.pharmacies) as pharmacies,
       (select count(*) from public.inventory)  as stock_rows;
