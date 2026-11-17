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
   Then copy two values from **Project Settings → API Keys**: the **Project URL** and the **Publishable key** (`sb_publishable_…`). Never use the secret key in the frontend.
2. **SQL Editor** → paste and run `supabase/01_schema.sql`.
3. **Table Editor → `medicines_import` → Insert → Import data from CSV** → choose `pakistan_medicines_supabase.csv` (6 MB, 21,957 rows).
4. **SQL Editor** → run `supabase/02_load_medicines.sql`. Expect `medicines = 21957`.
5. **SQL Editor** → run `supabase/03_seed_demo_pharmacies.sql`. Expect `150 pharmacies`, about 460k stock rows. It takes about 10 s.
6. Quick test in the SQL Editor:
   ```sql
   select product_name, generic_composition, score from search_medicines('panadoll', 5);
   ```

> Re-running `01_schema.sql` drops and recreates medicines, inventory and orders. Run steps 3–5 again after it.

## STEP 2 — AI keys (3 min)

**Groq** (voice assistant, fast, generous free tier): **https://console.groq.com/keys** → Create API Key → copy (`gsk_…`).

**Gemini** (prescription photo / PDF reading only):

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
supabase secrets set GROQ_API_KEY=gsk_...your_key       # voice assistant
supabase secrets set GEMINI_API_KEY=AIza...your_key     # photo / PDF reading
# optional: GROQ_MODEL (default llama-3.3-70b-versatile), GEMINI_MODEL (default gemini-2.5-flash)
supabase functions deploy extract-medicines --no-verify-jwt
supabase functions deploy dawa-assistant --no-verify-jwt
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

## Dashboard alternative (no terminal)
- **Edge Functions → Secrets:** add `GROQ_API_KEY` and `GEMINI_API_KEY`.
- **Edge Functions → Deploy a new function → Via Editor:** create `extract-medicines` and `dawa-assistant`, pasting each `index.ts`.
- In each function's settings, turn **Enforce JWT verification** OFF. The publishable key isn't a JWT.

## Already ran v2 SQL?
Run `supabase/04_patch_alternatives.sql` once. It stops the same brand repeating in alternatives.


---

## v6 — Ordering with couriers, confirmation emails, tracking (NEW)

### 1. Database (SQL Editor)
Run `supabase/07_orders_v2.sql` once. It adds courier quotes, order numbers (`DD-XXXXXX`), customer email, the status timeline and order tracking.

### 2. Emails with Brevo (free, 300/day, no domain needed)
1. Sign up at **brevo.com** → **Settings → Senders & IP → Senders → Add a sender** → use your Gmail → click the verification link Brevo emails you.
2. **Settings → SMTP & API → API Keys → Generate a new API key** → copy it (`xkeysib-…`).
3. Supabase → **Edge Functions → Secrets**, add:
   | Name | Value |
   |---|---|
   | `BREVO_API_KEY` | `xkeysib-…` |
   | `MAIL_FROM` | the Gmail you verified in Brevo |
   | `PHARMACY_INBOX` | the email that receives pharmacy orders (demo pharmacies have none, e.g. your team Gmail) |
   | `SITE_URL` | `https://dawadhoondo123.vercel.app` |

### 3. Deploy 2 new functions (JWT verification OFF on both)
- `order-notify`: emails the customer confirmation, and emails the pharmacy the new order with **Confirm / Out for delivery / Delivered / Cancel** buttons
- `order-action`: runs when the pharmacy clicks a button. It updates the order, emails the customer, and opens the website with a message.

### Order flow
Customer picks a pharmacy → **Order** → chooses Pickup (free), Pharmacy rider, Bykea, TCS same-day or Leopards overnight (fee calculated on the server from the distance) → name, phone, email, address → **Place order** → gets order number `DD-XXXXXX` + email.
The pharmacy gets an email and clicks **Confirm**, then **Out for delivery**, then **Delivered**. Each step emails the customer and updates **Track order** live (the tracking page refreshes every 8 s).
Tracking needs the order number + the same phone number, so strangers can't look up orders.

### Demo tip
Put your own phone's email as `PHARMACY_INBOX`. During the demo, place an order on the laptop, open the pharmacy email on your phone, tap **Confirm**, and the laptop's tracking screen updates by itself.

---

## v7 — Search fix, safety, assistant guardrails, dark mode

### Deploy
1. Push the code. Vercel redeploys.
2. SQL Editor → run `supabase/08_search_safety_areas.sql`.
3. Re-deploy `dawa-assistant` and `extract-medicines` (JWT verification OFF).

### What changed
- **Search ranking:** results that start with what you typed and sound alike come first, then spelling distance, then similarity. `pandol` → Panadol, `rizek` → Risek, `flagil` → Flagyl. Controlled medicines are ranked lower.
- **Rx / OTC / Controlled:** common self-care formulas (paracetamol, ibuprofen, antihistamines, ORS, vitamins…) are OTC; everything else is Rx. Narcotics and sedatives (tramadol, codeine, benzodiazepines, zolpidem…) are **controlled**: red badge, no Order button, no alternatives, and the database refuses orders for them (a trigger, not just the UI). The classification is rule-based for the demo; verify against DRAP schedules for production.
- **Area names match the pins:** each Lahore pharmacy is named after the nearest real neighbourhood ("Near Gulberg III, Lahore"). Other cities show the city name only.
- **Assistant guardrails (6 layers):**
  1. Rate limit per IP: 15/min and 150/day (photo reading: 6/min and 60/day)
  2. Input cleaning: length caps, control and invisible characters stripped, history checked
  3. Instant block for SQL injection, prompt injection, role-play / jailbreak and secret-fishing, with no AI call
  4. Scope check: a near-exact medicine name, or an AI classification; off-topic → polite refusal
  5. Hardened prompt: user text is treated as data, never instructions; answers only from DATA + APP_FACTS
  6. Output filter: no code, SQL, links or keys. The "same formula, ask your doctor or pharmacist before switching" line is added in code whenever an alternative is mentioned. Emergencies get a fixed 1122 message.
  The AI never writes SQL: every database call is a fixed, parameterised function.
- **Terms of Use & Privacy:** linked in the panel footer and the assistant.
- **Dark mode:** toggle in the top bar. It follows the phone or PC setting on the first visit, then remembers your choice.

---

## v8 — Real prices, Google-style routes, live location, Mini Doctor

### Deploy
1. Push the code. Vercel redeploys.
2. SQL Editor → run `supabase/09_doctors_prices.sql`, then `10_strip_prices.sql`. It sets every pharmacy price to the official DRAP price, adds 51 demo hospitals and clinics, 192 demo doctors in 16 specialties, schedules and appointments.
3. Re-deploy **`dawa-assistant`** and **`order-notify`** (JWT verification OFF).

### What changed
- **Real prices:** pharmacy price = DRAP maximum retail price (labelled "DRAP price"). No more random discounts.
- **Road routes like Google Maps:** a blue route along real roads (OSRM, free, no key) with drive time (adjusted for city traffic), distance and road name. One tap opens turn-by-turn navigation in Google Maps. If the routing server is unreachable, it falls back to an "approx." line.
- **Live location (required):** a blue dot that updates as you move, an accuracy circle, and a direction cone (compass on phones). If location is blocked, a screen explains how to allow it; "Continue with demo location (Lahore)" is there for demos. Pharmacies and doctors only re-load after you move more than 300 m.
- **Doctors tab:** 16 specialties, nearby doctors with qualifications, experience, fee, rating, and the **next free slot**. Book: pick a day → time → patient details → appointment number `AP-XXXXXX` + confirmation email (patient + clinic inbox). Double-booking is impossible (enforced by the database).
- **Mini Doctor** (the assistant):
  - Describe your symptoms in English or Urdu. It suggests the right specialist and shows bookable doctors nearby.
  - For mild adult symptoms it suggests an over-the-counter option with a "Find nearby" button ("ask the pharmacist for the dose").
  - It lists the warning signs that need 1122.
  - It never diagnoses, never recommends prescription medicines, and never gives doses. Children get a Pediatrician and no medicine suggestion.
  - Emergencies get the 1122 message immediately and are never rate-limited.
- **Map pin fix:** pins no longer jump to the top-left corner. The pop-in animation was overriding the map's positioning.
