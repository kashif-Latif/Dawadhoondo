const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const medicineItem = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING', description: 'Brand name as printed, with obvious spelling fixed' },
    strength: { type: 'STRING', description: 'e.g. 500mg, 625mg, 120mg/5ml. Empty if not visible' },
    form: { type: 'STRING', description: 'Tablet, Capsule, Syrup, Injection... Empty if unknown' },
  },
  required: ['name'],
};

export const TASKS = {
  prescription: {
    needsImage: true,
    prompt: `You read prescriptions and medicine packs from Pakistan (English, Urdu or mixed, printed or handwritten).
List every medicine that is clearly written. Fix obvious spelling of brand names (e.g. "Agmentin" -> "Augmentin").
Rules: never invent a medicine that is not written; never give dosage, diagnosis or medical advice;
if the image is not a prescription or medicine pack, set readable=false and return an empty list.`,
    schema: {
      type: 'OBJECT',
      properties: {
        readable: { type: 'BOOLEAN' },
        medicines: { type: 'ARRAY', items: medicineItem },
      },
      required: ['readable', 'medicines'],
    },
  },

  text: {
    needsImage: false,
    prompt: `A user in Pakistan typed this into a medicine search box. It may be misspelled, Roman Urdu, Urdu script or several medicines at once.
Return the medicine brand names (and strength if given) they are looking for, in English spelling.
If they describe a symptom or ask which medicine to take (e.g. "bukhar ki dawai"), set is_symptom=true and return an empty list:
we never recommend medicines. Never invent medicines.`,
    schema: {
      type: 'OBJECT',
      properties: {
        is_symptom: { type: 'BOOLEAN' },
        medicines: { type: 'ARRAY', items: medicineItem },
      },
      required: ['is_symptom', 'medicines'],
    },
  },

  invoice: {
    needsImage: true,
    prompt: `This is a supplier invoice, bill or delivery note received by a pharmacy in Pakistan (or a photo of medicine boxes).
Extract each medicine line: brand name, strength, form, quantity in units (packs/boxes as written) and unit price in PKR if shown.
"generic" = the active ingredient only if it is printed or you are completely certain; otherwise empty.
Skip totals, taxes, discounts and non-medicine lines. Never invent lines. If unreadable, set readable=false.`,
    schema: {
      type: 'OBJECT',
      properties: {
        readable: { type: 'BOOLEAN' },
        items: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              name: { type: 'STRING' },
              strength: { type: 'STRING' },
              form: { type: 'STRING' },
              generic: { type: 'STRING' },
              quantity: { type: 'INTEGER' },
              unit_price: { type: 'NUMBER' },
            },
            required: ['name', 'quantity'],
          },
        },
      },
      required: ['readable', 'items'],
    },
  },
};

export async function runGemini(task, { text, image }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error('Server is missing GEMINI_API_KEY'), { status: 500 });

  const parts = [{ text: task.prompt }];
  if (text) parts.push({ text: `User input: ${text}` });
  if (image) parts.push({ inline_data: { mime_type: image.mimeType, data: image.data } });

  const res = await fetch(ENDPOINT(MODEL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: task.schema,
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error('Gemini error', res.status, detail.slice(0, 500));
    const status = res.status === 429 ? 429 : 502;
    throw Object.assign(new Error(status === 429 ? 'Too many requests, try again in a minute' : 'Reading service unavailable'), { status });
  }

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw Object.assign(new Error('Could not read that, try a clearer photo'), { status: 422 });
  return JSON.parse(raw);
}
