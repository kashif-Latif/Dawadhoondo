import { useEffect, useRef, useState } from "react";

// Desktop: floating glass column on the left.
// Mobile: bottom sheet with 3 snap points (peek / half / full), drag the handle or tap it.
const SNAPS = { peek: 0.3, half: 0.55, full: 0.9 };

export function useIsMobile() {
  const q = "(max-width: 767px)";
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
}

export default function Panel({ children, snap, setSnap, onHeight, onTerms }) {
  const mobile = useIsMobile();
  const [dragH, setDragH] = useState(null);
  const start = useRef(null);
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const height = dragH ?? SNAPS[snap] * vh;

  useEffect(() => {
    onHeight?.(mobile ? SNAPS[snap] * vh : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, mobile]);

  if (!mobile) {
    return (
      <aside className="glass absolute bottom-4 left-4 top-20 z-20 flex w-[400px] flex-col overflow-hidden rounded-3xl anim-fade-up lg:w-[420px]">
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        <footer className="border-t border-slate-900/5 px-4 py-2.5 text-[10.5px] text-slate-500">
          Medicines & prices: DRAP Price Index · Pharmacies & stock are demo data ·{" "}
          <button onClick={onTerms} className="font-semibold underline decoration-dotted hover:text-brand-700">Terms & Privacy</button>
        </footer>
      </aside>
    );
  }

  const onDown = (e) => {
    start.current = { y: e.clientY, h: height };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    if (!start.current) return;
    const h = Math.min(0.92 * vh, Math.max(0.22 * vh, start.current.h + (start.current.y - e.clientY)));
    setDragH(h);
  };
  const onUp = () => {
    if (!start.current) return;
    const moved = dragH != null && Math.abs(dragH - start.current.h) > 8;
    if (moved) {
      const frac = dragH / vh;
      const next = Object.entries(SNAPS).reduce((a, b) => (Math.abs(b[1] - frac) < Math.abs(a[1] - frac) ? b : a))[0];
      setSnap(next);
    } else {
      setSnap(snap === "peek" ? "half" : snap === "half" ? "full" : "peek");
    }
    setDragH(null);
    start.current = null;
  };

  return (
    <aside
      className="glass fixed inset-x-0 bottom-0 z-20 flex flex-col rounded-t-[28px] anim-sheet-in"
      style={{ height, transition: dragH == null ? "height .3s cubic-bezier(.2,.8,.2,1)" : "none", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div
        role="button"
        aria-label="Resize panel"
        className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2.5 active:cursor-grabbing"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <span className="h-1.5 w-10 rounded-full bg-slate-900/20" />
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {children}
        <p className="pt-4 text-center text-[10.5px] text-slate-400">
          DRAP price data · demo pharmacies ·{" "}
          <button onClick={onTerms} className="font-semibold underline decoration-dotted">Terms & Privacy</button>
        </p>
      </div>
    </aside>
  );
}
