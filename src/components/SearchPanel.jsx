import { useRef, useState } from "react";

export default function SearchPanel({ onText, onFile, loading }) {
  const [q, setQ] = useState("");
  const fileRef = useRef(null);

  const submit = (e) => {
    e.preventDefault();
    if (q.trim().length >= 2) onText(q.trim());
  };

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Medicine name — e.g. panadoll, augmantin, risek 40"
          className="flex-1 rounded-xl bg-slate-800/80 px-4 py-3 text-sm text-white placeholder-slate-400 outline-none ring-1 ring-slate-700 focus:ring-emerald-500"
        />
        <button
          disabled={loading}
          className="rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-50"
        >
          {loading ? "…" : "Find"}
        </button>
      </form>

      <button
        type="button"
        disabled={loading}
        onClick={() => fileRef.current?.click()}
        className="w-full rounded-xl border border-dashed border-slate-600 px-4 py-3 text-sm text-slate-300 hover:border-emerald-500 hover:text-emerald-300 disabled:opacity-50"
      >
        📄 Upload prescription / medicine photo (image or PDF)
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
