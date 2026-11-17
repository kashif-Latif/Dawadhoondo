// Imports real pharmacy locations in Lahore from OpenStreetMap into Supabase.
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run import:pharmacies
// (or put them in .env and run: node --env-file=.env scripts/import-pharmacies.mjs)
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Lahore bounding box: south, west, north, east
const BBOX = process.env.BBOX || '31.30,74.10,31.70,74.55';
const query = `
[out:json][timeout:90];
(
  node["amenity"="pharmacy"](${BBOX});
  way["amenity"="pharmacy"](${BBOX});
  node["shop"="chemist"](${BBOX});
);
out center tags;`;

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function fetchOsm() {
  for (const m of MIRRORS) {
    try {
      const r = await fetch(m, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'DawaDhoondo/1.0' },
        body: 'data=' + encodeURIComponent(query),
      });
      if (r.ok) return (await r.json()).elements;
      console.warn(`${m} -> ${r.status}`);
    } catch (e) {
      console.warn(`${m} failed: ${e.message}`);
    }
  }
  throw new Error('All Overpass mirrors failed');
}

const elements = await fetchOsm();
const rows = elements
  .map((e) => {
    const t = e.tags || {};
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    const address = [t['addr:housenumber'], t['addr:street'], t['addr:suburb'] || t['addr:neighbourhood'], t['addr:city']]
      .filter(Boolean).join(', ');
    return {
      osm_id: `${e.type}/${e.id}`,
      name: (t.name || t['name:en'] || 'Pharmacy').trim(),
      address: address || null,
      phone: t.phone || t['contact:phone'] || null,
      lat, lng,
    };
  })
  .filter((r) => r.lat && r.lng);

const supabase = createClient(url, key, { auth: { persistSession: false } });
for (let i = 0; i < rows.length; i += 500) {
  const { error } = await supabase.from('pharmacies').upsert(rows.slice(i, i + 500), { onConflict: 'osm_id', ignoreDuplicates: true });
  if (error) throw error;
}
console.log(`Imported ${rows.length} pharmacies from OpenStreetMap`);
