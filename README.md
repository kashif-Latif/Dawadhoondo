# DawaDhoondo · دوا ڈھونڈو

**Know which pharmacy near you has your medicine, before you leave home.**

Built for the STCS AI Hackathon 2026 (Minhaj University Lahore) · SDG 3: Good Health & Well-Being

---

## The problem
In Pakistan, when a medicine is short or hard to find, patients and their families go **shop to shop** with a prescription. That costs time, money and, for critical medicines (insulin, inhalers, antibiotics), it costs health. Pharmacies don't publish stock anywhere, so nobody can see where a medicine is available.

**Who it affects:** patients and caregivers (especially the elderly and people with chronic conditions), and small independent pharmacies that lose customers they could have served.

## The solution
1. **Patient** types a medicine (typos and Roman Urdu are fine), speaks it, or **scans a prescription**.
2. DawaDhoondo shows **nearby pharmacies that have it in stock**, nearest first, on a map, with call and directions.
3. If no one has it, it shows **same-salt, same-strength brands** that are available (with a clear "ask your doctor or pharmacist first" note) and the nearest pharmacies to call.
4. **Pharmacies** keep stock updated by **photographing their supplier bill**. Lines are read automatically, the pharmacist checks them, and stock updates in one tap.
5. Every search feeds an anonymous **shortage radar**: medicines people search for but can't find nearby.

## Where AI is used (and where it is not)
| Step | How | Why |
|---|---|---|
| Read a prescription photo | Gemini vision → structured JSON | Handwriting and mixed Urdu/English need vision AI |
| Understand messy typed/spoken input | Gemini → normalized medicine names | "pandol", "augmantin", Urdu script |
| Read a supplier bill | Gemini vision → items, qty, price | Removes manual data entry, the main reason pharmacies would never update stock |
| Match names to the catalog | **PostgreSQL trigram search (deterministic)** | Reliable, free, explainable |
| Nearest pharmacy, alternatives, shortages | **SQL (deterministic)** | Must be exact, not generated |

Safety rules built into the prompts: never invent medicines, never give dosage or diagnosis, and symptom questions ("bukhar ki dawa") are refused with a "please ask a doctor or pharmacist" note. Same-salt alternatives come from the database, not the model.

## Tech stack
- **Frontend:** React 18 + Vite + Tailwind CSS v4, Leaflet + OpenStreetMap
- **Backend:** Vercel serverless function `/api/ai` (Gemini key stays server-side)
- **Database & auth:** Supabase (PostgreSQL, Row Level Security, pg_trgm)
- **Data:** real pharmacy locations from OpenStreetMap; catalog of common Pakistani brands; stock entered by pharmacies

### Security
- Gemini key only on the server; never in the browser or the repo
- RLS: anyone can read stock; only a pharmacy's owner can change its stock; owners cannot mark themselves verified
- Uploaded photos are processed and not stored; search logs keep location rounded to ~1 km

## Startup model
- **Free for patients.**
- **Pharmacies:** free listing; paid plan (~Rs 1,500/month) for featured placement, demand alerts ("12 people near you searched Lantus today") and simple inventory reports.
- **Distributors & pharma companies:** paid shortage-radar dashboards showing unmet demand by area.
- **Public health partners:** aggregated, anonymous shortage data for DRAP / provincial health departments.
- **Growth:** onboard pharmacies area by area (start around universities and hospitals), the same way delivery apps onboarded restaurants.

## Run locally
```bash
npm install
cp .env.example .env      # fill in your keys
npm run dev               # http://localhost:5173 (the /api route runs locally too)
```

### One-time database setup (Supabase)
1. Create a free project at supabase.com
2. SQL Editor → run `supabase/schema.sql`, then `supabase/seed_medicines.sql`
3. Authentication → Providers → Email → turn off **Confirm email** (for instant pharmacy signup in demos)
4. Import real Lahore pharmacies from OpenStreetMap:
   ```bash
   node --env-file=.env scripts/import-pharmacies.mjs
   ```

### Deploy (Vercel)
Import the repo in Vercel and add the env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`). Deploy.

## Limitations & next steps
- Stock accuracy depends on pharmacies updating it; next: WhatsApp-based updates and POS integrations
- Pharmacy claiming needs verification (phone OTP / license number) before public launch
- Catalog will grow from pharmacy bills; next: import the DRAP registered products list
- Urdu interface, and SMS search for feature phones
