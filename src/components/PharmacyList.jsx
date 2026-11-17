import { fmtKm, fmtPKR, rideLinks } from "../lib/geo";

export default function PharmacyList({ pharmacies, radius, user, activeId, onSelect, onOrder }) {
  if (!pharmacies.length) return <p className="text-sm text-slate-400">No pharmacy has this medicine in stock.</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">
        {pharmacies.length} pharmacies within {radius >= 2000 ? "Pakistan" : `${radius} km`}
      </p>
      {pharmacies.map((p) => {
        const links = rideLinks(user, p);
        const active = p.pharmacy_id === activeId;
        return (
          <div
            key={p.pharmacy_id}
            onClick={() => onSelect(p)}
            className={`cursor-pointer rounded-xl p-3 ring-1 transition ${active ? "bg-amber-500/10 ring-amber-400" : "bg-slate-800/60 ring-slate-700 hover:ring-emerald-500"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-white">{p.name}</p>
                <p className="text-xs text-slate-400">{p.address}</p>
              </div>
              <span className="whitespace-nowrap rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-300">
                {fmtKm(p.distance_km)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-300">
              <span>{fmtPKR(p.price)}</span>
              <span>Stock: {p.stock}</span>
              <span>★ {p.rating}</span>
              {p.open_24h && <span className="text-sky-300">24/7</span>}
              {p.delivery && <span className="text-emerald-300">Delivery</span>}
            </div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); onOrder(p); }}
                className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400"
              >
                Order
              </button>
              <a
                href={links.uber}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600"
              >
                🚗 Get a ride
              </a>
              <a
                href={links.directions}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600"
              >
                🧭 Directions
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
