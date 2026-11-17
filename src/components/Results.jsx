import { Icon, Chip } from "./ui";
import { fmtKm, fmtPKR, fmtUnit, rideLinks } from "../lib/geo";

export function MatchGroups({ groups, usedAI, selectedId, onPick }) {
  if (!groups.length) return null;
  return (
    <section className="space-y-2.5 anim-fade-up">
      {usedAI && (
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-sky-700">
          <Icon name="sparkle" className="h-4 w-4" /> Spelling corrected by AI
        </p>
      )}
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.corrected && <p className="mb-1.5 text-[12px] text-slate-500">Showing results for <b className="text-slate-800">{g.corrected}</b></p>}
          <div className="flex flex-wrap gap-1.5">
            {g.results.slice(0, 6).map((m) => (
              <button key={m.id} onClick={() => onPick(m)}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition ${selectedId === m.id ? "bg-brand-600 text-white shadow-md shadow-brand-600/30" : "bg-white/70 text-slate-700 ring-1 ring-slate-900/8 hover:bg-white"}`}>
                {m.product_name}
                {m.is_controlled ? <span className={`ml-1.5 rounded px-1 text-[9.5px] font-extrabold ${selectedId === m.id ? "bg-white/25 text-white" : "bg-rose-500/15 text-rose-600"}`}>CTRL</span>
                  : m.rx_status === "Rx" ? <span className={`ml-1.5 rounded px-1 text-[9.5px] font-extrabold ${selectedId === m.id ? "bg-white/25 text-white" : "bg-amber-500/15 text-amber-700"}`}>Rx</span> : null}
              </button>
            ))}
            {!g.results.length && <span className="text-[12px] text-slate-400">No match for “{g.query}”</span>}
          </div>
        </div>
      ))}
    </section>
  );
}

export function MedicineCard({ medicine, alternatives, onPick }) {
  return (
    <section className="glass-tile rounded-2xl p-4 anim-fade-up">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold leading-tight">{medicine.product_name}</h2>
          <p className="mt-0.5 text-[13px] text-slate-500">{medicine.generic_composition}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">DRAP max</p>
          <p className="text-[17px] font-extrabold text-brand-700">{fmtPKR(medicine.mrp_pkr)}</p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {medicine.dosage_form && <Chip>{medicine.dosage_form}</Chip>}
        {medicine.strength && <Chip>{medicine.strength}</Chip>}
        {medicine.pack_size && <Chip>Pack {medicine.pack_size}</Chip>}
        {medicine.is_controlled ? <Chip tone="rose"><Icon name="lock" className="h-3 w-3" /> Controlled · in-store with prescription only</Chip>
          : medicine.rx_status === "Rx" ? <Chip tone="amber">Rx · prescription needed</Chip>
          : medicine.rx_status === "OTC" ? <Chip tone="brand">Over the counter</Chip> : null}
      </div>
      {medicine.company && <p className="mt-2 text-[11.5px] text-slate-400">{medicine.company}</p>}

      {!medicine.is_controlled && alternatives.length > 0 && (
        <div className="mt-3 border-t border-slate-900/5 pt-3">
          <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">Same formula, cheaper brands</p>
          <div className="space-y-1">
            {alternatives.slice(0, 4).map((a) => (
              <button key={a.id} onClick={() => onPick(a)}
                className="flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left transition hover:bg-white">
                <span className="min-w-0 truncate text-[13px] font-medium">{a.product_name}</span>
                <span className="shrink-0 text-[12px] text-slate-500">
                  {a.price_per_unit ? <><b className="text-brand-700">{fmtUnit(a.price_per_unit)}</b>/unit</> : fmtPKR(a.mrp_pkr)}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-slate-400">Same formula — ask your doctor or pharmacist before switching.</p>
        </div>
      )}
    </section>
  );
}

export function PharmacyList({ pharmacies, radius, user, activeId, onSelect, onOrder, loading, controlled }) {
  if (loading) {
    return <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-28" />)}</div>;
  }
  if (!pharmacies.length) {
    return <p className="rounded-2xl bg-white/50 p-4 text-center text-[13px] text-slate-500">No pharmacy has this in stock right now.</p>;
  }
  return (
    <section className="space-y-2">
      <p className="px-1 text-[12px] font-semibold text-slate-500">
        {pharmacies.length} {pharmacies.length === 1 ? "pharmacy" : "pharmacies"} with stock · within {radius >= 2000 ? "Pakistan" : `${radius} km`}
      </p>
      <div className="stagger space-y-2">
        {pharmacies.map((p) => {
          const links = rideLinks(user, p);
          const active = p.pharmacy_id === activeId;
          return (
            <article key={p.pharmacy_id} onClick={() => onSelect(p)}
              className={`cursor-pointer rounded-2xl p-3.5 transition ${active ? "bg-white shadow-lg shadow-brand-600/10 ring-2 ring-brand-500" : "glass-tile hover:bg-white/90"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-[14.5px] font-bold">{p.name}</h3>
                  <p className="truncate text-[12px] text-slate-500">{p.address}</p>
                </div>
                <div className="shrink-0 rounded-xl bg-brand-500/10 px-2.5 py-1 text-right">
                  <p className="text-[13px] font-extrabold text-brand-700">{fmtKm(p.distance_km)}</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[15px] font-extrabold">{fmtPKR(p.price)}</span>
                <Chip tone={p.stock < 10 ? "amber" : "brand"}>{p.stock < 10 ? `Only ${p.stock} left` : "In stock"}</Chip>
                <Chip><Icon name="star" className="h-3 w-3" /> {p.rating}</Chip>
                {p.open_24h && <Chip tone="sky">24/7</Chip>}
                {p.delivery && <Chip tone="brand"><Icon name="truck" className="h-3 w-3" /> Delivery</Chip>}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {controlled ? (
                  <span title="Controlled medicine: buy in person with a prescription" className="flex items-center justify-center gap-1 rounded-xl bg-rose-500/10 py-2 text-[11.5px] font-semibold text-rose-600">
                    <Icon name="lock" className="h-3.5 w-3.5" /> In-store
                  </span>
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); onOrder(p); }} className="btn-primary rounded-xl py-2 text-[12.5px]">
                    Order
                  </button>
                )}
                <a href={links.uber} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                  className="btn-soft flex items-center justify-center gap-1 rounded-xl py-2 text-[12.5px] text-slate-700">
                  <Icon name="car" className="h-4 w-4" /> Ride
                </a>
                <a href={links.directions} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                  className="btn-soft flex items-center justify-center gap-1 rounded-xl py-2 text-[12.5px] text-slate-700">
                  <Icon name="route" className="h-4 w-4" /> Route
                </a>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
