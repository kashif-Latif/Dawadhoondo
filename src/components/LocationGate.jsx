import { Icon, Spinner } from "./ui";

// Location is required to sort pharmacies & doctors by distance.
// status: "asking" | "denied" | "unavailable"
export default function LocationGate({ status, onRetry, onDemo }) {
  if (status === "asking") {
    return (
      <div className="pointer-events-none fixed left-1/2 top-20 z-40 -translate-x-1/2 anim-fade-up">
        <div className="glass flex items-center gap-2 rounded-full px-4 py-2 text-[12.5px] font-semibold text-slate-700">
          <Spinner className="h-3.5 w-3.5 text-[#4285f4]" /> Finding your location…
        </div>
      </div>
    );
  }
  const denied = status === "denied";
  return (
    <div className="glass-dim fixed inset-0 z-[55] flex items-end justify-center md:items-center md:p-6">
      <div className="glass glass-solid w-full max-w-md rounded-t-[28px] p-6 text-center anim-sheet-in md:rounded-[28px]" style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}>
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#4285f4]/12 text-[#4285f4]">
          <Icon name="locate" className="h-8 w-8" />
        </div>
        <h2 className="mt-3 text-[19px] font-bold">Turn on your location</h2>
        <p className="mx-auto mt-1.5 max-w-xs text-[13.5px] text-slate-500">
          DawaDhoondo needs your location to show the nearest pharmacies, doctors and the road route to them.
          It stays on your device and is only used for distance.
        </p>
        {denied && (
          <div className="mt-4 rounded-2xl bg-slate-900/5 p-3 text-left text-[12.5px] text-slate-600">
            <p className="font-semibold text-slate-700">Location is blocked for this site</p>
            <p className="mt-1">Tap the <b>🔒 lock</b> (or ⓘ) next to the web address → <b>Location</b> → <b>Allow</b>, then tap Try again.
              On a phone, also make sure <b>Location / GPS</b> is switched on.</p>
          </div>
        )}
        {status === "unavailable" && (
          <p className="mt-3 text-[12.5px] text-amber-700">We couldn't get a GPS fix. Move near a window or switch on Location / GPS, then try again.</p>
        )}
        <button onClick={onRetry} className="btn-primary mt-5 w-full rounded-2xl py-3.5 text-[15px]">
          {denied ? "Try again" : "Allow location"}
        </button>
        <button onClick={onDemo} className="mt-3 text-[12.5px] font-semibold text-slate-500 underline decoration-dotted hover:text-brand-700">
          Continue with demo location (Lahore)
        </button>
      </div>
    </div>
  );
}
