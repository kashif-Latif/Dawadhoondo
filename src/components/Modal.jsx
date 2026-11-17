import { useEffect } from "react";
import { Icon } from "./ui";

// Centered glass dialog on desktop, bottom sheet on mobile.
export default function Modal({ title, subtitle, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="glass-dim fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="glass glass-solid flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[28px] anim-sheet-in md:max-w-lg md:rounded-[28px]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
          <div className="min-w-0">
            <h2 className="text-[18px] font-bold leading-tight">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-[12.5px] text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-900/5 text-slate-500 transition hover:bg-slate-900/10">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-slate-900/5 bg-white/40 px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}
