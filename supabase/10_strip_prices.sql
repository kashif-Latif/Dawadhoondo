-- =====================================================================
-- DawaDhoondo — 10_strip_prices.sql   (run AFTER 07_orders_v2.sql; safe to re-run)
-- Customers buy tablets/capsules by the STRIP, not the box.
--  * strip_size per medicine (from the pack text: "10 x 10's" → 10, "3x7's" → 7, else 10)
--  * search returns strip_size + pack_units so the app can show "Rs 38 / strip of 10"
--  * orders can be placed per strip (p_pack = 'strip') or per full pack
-- =====================================================================

alter table public.medicines add column if not exists strip_size int;

update public.medicines set strip_size = case
  when coalesce(dosage_form, '') not in ('Tablet', 'Capsule') or coalesce(pack_units, 0) < 2 then null
  when pack_size ~* '(\d+)\s*x\s*(\d+)' then least((regexp_match(pack_size, '(\d+)\s*[xX]\s*(\d+)'))[2]::int, pack_units)
  when pack_units <= 15 then pack_units
  else 10
end;

-- ---------- search: + pack_units, strip_size ----------
drop function if exists public.search_medicines(text, int);
create function public.search_medicines(q text, lim int default 12)
returns table (
  id bigint, product_name text, generic_composition text, company text,
  pack_size text, mrp_pkr numeric, score real,
  generic_name text, strength text, dosage_form text, rx_status text, price_per_unit numeric,
  is_controlled boolean, pack_units int, strip_size int
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
             - case when c.is_controlled then 0.10 else 0 end
             + case when c.dosage_form in ('Tablet', 'Capsule') then 0.06
                    when c.dosage_form in ('Injection', 'Infusion') then -0.06 else 0 end as rnk
    from cand c
  ),
  one_per_brand as (
    -- one row per brand: the smallest retail pack (what people actually buy)
    select distinct on (r.name_lc) r.*
    from ranked r
    order by r.name_lc, r.pack_units nulls last, r.mrp_pkr nulls last
  )
  select h.id, h.product_name, h.generic_name, h.company, h.pack_size, h.mrp_pkr,
         greatest(h.base, case when h.prefix then 0.8 else 0 end, h.lev * 0.9)::real as score,
         h.generic_name, h.strength, h.dosage_form, h.rx_status, h.price_per_unit, h.is_controlled,
         h.pack_units, h.strip_size
  from one_per_brand h
  order by h.rnk desc,
           coalesce(h.dosage_form in ('Tablet', 'Capsule'), false) desc,
           length(h.product_name), h.product_name
  limit least(greatest(lim, 1), 50);
$$;
grant execute on function public.search_medicines(text, int) to anon, authenticated;

-- ---------- orders per strip ----------
alter table public.orders add column if not exists pack_choice text not null default 'pack';
alter table public.orders add column if not exists unit_label text;

drop function if exists public.place_order_v2(bigint, bigint, int, text, text, text, text, text, double precision, double precision);
drop function if exists public.place_order_v2(bigint, bigint, int, text, text, text, text, text, double precision, double precision, text);
create function public.place_order_v2(
  p_pharmacy_id bigint, p_medicine_id bigint, p_qty int,
  p_name text, p_phone text, p_email text, p_address text,
  p_courier text, p_lat double precision, p_lng double precision,
  p_pack text default 'pack'
)
returns table (order_id uuid, order_no text, subtotal numeric, delivery_fee numeric, total numeric,
               eta_text text, courier_name text, unit_label text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack_price numeric; v_stock int; v_unit_price numeric; v_take int; v_label text;
  v_q record; v_m record; v_id uuid; v_no text;
  v_mode text := case when p_courier = 'pickup' then 'pickup' else 'delivery' end;
begin
  if p_qty is null or p_qty < 1 or p_qty > 20 then raise exception 'Quantity must be 1-20'; end if;
  if coalesce(length(trim(p_name)), 0) < 2 or length(p_name) > 80 then raise exception 'Please enter your full name'; end if;
  if p_phone !~ '^\+?[0-9 \-]{10,15}$' then raise exception 'Please enter a valid phone number (03xx xxxxxxx)'; end if;
  if p_email is not null and p_email <> '' and p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please enter a valid email'; end if;
  if v_mode = 'delivery' and coalesce(length(trim(p_address)), 0) < 5 then raise exception 'Delivery address is required'; end if;
  if p_pack not in ('pack', 'strip') then raise exception 'Invalid pack choice'; end if;

  select * into v_m from public.medicines where id = p_medicine_id;
  if not found then raise exception 'Medicine not found'; end if;

  select * into v_q from public.courier_quotes(p_pharmacy_id, p_lat, p_lng) q where q.code = p_courier;
  if not found then raise exception 'This delivery option is not available for this pharmacy'; end if;

  select i.price, i.stock into v_pack_price, v_stock
  from public.inventory i where i.pharmacy_id = p_pharmacy_id and i.medicine_id = p_medicine_id
  for update;
  if not found then raise exception 'This pharmacy does not stock this medicine'; end if;

  if p_pack = 'strip' and coalesce(v_m.strip_size, 0) > 1 and v_m.pack_units > v_m.strip_size then
    v_unit_price := round(v_pack_price / v_m.pack_units * v_m.strip_size, 2);
    v_take := ceil(p_qty * v_m.strip_size::numeric / v_m.pack_units)::int;   -- packs opened
    v_label := p_qty || case when p_qty = 1 then ' strip' else ' strips' end || ' of ' || v_m.strip_size;
  else
    v_unit_price := v_pack_price;
    v_take := p_qty;
    v_label := p_qty || ' × pack of ' || coalesce(v_m.pack_size, '1');
  end if;
  if v_stock < v_take then raise exception 'Not enough stock at this pharmacy'; end if;
  update public.inventory set stock = stock - v_take where pharmacy_id = p_pharmacy_id and medicine_id = p_medicine_id;

  loop
    v_no := 'DD-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.orders o where o.order_no = v_no);
  end loop;

  insert into public.orders (pharmacy_id, medicine_id, qty, customer_name, phone, email, address, mode,
                             courier, subtotal, delivery_fee, total, distance_km, eta_text, order_no, pack_choice, unit_label)
  values (p_pharmacy_id, p_medicine_id, p_qty, trim(p_name), p_phone, nullif(trim(p_email), ''), left(p_address, 300), v_mode,
          v_q.name, v_unit_price * p_qty, v_q.fee, v_unit_price * p_qty + v_q.fee, v_q.distance_km, v_q.eta_text, v_no, p_pack, v_label)
  returning id into v_id;

  return query select v_id, v_no, v_unit_price * p_qty, v_q.fee, v_unit_price * p_qty + v_q.fee, v_q.eta_text, v_q.name, v_label;
end;
$$;
grant execute on function public.place_order_v2(bigint, bigint, int, text, text, text, text, text, double precision, double precision, text) to anon, authenticated;

-- tracking shows "2 strips of 10" instead of a bare number
drop function if exists public.get_order(text, text);
create function public.get_order(p_order_no text, p_phone text)
returns table (
  order_no text, status text, medicine text, qty int, pharmacy text, pharmacy_address text,
  courier text, mode text, subtotal numeric, delivery_fee numeric, total numeric, eta_text text,
  created_at timestamptz, confirmed_at timestamptz, dispatched_at timestamptz,
  delivered_at timestamptz, cancelled_at timestamptz, unit_label text
)
language sql stable
security definer
set search_path = public
as $$
  select o.order_no, o.status, m.product_name, o.qty, p.name, p.address,
         o.courier, o.mode, o.subtotal, o.delivery_fee, o.total, o.eta_text,
         o.created_at, o.confirmed_at, o.dispatched_at, o.delivered_at, o.cancelled_at, o.unit_label
  from public.orders o
  join public.medicines m on m.id = o.medicine_id
  join public.pharmacies p on p.id = o.pharmacy_id
  where upper(o.order_no) = upper(trim(p_order_no))
    and right(regexp_replace(o.phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10);
$$;
grant execute on function public.get_order(text, text) to anon, authenticated;

select count(*) filter (where strip_size is not null) as strip_medicines,
       count(*) filter (where strip_size = 10) as strips_of_10,
       count(*) filter (where strip_size = 7) as strips_of_7
from public.medicines;
