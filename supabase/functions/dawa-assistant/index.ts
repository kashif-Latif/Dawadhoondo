// DawaDhoondo — dawa-assistant edge function (voice/text Q&A)
// Answers medicine questions grounded ONLY in our Supabase data
// (DRAP medicines + demo pharmacy stock), in English or Urdu.
//
// Deploy:  supabase functions deploy dawa-assistant --no-verify-jwt
// Secret:  GROQ_API_KEY (preferred, fast + generous free tier)  OR  GEMINI_API_KEY (fallback)
//          Optional: GROQ_MODEL (auto-picked if unset), GEMINI_MODEL
// SUPABASE_URL and SUPABASE_ANON_KEY are provided automatically by Supabase.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GROQ_KEY = Deno.env.get("GROQ_API_KEY");
const GROQ_MODEL_ENV = Deno.env.get("GROQ_MODEL");
// Groq retires models often, so pick the first available one from this list at runtime.
const GROQ_PREFERRED = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile",
  "moonshotai/kimi-k2-instruct", "qwen/qwen3-32b", "llama-3.1-8b-instant"];
let groqModel: string | null = null;
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";

const STOP = new Set(("what where which when have does available near nearby price cheap cheaper cheapest " +
  "medicine medicines tablet tablets syrup capsule please tell show find need want about with from that this " +
  "dawai dawa kahan milegi milega chahiye kitne kitni kya hai mujhe paas qeemat batao sasta sasti option " +
  "alternative alternatives generic brand store pharmacy pharmacies chemist shop open delivery order " +
  "fever cough cold pain headache allergy flu infection stomach baby child children kids bukhar khansi " +
  "dard nazla zukam sar pait bacha bachay bachon liye wala wali").split(" "));

async function rpc(fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${await r.text()}`);
  return r.json();
}

// One entry point for the LLM: Groq first (if key set), Gemini as fallback.
async function gemini(prompt: string, jsonOut = false): Promise<string> {
  if (GROQ_KEY) {
    try {
      return await groq(prompt, jsonOut);
    } catch (e) {
      console.error("Groq failed:", String(e));
      if (!GEMINI_KEY) throw e;
    }
  }
  return geminiCall(prompt, jsonOut);
}

async function pickGroqModel(): Promise<string> {
  if (groqModel) return groqModel;
  if (GROQ_MODEL_ENV) return (groqModel = GROQ_MODEL_ENV);
  const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${GROQ_KEY}` } });
  if (!r.ok) throw new Error(`Groq models ${r.status}`);
  const ids: string[] = ((await r.json()).data ?? []).filter((m: any) => m.active !== false).map((m: any) => m.id);
  const textIds = ids.filter((id) => !/whisper|tts|guard|playai|orpheus|compound|prompt/i.test(id));
  groqModel = GROQ_PREFERRED.find((m) => ids.includes(m)) ?? textIds[0];
  if (!groqModel) throw new Error("No Groq text model available");
  console.log("Using Groq model:", groqModel);
  return groqModel;
}

async function groq(prompt: string, jsonOut: boolean) {
  const model = await pickGroqModel();
  const isReasoning = /gpt-oss|qwen3/i.test(model);
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: isReasoning ? 1500 : 500,
      ...(isReasoning ? { reasoning_effort: /gpt-oss/i.test(model) ? "low" : "none" } : {}),
      messages: [{ role: "user", content: prompt }],
      ...(jsonOut ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!r.ok) {
    if (r.status === 404) groqModel = null; // model retired: re-pick next time
    throw new Error(`Groq ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  const d = await r.json();
  const text = d?.choices?.[0]?.message?.content ?? "";
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

async function geminiCall(prompt: string, jsonOut = false) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY! },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, ...(jsonOut ? { responseMimeType: "application/json" } : {}) },
    }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}`);
  const d = await r.json();
  return d?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

// Step 1: find medicines mentioned — database first (free), Gemini only if needed
async function findMedicines(question: string) {
  const words = [...new Set(question.toLowerCase().match(/[a-z][a-z0-9\-]{3,}/g) ?? [])].filter((w) => !STOP.has(w));
  const hits: any[] = [];
  for (const w of words.slice(0, 6)) {
    const r = await rpc("search_medicines", { q: w, lim: 3 });
    hits.push(...r.filter((x: any) => x.score >= 0.8));
  }
  if (hits.length) return hits.sort((a, b) => b.score - a.score);

  // Urdu script / heavy misspelling → ask Gemini for the names, then search
  const raw = await gemini(
    `Extract medicine names (Pakistani brand or generic) from this question. Fix spelling. ` +
      `Return JSON only: {"medicines":["name"]}. Question: ${question}`,
    true,
  );
  let names: string[] = [];
  try { names = JSON.parse(raw).medicines ?? []; } catch { /* ignore */ }
  for (const n of names.slice(0, 3)) {
    const r = await rpc("search_medicines", { q: n, lim: 3 });
    hits.push(...r);
  }
  return hits;
}

async function nearby(id: number, lat: number, lng: number) {
  for (const radius of [5, 10, 25, 100, 2000]) {
    const p = await rpc("nearby_pharmacies", { p_medicine_id: id, p_lat: lat, p_lng: lng, p_radius_km: radius, p_limit: 5 });
    if (p.length) return { pharmacies: p, radius };
  }
  return { pharmacies: [], radius: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!GROQ_KEY && !GEMINI_KEY) return json({ error: "Set GROQ_API_KEY (or GEMINI_API_KEY) in Supabase secrets" }, 500);

  try {
    const { question, lang = "en", lat = 31.5204, lng = 74.3587, history = [] } = await req.json();
    const q = String(question ?? "").trim().slice(0, 500);
    if (q.length < 2) return json({ error: "Ask a question" }, 400);

    const matches = await findMedicines(q);
    const top = matches[0];
    let near = { pharmacies: [] as any[], radius: null as number | null };
    let alternatives: any[] = [];
    if (top) {
      [near, alternatives] = await Promise.all([
        nearby(top.id, Number(lat), Number(lng)),
        rpc("medicine_alternatives", { p_medicine_id: top.id, lim: 3 }),
      ]);
    }

    const context = {
      matched_medicines: matches.slice(0, 5).map((m: any) => ({
        name: m.product_name, generic: m.generic_name, form: m.dosage_form, strength: m.strength,
        pack: m.pack_size, drap_max_price_pkr: m.mrp_pkr, rx: m.rx_status,
      })),
      nearest_pharmacies_with_stock: near.pharmacies.map((p: any) => ({
        name: p.name, area: p.address, distance_km: Number(p.distance_km.toFixed(1)),
        price_pkr: p.price, stock: p.stock, open_24h: p.open_24h, delivery: p.delivery,
      })),
      cheaper_same_formula: alternatives.map((a: any) => ({ name: a.product_name, strength: a.strength, pack: a.pack_size, price_pkr: a.mrp_pkr })),
    };

    const langRule = lang === "ur"
      ? "Reply in simple Urdu (Urdu script). Keep medicine names in English letters."
      : "Reply in simple English.";
    const convo = (history as { role: string; text: string }[]).slice(-6)
      .map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${String(h.text).slice(0, 300)}`).join("\n");

    const prompt = `You are DawaDhoondo, a voice assistant that helps people in Pakistan find medicines at nearby pharmacies.
RULES:
- Use ONLY the DATA below for names, prices, pharmacies and distances. Never invent pharmacies, prices or stock.
- If DATA has no match, say you could not find it and ask them to spell it or upload a photo of the box/prescription.
- Do NOT diagnose, and do NOT give doses or tell anyone to start/stop a medicine. For dosage or side effects say: "please ask your doctor or pharmacist".
- If the user describes an emergency (chest pain, can't breathe, overdose, unconscious, severe bleeding), tell them to call 1122 immediately.
- Prices are DRAP maximum retail prices or pharmacy prices in Pakistani rupees. ALWAYS write prices as "Rs 279" (or "279 روپے" in Urdu). Never use ₹ or INR.
- When suggesting a cheaper alternative, mention if its strength differs from what the user asked for.
- This answer will be spoken aloud: 2-4 short sentences, no lists, no markdown.
- ${langRule}

DATA: ${JSON.stringify(context)}

${convo ? `CONVERSATION SO FAR:\n${convo}\n` : ""}User: ${q}
Assistant:`;

    const answer = (await gemini(prompt)).trim().replace(/₹\s?/g, "Rs ").replace(/\bINR\b/g, "PKR");
    return json({ answer, medicine: top ?? null, nearby: near, alternatives, matches: matches.slice(0, 6) });
  } catch (e) {
    console.error(e);
    return json({ error: "Assistant error", detail: String(e).slice(0, 200) }, 502);
  }
});
