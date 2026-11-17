import { useCallback, useEffect, useState } from "react";
import Modal from "./Modal";
import { Icon, Spinner } from "./ui";
import { getOrder } from "../lib/api";
import { fmtPKR } from "../lib/geo";

const fmtTime = (t) => (t ? new Date(t).toLocaleString("en-PK", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" }) : "");

export default function TrackOrder({ initialNo = "", initialPhone = "", onClose }) {
  const [no, setNo] = useState(initialNo);
  const [phone, setPhone] = useState(initialPhone);
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setBusy(true);
    setError("");
    try {
      setOrder(await getOrder(no, phone));
    } catch (e) {
      if (!quiet) setError(e.message);
    } finally {
      if (!quiet) setBusy(false);
    }
  }, [no, phone]);

  useEffect(() => {
    if (initialNo && initialPhone) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live refresh while the order is moving
  useEffect(() => {
    if (!order || ["delivered", "cancelled"].includes(order.status)) return undefined;
    const t = setInterval(() => load(true), 8000);
    return () => clearInterval(t);
  }, [order, load]);

  const pickup = order?.mode === "pickup";
  const steps = order ? [
    { key: "placed", label: "Order placed", at: order.created_at, icon: "receipt" },
    { key: "confirmed", label: "Confirmed by pharmacy", at: order.confirmed_at, icon: "store" },
    { key: "dispatched", label: pickup ? "Ready for pickup" : `Out for delivery · ${order.courier}`, at: order.dispatched_at, icon: pickup ? "box" : "truck" },
    { key: "delivered", label: pickup ? "Collected" : "Delivered", at: order.delivered_at, icon: "check" },
  ] : [];
  const reached = order ? steps.filter((s) => s.at).length : 0;

  return (
    <Modal title="Track your order" subtitle={order ? `${order.order_no} · ${order.pharmacy}` : "Enter your order number and phone"} onClose={onClose}>
      {!order ? (
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="space-y-2.5 pt-1">
          <input className="field font-mono uppercase" placeholder="Order no. e.g. DD-3F9A1C" value={no} onChange={(e) => setNo(e.target.value)} />
          <input className="field" placeholder="Phone used for the order" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{error}</p>}
          <button disabled={busy || no.length < 5 || phone.length < 10} className="btn-primary flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm">
            {busy && <Spinner />} Track
          </button>
        </form>
      ) : (
        <div className="space-y-4 pt-1 anim-fade-up">
          <div className="rounded-2xl bg-white/70 p-3.5">
            <p className="text-[15px] font-bold">{order.medicine} · {order.unit_label ?? `× ${order.qty}`}</p>
            <p className="text-[12.5px] text-slate-500">{order.pharmacy} · {order.pharmacy_address}</p>
            <p className="mt-1 text-[13px]"><b className="text-brand-700">{fmtPKR(order.total)}</b> · {order.courier} · {order.eta_text}</p>
          </div>

          {order.status === "cancelled" ? (
            <p className="rounded-2xl bg-rose-50 p-4 text-[13px] text-rose-700">This order was cancelled by the pharmacy{order.cancelled_at ? ` on ${fmtTime(order.cancelled_at)}` : ""}. No payment was taken.</p>
          ) : (
            <ol className="relative space-y-4 pl-2">
              {steps.map((s, i) => {
                const done = i < reached;
                const current = i === reached - 1 && order.status !== "delivered";
                return (
                  <li key={s.key} className="relative flex gap-3">
                    {i < steps.length - 1 && <span className={`absolute left-[15px] top-8 h-[calc(100%-8px)] w-0.5 ${i < reached - 1 ? "bg-brand-500" : "bg-slate-900/10"}`} />}
                    <span className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full transition ${done ? "bg-brand-500 text-white" : "bg-white text-slate-400 ring-1 ring-slate-900/10"}`}
                      style={current ? { animation: "pulse-ring 1.8s ease-out infinite" } : undefined}>
                      <Icon name={s.icon} className="h-4 w-4" />
                    </span>
                    <div className="pt-1">
                      <p className={`text-[13.5px] font-semibold ${done ? "" : "text-slate-400"}`}>{s.label}</p>
                      {s.at && <p className="text-[11.5px] text-slate-500">{fmtTime(s.at)}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {!["delivered", "cancelled"].includes(order.status) && (
            <p className="flex items-center gap-1.5 text-[11.5px] text-slate-400"><Spinner className="h-3 w-3" /> Updates automatically</p>
          )}
        </div>
      )}
    </Modal>
  );
}
