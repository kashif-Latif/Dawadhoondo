-- Run once in SQL Editor (fixes repeated brands in alternatives). Safe to re-run.
drop function if exists public.medicine_alternatives(bigint, int);
-- Same formula + same dosage form, one row per brand, cheapest per unit first
create function public.medicine_alternatives(p_medicine_id bigint, lim int default 8)
returns table (
  id bigint, product_name text, company text, pack_size text,
  mrp_pkr numeric, price_per_unit numeric, pharmacies_count bigint
)
language sql stable
set search_path = public
as $$
  with me as (select formula_key, dosage_form, name_lc from public.medicines where id = p_medicine_id),
  alts as (
    select distinct on (m.name_lc) m.*
    from public.medicines m, me
    where m.formula_key = me.formula_key
      and coalesce(m.dosage_form, '') = coalesce(me.dosage_form, '')
      and coalesce(me.formula_key, '') <> ''
      and m.name_lc <> me.name_lc
    order by m.name_lc, m.price_per_unit nulls last, m.mrp_pkr nulls last
  )
  select a.id, a.product_name, a.company, a.pack_size, a.mrp_pkr, a.price_per_unit,
         (select count(*) from public.inventory i where i.medicine_id = a.id and i.stock > 0)
  from alts a
  order by a.price_per_unit nulls last, a.mrp_pkr nulls last
  limit least(greatest(lim, 1), 20);
$$;

grant execute on function public.medicine_alternatives(bigint, int) to anon, authenticated;
