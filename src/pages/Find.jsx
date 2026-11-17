import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { medLabel } from '../lib/api';
import { useLocation, formatKm, timeAgo } from '../lib/useLocation';
import MapView from '../components/MapView';
import { Empty, Notice, Spinner } from '../components/Bits';
import { PhoneIcon, RouteIcon, PinIcon, CheckIcon, StoreIcon } from '../components/Icons';

const RADIUS_KM = 20;

function groupByPharmacy(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.pharmacy_id)) {
      map.set(r.pharmacy_id, {
        id: r.pharmacy_id, name: r.pharmacy_name, address: r.address, phone: r.phone,
        lat: r.p_lat, lng: r.p_lng, verified: r.is_verified, distance: r.distance_km, items: [],
      });
    }
    map.get(r.pharmacy_id).items.push(r);
  }
  return [...map.values()];
}

const directions = (p) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;

function StockLine({ r }) {
  const low = r.quantity < 5;
  return (
    <li className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="flex items-center gap-2">
        <span className={`grid size-5 place-items-center rounded-full ${low ? 'bg-sand text-[#8a5a12]' : 'bg-mint text-leaf'}`}><CheckIcon className="size-3.5" /></span>
        <b>{medLabel(r)}</b>
      </span>
      <span className="text-right text-muted">
        <span className={low ? 'font-semibold text-[#8a5a12]' : 'font-semibold text-leaf'}>{low ? `Only ${r.quantity} left` : 'In stock'}</span>
        {r.price ? <span> · Rs {Number(r.price).toLocaleString()}</span> : null}
      </span>
    </li>
  );
}

function PharmacyCard({ p, index, total, highlight }) {
  return (
    <article id={`ph-${p.id}`} className={`card p-5 transition ${highlight ? 'ring-4 ring-saffron/50' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="pin shrink-0" style={{ background: p.items.length === total ? '#1E6B52' : '#F2A541' }}>{index}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-bold leading-tight">{p.name}</h3>
            {p.verified && <span className="chip bg-mint px-2 py-0.5 text-xs text-leaf">Verified</span>}
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
            <PinIcon className="size-4" /> {formatKm(p.distance)} away{p.address ? ` · ${p.address}` : ''}
          </p>
        </div>
        {total > 1 && (
          <span className={`chip shrink-0 text-xs ${p.items.length === total ? 'bg-leaf text-white' : 'bg-sand text-[#8a5a12]'}`}>
            Has {p.items.length} of {total}
          </span>
        )}
      </div>

      <ul className="mt-3 divide-y divide-line/70 border-t border-line/70 pt-1">
        {p.items.map((r) => <StockLine key={r.medicine_id} r={r} />)}
      </ul>
      <p className="mt-2 text-xs text-muted">Updated {timeAgo(p.items[0].updated_at)}</p>

      <div className="mt-4 flex gap-2">
        {p.phone && <a href={`tel:${p.phone}`} className="btn-soft flex-1 py-2.5"><PhoneIcon /> Call</a>}
        <a href={directions(p)} target="_blank" rel="noreferrer" className="btn-primary flex-1 py-2.5"><RouteIcon /> Directions</a>
      </div>
    </article>
  );
}

export default function Find() {
  const [params] = useSearchParams();
  const ids = useMemo(() => (params.get('ids') || '').split(',').filter(Boolean), [params]);
  const loc = useLocation();
  const [meds, setMeds] = useState([]);
  const [rows, setRows] = useState(null);
  const [alts, setAlts] = useState([]);
  const [nearby, setNearby] = useState([]);
  const [error, setError] = useState('');
  const [focus, setFocus] = useState(null);
  const logged = useRef('');

  useEffect(() => {
    if (!ids.length) return;
    let alive = true;
    (async () => {
      setRows(null); setError(''); setAlts([]); setNearby([]);
      try {
        const [{ data: medRows, error: e1 }, { data: stockRows, error: e2 }] = await Promise.all([
          supabase.from('medicines').select('id, brand, generic, strength, form').in('id', ids),
          supabase.rpc('find_stock_nearby', { med_ids: ids, user_lat: loc.lat, user_lng: loc.lng, radius_km: RADIUS_KM }),
        ]);
        if (e1 || e2) throw e1 || e2;
        if (!alive) return;
        setMeds(medRows);
        setRows(stockRows);

        const foundIds = new Set(stockRows.map((r) => r.medicine_id));
        const missing = ids.filter((id) => !foundIds.has(id));

        // Anonymous demand signal (once per search) for the shortage radar
        const key = ids.join(',') + (loc.isDefault ? '' : 'gps');
        if (logged.current !== key) {
          logged.current = key;
          supabase.from('search_log').insert(ids.map((id) => ({
            medicine_id: id, found: foundIds.has(id),
            lat: loc.isDefault ? null : +loc.lat.toFixed(2), lng: loc.isDefault ? null : +loc.lng.toFixed(2),
          }))).then(() => {});
        }

        if (missing.length) {
          const { data: altMeds } = await supabase.rpc('same_salt_alternatives', { med_ids: missing });
          if (altMeds?.length) {
            const { data: altStock } = await supabase.rpc('find_stock_nearby', {
              med_ids: altMeds.map((a) => a.id), user_lat: loc.lat, user_lng: loc.lng, radius_km: RADIUS_KM,
            });
            if (alive) setAlts((altStock || []).map((s) => ({ ...s, for: altMeds.find((a) => a.id === s.medicine_id)?.for_medicine_id })));
          }
        }
        if (!stockRows.length) {
          const { data: near } = await supabase.rpc('nearest_pharmacies', { user_lat: loc.lat, user_lng: loc.lng, lim: 6 });
          if (alive) setNearby(near || []);
        }
      } catch (e) {
        if (alive) setError(e.message || 'Could not load results');
      }
    })();
    return () => { alive = false; };
  }, [ids.join(','), loc.lat, loc.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const pharmacies = useMemo(() => {
    if (!rows) return [];
    return groupByPharmacy(rows).sort((a, b) => b.items.length - a.items.length || a.distance - b.distance);
  }, [rows]);

  const foundIds = new Set((rows || []).map((r) => r.medicine_id));
  const missingMeds = meds.filter((m) => !foundIds.has(m.id));

  if (!ids.length) {
    return <Empty title="Nothing to search yet">Go back and add a medicine. <Link to="/" className="font-semibold text-leaf underline">Start a search</Link></Empty>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/" className="text-sm font-semibold text-leaf">← New search</Link>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">
            {meds.length ? meds.map(medLabel).join(', ') : 'Searching…'}
          </h1>
          <p className="mt-1 text-sm text-muted">Within {RADIUS_KM} km of {loc.isDefault ? 'central Lahore' : 'your location'}</p>
        </div>
        {loc.isDefault && (
          <button onClick={loc.request} className="btn-soft py-2 text-sm" disabled={loc.asking}>
            {loc.asking ? <Spinner /> : <PinIcon />} Use my location
          </button>
        )}
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {!rows && !error && <div className="flex items-center gap-3 text-muted"><Spinner /> Checking pharmacies near you…</div>}

      {rows && (
        <>
          <MapView
            me={loc}
            className="h-72 sm:h-96"
            places={pharmacies.map((p, i) => ({
              id: p.id, name: p.name, lat: p.lat, lng: p.lng, label: i + 1,
              color: p.items.length === ids.length ? '#1E6B52' : '#F2A541',
              onClick: () => { setFocus(p.id); document.getElementById(`ph-${p.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
            }))}
          />

          {pharmacies.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-xl font-bold">{pharmacies.length} pharmac{pharmacies.length > 1 ? 'ies have' : 'y has'} it</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {pharmacies.map((p, i) => <PharmacyCard key={p.id} p={p} index={i + 1} total={ids.length} highlight={focus === p.id} />)}
              </div>
            </section>
          )}

          {missingMeds.length > 0 && (
            <section className="space-y-3">
              <Notice tone="warn">
                <b>{missingMeds.map(medLabel).join(', ')}</b> {missingMeds.length > 1 ? 'are' : 'is'} not listed at any pharmacy near you right now.
              </Notice>
              {alts.length > 0 && (
                <div className="card p-5">
                  <h3 className="font-display text-lg font-bold">Same salt, different brand</h3>
                  <p className="mb-3 text-sm text-muted">These have the same active ingredient and strength. <b>Always ask your doctor or pharmacist before switching.</b></p>
                  <ul className="divide-y divide-line/70">
                    {alts.map((a) => (
                      <li key={a.pharmacy_id + a.medicine_id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                        <span><b>{medLabel(a)}</b> <span className="text-muted">({a.generic})</span><br /><span className="text-muted">at {a.pharmacy_name} · {formatKm(a.distance_km)}</span></span>
                        <a className="btn-ghost text-sm" href={directions({ lat: a.p_lat, lng: a.p_lng })} target="_blank" rel="noreferrer"><RouteIcon /> Go</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {nearby.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-xl font-bold">Call a pharmacy near you</h2>
              <p className="text-sm text-muted">These pharmacies haven't listed their stock with us yet. A quick call can save you a trip.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {nearby.map((p) => (
                  <div key={p.id} className="card flex items-center gap-3 p-4">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-sand text-[#8a5a12]"><StoreIcon /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{p.name}</p>
                      <p className="text-sm text-muted">{formatKm(p.distance_km)} away</p>
                    </div>
                    {p.phone
                      ? <a href={`tel:${p.phone}`} className="btn-soft px-3 py-2" aria-label="Call"><PhoneIcon /></a>
                      : <a href={directions(p)} target="_blank" rel="noreferrer" className="btn-soft px-3 py-2" aria-label="Directions"><RouteIcon /></a>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
