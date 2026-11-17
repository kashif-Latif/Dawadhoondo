import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { PAKISTAN_CENTER } from "../lib/geo";

// Light, minimal vector style (fewer layers = faster). Free, no API key.
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const isMobile = () => window.matchMedia("(max-width: 767px)").matches;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function MapView({ user, pharmacies, activeId, onSelect, padding }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const spinRef = useRef(false);
  const paddingRef = useRef(padding);
  paddingRef.current = padding;

  useEffect(() => {
    const mobile = isMobile();
    const animate = !mobile && !reducedMotion();
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: animate ? [45, 22] : PAKISTAN_CENTER,
      zoom: animate ? 1.6 : 4.4,
      pitch: 0,
      pixelRatio: Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2),
      fadeDuration: 0,
      maxPitch: 70,
      attributionControl: { compact: true },
      cooperativeGestures: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showZoom: !mobile }), "bottom-right");

    map.on("style.load", () => {
      if (animate) {
        try { map.setProjection({ type: "globe" }); } catch { /* flat fallback */ }
      }
      add3DBuildings(map);
    });

    if (animate) {
      spinRef.current = true;
      const spin = () => {
        if (!spinRef.current) return;
        const c = map.getCenter();
        map.easeTo({ center: [c.lng + 10, c.lat], duration: 1000, easing: (t) => t });
      };
      map.on("moveend", spin);
      const stop = () => (spinRef.current = false);
      map.on("mousedown", stop);
      map.on("touchstart", stop);
      map.once("load", () => {
        spin();
        setTimeout(() => {
          spinRef.current = false;
          map.flyTo({ center: PAKISTAN_CENTER, zoom: 4.6, pitch: 25, duration: 3200, essential: true });
        }, 1800);
      });
    }
    return () => map.remove();
  }, []);

  // User location marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !user) return;
    userMarkerRef.current?.remove();
    const el = document.createElement("div");
    el.className = "user-marker";
    userMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat([user.lng, user.lat]).addTo(map);
  }, [user]);

  // Pharmacy markers + fit
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    spinRef.current = false;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (!pharmacies?.length) return;

    const place = () => pharmacies.forEach((p, i) => {
      const el = document.createElement("button");
      el.className = "pharmacy-marker";
      el.style.animationDelay = `${i * 40}ms`;
      el.setAttribute("aria-label", p.name);
      el.textContent = "💊";
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelect?.(p);
      });
      markersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map));
    });
    // Only place pins once the map can project coordinates (avoids pins stuck in a corner).
    if (map.loaded()) place();
    else map.once("load", place);

    const bounds = new maplibregl.LngLatBounds();
    pharmacies.slice(0, 8).forEach((p) => bounds.extend([p.lng, p.lat]));
    if (user) bounds.extend([user.lng, user.lat]);
    map.fitBounds(bounds, { padding: paddingRef.current, pitch: 50, bearing: -15, maxZoom: 15, duration: 1800 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pharmacies]);

  // Active pharmacy: highlight + route line
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
          layout: { "line-cap": "round" },
          paint: { "line-color": "#0d9488", "line-width": 4, "line-dasharray": [1.5, 1.5], "line-opacity": 0.85 },
        });
      }
      if (active) {
        map.flyTo({ center: [active.lng, active.lat], zoom: 16, pitch: 60, bearing: -25, duration: 1500, padding: paddingRef.current });
      }
    };
    if (map.isStyleLoaded()) draw();
    else map.once("idle", draw);
  }, [activeId, pharmacies, user]);

  // Inline size: maplibre-gl.css sets .maplibregl-map{position:relative}, which beats Tailwind v4's layered utilities.
  return (
    <div className="absolute inset-0">
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}

function add3DBuildings(map) {
  if (map.getLayer("dd-buildings-3d")) return;
  const src = map.getSource("openmaptiles") ? "openmaptiles" : null;
  if (!src) return;
  try {
    map.addLayer({
      id: "dd-buildings-3d",
      type: "fill-extrusion",
      source: src,
      "source-layer": "building",
      minzoom: 14.5,
      paint: {
        "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 8], 0, "#e2e8f0", 60, "#cbd5e1"],
        "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": 0.8,
      },
    });
  } catch { /* style without buildings */ }
}
