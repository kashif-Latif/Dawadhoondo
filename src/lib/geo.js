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

export function getBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, label: "My location" }),
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
