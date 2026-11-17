import { useEffect, useRef, useState } from "react";
import { askAssistant } from "../lib/api";
import { Icon } from "./ui";

const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
const LANGS = { en: { label: "EN", code: "en-PK" }, ur: { label: "اردو", code: "ur-PK" } };
const SUGGEST = {
  en: ["Where can I get Panadol?", "Cheaper option for Augmentin?", "Is Risek in stock near me?"],
  ur: ["پیناڈول کہاں ملے گی؟", "آگمینٹن کا سستا متبادل؟", "Brufen kahan milegi?"],
};

function pickVoice(langCode) {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const base = langCode.split("-")[0];
  return voices.find((v) => v.lang === langCode) || voices.find((v) => v.lang?.startsWith(base)) || null;
}

export default function VoiceAgent({ user, onResult, bottomOffset = 0 }) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState("en");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [history, setHistory] = useState([]);
  const [note, setNote] = useState("");
  const recRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    window.speechSynthesis?.getVoices();
  }, []);
  // Braces matter: Chrome 155+ scrollIntoView returns a Promise, which React would try to call as a cleanup.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, busy]);

  const speak = (msg) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(msg);
    const v = pickVoice(LANGS[lang].code);
    if (v) u.voice = v;
    else if (lang === "ur") {
      setNote("No Urdu voice on this device, so the answer is shown as text.");
      return;
    }
    u.lang = v?.lang ?? LANGS[lang].code;
    window.speechSynthesis.speak(u);
  };

  const ask = async (question) => {
    const q = question.trim();
    if (q.length < 2 || busy) return;
    setText("");
    setNote("");
    const nextHistory = [...history, { role: "user", text: q }];
    setHistory(nextHistory);
    setBusy(true);
    try {
      const res = await askAssistant({ question: q, lang, lat: user.lat, lng: user.lng, history: nextHistory.slice(-6) });
      setHistory((h) => [...h, { role: "assistant", text: res.answer }]);
      speak(res.answer);
      if (res.medicine) onResult?.(res);
    } catch (e) {
      setHistory((h) => [...h, { role: "assistant", text: `Sorry, something went wrong (${e.message}). Please try again.` }]);
    } finally {
      setBusy(false);
    }
  };

  const listen = () => {
    if (!SR) {
      setNote("Voice input needs Chrome or Edge. You can type instead.");
      return;
    }
    if (listening) {
      recRef.current?.stop();
      return;
    }
    window.speechSynthesis?.cancel();
    const rec = new SR();
    rec.lang = LANGS[lang].code;
    rec.interimResults = true;
    let finalText = "";
    rec.onresult = (e) => {
      const t = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      setText(t);
      if (e.results[e.results.length - 1].isFinal) finalText = t;
    };
    rec.onerror = (e) => setNote(e.error === "not-allowed" ? "Please allow microphone access." : `Mic error: ${e.error}`);
    rec.onend = () => {
      setListening(false);
      if (finalText) ask(finalText);
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ bottom: `calc(${bottomOffset}px + 16px + env(safe-area-inset-bottom))` }}
        className="btn-primary fixed right-4 z-30 flex items-center gap-2 rounded-full py-3 pl-3.5 pr-5 text-[14px] anim-fade-up md:bottom-6! md:right-6"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white/25"><Icon name="mic" className="h-4.5 w-4.5" /></span>
        Ask DawaDhoondo
      </button>
    );
  }

  return (
    <div className="glass glass-solid fixed inset-x-2 bottom-2 z-40 flex h-[72vh] flex-col rounded-[28px] anim-sheet-in md:inset-x-auto md:bottom-6 md:right-6 md:h-[540px] md:w-[380px]"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-sky-500 text-white"><Icon name="sparkle" className="h-5 w-5" /></span>
          <div>
            <p className="text-[14.5px] font-bold leading-tight">Ask DawaDhoondo</p>
            <p className="text-[11px] text-slate-500">Speak or type · English or اردو</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-xl bg-slate-900/5 p-0.5">
            {Object.entries(LANGS).map(([k, v]) => (
              <button key={k} onClick={() => setLang(k)}
                className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold transition ${lang === k ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"}`}>
                {v.label}
              </button>
            ))}
          </div>
          <button onClick={() => { window.speechSynthesis?.cancel(); setOpen(false); }} aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full bg-slate-900/5 text-slate-500 hover:bg-slate-900/10">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="scroll-thin flex-1 space-y-2 overflow-y-auto px-4 py-2 text-[13.5px]">
        {history.length === 0 && (
          <div className="space-y-2 pt-2 anim-fade-up">
            <p className="text-slate-500">Try asking:</p>
            {SUGGEST[lang].map((s) => (
              <button key={s} dir="auto" onClick={() => ask(s)}
                className="block w-full rounded-2xl bg-white/70 px-3.5 py-2.5 text-left font-medium text-slate-700 ring-1 ring-slate-900/5 transition hover:bg-white">
                {s}
              </button>
            ))}
          </div>
        )}
        {history.map((m, i) => (
          <div key={i} dir="auto"
            className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 leading-relaxed anim-fade-up ${m.role === "user" ? "ml-auto rounded-br-md bg-gradient-to-b from-brand-500 to-brand-600 text-white" : "rounded-bl-md bg-white/85 text-slate-800 ring-1 ring-slate-900/5"}`}>
            {m.text}
          </div>
        ))}
        {busy && (
          <div className="flex w-fit gap-1 rounded-2xl rounded-bl-md bg-white/85 px-4 py-3 ring-1 ring-slate-900/5">
            {[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-brand-500" style={{ animationDelay: `${i * 0.15}s` }} />)}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {note && <p className="px-4 pb-1 text-[11.5px] text-amber-700">{note}</p>}

      <form onSubmit={(e) => { e.preventDefault(); ask(text); }} className="flex items-center gap-2 p-3">
        <button type="button" onClick={listen} aria-label={listening ? "Stop" : "Speak"}
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-white transition ${listening ? "bg-rose-500" : "btn-primary"}`}
          style={listening ? { animation: "pulse-ring 1.2s ease-out infinite" } : undefined}>
          {listening ? <span className="h-3.5 w-3.5 rounded-sm bg-white" /> : <Icon name="mic" />}
        </button>
        <input dir="auto" value={text} onChange={(e) => setText(e.target.value)}
          placeholder={listening ? "Listening…" : lang === "ur" ? "یہاں لکھیں یا مائیک دبائیں" : "Type or tap the mic…"}
          className="field !rounded-full" />
        <button disabled={busy || text.trim().length < 2} aria-label="Send" className="btn-primary grid h-11 w-11 shrink-0 place-items-center rounded-full">
          <Icon name="send" className="h-4.5 w-4.5" />
        </button>
      </form>
      <p className="-mt-1 pb-2.5 text-center text-[10.5px] text-slate-400">Not medical advice · Emergency: call 1122</p>
    </div>
  );
}
