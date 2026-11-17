import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { medLabel } from '../lib/api';
import { Spinner, Empty } from '../components/Bits';
import { ChartIcon } from '../components/Icons';

async function count(table, filter) {
  let q = supabase.from(table).select('*', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count: c } = await q;
  return c ?? 0;
}

export default function Insights() {
  const [rows, setRows] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    supabase.rpc('shortage_signals', { days: 7 }).then(({ data }) => setRows(data || []));
    Promise.all([
      count('pharmacies'),
      count('pharmacies', (q) => q.not('owner_id', 'is', null)),
      count('medicines'),
    ]).then(([mapped, listed, meds]) => setStats({ mapped, listed, meds }));
  }, []);

  const max = Math.max(1, ...(rows || []).map((r) => Number(r.searches)));

  return (
    <div className="space-y-6">
      <div>
        <span className="chip bg-blush text-coral">Shortage radar · last 7 days</span>
        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight">Medicines people can't find</h1>
        <p className="mt-1 max-w-2xl text-muted">Every search tells us what patients need. When a medicine is searched often but nobody nearby has it, that's an early shortage signal for pharmacies, distributors and health officials.</p>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-3">
          {[['Pharmacies mapped', stats.mapped], ['Listing stock', stats.listed], ['Medicines in catalog', stats.meds]].map(([l, v]) => (
            <div key={l} className="card p-4">
              <p className="font-display text-3xl font-extrabold text-leaf">{v.toLocaleString()}</p>
              <p className="text-xs text-muted sm:text-sm">{l}</p>
            </div>
          ))}
        </div>
      )}

      {rows === null ? <div className="flex items-center gap-2 text-muted"><Spinner /> Loading…</div>
        : rows.length === 0 ? <Empty title="No searches yet" icon={<ChartIcon />}>As people search, medicines that are hard to find will show up here.</Empty>
        : (
          <div className="card divide-y divide-line/70">
            {rows.map((r) => (
              <div key={r.medicine_id} className="grid gap-2 p-4 sm:grid-cols-[1fr_2fr] sm:items-center">
                <div>
                  <p className="font-semibold">{medLabel(r)}</p>
                  <p className="text-xs text-muted">{r.generic}</p>
                </div>
                <div>
                  <div className="h-3 overflow-hidden rounded-full bg-cream">
                    <div className="h-full rounded-full bg-mint" style={{ width: `${(Number(r.searches) / max) * 100}%` }}>
                      <div className="h-full rounded-full bg-coral" style={{ width: `${(Number(r.not_found) / Number(r.searches)) * 100}%` }} />
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {r.searches} searches · <b className={Number(r.miss_rate) >= 50 ? 'text-coral' : ''}>{r.not_found} couldn't find it ({r.miss_rate}%)</b>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
