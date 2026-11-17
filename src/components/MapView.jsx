import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { PAKISTAN_CENTER } from "../lib/geo";

// Light, minimal vector style (fewer layers = faster). Free, no API key.
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const isMobile = () => window.matchMedia("(max-width: 767px)").matches;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const EMPTY = { type: "FeatureCollection", features: [] };

function circle(lng, lat, meters, steps = 48) {
  const coords = [];
  const dLat = meters / 111320;
  const dLng = meters / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    coords.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] } };
}

/**
 * places: [{ key, lat, lng, name, kind: "pharmacy" | "clinic" }]
 * route:  { geometry: GeoJSON LineString } | null
 */
export default function MapView({ user, heading, places, activeKey, onSelect, padding, route, follow }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const userMarkerRef = useRef(null);
  const spinRef = useRef(false);
  const paddingRef = useRef(padding);
  const readyRef = useRef(false);
  const pendingRef = useRef([]);
  paddingRef.current = padding;

  const whenReady = (fn) => (readyRef.current ? fn() : pendingRef.current.push(fn));

  useEffect(() => {
    const mobile = isMobile();
    const animate = !mobile && !reducedMotion();
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: animate ? [45, 22] : PAKISTAN_CENTER,
      zoom: animate ? 1.6 : 4.4,
      pixelRatio: Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2),
      fadeDuration: 0,
      maxPitch: 70,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showZoom: !mobile }), "bottom-right");

    map.on("load", () => {
      if (animate) {
        try { map.setProjection({ type: "globe" }); } catch { /* flat fallback */ }
      }
      add3DBuildings(map);
      // accuracy circle under everything
      map.addSource("accuracy", { type: "geojson", data: EMPTY });
      map.addLayer({ id: "accuracy-fill", type: "fill", source: "accuracy", paint: { "fill-color": "#4285f4", "fill-opacity": 0.12 } });
      map.addLayer({ id: "accuracy-line", type: "line", source: "accuracy", paint: { "line-color": "#4285f4", "line-opacity": 0.35, "line-width": 1 } });
      // Google-style route: dark casing + bright core
      map.addSource("route", { type: "geojson", data: EMPTY, lineMetrics: true });
      map.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#1a56c4", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 6, 16, 12] } });
      map.addLayer({ id: "route-line", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#4a8af4", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 16, 8] } });
      readyRef.current = true;
      pendingRef.current.splice(0).forEach((fn) => fn());
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
          if (!spinRef.current) return;
          spinRef.current = false;
          map.flyTo({ center: PAKISTAN_CENTER, zoom: 4.6, pitch: 25, duration: 3000, essential: true });
        }, 1600);
      });
    }
    return () => map.remove();
  }, []);

  // Live user dot + heading cone + accuracy circle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !user) return;
    if (!userMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "user-loc";
      el.innerHTML = '<div class="user-cone"></div><div class="user-dot"></div>';
      userMarkerRef.current = new maplibregl.Marker({ element: el, rotationAlignment: "map", pitchAlignment: "map" })
        .setLngLat([user.lng, user.lat]).addTo(map);
    } else {
      userMarkerRef.current.setLngLat([user.lng, user.lat]);
    }
    whenReady(() => {
      const src = map.getSource("accuracy");
      if (src) src.setData(user.accuracy && user.accuracy < 3000 ? circle(user.lng, user.lat, user.accuracy) : EMPTY);
    });
    if (follow) {
      spinRef.current = false;
      map.flyTo({ center: [user.lng, user.lat], zoom: Math.max(map.getZoom(), 13.5), pitch: 40, duration: 1600, padding: paddingRef.current });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.lat, user?.lng, user?.accuracy, follow]);

  useEffect(() => {
    const el = userMarkerRef.current?.getElement();
    if (!el) return;
    el.classList.toggle("has-heading", heading != null);
    if (heading != null) userMarkerRef.current.setRotation(heading);
  }, [heading]);

  // Place markers (pharmacies 💊 / clinics 🩺)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    spinRef.current = false;
    const keep = new Set((places ?? []).map((p) => p.key));
    for (const [k, m] of markersRef.current) {
      if (!keep.has(k)) { m.remove(); markersRef.current.delete(k); }
    }
    if (!places?.length) return;
    whenReady(() => {
      places.forEach((p, i) => {
        if (markersRef.current.has(p.key)) return;
        // MapLibre positions the wrapper with an inline transform; animations live on the inner
        // button so they never override that transform (which made pins jump to a corner).
        const wrap = document.createElement("div");
        const el = document.createElement("button");
        el.className = `place-marker ${p.kind}`;
        el.style.animationDelay = `${i * 35}ms`;
        el.setAttribute("aria-label", p.name);
        el.textContent = p.kind === "clinic" ? "🩺" : "💊";
        el.addEventListener("click", (e) => { e.stopPropagation(); onSelect?.(p.key); });
        wrap.appendChild(el);
        markersRef.current.set(p.key, new maplibregl.Marker({ element: wrap }).setLngLat([p.lng, p.lat]).addTo(map));
      });
      const bounds = new maplibregl.LngLatBounds();
      places.slice(0, 8).forEach((p) => bounds.extend([p.lng, p.lat]));
      if (user) bounds.extend([user.lng, user.lat]);
      map.fitBounds(bounds, { padding: paddingRef.current, pitch: 45, bearing: -12, maxZoom: 15, duration: 1500 });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places]);

  useEffect(() => {
    for (const [k, m] of markersRef.current) m.getElement().firstChild?.classList.toggle("active", k === activeKey);
  }, [activeKey, places]);

  // Road route
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    whenReady(() => {
      const src = map.getSource("route");
      if (!src) return;
      src.setData(route ? { type: "Feature", geometry: route.geometry } : EMPTY);
      if (route?.geometry?.coordinates?.length > 1) {
        const b = new maplibregl.LngLatBounds();
        route.geometry.coordinates.forEach((c) => b.extend(c));
        map.fitBounds(b, { padding: paddingRef.current, pitch: 35, bearing: 0, maxZoom: 16, duration: 1400 });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  // Inline size: maplibre-gl.css sets .maplibregl-map{position:relative}, which beats Tailwind v4's layered utilities.
  return (
    <div className="absolute inset-0">
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}

function add3DBuildings(map) {
  if (map.getLayer("dd-buildings-3d") || !map.getSource("openmaptiles")) return;
  try {
    map.addLayer({
      id: "dd-buildings-3d",
      type: "fill-extrusion",
      source: "openmaptiles",
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
