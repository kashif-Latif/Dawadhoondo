export const CITIES = [
  { name: "Lahore", lat: 31.5204, lng: 74.3587 },
  { name: "Karachi", lat: 24.8607, lng: 67.0011 },
  { name: "Islamabad", lat: 33.6844, lng: 73.0479 },
  { name: "Rawalpindi", lat: 33.5651, lng: 73.0169 },
  { name: "Faisalabad", lat: 31.4504, lng: 73.135 },
  { name: "Multan", lat: 30.1575, lng: 71.5249 },
  { name: "Peshawar", lat: 34.0151, lng: 71.5249 },
  { name: "Quetta", lat: 30.1798, lng: 66.975 },
];

export const PAKISTAN_CENTER = [69.3451, 30.3753];

// Live location: high accuracy, keeps updating. Returns a stop() function.
export function watchLocation(onUpdate, onError) {
  if (!navigator.geolocation) {
    onError?.({ code: 0, message: "Location is not supported on this device" });
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (p) => onUpdate({
      lat: p.coords.latitude,
      lng: p.coords.longitude,
      accuracy: p.coords.accuracy,
      heading: Number.isFinite(p.coords.heading) && p.coords.speed > 0.5 ? p.coords.heading : null,
      label: "My location",
      live: true,
    }),
    (e) => onError?.(e),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

// Compass heading (Android Chrome: deviceorientationabsolute; iOS: webkitCompassHeading)
export function watchCompass(onHeading) {
  const handler = (e) => {
    const h = typeof e.webkitCompassHeading === "number" ? e.webkitCompassHeading
      : e.absolute && typeof e.alpha === "number" ? (360 - e.alpha) % 360 : null;
    if (h != null) onHeading(h);
  };
  const evt = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
  window.addEventListener(evt, handler, true);
  return () => window.removeEventListener(evt, handler, true);
}

export function distanceKm(a, b) {
  const R = 6371, toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function getBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, label: "My location", live: true }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

export const rideLinks = (from, to) => ({
  directions: `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=driving`,
  uber:
    `https://m.uber.com/ul/?action=setPickup` +
    `&pickup[latitude]=${from.lat}&pickup[longitude]=${from.lng}` +
    `&dropoff[latitude]=${to.lat}&dropoff[longitude]=${to.lng}` +
    `&dropoff[nickname]=${encodeURIComponent(to.name ?? "Pharmacy")}`,
});

export const fmtKm = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);
export const fmtPKR = (n) => (n == null ? "—" : `Rs ${Number(n).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`);
export const fmtUnit = (n) => (n == null ? "—" : `Rs ${Number(n).toLocaleString("en-PK", { minimumFractionDigits: n < 10 ? 2 : 0, maximumFractionDigits: n < 10 ? 2 : 0 })}`);

export const fmtDuration = (s) => {
  const m = Math.max(1, Math.round(s / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
export const fmtSlot = (t) => {
  if (!t) return "No free slot this week";
  const d = new Date(t);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 864e5);
  const time = d.toLocaleTimeString("en-PK", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Karachi" });
  const sameDay = (a, b) => a.toLocaleDateString("en-PK", { timeZone: "Asia/Karachi" }) === b.toLocaleDateString("en-PK", { timeZone: "Asia/Karachi" });
  if (sameDay(d, today)) return `Today ${time}`;
  if (sameDay(d, tomorrow)) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString("en-PK", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Karachi" })} ${time}`;
};
