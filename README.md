# 💊 DawaDhoondo — find any medicine near you in Pakistan

Type a medicine (even misspelled: `panadoll`, `augmantin`), upload a prescription photo/PDF, or **ask by voice in English or Urdu**.
The app finds the medicine among **21,957 DRAP-registered Pakistani medicines**. A 3D globe flies to your city and shows nearby pharmacies (5 km → 10 km → … → all Pakistan) with stock and price. From there you can **Order** or **Get a ride**.

**Stack:** React + Vite + Tailwind · Supabase (Postgres + pg_trgm + 2 Edge Functions) · MapLibre + OpenFreeMap (3D globe, free, no key) · Google Gemini (AI) · Browser Web Speech API (voice, free).

```
Text / photo / voice
   │
   ├─ search_medicines()      Postgres fuzzy search (free, ~10 ms)
   ├─ extract-medicines       Gemini: photo/PDF/bad spelling → medicine names
   ├─ dawa-assistant          Gemini: answers questions, grounded ONLY in our DB
   ├─ nearby_pharmacies()     distance search, auto-widening radius
   ├─ medicine_alternatives() same formula + form, cheapest per unit first
   └─ place_order()           validated, atomic stock decrement
```

---

## STEP 1 — Supabase database (10 min)

1. Go to **supabase.com** → New project (free plan).
   Then copy two values from **Project Settings → API**: the **Project URL** and the **anon public key**.
2. **SQL Editor** → paste and run `supabase/01_schema.sql`.
3. **Table Editor → `medicines_import` → Insert → Import data from CSV** → choose `pakistan_medicines_supabase.csv` (6 MB, 21,957 rows).
4. **SQL Editor** → run `supabase/02_load_medicines.sql`. Expect `medicines = 21957`.
5. **SQL Editor** → run `supabase/03_seed_demo_pharmacies.sql`. Expect `150 pharmacies`, about 460k stock rows. It takes about 10 s.
6. Quick test in the SQL Editor:
   ```sql
   select product_name, generic_composition, score from search_medicines('panadoll', 5);
   ```

> Re-running `01_schema.sql` drops and recreates medicines, inventory and orders. Run steps 3–5 again after it.

## STEP 2 — Get a Google Gemini API key (2 min)

1. Open **https://aistudio.google.com/apikey** → sign in with your Google account → **Create API key**.
2. Copy the key (starts with `AIza…`).
3. **Never** put this key in the frontend, `.env`, or GitHub. It lives only in Supabase secrets (step 3).
4. Free-tier limits are per Google Cloud project and change over time. Check yours under AI Studio → **Usage / Rate limits**.
   The app uses AI only when it's needed: typed searches don't call Gemini at all.

## STEP 3 — Deploy the two AI functions (5 min)

On your laptop, inside this project folder:
```bash
npm i -g supabase                         # Supabase CLI
supabase login                            # opens browser
supabase link --project-ref YOUR_PROJECT_REF   # the xxxx in https://xxxx.supabase.co
supabase secrets set GEMINI_API_KEY=AIza...your_key
supabase secrets set GEMINI_MODEL=gemini-2.5-flash   # optional; change if Google renames models
supabase functions deploy extract-medicines
supabase functions deploy dawa-assistant
```
`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected into functions automatically, so don't set them.

Test from the terminal:
```bash
curl -X POST https://YOUR_REF.supabase.co/functions/v1/dawa-assistant \
  -H "Authorization: Bearer YOUR_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"question":"Where can I get augmentin near me?","lang":"en","lat":31.52,"lng":74.35}'
```
You should get `answer` (text), `medicine`, `nearby.pharmacies` and `alternatives`.

## STEP 4 — Frontend + Vercel (5 min)

Local:
```bash
npm install
cp .env.example .env    # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```
Vercel: **Add New Project → import the GitHub repo**. Add the same two env vars, then Deploy.
Every push to `main` redeploys automatically. HTTPS is required for the microphone and GPS.

---

## How the voice agent works

```
🎤 Browser SpeechRecognition (en-PK / ur-PK, free, Chrome/Edge)
   → text question
   → Edge Function dawa-assistant
        1. find medicine names: DB fuzzy search on each word (free);
           if none (Urdu script / bad spelling) → 1 Gemini call to extract names
        2. top match → nearby pharmacies + cheaper alternatives (DB)
        3. 1 Gemini call: answer using ONLY that data, 2–4 spoken sentences,
           in English or Urdu, safety rules (no dosing/diagnosis, emergency → 1122)
   → answer text + medicine + pharmacies
🔊 Browser speechSynthesis reads the answer. The map and list update to the same result.
```
- **Cost:** 1–2 Gemini calls per question. Voice in and out is free (it runs in the browser).
- **Languages:** EN / اردو toggle. Recognising Urdu speech works in Chrome. Speaking Urdu depends on the device having an Urdu voice. If it doesn't, the answer is shown as text.
- **Firefox/Safari:** voice input may not be available. Typing in the assistant box always works.
- **Upgrade later (optional):** the Gemini Live API gives real-time two-way voice. It needs WebSockets and short-lived tokens, so it's more work than the 2-hour scope.

## Demo script (3 min)
1. The globe spins, then flies to Pakistan.
2. Type `panadoll` → Panadol Tablets. Pharmacies appear 1–3 km away and the camera tilts into 3D streets.
3. Click a pharmacy → route line → **Get a ride** / **Directions** / **Order** → order ID.
4. 🎙️ Click "Ask DawaDhoondo" and say: "Augmentin ka sasta option kahan milega?" → spoken answer, and the map updates.
5. Switch to اردو and ask in Urdu.
6. Upload a prescription photo → all medicines extracted.

## Data
- `pakistan_medicines_supabase.csv`: 21,957 rows, sorted by name.
  - Source: DRAP Pharmaceutical Product Price Index (e.dra.gov.pk), scraped 17 Nov 2026, plus 53 extra common brands from a curated GitHub list (price approximate, marked in `source`).
  - Cleaned: removed "Each tablet contains…" text; standard `generic_name` + `formula_key`; 20 standard dosage forms; numeric price; `pack_units` and `price_per_unit`; ISO dates; `is_common` flag.
- **Pharmacies and stock are generated demo data** (`is_demo = true`). Say so to the judges.

## Security
- RLS: the public can only read medicines, pharmacies and stock. Orders are written only through `place_order`.
- The Gemini key is kept in Supabase secrets only. The assistant can't invent prices or pharmacies: it only sees DB rows.
