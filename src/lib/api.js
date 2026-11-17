import { supabase } from './supabase';

// Server-side reader (prescription / typed text / supplier bill). Key never reaches the browser.
export async function readWithAI(task, payload) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

export async function searchMedicines(q, lim = 8) {
  if (!q?.trim()) return [];
  const { data, error } = await supabase.rpc('search_medicines', { q: q.trim(), lim });
  if (error) throw error;
  return data || [];
}

const MIN_SCORE = 0.3;

// Deterministic matching of names (read from a photo/text) against our catalog.
export async function matchNames(list) {
  const matched = [];
  const unmatched = [];
  for (const item of list) {
    const withStrength = `${item.name} ${item.strength || ''}`.trim();
    let hits = await searchMedicines(withStrength, 3);
    if (!hits.length || hits[0].score < MIN_SCORE) hits = await searchMedicines(item.name, 3);
    if (hits.length && hits[0].score >= MIN_SCORE) matched.push(hits[0]);
    else unmatched.push(withStrength);
  }
  const unique = [...new Map(matched.map((m) => [m.id, m])).values()];
  return { matched: unique, unmatched };
}

export const medLabel = (m) => [m.brand, m.strength].filter(Boolean).join(' ');
