import { useEffect, useRef, useState } from 'react';
import { searchMedicines, medLabel } from '../lib/api';
import { SearchIcon } from './Icons';

// Typo-tolerant medicine box with instant suggestions from the catalog.
export default function MedicineInput({ onPick, onEnter, placeholder, autoFocus, rightSlot, value, onChange }) {
  const [q, setQ] = useState(value || '');
  const [hits, setHits] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef();

  useEffect(() => { if (value !== undefined) setQ(value); }, [value]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(async () => {
      try { setHits(await searchMedicines(q, 7)); setActive(0); } catch { setHits([]); }
    }, 180);
    return () => clearTimeout(timer.current);
  }, [q]);

  const set = (v) => { setQ(v); onChange?.(v); setOpen(true); };
  const pick = (m) => { onPick(m); set(''); setHits([]); setOpen(false); };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === 'Escape') setOpen(false);
    if (e.key === 'Enter') {
      e.preventDefault();
      if (open && hits[active]) pick(hits[active]);
      else onEnter?.(q);
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-paper pl-4 pr-2 focus-within:border-leaf focus-within:ring-4 focus-within:ring-mint">
        <SearchIcon className="size-5 shrink-0 text-muted" />
        <input
          value={q}
          onChange={(e) => set(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder || 'Type a medicine, e.g. Panadol, Augmentin…'}
          autoFocus={autoFocus}
          className="min-w-0 flex-1 bg-transparent py-3.5 text-base outline-none placeholder:text-muted/70"
          aria-label="Medicine name"
          autoComplete="off"
        />
        {rightSlot}
      </div>

      {open && hits.length > 0 && (
        <ul className="absolute z-[1000] mt-2 w-full overflow-hidden rounded-2xl border border-line bg-paper shadow-xl">
          {hits.map((m, i) => (
            <li key={m.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(m)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left ${i === active ? 'bg-mint' : 'hover:bg-cream'}`}
              >
                <span>
                  <span className="font-semibold">{medLabel(m)}</span>
                  <span className="ml-2 text-sm text-muted">{m.form}</span>
                </span>
                <span className="truncate text-sm text-muted">{m.generic}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
