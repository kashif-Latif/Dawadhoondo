export function Spinner({ className = 'size-5' }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".2" strokeWidth="3" fill="none" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

const tones = {
  info: 'bg-mint text-leaf-dark border-leaf/20',
  warn: 'bg-sand text-[#8a5a12] border-saffron/30',
  error: 'bg-blush text-coral border-coral/20',
};

export function Notice({ tone = 'info', children, onClose }) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${tones[tone]}`} role="status">
      <div className="flex-1">{children}</div>
      {onClose && <button onClick={onClose} className="font-semibold opacity-70 hover:opacity-100" aria-label="Dismiss">✕</button>}
    </div>
  );
}

export function Empty({ title, children, icon }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon && <div className="mb-1 grid size-14 place-items-center rounded-2xl bg-sand text-[#8a5a12]">{icon}</div>}
      <h3 className="font-display text-xl font-bold">{title}</h3>
      <div className="max-w-md text-muted">{children}</div>
    </div>
  );
}
