import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { Icon, Spinner } from "./ui";
import { doctorSlots, bookAppointment } from "../lib/api";
import { fmtPKR, rideLinks } from "../lib/geo";

const SAVED = "dd_contact";
const pkDate = (d) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }); // YYYY-MM-DD

export default function BookingSheet({ doctor, user, reason: initialReason = "", onClose }) {
  const saved = (() => { try { return JSON.parse(localStorage.getItem(SAVED) || "{}"); } catch { return {}; } })();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(Date.now() + i * 864e5)), []);
  const [day, setDay] = useState(doctor.next_slot ? pkDate(new Date(doctor.next_slot)) : pkDate(days[0]));
  const [slots, setSlots] = useState(null);
  const [slot, setSlot] = useState(null);
  const [form, setForm] = useState({ name: saved.name ?? "", phone: saved.phone ?? "", email: saved.email ?? "", reason: initialReason });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    setSlots(null);
    setSlot(null);
    doctorSlots(doctor.doctor_id, day).then(setSlots).catch((e) => setError(e.message));
  }, [doctor, day]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valid = slot && form.name.trim().length >= 2 && /^\+?[0-9 -]{10,15}$/.test(form.phone.trim()) && (!form.email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email));

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await bookAppointment({ doctorId: doctor.doctor_id, startsAt: slot.starts_at, name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), reason: form.reason.trim() });
      try { localStorage.setItem(SAVED, JSON.stringify({ ...saved, name: form.name, phone: form.phone, email: form.email })); } catch { /* ignore */ }
      setDone(res);
    } catch (e) {
      setError(e.message);
      if (/no longer available|just booked/i.test(e.message)) doctorSlots(doctor.doctor_id, day).then(setSlots);
    } finally {
      setBusy(false);
    }
  };

  const when = (t) => new Date(t).toLocaleString("en-PK", { timeZone: "Asia/Karachi", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

  if (done) {
    return (
      <Modal title="Appointment booked" onClose={onClose}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onClose} className="btn-soft rounded-xl py-3 text-sm">Done</button>
            <a href={rideLinks(user, doctor).directions} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-violet-500 to-violet-700 py-3 text-sm font-semibold text-white">
              <Icon name="route" className="h-4 w-4" /> Directions
            </a>
          </div>
        }>
        <div className="flex flex-col items-center py-3 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-violet-400 to-violet-700 text-white shadow-lg shadow-violet-600/30" style={{ animation: "pop .5s both" }}>
            <Icon name="check" className="h-8 w-8" strokeWidth={3} />
          </div>
          <p className="mt-3 text-[13px] text-slate-500">Appointment number</p>
          <p className="font-mono text-2xl font-extrabold tracking-wider">{done.appt_no}</p>
          <p className="mt-2 text-[14px] font-bold">{done.doctor}</p>
          <p className="text-[13px] text-slate-600">{when(done.starts_at)}</p>
          <p className="text-[13px] text-slate-600">{done.facility} · {doctor.address}</p>
          <p className="mt-1 text-[14px] font-bold text-violet-700">Fee {fmtPKR(done.fee_pkr)} · pay at the clinic</p>
          <div className="mt-4 w-full rounded-xl bg-white/60 px-3 py-2 text-left text-[12.5px]">
            {form.email
              ? done.emailed?.sent?.includes("patient") ? `✅ Confirmation emailed to ${form.email}` : "Confirmation email could not be sent. Please save your appointment number."
              : "No email given. Please save your appointment number."}
          </div>
          <p className="mt-2 text-[11.5px] text-slate-400">Arrive 10 minutes early and bring previous prescriptions or reports.</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Book appointment" subtitle={`${doctor.name} · ${doctor.specialty} · ${doctor.facility}`} onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] text-slate-500">Consultation fee</p>
              <p className="text-[17px] font-extrabold">{fmtPKR(doctor.fee_pkr)}</p>
            </div>
            <button disabled={!valid || busy} onClick={submit}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-b from-violet-500 to-violet-700 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-violet-600/30 disabled:opacity-50">
              {busy && <Spinner />} Confirm booking
            </button>
          </div>
        </div>
      }>
      <div className="space-y-4 pt-1">
        <div>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-400">Pick a day</p>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {days.map((d) => {
              const k = pkDate(d);
              const sel = k === day;
              return (
                <button key={k} onClick={() => setDay(k)}
                  className={`flex w-14 shrink-0 flex-col items-center rounded-2xl py-2 transition ${sel ? "bg-violet-600 text-white shadow-md shadow-violet-600/30" : "bg-white/60 ring-1 ring-slate-900/6 hover:bg-white"}`}>
                  <span className={`text-[10.5px] font-semibold uppercase ${sel ? "text-white/80" : "text-slate-400"}`}>{d.toLocaleDateString("en-PK", { weekday: "short", timeZone: "Asia/Karachi" })}</span>
                  <span className="text-[17px] font-extrabold">{d.toLocaleDateString("en-PK", { day: "numeric", timeZone: "Asia/Karachi" })}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-400">Pick a time</p>
          {!slots ? (
            <div className="grid grid-cols-4 gap-1.5">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton h-9" />)}</div>
          ) : slots.length === 0 ? (
            <p className="rounded-xl bg-slate-900/5 px-3 py-3 text-center text-[12.5px] text-slate-500">No free time on this day. Try another day.</p>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {slots.map((s) => (
                <button key={s.starts_at} onClick={() => setSlot(s)}
                  className={`rounded-xl py-2 text-[12.5px] font-semibold transition ${slot?.starts_at === s.starts_at ? "bg-violet-600 text-white" : "bg-white/70 ring-1 ring-slate-900/6 hover:bg-white"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-2.5">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Patient details</p>
          <input className="field" placeholder="Patient's full name" value={form.name} onChange={set("name")} autoComplete="name" />
          <input className="field" placeholder="Phone (03xx xxxxxxx)" inputMode="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" />
          <input className="field" placeholder="Email for confirmation (optional)" inputMode="email" value={form.email} onChange={set("email")} autoComplete="email" />
          <textarea className="field resize-none" rows={2} placeholder="Reason / symptoms (optional)" value={form.reason} onChange={set("reason")} maxLength={300} />
        </div>
        <p className="text-[11px] text-slate-400">Demo doctors and clinics. Fee is paid at the clinic.</p>
      </div>
    </Modal>
  );
}
