import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const pin = (label, color) =>
  L.divIcon({ className: '', html: `<div class="pin" style="background:${color}">${label}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });

const youIcon = L.divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,.2)"></div>',
  iconSize: [18, 18], iconAnchor: [9, 9],
});

function Fit({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 14);
    else if (points.length > 1) map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
  }, [map, JSON.stringify(points)]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// places: [{ id, name, lat, lng, label, color, onClick }]
export default function MapView({ me, places, className = 'h-72' }) {
  const points = [[me.lat, me.lng], ...places.map((p) => [p.lat, p.lng])];
  return (
    <div className={`overflow-hidden rounded-3xl border border-line ${className}`}>
      <MapContainer center={[me.lat, me.lng]} zoom={13} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        <Marker position={[me.lat, me.lng]} icon={youIcon}><Popup>You are here</Popup></Marker>
        {places.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={pin(p.label, p.color || '#1E6B52')}
                  eventHandlers={p.onClick ? { click: p.onClick } : undefined}>
            <Popup><b>{p.name}</b></Popup>
          </Marker>
        ))}
        <Fit points={points} />
      </MapContainer>
    </div>
  );
}
