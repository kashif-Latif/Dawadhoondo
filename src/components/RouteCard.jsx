import { Icon, Spinner } from "./ui";
import { fmtDuration, rideLinks } from "../lib/geo";

// Floating "Google Maps"-style route summary for the selected pharmacy / clinic.
export default function RouteCard({ dest, route, loading, user, onClose, mobile }) {
  if (!dest) return null;
  const links = rideLinks(user, dest);
  return (
    <div className={`fixed z-30 anim-fade-up ${mobile ? "left-3 right-3 top-[72px]" : "left-1/2 top-4 w-[440px] -translate-x-1/2"}`}>
      <div className="glass flex items-center gap-3 rounded-2xl p-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#4285f4] text-white shadow-md">
          <Icon name="car" className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          {loading || !route ? (
            <p className="flex items-center gap-2 text-[13px] font-semibold text-slate-600"><Spinner className="h-3.5 w-3.5" /> Finding the best road route…</p>
          ) : (
            <>
              <p className="text-[16px] font-extrabold leading-tight">
                <span className="text-[#1a73e8] dark:text-[#8ab4f8]">{fmtDuration(route.durationS)}</span>
                <span className="ml-1.5 text-[13px] font-semibold text-slate-500">({route.distanceKm.toFixed(1)} km)</span>
              </p>
              <p className="truncate text-[12px] text-slate-500">
                to <b className="text-slate-700">{dest.name}</b>{route.via ? ` · via ${route.via}` : ""}{!route.exact ? " · approx." : ""}
              </p>
            </>
          )}
        </div>
        <a href={links.directions} target="_blank" rel="noreferrer" title="Navigate in Google Maps"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#1a73e8] text-white shadow-md transition hover:brightness-110">
          <Icon name="route" className="h-5 w-5" />
        </a>
        <button onClick={onClose} aria-label="Close route" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-900/5 text-slate-500 hover:bg-slate-900/10">
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
