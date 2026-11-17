import { useState } from "react";
import { placeOrder } from "../lib/api";
import { fmtPKR } from "../lib/geo";

export default function OrderModal({ medicine, pharmacy, onClose }) {
  const [form, setForm] = useState({ name: "", phone: "", address: "", qty: 1, mode: pharmacy.delivery ? "delivery" : "pickup" });
  const [state, setState] = useState({ loading: false, error: "", done: null });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setState({ loading: true, error: "", done: null });
    try {
      const res = await placeOrder({
        pharmacyId: pharmacy.pharmacy_id,
        medicineId: medicine.id,
        qty: Number(form.qty),
        name: form.name,
        phone: form.phone,
        address: form.address,
        mode: form.mode,
      });
      setState({ loading: false, error: "", done: res });
    } catch (err) {
      setState({ loading: false, error: err.message, done: null });
    }
  };

  const input = "w-full rounded-lg bg-slate-800 px-3 py-2 text-sm text-white outline-none ring-1 ring-slate-700 focus:ring-emerald-500";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass w-full max-w-md rounded-2xl p-5 text-white" onClick={(e) => e.stopPropagation()}>
        {state.done ? (
          <div className="space-y-3 text-center">
            <div className="text-4xl">✅</div>
            <h3 className="text-lg font-bold">Order placed</h3>
            <p className="text-sm text-slate-300">
              {form.qty} × {medicine.product_name} from {pharmacy.name}
            </p>
            <p className="text-sm">Total: <b>{fmtPKR(state.done.total)}</b></p>
            <p className="font-mono text-xs text-slate-400">Order ID: {state.done.order_id}</p>
            <button onClick={onClose} className="mt-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold">Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <h3 className="text-lg font-bold">Order medicine</h3>
              <p className="text-xs text-slate-400">
                {medicine.product_name} · {pharmacy.name} · {fmtPKR(pharmacy.price)} each · {pharmacy.stock} in stock
              </p>
            </div>
            <input required minLength={2} maxLength={80} placeholder="Full name" value={form.name} onChange={set("name")} className={input} />
            <input required pattern="^\+?[0-9 \-]{10,15}$" placeholder="Phone (03xx xxxxxxx)" value={form.phone} onChange={set("phone")} className={input} />
            <div className="flex gap-2">
              <input type="number" min={1} max={Math.min(20, pharmacy.stock)} value={form.qty} onChange={set("qty")} className={input + " w-24"} />
              <select value={form.mode} onChange={set("mode")} className={input}>
                {pharmacy.delivery && <option value="delivery">Home delivery</option>}
                <option value="pickup">Pickup from pharmacy</option>
              </select>
            </div>
            {form.mode === "delivery" && (
              <textarea required minLength={5} maxLength={300} placeholder="Delivery address" value={form.address} onChange={set("address")} className={input} rows={2} />
            )}
            {state.error && <p className="text-sm text-red-400">{state.error}</p>}
            <div className="flex justify-between pt-1">
              <span className="text-sm text-slate-300">Total: <b>{fmtPKR(pharmacy.price * form.qty)}</b></span>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-slate-300">Cancel</button>
                <button disabled={state.loading} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold disabled:opacity-50">
                  {state.loading ? "Placing…" : "Place order"}
                </button>
              </div>
            </div>
            <p className="text-[10px] text-slate-500">Demo order — no payment is taken.</p>
          </form>
        )}
      </div>
    </div>
  );
}
