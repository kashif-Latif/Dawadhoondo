import { useEffect, useState } from "react";
import { Icon, Chip } from "./ui";
import { fmtKm, fmtPKR, fmtSlot } from "../lib/geo";

export const SPECIALTIES = [
  ["General Physician", "🩺"], ["Pediatrician", "🧒"], ["Gynecologist", "🤰"], ["Dermatologist", "🧴"],
  ["ENT Specialist", "👂"], ["Cardiologist", "❤️"], ["Gastroenterologist", "🫃"], ["Orthopedic Surgeon", "🦴"],
  ["Neurologist", "🧠"], ["Psychiatrist", "💬"], ["Pulmonologist", "🫁"], ["Endocrinologist", "🩸"],
  ["Urologist", "💧"], ["Eye Specialist", "👁️"], ["Dentist", "🦷"], ["Nephrologist", "🫘"],
];

const initials = (n) => n.replace(/^Dr\.?\s*/, "").split(" ").map((x) => x[0]).slice(0, 2).join("");

export function DoctorCard({ d, active, onSelect, onBook, compact }) {
  return (
    <article onClick={() => onSelect?.(d)}
      className={`cursor-pointer rounded-2xl p-3.5 transition ${active ? "bg-white shadow-lg shadow-violet-600/10 ring-2 ring-violet-500" : "glass-tile hover:bg-white/90"}`}>
      <div className="flex items-start gap-3">
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-[14px] font-bold text-white ${d.gender === "F" ? "bg-gradient-to-br from-pink-400 to-violet-500" : "bg-gradient-to-br from-sky-400 to-violet-600"}`}>
          {initials(d.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-[14.5px] font-bold">{d.name}</h3>
              <p className="truncate text-[12px] font-semibold text-violet-700">{d.specialty}</p>
            </div>
            {d.distance_km != null && <span className="shrink-0 rounded-xl bg-violet-500/10 px-2 py-0.5 text-[12.5px] font-extrabold text-violet-700">{fmtKm(d.distance_km)}</span>}
          </div>
          {!compact && <p className="truncate text-[11.5px] text-slate-500">{d.qualifications} · {d.experience_yrs} yrs</p>}
          <p className="mt-0.5 truncate text-[12px] text-slate-600">
            <span className="font-semibold">{d.facility}</span> · {d.address}
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[14px] font-extrabold">{fmtPKR(d.fee_pkr)}</span>
        <Chip><Icon name="star" className="h-3 w-3" /> {d.rating} ({d.reviews})</Chip>
        <Chip tone={d.next_slot ? "brand" : "slate"}><Icon name="clock" className="h-3 w-3" /> {fmtSlot(d.next_slot)}</Chip>
        {d.emergency && <Chip tone="rose">24/7 emergency</Chip>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <button disabled={!d.next_slot} onClick={(e) => { e.stopPropagation(); onBook(d); }}
          className="rounded-xl bg-gradient-to-b from-violet-500 to-violet-700 py-2 text-[12.5px] font-semibold text-white shadow-md shadow-violet-600/30 transition active:scale-[.97] disabled:opacity-50">
          Book appointment
        </button>
        <button onClick={(e) => { e.stopPropagation(); onSelect?.(d); }} className="btn-soft flex items-center justify-center gap-1 rounded-xl py-2 text-[12.5px] text-slate-700">
          <Icon name="route" className="h-4 w-4" /> Route
        </button>
      </div>
    </article>
  );
}

export default function DoctorsTab({ specialty, setSpecialty, doctors, loading, activeId, onSelect, onBook, intro }) {
  const [filter, setFilter] = useState("");
  useEffect(() => {
    setFilter("");
  }, [specialty]);
  const list = doctors.filter((d) => !filter || `${d.name} ${d.facility}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="space-y-3">
      {intro && (
        <div className="rounded-2xl bg-gradient-to-br from-violet-500/10 to-sky-500/10 p-3.5 text-[12.5px] text-slate-600 anim-fade-up">
          <p className="font-bold text-slate-800">Not sure which doctor?</p>
          Tap <b>Mini Doctor</b> and describe your symptoms. It suggests the right specialist near you and helps you book.
        </div>
      )}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scroll-thin">
        {SPECIALTIES.map(([s, e]) => (
          <button key={s} onClick={() => setSpecialty(s)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition ${specialty === s ? "bg-violet-600 text-white shadow-md shadow-violet-600/30" : "bg-white/70 text-slate-700 ring-1 ring-slate-900/8 hover:bg-white"}`}>
            {e} {s}
          </button>
        ))}
      </div>
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by doctor or clinic name" className="field !py-2.5 !pl-9 text-[13px]" />
      </div>
      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-36" />)}</div>
      ) : (
        <>
          <p className="px-1 text-[12px] font-semibold text-slate-500">{list.length} {specialty}{list.length === 1 ? "" : "s"} near you · demo doctors</p>
          <div className="stagger space-y-2">
            {list.map((d) => <DoctorCard key={d.doctor_id} d={d} active={d.doctor_id === activeId} onSelect={onSelect} onBook={onBook} />)}
          </div>
        </>
      )}
    </div>
  );
}
