-- =====================================================================
-- DawaDhoondo — 07_orders_v2.sql
-- Courier delivery, order numbers, email confirmation, pharmacy actions,
-- order tracking. Run once in SQL Editor (safe to re-run).
-- =====================================================================

-- 1) Pharmacy email (demo pharmacies have none → emails go to PHARMACY_INBOX secret)
alter table public.pharmacies add column if not exists email text;

-- 2) Richer orders
alter table public.orders add column if not exists order_no       text;
alter table public.orders add column if not exists email          text;
alter table public.orders add column if not exists courier        text;
alter table public.orders add column if not exists subtotal       numeric(12,2);
alter table public.orders add column if not exists delivery_fee   numeric(12,2) default 0;
alter table public.orders add column if not exists distance_km    numeric(8,2);
alter table public.orders add column if not exists eta_text       text;
alter table public.orders add column if not exists pharmacy_token uuid default gen_random_uuid();
alter table public.orders add column if not exists emailed_at     timestamptz;
alter table public.orders add column if not exists confirmed_at   timestamptz;
alter table public.orders add column if not exists dispatched_at  timestamptz;
alter table public.orders add column if not exists delivered_at   timestamptz;
alter table public.orders add column if not exists cancelled_at   timestamptz;
create unique index if not exists orders_order_no on public.orders (order_no);

-- 3) Courier quotes for one pharmacy → customer location (single source of truth for fees)
create or replace function public.courier_quotes(
  p_pharmacy_id bigint, p_lat double precision, p_lng double precision
)
returns table (code text, name text, fee numeric, eta_text text, distance_km numeric)
language sql stable
set search_path = public
as $$
  with d as (
    select (6371 * 2 * asin(sqrt(
             power(sin(radians(p.lat - p_lat) / 2), 2) +
             cos(radians(p_lat)) * cos(radians(p.lat)) *
             power(sin(radians(p.lng - p_lng) / 2), 2))))::numeric as km
    from public.pharmacies p where p.id = p_pharmacy_id
  )
  select * from (
    select 'pickup'::text, 'Pickup from pharmacy'::text, 0::numeric, 'Ready in ~15 min'::text, round(km, 1) from d
    union all
    select 'rider', 'Pharmacy rider', round(80 + 15 * km), (25 + ceil(km * 4))::int || '–' || (40 + ceil(km * 4))::int || ' min', round(km, 1) from d where km <= 25
    union all
    select 'bykea', 'Bykea', round(120 + 20 * km), (20 + ceil(km * 3))::int || '–' || (35 + ceil(km * 3))::int || ' min', round(km, 1) from d where km <= 25
    union all
    select 'tcs', 'TCS same-day', 250, '4–6 hours', round(km, 1) from d where km <= 60
    union all
    select 'leopards', 'Leopards overnight', 200, 'Next day', round(km, 1) from d
  ) q;
$$;

-- 4) Place order v2: validates, picks courier fee server-side, decrements stock atomically
create or replace function public.place_order_v2(
  p_pharmacy_id bigint, p_medicine_id bigint, p_qty int,
  p_name text, p_phone text, p_email text, p_address text,
  p_courier text, p_lat double precision, p_lng double precision
)
returns table (order_id uuid, order_no text, subtotal numeric, delivery_fee numeric, total numeric, eta_text text, courier_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price numeric;
  v_q record;
  v_id uuid;
  v_no text;
  v_mode text := case when p_courier = 'pickup' then 'pickup' else 'delivery' end;
begin
  if p_qty is null or p_qty < 1 or p_qty > 20 then raise exception 'Quantity must be 1-20'; end if;
  if coalesce(length(trim(p_name)), 0) < 2 or length(p_name) > 80 then raise exception 'Please enter your full name'; end if;
  if p_phone !~ '^\+?[0-9 \-]{10,15}$' then raise exception 'Please enter a valid phone number (03xx xxxxxxx)'; end if;
  if p_email is not null and p_email <> '' and p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please enter a valid email'; end if;
  if v_mode = 'delivery' and coalesce(length(trim(p_address)), 0) < 5 then raise exception 'Delivery address is required'; end if;

  select * into v_q from public.courier_quotes(p_pharmacy_id, p_lat, p_lng) q where q.code = p_courier;
  if not found then raise exception 'This delivery option is not available for this pharmacy'; end if;

  update public.inventory
     set stock = stock - p_qty
   where pharmacy_id = p_pharmacy_id and medicine_id = p_medicine_id and stock >= p_qty
  returning price into v_price;
  if not found then raise exception 'Not enough stock at this pharmacy'; end if;

  loop
    v_no := 'DD-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.orders o where o.order_no = v_no);
  end loop;

  insert into public.orders (pharmacy_id, medicine_id, qty, customer_name, phone, email, address, mode,
                             courier, subtotal, delivery_fee, total, distance_km, eta_text, order_no)
  values (p_pharmacy_id, p_medicine_id, p_qty, trim(p_name), p_phone, nullif(trim(p_email), ''), left(p_address, 300), v_mode,
          v_q.name, v_price * p_qty, v_q.fee, v_price * p_qty + v_q.fee, v_q.distance_km, v_q.eta_text, v_no)
  returning id into v_id;

  return query select v_id, v_no, v_price * p_qty, v_q.fee, v_price * p_qty + v_q.fee, v_q.eta_text, v_q.name;
end;
$$;

-- 5) Track an order: needs order number + the same phone number (privacy)
create or replace function public.get_order(p_order_no text, p_phone text)
returns table (
  order_no text, status text, medicine text, qty int, pharmacy text, pharmacy_address text,
  courier text, mode text, subtotal numeric, delivery_fee numeric, total numeric, eta_text text,
  created_at timestamptz, confirmed_at timestamptz, dispatched_at timestamptz,
  delivered_at timestamptz, cancelled_at timestamptz
)
language sql stable
security definer
set search_path = public
as $$
  select o.order_no, o.status, m.product_name, o.qty, p.name, p.address,
         o.courier, o.mode, o.subtotal, o.delivery_fee, o.total, o.eta_text,
         o.created_at, o.confirmed_at, o.dispatched_at, o.delivered_at, o.cancelled_at
  from public.orders o
  join public.medicines m on m.id = o.medicine_id
  join public.pharmacies p on p.id = o.pharmacy_id
  where upper(o.order_no) = upper(trim(p_order_no))
    and right(regexp_replace(o.phone, '\D', '', 'g'), 10) = right(regexp_replace(p_phone, '\D', '', 'g'), 10);
$$;

grant execute on function public.courier_quotes(bigint, double precision, double precision) to anon, authenticated;
grant execute on function public.place_order_v2(bigint, bigint, int, text, text, text, text, text, double precision, double precision) to anon, authenticated;
grant execute on function public.get_order(text, text) to anon, authenticated;
