import { useEffect, useState } from "react";
import MapView from "./components/MapView";
import SearchPanel from "./components/SearchPanel";
import PharmacyList from "./components/PharmacyList";
import OrderModal from "./components/OrderModal";
import VoiceAgent from "./components/VoiceAgent";
import { smartSearch, searchFromFile, findNearby, getAlternatives } from "./lib/api";
import { CITIES, getBrowserLocation, fmtPKR } from "./lib/geo";

const DEFAULT_USER = { ...CITIES[0], label: "Lahore (default)" };

export default function App() {
  const [user, setUser] = useState(DEFAULT_USER);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [groups, setGroups] = useState([]);
  const [usedAI, setUsedAI] = useState(false);
  const [medicine, setMedicine] = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [nearby, setNearby] = useState({ pharmacies: [], radius: null });
  const [active, setActive] = useState(null);
  const [ordering, setOrdering] = useState(null);

  useEffect(() => {
    getBrowserLocation().then(setUser).catch(() => {});
  }, []);

  const run = async (fn) => {
    setLoading(true);
    setError("");
    setMedicine(null);
    setNearby({ pharmacies: [], radius: null });
    setActive(null);
    try {
      const res = await fn();
      setGroups(res.groups);
      setUsedAI(res.usedAI);
      const first = res.groups.find((g) => g.results.length)?.results[0];
      if (first) await pickMedicine(first);
      else setError("No matching medicine found. Try another spelling or upload a photo.");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const pickMedicine = async (m) => {
    setMedicine(m);
    setActive(null);
    const [near, alts] = await Promise.all([findNearby(m.id, user.lat, user.lng), getAlternatives(m.id)]);
    setNearby(near);
    setAlternatives(alts);
  };

  // Re-run nearby search when the location changes
  useEffect(() => {
    if (medicine) findNearby(medicine.id, user.lat, user.lng).then(setNearby).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapView user={user} pharmacies={nearby.pharmacies} activeId={active?.pharmacy_id} onSelect={setActive} />

      <aside className="glass absolute left-3 top-3 bottom-3 z-10 flex w-[min(420px,calc(100%-24px))] flex-col rounded-2xl text-white">
        <header className="border-b border-slate-700/60 p-4">
          <h1 className="text-xl font-extrabold tracking-tight">
            💊 Dawa<span className="text-emerald-400">Dhoondo</span>
          </h1>
          <p className="text-xs text-slate-400">Find any medicine at pharmacies near you — across Pakistan</p>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-slate-400">📍</span>
            <select
              value={user.label}
              onChange={(e) => {
                const c = CITIES.find((x) => x.name === e.target.value);
                if (c) setUser({ ...c, label: c.name });
                else getBrowserLocation().then(setUser).catch(() => setError("Location permission denied"));
              }}
              className="rounded-lg bg-slate-800 px-2 py-1 text-white outline-none"
            >
              <option value={user.label}>{user.label}</option>
              <option value="__gps">Use my GPS location</option>
              {CITIES.filter((c) => c.name !== user.label).map((c) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <SearchPanel
            loading={loading}
            onText={(t) => run(() => smartSearch(t))}
            onFile={(f) => run(() => searchFromFile(f))}
          />

          {loading && <p className="animate-pulse text-sm text-emerald-300">Searching medicines & pharmacies…</p>}
          {error && <p className="rounded-lg bg-red-500/10 p-2 text-sm text-red-300">{error}</p>}

          {groups.length > 0 && !loading && (
            <section className="space-y-2">
              {usedAI && <p className="text-xs text-sky-300">✨ AI corrected / extracted your medicine names</p>}
              {groups.map((g, gi) => (
                <div key={gi}>
                  {g.corrected && <p className="mb-1 text-xs text-slate-400">Did you mean <b className="text-white">{g.corrected}</b>?</p>}
                  <div className="flex flex-wrap gap-1.5">
                    {g.results.slice(0, 6).map((m) => (
                      <button
                        key={m.id}
                        onClick={() => pickMedicine(m)}
                        className={`rounded-full px-3 py-1 text-xs ring-1 ${medicine?.id === m.id ? "bg-emerald-500 ring-emerald-400" : "bg-slate-800 ring-slate-700 hover:ring-emerald-500"}`}
                      >
                        {m.product_name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          {medicine && (
            <section className="rounded-xl bg-slate-800/60 p-3 ring-1 ring-slate-700">
              <p className="text-base font-bold">{medicine.product_name}</p>
              <p className="text-xs text-slate-400">{medicine.generic_composition}</p>
              <p className="mt-1 text-xs text-slate-300">
                {[medicine.dosage_form, medicine.strength].filter(Boolean).join(" · ")}{medicine.rx_status ? ` · ${medicine.rx_status}` : ""}
              </p>
              <p className="text-xs text-slate-300">
                {medicine.company} · {medicine.pack_size} · DRAP max price <b>{fmtPKR(medicine.mrp_pkr)}</b>
              </p>
              {alternatives.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-slate-400">Same-formula alternatives:</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {alternatives.map((a) => (
                      <button key={a.id} onClick={() => pickMedicine(a)} className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] ring-1 ring-slate-700 hover:ring-emerald-500">
                        {a.product_name} · {fmtPKR(a.mrp_pkr)}{a.price_per_unit ? ` (${fmtPKR(a.price_per_unit)}/unit)` : ""}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {medicine && (
            <PharmacyList
              pharmacies={nearby.pharmacies}
              radius={nearby.radius}
              user={user}
              activeId={active?.pharmacy_id}
              onSelect={setActive}
              onOrder={(p) => setOrdering(p)}
            />
          )}
        </div>

        <footer className="border-t border-slate-700/60 p-3 text-[10px] text-slate-500">
          Medicine data: DRAP Pharmaceutical Price Index. Pharmacy locations & stock are demo data.
        </footer>
      </aside>

      <VoiceAgent
        user={user}
        onResult={(res) => {
          setError("");
          setGroups([{ query: res.medicine.product_name, corrected: null, results: res.matches?.length ? res.matches : [res.medicine] }]);
          setUsedAI(true);
          setMedicine(res.medicine);
          setNearby(res.nearby ?? { pharmacies: [], radius: null });
          setAlternatives(res.alternatives ?? []);
          setActive(null);
        }}
      />

      {ordering && medicine && <OrderModal medicine={medicine} pharmacy={ordering} onClose={() => setOrdering(null)} />}
    </div>
  );
}
