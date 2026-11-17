import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MedicineInput from '../components/MedicineInput';
import PhotoButton from '../components/PhotoButton';
import { Notice, Spinner } from '../components/Bits';
import { MicIcon, XIcon, ArrowIcon, PinIcon, StoreIcon, ShieldIcon } from '../components/Icons';
import { readWithAI, matchNames, medLabel, searchMedicines } from '../lib/api';

const POPULAR = ['Panadol', 'Augmentin', 'Risek', 'Glucophage', 'Ventolin', 'Brufen'];

export default function Home() {
  const navigate = useNavigate();
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [listening, setListening] = useState(false);

  const add = (m) => setPicked((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]));
  const remove = (id) => setPicked((p) => p.filter((x) => x.id !== id));

  const applyRead = async (result, source) => {
    if (result.is_symptom) {
      setMsg({ tone: 'warn', text: 'We can only search by medicine name. For symptoms, please ask a doctor or pharmacist which medicine is right for you.' });
      return;
    }
    if (result.readable === false || !result.medicines.length) {
      setMsg({ tone: 'warn', text: source === 'photo' ? 'We could not read any medicine names. Try a clearer, well-lit photo.' : 'No medicine found with that name. Check the spelling?' });
      return;
    }
    const { matched, unmatched } = await matchNames(result.medicines);
    matched.forEach(add);
    if (unmatched.length) {
      setMsg({ tone: 'warn', text: `Added ${matched.length}. Not in our list yet: ${unmatched.join(', ')}.` });
    } else {
      setMsg({ tone: 'info', text: `Found ${matched.length} medicine${matched.length > 1 ? 's' : ''}${source === 'photo' ? ' on your prescription' : ''}. Check the list below and tap Find.` });
    }
  };

  const smartSearch = async (text) => {
    if (!text?.trim()) return;
    setBusy('text'); setMsg(null);
    try {
      const direct = await searchMedicines(text, 1);
      if (direct[0]?.score >= 0.45) add(direct[0]);
      else await applyRead(await readWithAI('text', { text }), 'text');
    } catch (e) { setMsg({ tone: 'error', text: e.message }); }
    setBusy('');
  };

  const onPhoto = async (image) => {
    setBusy('photo'); setMsg(null);
    try { await applyRead(await readWithAI('prescription', { image }), 'photo'); }
    catch (e) { setMsg({ tone: 'error', text: e.message }); }
    setBusy('');
  };

  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const listen = () => {
    if (!SR) return;
    const r = new SR();
    r.lang = 'en-IN';
    r.interimResults = false;
    r.onresult = (e) => smartSearch(e.results[0][0].transcript);
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    setListening(true);
    r.start();
  };

  const go = () => navigate(`/find?ids=${picked.map((m) => m.id).join(',')}`);

  return (
    <div className="space-y-12">
      <section className="relative">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-urdu text-lg leading-[2.4] text-leaf" dir="rtl">دوا کہاں ملے گی؟</p>
          <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Know which pharmacy has it <span className="relative whitespace-nowrap text-leaf">
              before you go
              <svg viewBox="0 0 300 12" className="absolute -bottom-2 left-0 w-full" aria-hidden="true"><path d="M3 9c60-6 180-8 294-3" stroke="#F2A541" strokeWidth="5" fill="none" strokeLinecap="round" /></svg>
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-lg text-muted">
            No more going shop to shop. Search your medicine and see nearby pharmacies that have it in stock right now.
          </p>
        </div>

        <div className="card mx-auto mt-8 max-w-2xl p-4 shadow-[0_20px_60px_-30px_rgba(30,107,82,.45)] sm:p-5">
          <MedicineInput
            autoFocus
            onPick={add}
            onEnter={smartSearch}
            rightSlot={SR && (
              <button type="button" onClick={listen} className={`grid size-10 place-items-center rounded-xl ${listening ? 'bg-coral text-white animate-pulse' : 'text-muted hover:bg-cream'}`} aria-label="Speak medicine name">
                <MicIcon />
              </button>
            )}
          />

          {picked.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {picked.map((m) => (
                <span key={m.id} className="chip bg-mint text-leaf-dark">
                  {medLabel(m)} <span className="text-leaf/70">{m.form}</span>
                  <button onClick={() => remove(m.id)} aria-label={`Remove ${m.brand}`}><XIcon className="size-4" /></button>
                </span>
              ))}
            </div>
          )}

          {msg && <div className="mt-3"><Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice></div>}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <PhotoButton onImage={onPhoto} onError={(t) => setMsg({ tone: 'error', text: t })} disabled={!!busy} className="btn-soft flex-1">
              {busy === 'photo' ? <><Spinner /> Reading prescription…</> : 'Scan prescription'}
            </PhotoButton>
            <button className="btn-primary flex-1" disabled={!picked.length || !!busy} onClick={go}>
              {busy === 'text' ? <><Spinner /> Searching…</> : <>Find nearby <ArrowIcon /></>}
            </button>
          </div>

          {!picked.length && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">Try:</span>
              {POPULAR.map((p) => (
                <button key={p} onClick={() => smartSearch(p)} className="chip border border-line bg-cream hover:border-leaf/40">{p}</button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: <PinIcon />, t: 'Nearest first', d: 'Pharmacies around you that have your medicine, sorted by distance.' },
          { icon: <StoreIcon />, t: 'Updated by pharmacies', d: 'Shops update stock by snapping a photo of their supplier bill.' },
          { icon: <ShieldIcon />, t: 'Same-salt options', d: 'Out of stock? See brands with the same salt and strength, to ask your doctor about.' },
        ].map((f) => (
          <div key={f.t} className="card p-5">
            <div className="mb-3 grid size-11 place-items-center rounded-2xl bg-mint text-leaf">{f.icon}</div>
            <h3 className="font-display text-lg font-bold">{f.t}</h3>
            <p className="mt-1 text-sm text-muted">{f.d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
