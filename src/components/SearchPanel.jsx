import { useEffect, useRef, useState } from "react";
import { Icon, Spinner } from "./ui";

const EXAMPLES = ["Panadol", "Augmentin 625", "Risek 20", "Brufen", "Calpol syrup"];
const STAGES = ["Reading your file", "AI is reading the prescription", "Matching with 21,957 DRAP medicines", "Done"];

export default function SearchPanel({ onText, onFile, loading, upload }) {
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);

  const submit = (e) => {
    e.preventDefault();
    if (q.trim().length >= 2) onText(q.trim());
  };
  const pick = (f) => f && onFile(f);

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="relative">
        <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a medicine — even misspelled"
          enterKeyHint="search"
          className="field !rounded-2xl !py-3.5 !pl-11 !pr-28 text-[15px]"
        />
        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
          <button type="button" onClick={() => fileRef.current?.click()} title="Scan prescription"
            className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 transition hover:bg-brand-50 hover:text-brand-700">
            <Icon name="upload" />
          </button>
          <button disabled={loading} className="btn-primary h-10 rounded-xl px-4 text-sm">
            {loading && !upload ? <Spinner /> : "Find"}
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
          onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      </form>

      {upload ? (
        <UploadProgress upload={upload} />
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
          onClick={() => fileRef.current?.click()}
          className={`group flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed p-3 transition ${drag ? "border-brand-500 bg-brand-50/80" : "border-slate-900/15 bg-white/40 hover:border-brand-400 hover:bg-white/70"}`}
        >
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sky-100 to-brand-100 text-brand-700 transition group-hover:scale-105">
            <Icon name="file" />
          </div>
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold">Scan a prescription or medicine box</p>
            <p className="text-[11.5px] text-slate-500">Photo or PDF · drop it here or tap to upload</p>
          </div>
        </div>
      )}

      {!upload && (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((x) => (
            <button key={x} onClick={() => { setQ(x); onText(x); }}
              className="rounded-full bg-white/60 px-3 py-1 text-[12px] font-medium text-slate-600 ring-1 ring-slate-900/5 transition hover:bg-white hover:text-brand-700">
              {x}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UploadProgress({ upload }) {
  const { file, stage, error, extracted } = upload;
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!file?.type?.startsWith("image/")) return undefined;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  return (
    <div className="glass-tile overflow-hidden rounded-2xl anim-scale-in">
      <div className="flex items-center gap-3 p-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100">
          {url ? <img src={url} alt="" className="h-full w-full object-cover" /> :
            <div className="grid h-full w-full place-items-center text-rose-500"><Icon name="file" className="h-7 w-7" /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{file?.name}</p>
          <p className="text-[11.5px] text-slate-500">{(file?.size / 1024).toFixed(0)} KB</p>
        </div>
      </div>
      <ol className="space-y-1.5 border-t border-slate-900/5 px-3 py-2.5">
        {STAGES.map((s, i) => {
          const done = stage > i || stage === 3;
          const active = stage === i && !error && stage !== 3;
          return (
            <li key={s} className={`flex items-center gap-2 text-[12.5px] ${done ? "text-slate-700" : active ? "font-semibold text-brand-700" : "text-slate-400"}`}>
              <span className={`grid h-5 w-5 place-items-center rounded-full ${done ? "bg-brand-500 text-white" : active ? "bg-brand-100" : "bg-slate-900/5"}`}>
                {done ? <Icon name="check" className="h-3 w-3" strokeWidth={3} /> : active ? <Spinner className="h-3 w-3 text-brand-600" /> : null}
              </span>
              {s}
            </li>
          );
        })}
      </ol>
      {error && <p className="border-t border-rose-100 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{error}</p>}
      {extracted?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-slate-900/5 px-3 py-2.5">
          <span className="w-full text-[11px] font-semibold uppercase tracking-wide text-slate-400">Found in your file</span>
          {extracted.map((m, i) => (
            <span key={i} className="rounded-full bg-brand-500/10 px-2.5 py-1 text-[12px] font-semibold text-brand-700">
              {m.name}{m.strength ? ` ${m.strength}` : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
