-- =====================================================================
-- DawaDhoondo — 02_load_medicines.sql  (v2)
-- Run AFTER importing pakistan_medicines_supabase.csv into the table
-- "medicines_import" (Table Editor → medicines_import → Insert →
-- Import data from CSV). Copies typed rows into "medicines".
-- =====================================================================

truncate public.medicines restart identity cascade;

insert into public.medicines
  (product_name, generic_name, generic_composition, formula_key, strength, dosage_form,
   company, licence, reg_no, category, pack_size, pack_units, mrp_pkr, price_per_unit,
   effective_from, rx_status, indication, is_common, source, search_text)
select distinct on (trim(product_name), reg_no, pack_size, mrp_pkr)   -- safe if CSV was imported twice
  trim(product_name),
  nullif(trim(generic_name), ''),
  nullif(trim(generic_composition), ''),
  nullif(trim(formula_key), ''),
  nullif(trim(strength), ''),
  nullif(trim(dosage_form), ''),
  nullif(trim(company), ''),
  nullif(trim(licence), ''),
  nullif(trim(reg_no), ''),
  nullif(trim(category), ''),
  nullif(trim(pack_size), ''),
  nullif(trim(pack_units), '')::int,
  nullif(trim(mrp_pkr), '')::numeric,
  nullif(trim(price_per_unit), '')::numeric,
  nullif(trim(effective_from), '')::date,
  nullif(trim(rx_status), ''),
  nullif(trim(indication), ''),
  coalesce(lower(trim(is_common)) = 'true', false),
  nullif(trim(source), ''),
  nullif(trim(search_text), '')
from public.medicines_import
where coalesce(trim(product_name), '') <> ''
order by trim(product_name), reg_no, pack_size, mrp_pkr;

analyze public.medicines;

-- Optional: free the staging table once loaded
-- truncate public.medicines_import;

select count(*) as medicines,
       count(*) filter (where is_common) as common,
       count(*) filter (where mrp_pkr is not null) as with_price
from public.medicines;
