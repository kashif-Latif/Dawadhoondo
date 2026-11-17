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
// onStage(0..3) drives the progress UI: 0 reading file, 1 AI reading, 2 matching, 3 done.
export async function searchFromFile(file, onStage = () => {}) {
  if (file.size > 5 * 1024 * 1024) throw new Error("File too large (max 5 MB)");
  onStage(0);
  const data = await fileToBase64(file);
  onStage(1);
  const names = await aiExtract({ file: { mimeType: file.type, data } });
  if (!names.length) throw new Error("Couldn't find any medicine names in this file. Try a clearer photo.");
  onStage(2);
  const groups = await searchNames(names);
  onStage(3);
  return { groups, usedAI: true, extracted: names };
}

export async function courierQuotes(pharmacyId, lat, lng) {
  const { data, error } = await supabase.rpc("courier_quotes", { p_pharmacy_id: pharmacyId, p_lat: lat, p_lng: lng });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function placeOrderV2(o) {
  const { data, error } = await supabase.rpc("place_order_v2", {
    p_pharmacy_id: o.pharmacyId,
    p_medicine_id: o.medicineId,
    p_qty: o.qty,
    p_name: o.name,
    p_phone: o.phone,
    p_email: o.email,
    p_address: o.address,
    p_courier: o.courier,
    p_lat: o.lat,
    p_lng: o.lng,
  });
  if (error) throw new Error(error.message);
  const order = data?.[0];
  // Fire-and-forget confirmation emails (customer + pharmacy)
  let emailed = null;
  try {
    const { data: n } = await supabase.functions.invoke("order-notify", { body: { order_id: order.order_id } });
    emailed = n;
  } catch (e) {
    console.warn("Email not sent:", e.message);
  }
  return { ...order, emailed };
}

export async function getOrder(orderNo, phone) {
  const { data, error } = await supabase.rpc("get_order", { p_order_no: orderNo, p_phone: phone });
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("No order found with this number and phone");
  return data[0];
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

// ---------------- Mini Doctor ----------------
export async function nearbyDoctors(specialty, lat, lng, limit = 15) {
  const { data, error } = await supabase.rpc("nearby_doctors", { p_specialty: specialty || null, p_lat: lat, p_lng: lng, p_limit: limit });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listSpecialties() {
  const { data, error } = await supabase.rpc("list_specialties");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function doctorSlots(doctorId, day) {
  const { data, error } = await supabase.rpc("doctor_slots", { p_doctor_id: doctorId, p_day: day });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function bookAppointment(b) {
  const { data, error } = await supabase.rpc("book_appointment", {
    p_doctor_id: b.doctorId, p_starts_at: b.startsAt, p_name: b.name, p_phone: b.phone, p_email: b.email, p_reason: b.reason,
  });
  if (error) throw new Error(error.message);
  const appt = data?.[0];
  let emailed = null;
  try {
    const { data: n } = await supabase.functions.invoke("order-notify", { body: { appointment_id: appt.appointment_id } });
    emailed = n;
  } catch (e) {
    console.warn("Appointment email not sent:", e.message);
  }
  return { ...appt, emailed };
}
