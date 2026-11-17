import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import TopBar from "./components/TopBar";
import Panel, { useIsMobile } from "./components/Panel";
import SearchPanel from "./components/SearchPanel";
import { MatchGroups, MedicineCard, PharmacyList } from "./components/Results";
import OrderSheet from "./components/OrderSheet";
import TrackOrder from "./components/TrackOrder";
import VoiceAgent from "./components/VoiceAgent";
import DoctorsTab from "./components/Doctors";
import BookingSheet from "./components/BookingSheet";
import LocationGate from "./components/LocationGate";
import RouteCard from "./components/RouteCard";
import Terms from "./components/Terms";
import { Icon } from "./components/ui";
import { smartSearch, searchFromFile, findNearby, getAlternatives, nearbyDoctors } from "./lib/api";
import { CITIES, watchLocation, watchCompass, distanceKm } from "./lib/geo";
import { roadRoute } from "./lib/route";

// Map engine loads in its own chunk so the UI is interactive immediately.
const MapView = lazy(() => import("./components/MapView"));

const DEMO_USER = { ...CITIES[0], label: "Lahore (demo)", accuracy: null, live: false };
const PHARMACY_MSG = {
  confirmed: "Order confirmed. The customer has been emailed.",
  dispatched: "Marked as dispatched / ready. The customer has been emailed.",
  delivered: "Marked as delivered. Thank you!",
  cancelled: "Order cancelled and stock restored.",
};

export default function App() {
  const mobile = useIsMobile();

  // ---------- location (required; demo fallback) ----------
  const [user, setUser] = useState(DEMO_USER);
  const [locStatus, setLocStatus] = useState("asking"); // asking | ok | denied | unavailable | demo
  const [heading, setHeading] = useState(null);
  const [anchor, setAnchor] = useState(DEMO_USER); // location used for queries (moves only when user moves > 300 m)
  const [follow, setFollow] = useState(false);
  const stopRef = useRef(() => {});

  const startLocation = () => {
    stopRef.current();
    setLocStatus("asking");
    let first = true;
    stopRef.current = watchLocation(
      (pos) => {
        setUser(pos);
        setLocStatus("ok");
        if (first) {
          first = false;
          setAnchor(pos);
          setFollow(true);
          setTimeout(() => setFollow(false), 100);
        } else {
          setAnchor((a) => (a.live && distanceKm(a, pos) < 0.3 ? a : pos));
        }
      },
      (err) => setLocStatus(err?.code === 1 ? "denied" : "unavailable"),
    );
  };
  useEffect(() => {
    startLocation();
    const stopCompass = watchCompass((h) => setHeading(Math.round(h)));
    return () => { stopRef.current(); stopCompass(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const goDemo = (city = CITIES[0]) => {
    stopRef.current();
    const u = { ...city, label: `${city.name} (demo)`, accuracy: null, live: false };
    setUser(u);
    setAnchor(u);
    setLocStatus("demo");
  };

  // ---------- state ----------
  const [tab, setTab] = useState("medicines");
  const [loading, setLoading] = useState(false);
  const [nearLoading, setNearLoading] = useState(false);
  const [error, setError] = useState("");
  const [groups, setGroups] = useState([]);
  const [usedAI, setUsedAI] = useState(false);
  const [upload, setUpload] = useState(null);
  const [medicine, setMedicine] = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [nearby, setNearby] = useState({ pharmacies: [], radius: null });
  const [specialty, setSpecialty] = useState("General Physician");
  const [doctors, setDoctors] = useState([]);
  const [docLoading, setDocLoading] = useState(false);
  const [dest, setDest] = useState(null); // { key, name, lat, lng, kind, id }
  const [route, setRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [ordering, setOrdering] = useState(null);
  const [booking, setBooking] = useState(null); // { doctor, reason }
  const [track, setTrack] = useState(null);
  const [toast, setToast] = useState(null);
  const [snap, setSnap] = useState("peek");
  const [sheetH, setSheetH] = useState(0);
  const [showTerms, setShowTerms] = useState(false);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("dd_theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#08111b" : "#e9f1f3");
    try { localStorage.setItem("dd_theme", theme); } catch { /* private mode */ }
  }, [theme]);

  // Deep links (?track=DD-XXXX, ?pa=confirmed&o=DD-XXXX from pharmacy email)
  useEffect(() => {
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

  // ---------- road route to the selected place ----------
  useEffect(() => {
    if (!dest) {
      setRoute(null);
      return undefined;
    }
    let alive = true;
    setRouteLoading(true);
    roadRoute(anchor, dest).then((r) => {
      if (alive) { setRoute(r); setRouteLoading(false); }
    });
    return () => { alive = false; };
  }, [dest, anchor]);

  // ---------- medicines ----------
  const reset = () => {
    setError("");
    setMedicine(null);
    setNearby({ pharmacies: [], radius: null });
    setAlternatives([]);
    setDest(null);
  };

  const pickMedicine = async (m) => {
    setTab("medicines");
    setMedicine(m);
    setDest(null);
    setNearLoading(true);
    if (mobile) setSnap("half");
    try {
      const [near, alts] = await Promise.all([findNearby(m.id, anchor.lat, anchor.lng), getAlternatives(m.id)]);
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

  // ---------- doctors ----------
  const loadDoctors = async (spec) => {
    setDocLoading(true);
    try {
      setDoctors(await nearbyDoctors(spec, anchor.lat, anchor.lng, 15));
    } catch (e) {
      setError(e.message);
    } finally {
      setDocLoading(false);
    }
  };
  useEffect(() => {
    if (tab === "doctors") loadDoctors(specialty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, specialty]);

  // Re-query when the user actually moves (or picks a city)
  useEffect(() => {
    if (medicine) findNearby(medicine.id, anchor.lat, anchor.lng).then(setNearby).catch((e) => setError(e.message));
    if (tab === "doctors") loadDoctors(specialty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  // ---------- map places ----------
  const places = useMemo(() => {
    if (tab === "doctors") {
      const seen = new Map();
      doctors.forEach((d) => { if (!seen.has(d.facility_id)) seen.set(d.facility_id, { key: `f${d.facility_id}`, name: d.facility, lat: d.lat, lng: d.lng, kind: "clinic" }); });
      return [...seen.values()];
    }
    return nearby.pharmacies.map((p) => ({ key: `p${p.pharmacy_id}`, name: p.name, lat: p.lat, lng: p.lng, kind: "pharmacy" }));
  }, [tab, doctors, nearby]);

  const selectPharmacy = (p) => {
    setDest({ key: `p${p.pharmacy_id}`, id: p.pharmacy_id, name: p.name, lat: p.lat, lng: p.lng, kind: "pharmacy" });
    if (mobile) setSnap("peek");
  };
  const selectDoctor = (d) => {
    setDest({ key: `f${d.facility_id}`, id: d.doctor_id, name: `${d.name} · ${d.facility}`, lat: d.lat, lng: d.lng, kind: "clinic" });
    if (mobile) setSnap("peek");
  };
  const onMarker = (key) => {
    if (key.startsWith("p")) {
      const p = nearby.pharmacies.find((x) => `p${x.pharmacy_id}` === key);
      if (p) selectPharmacy(p);
    } else {
      const d = doctors.find((x) => `f${x.facility_id}` === key);
      if (d) selectDoctor(d);
    }
  };

  const mapPadding = useMemo(
    () => (mobile ? { top: 150, left: 30, right: 30, bottom: Math.round(sheetH) + 20 } : { top: 110, left: 460, right: 80, bottom: 80 }),
    [mobile, sheetH],
  );

  const setCity = (name) => {
    const c = CITIES.find((x) => x.name === name);
    if (c) goDemo(c);
  };

  const activePharmacyId = dest?.kind === "pharmacy" ? dest.id : null;
  const activeDoctorId = dest?.kind === "clinic" ? dest.id : null;

  return (
    <div className="fixed inset-0 overflow-clip">
      <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-sky-100 via-teal-50 to-indigo-100 dark:from-[#07111c] dark:via-[#0a1824] dark:to-[#0d1530]">
        <span className="blob left-[10%] top-[15%] h-72 w-72 bg-teal-300" />
        <span className="blob bottom-[10%] right-[15%] h-80 w-80 bg-sky-300" style={{ animationDelay: "-5s" }} />
        <Suspense fallback={null}>
          <MapView user={user} heading={heading} places={places} activeKey={dest?.key} onSelect={onMarker}
            padding={mapPadding} route={route} follow={follow} />
        </Suspense>
      </div>

      <TopBar
        user={user}
        onCity={setCity}
        onGps={startLocation}
        onTrack={() => setTrack({ no: "", phone: "" })}
        theme={theme}
        onTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      />

      <RouteCard dest={dest} route={route} loading={routeLoading} user={anchor} mobile={mobile} onClose={() => setDest(null)} />

      <Panel snap={snap} setSnap={setSnap} onHeight={setSheetH} onTerms={() => setShowTerms(true)}>
        <div className="space-y-4">
          {/* Tabs */}
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-900/5 p-1">
            {[["medicines", "pill", "Medicines"], ["doctors", "shield", "Doctors"]].map(([k, icon, label]) => (
              <button key={k} onClick={() => { setTab(k); setDest(null); }}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-bold transition ${tab === k ? `bg-white shadow-sm ${k === "doctors" ? "text-violet-700" : "text-brand-700"}` : "text-slate-500 hover:text-slate-700"}`}>
                <Icon name={icon} className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          {tab === "doctors" ? (
            <DoctorsTab specialty={specialty} setSpecialty={setSpecialty} doctors={doctors} loading={docLoading}
              activeId={activeDoctorId} onSelect={selectDoctor} onBook={(d) => setBooking({ doctor: d, reason: "" })} intro />
          ) : (
            <>
              {!medicine && !loading && !upload && (
                <div className="anim-fade-up">
                  <h1 className="text-[22px] font-extrabold leading-tight tracking-tight md:text-[24px]">
                    Find your medicine,<br /><span className="bg-gradient-to-r from-brand-600 to-sky-600 bg-clip-text text-transparent">at a pharmacy near you.</span>
                  </h1>
                  <p className="mt-1.5 text-[13px] text-slate-500">21,957 DRAP-registered medicines at official prices. Type it, scan it, or ask the Mini Doctor.</p>
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
                  user={anchor}
                  activeId={activePharmacyId}
                  onSelect={selectPharmacy}
                  onOrder={setOrdering}
                  loading={nearLoading}
                  controlled={!!medicine.is_controlled}
                  medicine={medicine}
                />
              )}

              {medicine?.is_controlled && (
                <p className="rounded-2xl bg-rose-50 px-3.5 py-3 text-[12.5px] text-rose-700">
                  <b>Controlled medicine.</b> It can't be ordered online. Buy it in person at a pharmacy with a valid prescription.
                </p>
              )}

              {medicine && (
                <button onClick={() => { reset(); setGroups([]); setUpload(null); }} className="mx-auto flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-500 hover:text-brand-700">
                  <Icon name="back" className="h-4 w-4" /> New search
                </button>
              )}
            </>
          )}
        </div>
      </Panel>

      <VoiceAgent
        user={anchor}
        bottomOffset={mobile ? sheetH : 0}
        onTerms={() => setShowTerms(true)}
        onBook={(d, reason) => setBooking({ doctor: d, reason: reason ?? "" })}
        onMedicine={(m) => pickMedicine(m)}
        onResult={(res) => {
          setError("");
          setUpload(null);
          if (res.mode === "doctor" && res.doctors?.length) {
            setTab("doctors");
            if (res.specialty) setSpecialty(res.specialty);
            setDoctors(res.doctors);
            if (res.focus) selectDoctor(res.focus);
            return;
          }
          if (!res.medicine) return;
          setTab("medicines");
          setGroups([{ query: res.medicine.product_name, corrected: null, results: res.matches?.length ? res.matches : [res.medicine] }]);
          setUsedAI(true);
          setMedicine(res.medicine);
          setNearby(res.nearby ?? { pharmacies: [], radius: null });
          setAlternatives(res.alternatives ?? []);
          setDest(null);
        }}
      />

      {ordering && medicine && (
        <OrderSheet medicine={medicine} pharmacy={ordering} user={anchor} onClose={() => setOrdering(null)}
          onTrack={(no, phone) => { setOrdering(null); setTrack({ no, phone }); }} />
      )}
      {booking && <BookingSheet doctor={booking.doctor} reason={booking.reason} user={anchor} onClose={() => setBooking(null)} />}
      {showTerms && <Terms onClose={() => setShowTerms(false)} />}
      {track && <TrackOrder initialNo={track.no} initialPhone={track.phone} onClose={() => setTrack(null)} />}

      {(locStatus === "asking" || locStatus === "denied" || locStatus === "unavailable") && (
        <LocationGate status={locStatus} onRetry={startLocation} onDemo={() => goDemo()} />
      )}

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
