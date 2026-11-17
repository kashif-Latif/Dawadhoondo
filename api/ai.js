import { TASKS, runGemini } from './_lib/gemini.js';

const MAX_IMAGE_B64 = 6_000_000; // ~4.5 MB image
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

const clean = (s, max = 80) => String(s ?? '').trim().slice(0, max);

function sanitize(task, out) {
  if (task === 'invoice') {
    return {
      readable: out.readable !== false,
      items: (out.items || []).slice(0, 60).map((i) => ({
        name: clean(i.name),
        strength: clean(i.strength, 30),
        form: clean(i.form, 30),
        generic: clean(i.generic, 120),
        quantity: Math.max(0, Math.min(100000, parseInt(i.quantity, 10) || 0)),
        unit_price: Number.isFinite(+i.unit_price) && +i.unit_price > 0 ? +i.unit_price : null,
      })).filter((i) => i.name),
    };
  }
  return {
    readable: out.readable !== false,
    is_symptom: out.is_symptom === true,
    medicines: (out.medicines || []).slice(0, 15).map((m) => ({
      name: clean(m.name),
      strength: clean(m.strength, 30),
      form: clean(m.form, 30),
    })).filter((m) => m.name),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { task, text, image } = req.body || {};
  const def = TASKS[task];
  if (!def) return res.status(400).json({ error: 'Unknown task' });

  if (def.needsImage) {
    if (!image?.data || !ALLOWED_MIME.includes(image.mimeType)) {
      return res.status(400).json({ error: 'Please upload a JPG, PNG or WEBP photo' });
    }
    if (image.data.length > MAX_IMAGE_B64) return res.status(413).json({ error: 'Photo is too large' });
  } else if (!text || typeof text !== 'string' || text.length > 300) {
    return res.status(400).json({ error: 'Please type a medicine name' });
  }

  try {
    const out = await runGemini(def, { text: def.needsImage ? undefined : text, image: def.needsImage ? image : undefined });
    return res.status(200).json(sanitize(task, out));
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || 'Something went wrong' });
  }
}
