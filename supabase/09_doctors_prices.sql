-- =====================================================================
-- DawaDhoondo — 09_doctors_prices.sql   (run once; safe to re-run)
--  1. Real prices: pharmacy price = official DRAP maximum retail price
--  2. Mini Doctor: hospitals/clinics, doctors, schedules, appointments
--     (all DEMO data, clearly flagged is_demo)
-- Requires 08_search_safety_areas.sql (areas table) to have been run.
-- =====================================================================

-- ---------- 1. Real prices ----------
update public.inventory i set price = m.mrp_pkr
from public.medicines m where m.id = i.medicine_id and i.price is distinct from m.mrp_pkr;

-- ---------- 2. Facilities ----------
create table if not exists public.facilities (
  id        bigint generated always as identity primary key,
  name      text not null,
  kind      text not null check (kind in ('hospital', 'clinic')),
  city      text not null,
  address   text,
  lat       double precision not null,
  lng       double precision not null,
  emergency boolean not null default false,
  open_24h  boolean not null default false,
  rating    numeric(2,1),
  is_demo   boolean not null default true
);

create table if not exists public.doctors (
  id            bigint generated always as identity primary key,
  name          text not null,
  gender        text,
  specialty     text not null,
  qualifications text,
  experience_yrs int,
  fee_pkr       int not null,
  facility_id   bigint not null references public.facilities(id) on delete cascade,
  days          int[] not null,            -- 0=Sun … 6=Sat
  start_time    time not null,
  end_time      time not null,
  slot_minutes  int not null default 20,
  rating        numeric(2,1),
  reviews       int,
  languages     text default 'Urdu, English',
  is_demo       boolean not null default true
);
create index if not exists doctors_specialty on public.doctors (specialty);

create table if not exists public.appointments (
  id           uuid primary key default gen_random_uuid(),
  appt_no      text unique not null,
  doctor_id    bigint not null references public.doctors(id),
  starts_at    timestamptz not null,
  patient_name text not null,
  phone        text not null,
  email        text,
  reason       text,
  status       text not null default 'booked' check (status in ('booked', 'cancelled', 'completed')),
  token        uuid not null default gen_random_uuid(),
  emailed_at   timestamptz,
  created_at   timestamptz not null default now()
);
create unique index if not exists appointments_no_double_booking
  on public.appointments (doctor_id, starts_at) where status <> 'cancelled';

alter table public.facilities   enable row level security;
alter table public.doctors      enable row level security;
alter table public.appointments enable row level security;   -- no public access
drop policy if exists "public read facilities" on public.facilities;
drop policy if exists "public read doctors" on public.doctors;
create policy "public read facilities" on public.facilities for select to anon, authenticated using (true);
create policy "public read doctors"    on public.doctors    for select to anon, authenticated using (true);

-- ---------- Seed demo facilities + doctors (only when empty) ----------
do $$
declare
  c record; f_id bigint; i int; j int; n_docs int; spec text; fem boolean;
  specs text[] := array['General Physician','General Physician','General Physician','Pediatrician','Gynecologist',
    'Dermatologist','ENT Specialist','Cardiologist','Gastroenterologist','Orthopedic Surgeon','Neurologist',
    'Psychiatrist','Pulmonologist','Endocrinologist','Urologist','Eye Specialist','Dentist','Nephrologist'];
  quals jsonb := '{"General Physician":"MBBS, FCPS (Medicine)","Pediatrician":"MBBS, FCPS (Paediatrics)","Gynecologist":"MBBS, FCPS (Obs & Gynae)",
    "Dermatologist":"MBBS, FCPS (Dermatology)","ENT Specialist":"MBBS, FCPS (ENT)","Cardiologist":"MBBS, FCPS (Cardiology)",
    "Gastroenterologist":"MBBS, FCPS (Gastroenterology)","Orthopedic Surgeon":"MBBS, FCPS (Orthopaedics)","Neurologist":"MBBS, FCPS (Neurology)",
    "Psychiatrist":"MBBS, FCPS (Psychiatry)","Pulmonologist":"MBBS, FCPS (Pulmonology)","Endocrinologist":"MBBS, FCPS (Endocrinology)",
    "Urologist":"MBBS, FCPS (Urology)","Eye Specialist":"MBBS, FCPS (Ophthalmology)","Dentist":"BDS, FCPS (Operative Dentistry)",
    "Nephrologist":"MBBS, FCPS (Nephrology)"}';
  male text[]   := array['Ahmed','Usman','Bilal','Hamza','Imran','Faisal','Kamran','Salman','Adeel','Zeeshan','Waqas','Asad','Haris','Junaid','Tariq','Omer'];
  female text[] := array['Ayesha','Fatima','Sana','Hira','Maryam','Amna','Saima','Nadia','Rabia','Zainab','Sadia','Mahnoor','Iqra','Farah','Sobia','Anam'];
  last text[]   := array['Khan','Malik','Qureshi','Butt','Sheikh','Chaudhry','Raza','Siddiqui','Hussain','Iqbal','Akhtar','Javed','Mirza','Aslam','Rehman','Farooq'];
  pre text[]    := array['CarePoint','MediCity','HealWell','Sehatmand','Rahma','Shafa Care','Wellspring','Family Health','Lifeline Care','Medix'];
begin
  if exists (select 1 from public.facilities) then return; end if;

  for c in select * from (values
      ('Lahore', 31.5204, 74.3587, 14, 0.11), ('Karachi', 24.9200, 67.0750, 10, 0.09),
      ('Islamabad', 33.6844, 73.0479, 6, 0.07), ('Rawalpindi', 33.5651, 73.0169, 4, 0.06),
      ('Faisalabad', 31.4504, 73.1350, 3, 0.06), ('Multan', 30.1575, 71.5249, 3, 0.05),
      ('Peshawar', 34.0151, 71.5249, 3, 0.05), ('Quetta', 30.1798, 66.9750, 2, 0.04),
      ('Gujranwala', 32.1877, 74.1945, 2, 0.04), ('Hyderabad', 25.3960, 68.3578, 2, 0.04),
      ('Sialkot', 32.4945, 74.5229, 2, 0.04)
    ) as t(city, lat, lng, n, spread)
  loop
    for i in 1..c.n loop
      insert into public.facilities (name, kind, city, lat, lng, emergency, open_24h, rating)
      values (
        pre[1 + floor(random() * array_length(pre, 1))::int] ||
          case when i % 3 = 0 then ' Hospital' when i % 3 = 1 then ' Medical Centre' else ' Clinic' end,
        case when i % 3 = 0 then 'hospital' else 'clinic' end,
        c.city,
        c.lat + (random() - 0.5) * c.spread,
        c.lng + (random() - 0.5) * c.spread,
        i % 3 = 0, i % 3 = 0,
        round((3.8 + random() * 1.2)::numeric, 1))
      returning id into f_id;

      n_docs := case when i % 3 = 0 then 6 else 3 end;
      for j in 1..n_docs loop
        spec := case when j = 1 then 'General Physician' else specs[1 + floor(random() * array_length(specs, 1))::int] end;
        fem := spec = 'Gynecologist' or random() < 0.45;
        insert into public.doctors (name, gender, specialty, qualifications, experience_yrs, fee_pkr, facility_id,
                                    days, start_time, end_time, slot_minutes, rating, reviews)
        values (
          'Dr. ' || (case when fem then female[1 + floor(random() * 16)::int] else male[1 + floor(random() * 16)::int] end)
                 || ' ' || last[1 + floor(random() * 16)::int],
          case when fem then 'F' else 'M' end,
          spec,
          quals ->> spec,
          4 + floor(random() * 22)::int,
          case when spec = 'General Physician' then 1000 + 250 * floor(random() * 5)::int
               when spec = 'Dentist' then 1500 + 500 * floor(random() * 3)::int
               else 2000 + 500 * floor(random() * 6)::int end,
          f_id,
          case floor(random() * 3)::int when 0 then array[1,2,3,4,5,6] when 1 then array[1,3,5,6] else array[2,4,6,0] end,
          case when random() < 0.5 then time '10:00' else time '17:00' end,
          case when random() < 0.5 then time '13:00' else time '14:00' end
            + case when random() < 0.5 then interval '0' else interval '7 hours' end,
          case when random() < 0.5 then 15 else 20 end,
          round((4.0 + random()) ::numeric, 1),
          20 + floor(random() * 480)::int);
      end loop;
    end loop;
  end loop;

  -- keep evening doctors' end after start
  update public.doctors set end_time = start_time + interval '4 hours' where end_time <= start_time;
end $$;

-- Lahore facilities named after the nearest neighbourhood (same as pharmacies)
update public.facilities f
   set address = coalesce((
     select 'Near ' || a.name || ', ' || f.city from public.areas a
     where a.city = f.city
       and (6371 * 2 * asin(sqrt(power(sin(radians(a.lat - f.lat) / 2), 2) +
            cos(radians(f.lat)) * cos(radians(a.lat)) * power(sin(radians(a.lng - f.lng) / 2), 2)))) <= 2.5
     order by power(a.lat - f.lat, 2) + power((a.lng - f.lng) * cos(radians(f.lat)), 2) limit 1), f.city)
 where f.is_demo;

-- ---------- RPCs ----------
-- Free slots for one doctor on one date (Pakistan time)
create or replace function public.doctor_slots(p_doctor_id bigint, p_day date)
returns table (starts_at timestamptz, label text)
language sql stable
set search_path = public
as $$
  with d as (select * from public.doctors where id = p_doctor_id),
  s as (
    select ((p_day + d.start_time) at time zone 'Asia/Karachi') + (n * make_interval(mins => d.slot_minutes)) as t
    from d, generate_series(0, 60) n
    where extract(dow from p_day)::int = any (d.days)
      and (p_day + d.start_time) + (n * make_interval(mins => d.slot_minutes)) < (p_day + d.end_time)
  )
  select s.t, to_char(s.t at time zone 'Asia/Karachi', 'HH12:MI AM')
  from s
  where s.t > now() + interval '30 minutes'
    and not exists (select 1 from public.appointments a
                    where a.doctor_id = p_doctor_id and a.starts_at = s.t and a.status <> 'cancelled')
  order by s.t;
$$;

-- Next free slot within 14 days
create or replace function public.doctor_next_slot(p_doctor_id bigint)
returns timestamptz language sql stable set search_path = public as $$
  select min(ds.starts_at)
  from generate_series((now() at time zone 'Asia/Karachi')::date, (now() at time zone 'Asia/Karachi')::date + 13, interval '1 day') g(day)
  cross join lateral public.doctor_slots(p_doctor_id, g.day::date) ds;
$$;

-- Doctors near a point, optionally by specialty
create or replace function public.nearby_doctors(
  p_specialty text, p_lat double precision, p_lng double precision, p_limit int default 10
)
returns table (
  doctor_id bigint, name text, gender text, specialty text, qualifications text, experience_yrs int,
  fee_pkr int, rating numeric, reviews int, languages text,
  facility_id bigint, facility text, kind text, address text, city text, lat double precision, lng double precision,
  emergency boolean, distance_km double precision, next_slot timestamptz
)
language sql stable
set search_path = public
as $$
  select x.*, public.doctor_next_slot(x.doctor_id)
  from (
    select d.id, d.name, d.gender, d.specialty, d.qualifications, d.experience_yrs, d.fee_pkr, d.rating, d.reviews, d.languages,
           f.id, f.name, f.kind, f.address, f.city, f.lat, f.lng, f.emergency,
           6371 * 2 * asin(sqrt(power(sin(radians(f.lat - p_lat) / 2), 2) +
             cos(radians(p_lat)) * cos(radians(f.lat)) * power(sin(radians(f.lng - p_lng) / 2), 2))) as distance_km
    from public.doctors d join public.facilities f on f.id = d.facility_id
    where p_specialty is null or p_specialty = '' or d.specialty = p_specialty
    order by distance_km, d.rating desc
    limit least(greatest(p_limit, 1), 30)
  ) x(doctor_id, name, gender, specialty, qualifications, experience_yrs, fee_pkr, rating, reviews, languages,
      facility_id, facility, kind, address, city, lat, lng, emergency, distance_km);
$$;

create or replace function public.list_specialties()
returns table (specialty text, doctors bigint) language sql stable set search_path = public as $$
  select specialty, count(*) from public.doctors group by 1 order by 2 desc, 1;
$$;

-- Book: validates slot belongs to schedule, is free, in the future
create or replace function public.book_appointment(
  p_doctor_id bigint, p_starts_at timestamptz,
  p_name text, p_phone text, p_email text, p_reason text
)
returns table (appointment_id uuid, appt_no text, starts_at timestamptz, doctor text, facility text, fee_pkr int)
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_no text; d record;
begin
  if coalesce(length(trim(p_name)), 0) < 2 or length(p_name) > 80 then raise exception 'Please enter the patient''s full name'; end if;
  if p_phone !~ '^\+?[0-9 \-]{10,15}$' then raise exception 'Please enter a valid phone number (03xx xxxxxxx)'; end if;
  if p_email is not null and p_email <> '' and p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please enter a valid email'; end if;

  select d2.*, f.name as fname into d from public.doctors d2 join public.facilities f on f.id = d2.facility_id where d2.id = p_doctor_id;
  if not found then raise exception 'Doctor not found'; end if;
  if not exists (select 1 from public.doctor_slots(p_doctor_id, (p_starts_at at time zone 'Asia/Karachi')::date) s where s.starts_at = p_starts_at) then
    raise exception 'That time is no longer available. Please pick another slot.';
  end if;

  loop
    v_no := 'AP-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.appointments a where a.appt_no = v_no);
  end loop;

  insert into public.appointments (appt_no, doctor_id, starts_at, patient_name, phone, email, reason)
  values (v_no, p_doctor_id, p_starts_at, trim(p_name), p_phone, nullif(trim(p_email), ''), left(p_reason, 300))
  returning id into v_id;

  return query select v_id, v_no, p_starts_at, d.name, d.fname, d.fee_pkr;
exception when unique_violation then
  raise exception 'That time was just booked by someone else. Please pick another slot.';
end;
$$;

grant execute on function public.doctor_slots(bigint, date) to anon, authenticated;
grant execute on function public.doctor_next_slot(bigint) to anon, authenticated;
grant execute on function public.nearby_doctors(text, double precision, double precision, int) to anon, authenticated;
grant execute on function public.list_specialties() to anon, authenticated;
grant execute on function public.book_appointment(bigint, timestamptz, text, text, text, text) to anon, authenticated;

select (select count(*) from public.facilities) as facilities,
       (select count(*) from public.doctors) as doctors,
       (select count(distinct specialty) from public.doctors) as specialties;
