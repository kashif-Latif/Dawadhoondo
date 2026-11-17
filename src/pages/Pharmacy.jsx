import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { readWithAI, searchMedicines, medLabel } from '../lib/api';
import { useLocation, formatKm, timeAgo } from '../lib/useLocation';
import PhotoButton from '../components/PhotoButton';
import MedicineInput from '../components/MedicineInput';
import { Notice, Spinner } from '../components/Bits';
import { StoreIcon, PlusIcon, MinusIcon, CheckIcon, PinIcon } from '../components/Icons';

/* ---------------- Auth ---------------- */
function AuthForm() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const fn = mode === 'signin' ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { data, error } = await fn.call(supabase.auth, { email, password });
    if (error) setMsg({ tone: 'error', text: error.message });
    else if (mode === 'signup' && !data.session) setMsg({ tone: 'info', text: 'Account created. Check your email to confirm, then sign in.' });
    setBusy(false);
  };

  return (
    <div className="mx-auto grid max-w-4xl items-center gap-8 md:grid-cols-2">
      <div>
        <span className="chip bg-sand text-[#8a5a12]">For pharmacy owners</span>
        <h1 className="mt-3 font-display text-4xl font-extrabold leading-tight tracking-tight">Customers are already looking for your medicines.</h1>
        <p className="mt-3 text-lg text-muted">List your stock on DawaDhoondo and people nearby will find your shop. Updating takes seconds: just photograph your supplier bill.</p>
        <ul className="mt-5 space-y-2 text-sm">
          {['Free to list your pharmacy', 'Snap a bill, stock updates itself', 'See which medicines people nearby can\'t find'].map((t) => (
            <li key={t} className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-mint text-leaf"><CheckIcon className="size-4" /></span>{t}</li>
          ))}
        </ul>
      </div>
      <form onSubmit={submit} className="card space-y-4 p-6">
        <div className="flex rounded-full bg-cream p-1 text-sm font-semibold">
          {[['signin', 'Sign in'], ['signup', 'Create account']].map(([k, l]) => (
            <button type="button" key={k} onClick={() => setMode(k)} className={`flex-1 rounded-full py-2 ${mode === k ? 'bg-paper shadow-sm' : 'text-muted'}`}>{l}</button>
          ))}
        </div>
        <label className="block text-sm font-semibold">Email
          <input className="input mt-1" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="block text-sm font-semibold">Password
          <input className="input mt-1" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
        </label>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner />}{mode === 'signin' ? 'Sign in' : 'Create account'}</button>
      </form>
    </div>
  );
}

/* ---------------- Onboarding: claim or add ---------------- */
function Onboard({ userId, onDone }) {
  const loc = useLocation();
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      let res;
      if (q.trim().length >= 2) {
        res = await supabase.from('pharmacies').select('id, name, address, lat, lng').is('owner_id', null).ilike('name', `%${q.trim()}%`).limit(15);
        res.data = res.data?.map((p) => ({ ...p, distance_km: null }));
      } else {
        res = await supabase.rpc('nearest_pharmacies', { user_lat: loc.lat, user_lng: loc.lng, lim: 12, only_unclaimed: true });
      }
      if (alive) setList(res.data || []);
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [q, loc.lat, loc.lng]);

  const claim = async (id) => {
    setBusy(true); setErr('');
    const { error } = await supabase.from('pharmacies').update({ owner_id: userId }).eq('id', id).is('owner_id', null);
    if (error) setErr(error.message); else onDone();
    setBusy(false);
  };

  const create = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const { error } = await supabase.from('pharmacies').insert({ ...form, lat: loc.lat, lng: loc.lng, owner_id: userId });
    if (error) setErr(error.message); else onDone();
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Find your pharmacy</h1>
        <p className="mt-1 text-muted">We've mapped pharmacies across Lahore. Pick yours to start listing stock.</p>
      </div>
      {loc.isDefault && <Notice tone="warn">Allow location access so we can show pharmacies around you. <button className="font-semibold underline" onClick={loc.request}>Allow</button></Notice>}
      {err && <Notice tone="error">{err}</Notice>}

      {!form ? (
        <>
          <input className="input" placeholder="Search by pharmacy name…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="card divide-y divide-line/70">
            {list === null && <div className="flex items-center gap-2 p-5 text-muted"><Spinner /> Loading…</div>}
            {list?.length === 0 && <p className="p-5 text-muted">No unclaimed pharmacy found here.</p>}
            {list?.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-mint text-leaf"><StoreIcon /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="truncate text-sm text-muted">{p.distance_km != null ? `${formatKm(p.distance_km)} · ` : ''}{p.address || 'Address not listed'}</p>
                </div>
                <button className="btn-soft py-2 text-sm" disabled={busy} onClick={() => claim(p.id)}>This is mine</button>
              </div>
            ))}
          </div>
          <button className="btn-ghost" onClick={() => setForm({ name: q, address: '', phone: '' })}><PlusIcon /> My pharmacy isn't listed</button>
        </>
      ) : (
        <form onSubmit={create} className="card space-y-4 p-6">
          <h2 className="font-display text-xl font-bold">Add your pharmacy</h2>
          {['name', 'address', 'phone'].map((k) => (
            <label key={k} className="block text-sm font-semibold capitalize">{k}
              <input className="input mt-1" required={k !== 'address'} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                     type={k === 'phone' ? 'tel' : 'text'} placeholder={k === 'phone' ? '03xx xxxxxxx' : ''} />
            </label>
          ))}
          <p className="flex items-center gap-1 text-sm text-muted"><PinIcon className="size-4" /> Location: {loc.isDefault ? 'central Lahore (allow location for exact spot)' : 'your current location'}</p>
          <div className="flex gap-2">
            <button type="button" className="btn-soft flex-1" onClick={() => setForm(null)}>Back</button>
            <button className="btn-primary flex-1" disabled={busy}>{busy && <Spinner />} Add pharmacy</button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ---------------- Scan supplier bill ---------------- */
async function ensureMedicine(row) {
  if (row.medicine_id !== 'new') return row.medicine_id;
  const brand = row.name.trim();
  const strength = (row.strength || '').trim();
  const form = (row.form || '').trim();
  const existing = await supabase.from('medicines').select('id').eq('brand', brand).eq('strength', strength).eq('form', form).maybeSingle();
  if (existing.data) return existing.data.id;
  const { data, error } = await supabase.from('medicines')
    .insert({ brand, strength, form, generic: (row.generic || '').trim() }).select('id').single();
  if (error) throw error;
  return data.id;
}

function ScanBill({ pharmacyId, onSaved }) {
  const [rows, setRows] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);

  const onImage = async (image) => {
    setBusy('read'); setMsg(null); setRows(null); setPreview(image.preview);
    try {
      const out = await readWithAI('invoice', { image });
      if (!out.readable || !out.items.length) {
        setMsg({ tone: 'warn', text: 'No medicine lines found. Try a flatter, well-lit photo of the bill.' });
      } else {
        const withMatches = await Promise.all(out.items.map(async (it, i) => {
          const options = await searchMedicines(`${it.name} ${it.strength}`.trim(), 4).catch(() => []);
          const best = options[0]?.score >= 0.35 ? options[0].id : 'new';
          return { key: i, ...it, price: it.unit_price ?? '', options, medicine_id: best, include: true };
        }));
        setRows(withMatches);
      }
    } catch (e) { setMsg({ tone: 'error', text: e.message }); }
    setBusy('');
  };

  const update = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = async () => {
    setBusy('save'); setMsg(null);
    try {
      const chosen = rows.filter((r) => r.include && r.quantity > 0);
      const items = [];
      for (const r of chosen) items.push({ medicine_id: await ensureMedicine(r), quantity: +r.quantity, price: r.price === '' ? '' : String(r.price) });
      const { error } = await supabase.rpc('apply_stock_items', { p_pharmacy: pharmacyId, p_items: items, p_mode: 'add' });
      if (error) throw error;
      setMsg({ tone: 'info', text: `Added ${items.length} item${items.length > 1 ? 's' : ''} to your stock.` });
      setRows(null); setPreview('');
      onSaved();
    } catch (e) { setMsg({ tone: 'error', text: e.message }); }
    setBusy('');
  };

  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Add stock from a bill</h2>
          <p className="text-sm text-muted">Photograph your supplier invoice. We read it, you check it, done.</p>
        </div>
        <PhotoButton onImage={onImage} onError={(t) => setMsg({ tone: 'error', text: t })} disabled={!!busy} className="btn-primary">
          {busy === 'read' ? <><Spinner /> Reading bill…</> : 'Snap a bill'}
        </PhotoButton>
      </div>
      {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}

      {rows && (
        <div className="grid gap-4 lg:grid-cols-[160px_1fr]">
          {preview && <img src={preview} alt="Bill" className="hidden max-h-72 w-full rounded-2xl border border-line object-cover lg:block" />}
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.key} className={`grid grid-cols-[auto_1fr] gap-3 rounded-2xl border p-3 ${r.include ? 'border-line bg-cream/60' : 'border-dashed border-line opacity-60'}`}>
                <input type="checkbox" className="mt-2 size-5 accent-[#1E6B52]" checked={r.include} onChange={(e) => update(r.key, { include: e.target.checked })} aria-label="Include line" />
                <div className="grid gap-2 sm:grid-cols-[1fr_90px_100px]">
                  <div>
                    <p className="text-xs text-muted">On bill: <b className="text-ink">{[r.name, r.strength, r.form].filter(Boolean).join(' ')}</b></p>
                    <select className="input mt-1 py-2" value={r.medicine_id} onChange={(e) => update(r.key, { medicine_id: e.target.value })}>
                      {r.options.map((o) => <option key={o.id} value={o.id}>{medLabel(o)} {o.form} · {o.generic}</option>)}
                      <option value="new">+ Add as new: {[r.name, r.strength].filter(Boolean).join(' ')}</option>
                    </select>
                    {r.medicine_id === 'new' && (
                      <input className="input mt-2 py-2" placeholder="Salt / generic name (e.g. Paracetamol)" value={r.generic} onChange={(e) => update(r.key, { generic: e.target.value })} />
                    )}
                  </div>
                  <label className="text-xs text-muted">Qty
                    <input className="input mt-1 py-2" type="number" min="0" value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} />
                  </label>
                  <label className="text-xs text-muted">Price (Rs)
                    <input className="input mt-1 py-2" type="number" min="0" step="0.01" value={r.price} onChange={(e) => update(r.key, { price: e.target.value })} />
                  </label>
                </div>
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-soft" onClick={() => setRows(null)}>Cancel</button>
              <button className="btn-primary" onClick={save} disabled={busy === 'save' || !rows.some((r) => r.include)}>
                {busy === 'save' && <Spinner />} Add to my stock
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------------- Stock list ---------------- */
function StockList({ pharmacyId, version }) {
  const [items, setItems] = useState(null);
  const [adding, setAdding] = useState(null);
  const [addQty, setAddQty] = useState(10);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('stock')
      .select('quantity, price, updated_at, medicines(id, brand, generic, strength, form)')
      .eq('pharmacy_id', pharmacyId).order('updated_at', { ascending: false });
    setItems(data || []);
  }, [pharmacyId]);

  useEffect(() => { load(); }, [load, version]);

  const setQty = async (medicine_id, quantity) => {
    setItems((its) => its.map((i) => (i.medicines.id === medicine_id ? { ...i, quantity } : i)));
    await supabase.rpc('apply_stock_items', { p_pharmacy: pharmacyId, p_items: [{ medicine_id, quantity }], p_mode: 'set' });
  };

  const addOne = async () => {
    await supabase.rpc('apply_stock_items', { p_pharmacy: pharmacyId, p_items: [{ medicine_id: adding.id, quantity: +addQty }], p_mode: 'add' });
    setAdding(null); setAddQty(10); load();
  };

  const shown = (items || []).filter((i) => medLabel(i.medicines).toLowerCase().includes(filter.toLowerCase()));

  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">My stock <span className="text-base font-medium text-muted">({items?.filter((i) => i.quantity > 0).length ?? 0} in stock)</span></h2>
        <input className="input max-w-56 py-2" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>

      <div className="rounded-2xl bg-cream/70 p-3">
        <p className="mb-2 text-sm font-semibold">Quick add</p>
        {!adding ? (
          <MedicineInput onPick={setAdding} placeholder="Search a medicine to add…" />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip bg-mint text-leaf-dark">{medLabel(adding)} {adding.form}</span>
            <input className="input w-24 py-2" type="number" min="1" value={addQty} onChange={(e) => setAddQty(e.target.value)} aria-label="Quantity" />
            <button className="btn-primary py-2" onClick={addOne}>Add</button>
            <button className="btn-ghost" onClick={() => setAdding(null)}>Cancel</button>
          </div>
        )}
      </div>

      {items === null ? <div className="flex items-center gap-2 text-muted"><Spinner /> Loading…</div>
        : items.length === 0 ? <p className="text-muted">No stock yet. Snap a supplier bill or use quick add.</p>
        : (
          <ul className="divide-y divide-line/70">
            {shown.map((i) => (
              <li key={i.medicines.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{medLabel(i.medicines)} <span className="font-normal text-muted">{i.medicines.form}</span></p>
                  <p className="truncate text-xs text-muted">{i.medicines.generic}{i.price ? ` · Rs ${Number(i.price).toLocaleString()}` : ''} · {timeAgo(i.updated_at)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button className="grid size-9 place-items-center rounded-full border border-line hover:bg-cream" onClick={() => setQty(i.medicines.id, Math.max(0, i.quantity - 1))} aria-label="Decrease"><MinusIcon className="size-4" /></button>
                  <span className={`w-12 text-center font-bold ${i.quantity === 0 ? 'text-coral' : i.quantity < 5 ? 'text-[#8a5a12]' : ''}`}>{i.quantity}</span>
                  <button className="grid size-9 place-items-center rounded-full border border-line hover:bg-cream" onClick={() => setQty(i.medicines.id, i.quantity + 1)} aria-label="Increase"><PlusIcon className="size-4" /></button>
                  <button className="ml-1 text-xs font-semibold text-coral hover:underline" onClick={() => setQty(i.medicines.id, 0)}>Out</button>
                </div>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

/* ---------------- Page ---------------- */
export default function Pharmacy() {
  const [session, setSession] = useState(undefined);
  const [pharmacy, setPharmacy] = useState(undefined);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadPharmacy = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase.from('pharmacies').select('*').eq('owner_id', session.user.id).limit(1).maybeSingle();
    setPharmacy(data);
  }, [session]);

  useEffect(() => { loadPharmacy(); }, [loadPharmacy]);

  if (session === undefined) return <div className="flex items-center gap-2 text-muted"><Spinner /> Loading…</div>;
  if (!session) return <AuthForm />;
  if (pharmacy === undefined) return <div className="flex items-center gap-2 text-muted"><Spinner /> Loading your pharmacy…</div>;
  if (!pharmacy) return <Onboard userId={session.user.id} onDone={loadPharmacy} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-leaf text-white"><StoreIcon /></div>
          <div>
            <h1 className="font-display text-2xl font-extrabold leading-tight">{pharmacy.name}</h1>
            <p className="text-sm text-muted">{pharmacy.address || 'Lahore'} {pharmacy.is_verified ? '· Verified' : '· Verification pending'}</p>
          </div>
        </div>
        <button className="btn-ghost text-sm" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
      <ScanBill pharmacyId={pharmacy.id} onSaved={() => setVersion((v) => v + 1)} />
      <StockList pharmacyId={pharmacy.id} version={version} />
    </div>
  );
}

