// Road routing (free, no key): OSRM public server. Falls back to a straight line.
// Durations are scaled for Pakistani city traffic, since OSRM assumes free-flowing roads.
const cache = new Map();
const TRAFFIC = 1.35;

export async function roadRoute(from, to) {
  const key = [from.lat, from.lng, to.lat, to.lng].map((v) => v.toFixed(4)).join(",");
  if (cache.has(key)) return cache.get(key);
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&alternatives=false&steps=true`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    const j = await r.json();
    if (j.code !== "Ok" || !j.routes?.length) throw new Error(j.code || "No route");
    const rt = j.routes[0];
    const out = {
      geometry: rt.geometry,
      distanceKm: rt.distance / 1000,
      durationS: rt.duration * TRAFFIC,
      via: rt.legs?.[0]?.summary || "",
      exact: true,
    };
    cache.set(key, out);
    return out;
  } catch {
    const km = Math.hypot((to.lat - from.lat) * 111, (to.lng - from.lng) * 111 * Math.cos((from.lat * Math.PI) / 180));
    return {
      geometry: { type: "LineString", coordinates: [[from.lng, from.lat], [to.lng, to.lat]] },
      distanceKm: km * 1.3,
      durationS: ((km * 1.3) / 22) * 3600,
      via: "",
      exact: false,
    };
  } finally {
    clearTimeout(t);
  }
}
