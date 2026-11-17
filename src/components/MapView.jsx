import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { PAKISTAN_CENTER } from "../lib/geo";

// Free vector tiles, no API key. Includes buildings for 3D extrusion.
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export default function MapView({ user, pharmacies, activeId, onSelect }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const spinRef = useRef(true);

  // Init: 3D globe that spins, then flies to Pakistan
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [40, 20],
      zoom: 1.4,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");

    map.on("style.load", () => {
      try { map.setProjection({ type: "globe" }); } catch { /* older engine: flat map */ }
      try {
        map.setSky({ "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0] });
      } catch { /* optional */ }
      add3DBuildings(map);
    });

    const spin = () => {
      if (!spinRef.current || !mapRef.current) return;
      const c = map.getCenter();
      map.easeTo({ center: [c.lng + 12, c.lat], duration: 1000, easing: (t) => t });
    };
    map.on("moveend", spin);
    map.on("mousedown", () => (spinRef.current = false));
    map.on("touchstart", () => (spinRef.current = false));
    map.once("load", () => {
      spin();
      setTimeout(() => {
        spinRef.current = false;
        map.flyTo({ center: PAKISTAN_CENTER, zoom: 4.6, pitch: 30, duration: 4000, essential: true });
      }, 2500);
    });

    return () => map.remove();
  }, []);

  // User marker + fly into 3D street view
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !user) return;
    spinRef.current = false;
    userMarkerRef.current?.remove();
    const el = document.createElement("div");
    el.className = "user-marker";
    userMarkerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([user.lng, user.lat])
      .setPopup(new maplibregl.Popup({ offset: 12 }).setText(user.label ?? "You"))
      .addTo(map);
  }, [user]);

  // Pharmacy markers + fit to results
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (!pharmacies?.length) return;

    pharmacies.forEach((p) => {
      const el = document.createElement("div");
      el.className = "pharmacy-marker" + (p.pharmacy_id === activeId ? " active" : "");
      el.textContent = "💊";
      el.title = p.name;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelect?.(p);
      });
      markersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map));
    });

    const bounds = new maplibregl.LngLatBounds();
    pharmacies.slice(0, 8).forEach((p) => bounds.extend([p.lng, p.lat]));
    if (user) bounds.extend([user.lng, user.lat]);
    map.fitBounds(bounds, { padding: { top: 80, bottom: 80, left: 460, right: 80 }, pitch: 55, bearing: -20, maxZoom: 15, duration: 3000 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pharmacies]);

  // Highlight active pharmacy + draw route line
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m, i) => {
      m.getElement().classList.toggle("active", pharmacies?.[i]?.pharmacy_id === activeId);
    });
    const active = pharmacies?.find((p) => p.pharmacy_id === activeId);
    const draw = () => {
      const data = active && user
        ? { type: "Feature", geometry: { type: "LineString", coordinates: [[user.lng, user.lat], [active.lng, active.lat]] } }
        : { type: "FeatureCollection", features: [] };
      if (map.getSource("route")) map.getSource("route").setData(data);
      else {
        map.addSource("route", { type: "geojson", data });
        map.addLayer({
          id: "route", type: "line", source: "route",
          paint: { "line-color": "#f59e0b", "line-width": 4, "line-dasharray": [2, 1.5] },
        });
      }
      if (active) map.flyTo({ center: [active.lng, active.lat], zoom: 16, pitch: 60, bearing: -30, duration: 2000 });
    };
    if (map.isStyleLoaded()) draw();
    else map.once("idle", draw);
  }, [activeId, pharmacies, user]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

function add3DBuildings(map) {
  if (map.getLayer("building-3d") || map.getLayer("dd-buildings-3d")) return;
  const source = Object.keys(map.getStyle().sources).find((s) => s === "openmaptiles") ?? null;
  if (!source) return;
  map.addLayer({
    id: "dd-buildings-3d",
    type: "fill-extrusion",
    source,
    "source-layer": "building",
    minzoom: 14,
    paint: {
      "fill-extrusion-color": "#cbd5e1",
      "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10],
      "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
      "fill-extrusion-opacity": 0.75,
    },
  });
}
