import { useEffect, useState } from 'react';

const LAHORE = { lat: 31.5204, lng: 74.3587 };
const KEY = 'dd_location';

function load() {
  try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; }
}

export function useLocation() {
  const [loc, setLoc] = useState(() => load() || { ...LAHORE, source: 'default' });
  const [asking, setAsking] = useState(false);

  const request = () => {
    if (!navigator.geolocation) return;
    setAsking(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude, source: 'gps' };
        setLoc(next);
        try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
        setAsking(false);
      },
      () => setAsking(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  };

  useEffect(() => { if (loc.source !== 'gps') request(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...loc, asking, request, isDefault: loc.source !== 'gps' };
}

export const formatKm = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

export function timeAgo(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.round(h / 24)} days ago`;
}
