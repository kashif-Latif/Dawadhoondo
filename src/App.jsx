import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import TopBar from "./components/TopBar";
import Panel, { useIsMobile } from "./components/Panel";
import SearchPanel from "./components/SearchPanel";
import { MatchGroups, MedicineCard, PharmacyList } from "./components/Results";
import OrderSheet from "./components/OrderSheet";
import TrackOrder from "./components/TrackOrder";
import VoiceAgent from "./components/VoiceAgent";
import { Icon } from "./components/ui";
import { smartSearch, searchFromFile, findNearby, getAlternatives } from "./lib/api";
import { CITIES, getBrowserLocation } from "./lib/geo";

// Map engine loads in its own chunk so the UI is interactive immediately.
const MapView = lazy(() => import("./components/MapView"));

const DEFAULT_USER = { ...CITIES[0], label: "Lahore" };
const PHARMACY_MSG = {
  confirmed: "Order confirmed. The customer has been emailed.",
  dispatched: "Marked as dispatched / ready. The customer has been emailed.",
  delivered: "Marked as delivered. Thank you!",
  cancelled: "Order cancelled and stock restored.",
};

export default function App() {
  const mobile = useIsMobile();
  const [user, setUser] = useState(DEFAULT_USER);
  const [loading, setLoading] = useState(false);
  const [nearLoading, setNearLoading] = useState(false);
  const [error, setError] = useState("");
  const [groups, setGroups] = useState([]);
  const [usedAI, setUsedAI] = useState(false);
  const [upload, setUpload] = useState(null);
  const [medicine, setMedicine] = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [nearby, setNearby] = useState({ pharmacies: [], radius: null });
  const [active, setActive] = useState(null);
  const [ordering, setOrdering] = useState(null);
  const [track, setTrack] = useState(null);
  const [toast, setToast] = useState(null);
  const [snap, setSnap] = useState("peek");
  const [sheetH, setSheetH] = useState(0);

  // GPS on load + deep links (?track=DD-XXXX, ?pa=confirmed&o=DD-XXXX from pharmacy email)
  useEffect(() => {
    getBrowserLocation().then(setUser).catch(() => {});
    const p = new URLSearchParams(window.location.search);
    if (p.get("track")) setTrack({ no: p.get("track"), phone: "" });
    if (p.get("pa")) {
      const ok = p.get("pa") !== "error";
      setToast({ ok, text: ok ? `${p.get("o") ?? ""} · ${PHARMACY_MSG[p.get("pa")] ?? "Updated."}` : p.get("msg") ?? "Something went wrong" });
    }
    if (p.toString()) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const reset = () => {
    setError("");
    setMedicine(null);
    setNearby({ pharmacies: [], radius: null });
    setAlternatives([]);
    setActive(null);
  };

  const pickMedicine = async (m) => {
    setMedicine(m);
    setActive(null);
    setNearLoading(true);
    if (mobile) setSnap("half");
    try {
      const [near, alts] = await Promise.all([findNearby(m.id, user.lat, user.lng), getAlternatives(m.id)]);
      setNearby(near);
      setAlternatives(alts);
    } catch (e) {
      setError(e.message);
    } finally {
      setNearLoading(false);
    }
  };

  const runText = async (text) => {
    reset();
    setUpload(null);
    setLoading(true);
    try {
      const res = await smartSearch(text);
      setGroups(res.groups);
      setUsedAI(res.usedAI);
      const first = res.groups.find((g) => g.results.length)?.results[0];
      if (first) await pickMedicine(first);
      else setError("No matching medicine found. Try another spelling, or scan the box.");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const runFile = async (file) => {
    reset();
    setGroups([]);
    setLoading(true);
    if (mobile) setSnap("half");
    setUpload({ file, stage: 0 });
    try {
      const res = await searchFromFile(file, (stage) => setUpload((u) => ({ ...u, stage })));
      setUpload((u) => ({ ...u, stage: 3, extracted: res.extracted }));
      setGroups(res.groups);
      setUsedAI(true);
      const first = res.groups.find((g) => g.results.length)?.results[0];
      if (first) await pickMedicine(first);
    } catch (e) {
      setUpload((u) => ({ ...u, error: e.message }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (medicine) findNearby(medicine.id, user.lat, user.lng).then(setNearby).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const mapPadding = useMemo(
    () => (mobile ? { top: 90, left: 30, right: 30, bottom: Math.round(sheetH) + 20 } : { top: 100, left: 460, right: 80, bottom: 80 }),
    [mobile, sheetH],
  );

  const setCity = (name) => {
    const c = CITIES.find((x) => x.name === name);
    if (c) setUser({ ...c, label: c.name });
  };

  return (
    <div className="fixed inset-0 overflow-clip">
      {/* Map (lazy) with a soft animated backdrop while it loads */}
      <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-sky-100 via-teal-50 to-indigo-100">
        <span className="blob left-[10%] top-[15%] h-72 w-72 bg-teal-300" />
        <span className="blob bottom-[10%] right-[15%] h-80 w-80 bg-sky-300" style={{ animationDelay: "-5s" }} />
        <Suspense fallback={null}>
          <MapView user={user} pharmacies={nearby.pharmacies} activeId={active?.pharmacy_id} onSelect={(p) => { setActive(p); if (mobile) setSnap("half"); }} padding={mapPadding} />
        </Suspense>
      </div>

      <TopBar
        user={user}
        onCity={setCity}
        onGps={() => getBrowserLocation().then(setUser).catch(() => setToast({ ok: false, text: "Location permission denied" }))}
        onTrack={() => setTrack({ no: "", phone: "" })}
      />

      <Panel snap={snap} setSnap={setSnap} onHeight={setSheetH}>
        <div className="space-y-4">
          {!medicine && !loading && !upload && (
            <div className="pt-1 anim-fade-up">
              <h1 className="text-[22px] font-extrabold leading-tight tracking-tight md:text-[24px]">
                Find your medicine,<br /><span className="bg-gradient-to-r from-brand-600 to-sky-600 bg-clip-text text-transparent">at a pharmacy near you.</span>
              </h1>
              <p className="mt-1.5 text-[13px] text-slate-500">21,957 DRAP-registered medicines. Type it, scan it, or just ask.</p>
            </div>
          )}

          <SearchPanel onText={runText} onFile={runFile} loading={loading} upload={upload} />

          {error && <p className="rounded-2xl bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700 anim-fade-up">{error}</p>}

          {loading && !upload && (
            <div className="space-y-2"><div className="skeleton h-8 w-2/3" /><div className="skeleton h-32" /><div className="skeleton h-24" /></div>
          )}

          {!loading && <MatchGroups groups={groups} usedAI={usedAI} selectedId={medicine?.id} onPick={pickMedicine} />}

          {medicine && <MedicineCard medicine={medicine} alternatives={alternatives} onPick={pickMedicine} />}

          {medicine && (
            <PharmacyList
              pharmacies={nearby.pharmacies}
              radius={nearby.radius}
              user={user}
              activeId={active?.pharmacy_id}
              onSelect={setActive}
              onOrder={setOrdering}
              loading={nearLoading}
            />
          )}

          {medicine && (
            <button onClick={() => { reset(); setGroups([]); setUpload(null); }} className="mx-auto flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-500 hover:text-brand-700">
              <Icon name="back" className="h-4 w-4" /> New search
            </button>
          )}
        </div>
      </Panel>

      <VoiceAgent
        user={user}
        bottomOffset={mobile ? sheetH : 0}
        onResult={(res) => {
          setError("");
          setUpload(null);
          setGroups([{ query: res.medicine.product_name, corrected: null, results: res.matches?.length ? res.matches : [res.medicine] }]);
          setUsedAI(true);
          setMedicine(res.medicine);
          setNearby(res.nearby ?? { pharmacies: [], radius: null });
          setAlternatives(res.alternatives ?? []);
          setActive(null);
        }}
      />

      {ordering && medicine && (
        <OrderSheet medicine={medicine} pharmacy={ordering} user={user} onClose={() => setOrdering(null)}
          onTrack={(no, phone) => { setOrdering(null); setTrack({ no, phone }); }} />
      )}
      {track && <TrackOrder initialNo={track.no} initialPhone={track.phone} onClose={() => setTrack(null)} />}

      {toast && (
        <div className="fixed left-1/2 top-20 z-[60] w-[min(92vw,420px)] -translate-x-1/2 anim-fade-up">
          <div className={`glass flex items-center gap-2.5 rounded-2xl px-4 py-3 text-[13px] font-medium ${toast.ok ? "text-slate-800" : "text-rose-700"}`}>
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-white ${toast.ok ? "bg-brand-500" : "bg-rose-500"}`}>
              <Icon name={toast.ok ? "check" : "close"} className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
            {toast.text}
          </div>
        </div>
      )}
    </div>
  );
}
