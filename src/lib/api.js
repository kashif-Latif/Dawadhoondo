import { supabase } from "./supabase";

const GOOD_MATCH = 0.5;
const RADII_KM = [5, 10, 25, 100, 2000]; // widen until something is found

export async function searchMedicines(q, lim = 12) {
  const { data, error } = await supabase.rpc("search_medicines", { q, lim });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function aiExtract({ text, file }) {
  const { data, error } = await supabase.functions.invoke("extract-medicines", {
    body: { text, file },
  });
  if (error) throw new Error(error.message);
  return data?.medicines ?? [];
}

// Typed text: database fuzzy search first (free + fast), AI only if weak match.
export async function smartSearch(text) {
  const direct = await searchMedicines(text);
  if (direct[0]?.score >= GOOD_MATCH) {
    return { groups: [{ query: text, corrected: null, results: direct }], usedAI: false };
  }
  let names = [];
  try {
    names = await aiExtract({ text });
  } catch (e) {
    console.warn("AI unavailable, using DB results only:", e.message);
  }
  if (!names.length) return { groups: [{ query: text, corrected: null, results: direct }], usedAI: false };
  return { groups: await searchNames(names), usedAI: true };
}

// Image / PDF prescription → AI extracts names → DB search each.
export async function searchFromFile(file) {
  if (file.size > 5 * 1024 * 1024) throw new Error("File too large (max 5 MB)");
  const data = await fileToBase64(file);
  const names = await aiExtract({ file: { mimeType: file.type, data } });
  if (!names.length) throw new Error("No medicine names found in the file");
  return { groups: await searchNames(names), usedAI: true };
}

async function searchNames(names) {
  return Promise.all(
    names.map(async (m) => {
      const q = [m.name, m.strength].filter(Boolean).join(" ");
      let results = await searchMedicines(q, 6);
      if (!results.length && m.generic) results = await searchMedicines(m.generic, 6);
      return { query: q, corrected: m.name, results };
    })
  );
}

export async function findNearby(medicineId, lat, lng) {
  for (const radius of RADII_KM) {
    const { data, error } = await supabase.rpc("nearby_pharmacies", {
      p_medicine_id: medicineId,
      p_lat: lat,
      p_lng: lng,
      p_radius_km: radius,
      p_limit: 30,
    });
    if (error) throw new Error(error.message);
    if (data?.length) return { pharmacies: data, radius };
  }
  return { pharmacies: [], radius: null };
}

export async function getAlternatives(medicineId) {
  const { data, error } = await supabase.rpc("medicine_alternatives", { p_medicine_id: medicineId, lim: 6 });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function askAssistant({ question, lang, lat, lng, history }) {
  const { data, error } = await supabase.functions.invoke("dawa-assistant", {
    body: { question, lang, lat, lng, history },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function placeOrder(o) {
  const { data, error } = await supabase.rpc("place_order", {
    p_pharmacy_id: o.pharmacyId,
    p_medicine_id: o.medicineId,
    p_qty: o.qty,
    p_name: o.name,
    p_phone: o.phone,
    p_address: o.address,
    p_mode: o.mode,
  });
  if (error) throw new Error(error.message);
  return data?.[0];
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
