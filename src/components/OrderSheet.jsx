import { useEffect, useState } from "react";
import Modal from "./Modal";
import { Icon, Spinner, Chip } from "./ui";
import { courierQuotes, placeOrderV2 } from "../lib/api";
import { fmtPKR } from "../lib/geo";

const COURIER_ICON = { pickup: "store", rider: "bike", bykea: "bike", tcs: "truck", leopards: "box" };
const SAVED = "dd_contact";

function loadContact() {
  try {
    return JSON.parse(localStorage.getItem(SAVED) || "{}");
  } catch {
    return {};
  }
}

export default function OrderSheet({ medicine, pharmacy, user, onClose, onTrack }) {
  const saved = loadContact();
  const [step, setStep] = useState(0);
  const [quotes, setQuotes] = useState(null);
  const [form, setForm] = useState({
    qty: 1, courier: "", name: saved.name ?? "", phone: saved.phone ?? "", email: saved.email ?? "", address: saved.address ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    courierQuotes(pharmacy.pharmacy_id, user.lat, user.lng)
      .then((q) => {
        const list = pharmacy.delivery ? q : q.filter((x) => x.code === "pickup" || x.code === "tcs" || x.code === "leopards");
        setQuotes(list);
        setForm((f) => ({ ...f, courier: f.courier || (list.find((x) => x.code === "rider") ?? list[0])?.code }));
      })
      .catch((e) => setError(e.message));
  }, [pharmacy, user]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const quote = quotes?.find((q) => q.code === form.courier);
  const subtotal = (pharmacy.price ?? 0) * form.qty;
  const fee = Number(quote?.fee ?? 0);
  const isPickup = form.courier === "pickup";
  const maxQty = Math.min(20, pharmacy.stock);

  const validDetails =
    form.name.trim().length >= 2 &&
    /^\+?[0-9 -]{10,15}$/.test(form.phone.trim()) &&
    (!form.email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) &&
    (isPickup || form.address.trim().length >= 5);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await placeOrderV2({
        pharmacyId: pharmacy.pharmacy_id, medicineId: medicine.id, qty: Number(form.qty),
        name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), address: form.address.trim(),
        courier: form.courier, lat: user.lat, lng: user.lng,
      });
      try {
        localStorage.setItem(SAVED, JSON.stringify({ name: form.name, phone: form.phone, email: form.email, address: form.address }));
      } catch { /* private mode */ }
      setDone(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Modal title="Order placed" onClose={onClose}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onClose} className="btn-soft rounded-xl py-3 text-sm">Done</button>
            <button onClick={() => onTrack(done.order_no, form.phone)} className="btn-primary rounded-xl py-3 text-sm">Track order</button>
          </div>
        }>
        <div className="flex flex-col items-center py-4 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-lg shadow-brand-600/30" style={{ animation: "pop .5s both" }}>
            <Icon name="check" className="h-8 w-8" strokeWidth={3} />
          </div>
          <p className="mt-3 text-[13px] text-slate-500">Your order number</p>
          <p className="font-mono text-2xl font-extrabold tracking-wider">{done.order_no}</p>
          <p className="mt-2 max-w-xs text-[13px] text-slate-600">
            {form.qty} × {medicine.product_name} from <b>{pharmacy.name}</b> · {done.courier_name} · {done.eta_text}
          </p>
          <p className="mt-1 text-[15px] font-bold text-brand-700">{fmtPKR(done.total)} cash on delivery</p>
          <div className="mt-4 w-full space-y-1.5 text-left">
            <Status ok label={`Sent to ${pharmacy.name}`} />
            {form.email ? (
              <Status ok={done.emailed?.sent?.includes("customer")} label={done.emailed?.sent?.includes("customer") ? `Confirmation emailed to ${form.email}` : "Confirmation email could not be sent"} />
            ) : (
              <Status label="No email given — save your order number" />
            )}
          </div>
        </div>
      </Modal>
    );
  }

  const steps = ["Delivery", "Your details", "Review"];
  return (
    <Modal
      title="Order medicine"
      subtitle={`${medicine.product_name} · ${pharmacy.name}`}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] text-slate-500">Total</p>
              <p className="text-[17px] font-extrabold">{fmtPKR(subtotal + fee)}</p>
            </div>
            <div className="flex gap-2">
              {step > 0 && <button onClick={() => setStep(step - 1)} className="btn-soft rounded-xl px-4 py-3 text-sm">Back</button>}
              {step < 2 ? (
                <button disabled={step === 0 ? !quote : !validDetails} onClick={() => setStep(step + 1)} className="btn-primary rounded-xl px-6 py-3 text-sm">
                  Continue
                </button>
              ) : (
                <button disabled={busy} onClick={submit} className="btn-primary flex items-center gap-2 rounded-xl px-6 py-3 text-sm">
                  {busy && <Spinner />} Place order
                </button>
              )}
            </div>
          </div>
        </div>
      }
    >
      <ol className="mb-4 flex items-center gap-2">
        {steps.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold transition ${i < step ? "bg-brand-500 text-white" : i === step ? "bg-brand-600 text-white ring-4 ring-brand-500/20" : "bg-slate-900/8 text-slate-500"}`}>
              {i < step ? <Icon name="check" className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <span className={`hidden text-[12px] font-semibold sm:inline ${i === step ? "text-slate-800" : "text-slate-400"}`}>{s}</span>
            {i < steps.length - 1 && <span className="h-px flex-1 bg-slate-900/10" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-4 anim-fade-up">
          <div className="flex items-center justify-between rounded-2xl bg-white/60 p-3">
            <div>
              <p className="text-[13px] font-semibold">Quantity</p>
              <p className="text-[11.5px] text-slate-500">{fmtPKR(pharmacy.price)} each · {pharmacy.stock} in stock</p>
            </div>
            <div className="flex items-center gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-900/8">
              <button onClick={() => setForm((f) => ({ ...f, qty: Math.max(1, f.qty - 1) }))} className="grid h-8 w-8 place-items-center rounded-lg text-lg font-bold hover:bg-slate-100">−</button>
              <span className="w-8 text-center font-bold">{form.qty}</span>
              <button onClick={() => setForm((f) => ({ ...f, qty: Math.min(maxQty, f.qty + 1) }))} className="grid h-8 w-8 place-items-center rounded-lg text-lg font-bold hover:bg-slate-100">+</button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-400">How do you want it?</p>
            {!quotes ? (
              <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16" />)}</div>
            ) : (
              <div className="space-y-2">
                {quotes.map((q) => {
                  const sel = form.courier === q.code;
                  return (
                    <button key={q.code} onClick={() => setForm((f) => ({ ...f, courier: q.code }))}
                      className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${sel ? "bg-white ring-2 ring-brand-500 shadow-md shadow-brand-600/10" : "bg-white/55 ring-1 ring-slate-900/6 hover:bg-white"}`}>
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${sel ? "bg-brand-600 text-white" : "bg-slate-900/5 text-slate-600"}`}>
                        <Icon name={COURIER_ICON[q.code] ?? "truck"} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold">{q.name}</span>
                        <span className="flex items-center gap-1 text-[12px] text-slate-500"><Icon name="clock" className="h-3.5 w-3.5" /> {q.eta_text}</span>
                      </span>
                      <span className="text-[14px] font-bold">{Number(q.fee) === 0 ? <span className="text-brand-700">Free</span> : fmtPKR(q.fee)}</span>
                    </button>
                  );
                })}
                <p className="px-1 text-[11px] text-slate-400">Courier fees are estimates for the demo · {quotes[0]?.distance_km} km from you</p>
              </div>
            )}
          </div>
          {medicine.rx_status === "Rx" && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-800">This medicine needs a prescription. Keep it ready for the rider or at pickup.</p>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-2.5 anim-fade-up">
          <Field icon="pill" label="Full name"><input className="field" value={form.name} onChange={set("name")} autoComplete="name" placeholder="e.g. Ali Raza" /></Field>
          <Field icon="phone" label="Phone"><input className="field" value={form.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" placeholder="03xx xxxxxxx" /></Field>
          <Field icon="mail" label="Email (for confirmation)"><input className="field" value={form.email} onChange={set("email")} inputMode="email" autoComplete="email" placeholder="you@example.com" /></Field>
          {!isPickup && (
            <Field icon="pin" label="Delivery address">
              <textarea className="field resize-none" rows={2} value={form.address} onChange={set("address")} autoComplete="street-address" placeholder="House, street, area, city" />
            </Field>
          )}
          <p className="text-[11px] text-slate-400">Saved on this device for next time.</p>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3 anim-fade-up">
          <div className="rounded-2xl bg-white/70 p-3.5 text-[13px]">
            <Row k="Medicine" v={`${medicine.product_name} × ${form.qty}`} />
            <Row k="Pharmacy" v={pharmacy.name} />
            <Row k={isPickup ? "Pickup" : "Deliver to"} v={isPickup ? pharmacy.address : form.address} />
            <Row k="Method" v={`${quote?.name} · ${quote?.eta_text}`} />
            <Row k="Contact" v={`${form.name} · ${form.phone}`} />
            {form.email && <Row k="Email" v={form.email} />}
          </div>
          <div className="rounded-2xl bg-white/70 p-3.5 text-[13px]">
            <Row k="Subtotal" v={fmtPKR(subtotal)} />
            <Row k="Delivery" v={fee === 0 ? "Free" : fmtPKR(fee)} />
            <div className="mt-1.5 flex justify-between border-t border-slate-900/5 pt-2 text-[15px] font-extrabold">
              <span>Total</span><span className="text-brand-700">{fmtPKR(subtotal + fee)}</span>
            </div>
            <div className="mt-2"><Chip tone="slate">Cash on delivery · demo, no payment taken</Chip></div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Field({ icon, label, children }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-slate-500"><Icon name={icon} className="h-3.5 w-3.5" />{label}</span>
      {children}
    </label>
  );
}
const Row = ({ k, v }) => (
  <div className="flex justify-between gap-4 py-1">
    <span className="shrink-0 text-slate-500">{k}</span><span className="text-right font-medium">{v}</span>
  </div>
);
const Status = ({ ok, label }) => (
  <div className="flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2 text-[12.5px]">
    <span className={`grid h-5 w-5 place-items-center rounded-full ${ok ? "bg-brand-500 text-white" : "bg-slate-900/10 text-slate-500"}`}>
      <Icon name={ok ? "check" : "mail"} className="h-3 w-3" strokeWidth={3} />
    </span>
    {label}
  </div>
);
