import { useEffect, useRef, useState } from "react";
import { askAssistant } from "../lib/api";

const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
const LANGS = { en: { label: "EN", code: "en-PK" }, ur: { label: "اردو", code: "ur-PK" } };

function pickVoice(langCode) {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const base = langCode.split("-")[0];
  return voices.find((v) => v.lang === langCode) || voices.find((v) => v.lang?.startsWith(base)) || null;
}

export default function VoiceAgent({ user, onResult }) {
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
    window.speechSynthesis?.getVoices(); // warm up voice list
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
      setNote("No Urdu voice on this device — showing the answer as text.");
      return;
    }
    u.lang = v?.lang ?? LANGS[lang].code;
    u.rate = 1;
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
      setHistory((h) => [...h, { role: "assistant", text: `Sorry — ${e.message}` }]);
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
    rec.maxAlternatives = 1;
    let finalText = "";
    rec.onresult = (e) => {
      const t = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      setText(t);
      if (e.results[e.results.length - 1].isFinal) finalText = t;
    };
    rec.onerror = (e) => setNote(e.error === "not-allowed" ? "Microphone permission denied." : `Mic error: ${e.error}`);
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
        className="absolute bottom-6 right-6 z-20 flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-3 font-semibold text-white shadow-2xl hover:bg-emerald-400"
      >
        🎙️ Ask DawaDhoondo
      </button>
    );
  }

  return (
    <div className="glass absolute bottom-6 right-6 z-20 flex h-[460px] w-[min(360px,calc(100%-24px))] flex-col rounded-2xl text-white">
      <div className="flex items-center justify-between border-b border-slate-700/60 px-4 py-3">
        <p className="font-bold">🎙️ Voice assistant</p>
        <div className="flex items-center gap-2">
          {Object.entries(LANGS).map(([k, v]) => (
            <button
              key={k}
              onClick={() => setLang(k)}
              className={`rounded-md px-2 py-0.5 text-xs ${lang === k ? "bg-emerald-500" : "bg-slate-800"}`}
            >
              {v.label}
            </button>
          ))}
          <button onClick={() => { window.speechSynthesis?.cancel(); setOpen(false); }} className="ml-1 text-slate-400 hover:text-white">✕</button>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
        {history.length === 0 && (
          <p className="text-slate-400">
            Tap the mic and ask, e.g. “Where can I get Panadol near me?” or “Augmentin ka sasta option?”
          </p>
        )}
        {history.map((m, i) => (
          <div
            key={i}
            dir="auto"
            className={`max-w-[85%] rounded-xl px-3 py-2 ${m.role === "user" ? "ml-auto bg-emerald-600" : "bg-slate-800"}`}
          >
            {m.text}
          </div>
        ))}
        {busy && <div className="w-fit animate-pulse rounded-xl bg-slate-800 px-3 py-2 text-slate-300">Thinking…</div>}
        <div ref={endRef} />
      </div>

      {note && <p className="px-3 pb-1 text-[11px] text-amber-300">{note}</p>}

      <form
        onSubmit={(e) => { e.preventDefault(); ask(text); }}
        className="flex gap-2 border-t border-slate-700/60 p-3"
      >
        <button
          type="button"
          onClick={listen}
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${listening ? "animate-pulse bg-red-500" : "bg-emerald-500 hover:bg-emerald-400"}`}
          title={listening ? "Stop" : "Speak"}
        >
          {listening ? "■" : "🎤"}
        </button>
        <input
          dir="auto"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={lang === "ur" ? "یہاں لکھیں یا مائیک دبائیں" : "Type or tap the mic…"}
          className="flex-1 rounded-xl bg-slate-800 px-3 text-sm outline-none ring-1 ring-slate-700 focus:ring-emerald-500"
        />
        <button disabled={busy} className="rounded-xl bg-slate-700 px-3 text-sm disabled:opacity-50">Send</button>
      </form>
      <p className="px-3 pb-2 text-[10px] text-slate-500">Not medical advice. Emergency: call 1122.</p>
    </div>
  );
}
