import { Icon } from "./ui";
import { CITIES } from "../lib/geo";

export default function TopBar({ user, onCity, onGps, onTrack }) {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-3 md:p-4">
      <div className="glass pointer-events-auto flex min-w-0 items-center gap-2 rounded-2xl py-2 pl-3 pr-2 anim-fade-up">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-sky-500 text-white shadow-md">
          <Icon name="pill" className="h-5 w-5" strokeWidth={2.2} />
        </div>
        <div className="hidden min-w-0 sm:block">
          <p className="text-[15px] font-extrabold leading-none tracking-tight">
            Dawa<span className="text-brand-600">Dhoondo</span>
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">Medicine near you, anywhere in Pakistan</p>
        </div>
        <div className="mx-1 hidden h-8 w-px bg-slate-900/10 sm:block" />
        <label className="relative flex items-center">
          <Icon name="pin" className="pointer-events-none absolute left-2.5 h-4 w-4 text-brand-600" />
          <select
            aria-label="Your location"
            value={CITIES.some((c) => c.name === user.label) ? user.label : "__current"}
            onChange={(e) => (e.target.value === "__gps" ? onGps() : onCity(e.target.value))}
            className="cursor-pointer appearance-none rounded-xl bg-white/70 py-2 pl-8 pr-7 text-[13px] font-semibold outline-none ring-1 ring-slate-900/10 hover:bg-white focus:ring-brand-500"
          >
            {!CITIES.some((c) => c.name === user.label) && <option value="__current">{user.label}</option>}
            <option value="__gps">📍 Use my location</option>
            {CITIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <Icon name="chevron" className="pointer-events-none absolute right-2 h-3.5 w-3.5 rotate-90 text-slate-500" />
        </label>
      </div>

      <button
        onClick={onTrack}
        className="glass pointer-events-auto flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-[13px] font-semibold text-slate-700 transition hover:text-brand-700 anim-fade-up"
      >
        <Icon name="receipt" className="h-4.5 w-4.5" />
        <span className="hidden sm:inline">Track order</span>
      </button>
    </header>
  );
}
