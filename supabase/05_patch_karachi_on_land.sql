-- Moves demo Karachi pharmacies inland (some landed in the sea). Run once; safe to re-run.
update public.pharmacies
   set lat = 24.875 + random() * 0.09,   -- 24.875 .. 24.965
       lng = 67.035 + random() * 0.085   -- 67.035 .. 67.120
 where city = 'Karachi' and is_demo;
select count(*) as karachi_pharmacies_moved from public.pharmacies where city = 'Karachi';
