import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Mapa bez podkładu kafelkowego: tylko granice, rzeki i jeziora — żadnych miejscowości.
const POLAND_BOUNDS = L.latLngBounds([49.0, 14.1], [54.85, 24.15]);
const MAX_BOUNDS = L.latLngBounds([46.5, 9.0], [57.5, 29.0]);

type GeoJSON = GeoJSON.FeatureCollection;

const base = import.meta.env.BASE_URL;
let layersPromise: Promise<[GeoJSON, GeoJSON, GeoJSON]> | null = null;
function loadLayers() {
  layersPromise ??= Promise.all(
    ["countries", "lakes", "rivers"].map((n) => fetch(`${base}map/${n}.json`).then((r) => r.json())),
  ) as Promise<[GeoJSON, GeoJSON, GeoJSON]>;
  return layersPromise;
}

function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const pinIcon = (cls: string, label: string) =>
  L.divIcon({
    className: `pin ${cls}`,
    html: `<svg viewBox="0 0 32 44" aria-hidden="true"><path d="M16 1C8 1 1.5 7.4 1.5 15.3c0 10.6 12.6 25.4 13.4 26.4a1.4 1.4 0 0 0 2.2 0c.8-1 13.4-15.8 13.4-26.4C30.5 7.4 24 1 16 1z"/><circle cx="16" cy="15" r="5.5"/></svg><span class="sr-only">${label}</span>`,
    iconSize: [32, 44],
    iconAnchor: [16, 43],
  });

export interface GameMap {
  map: L.Map;
  onPlace(cb: (lat: number, lon: number) => void): void;
  setGuess(lat: number, lon: number): void;
  getGuess(): L.LatLng | null;
  reveal(answer: { lat: number; lon: number }, guess: { lat: number; lon: number }): void;
  showMany(points: { lat: number; lon: number; label: string }[]): void;
  reset(): void;
  lock(locked: boolean): void;
  invalidate(): void;
}

export async function createMap(el: HTMLElement): Promise<GameMap> {
  const map = L.map(el, {
    zoomControl: true,
    attributionControl: true,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    minZoom: 5.5,
    maxZoom: 11,
    maxBounds: MAX_BOUNDS,
    maxBoundsViscosity: 0.9,
    preferCanvas: false,
    doubleClickZoom: false,
  });
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution("Granice i rzeki: Natural Earth");
  map.fitBounds(POLAND_BOUNDS, { padding: [8, 8] });

  const [countries, lakes, rivers] = await loadLayers();
  const hover = window.matchMedia("(hover: hover)").matches;

  L.geoJSON(countries, {
    interactive: false,
    style: (f) => {
      const pl = f?.properties?.id === "POL";
      return {
        color: pl ? css("--map-border") : css("--map-border-other"),
        weight: pl ? 1.6 : 0.8,
        fillColor: pl ? css("--map-land") : css("--map-land-other"),
        fillOpacity: 1,
      };
    },
  }).addTo(map);

  L.geoJSON(lakes, {
    interactive: false,
    style: { color: css("--map-water"), weight: 0.6, fillColor: css("--map-water"), fillOpacity: 1 },
  }).addTo(map);

  const riverLayer = L.geoJSON(rivers, {
    interactive: hover,
    style: (f) => ({ color: css("--map-river"), weight: 0.6 + (f?.properties?.w ?? 1) * 0.55, opacity: 0.95, lineCap: "round" }),
    onEachFeature: (f, layer) => {
      if (hover && f.properties?.name) layer.bindTooltip(f.properties.name, { sticky: true, direction: "top", className: "river-tip" });
    },
  }).addTo(map);
  // grubsze rzeki przy większym przybliżeniu
  map.on("zoomend", () => {
    const z = map.getZoom();
    riverLayer.setStyle((f) => ({ weight: (0.6 + (f?.properties?.w ?? 1) * 0.55) * Math.max(1, (z - 5) / 2) }));
  });

  let guess: L.Marker | null = null;
  let extra: L.Layer[] = [];
  let locked = false;
  let placeCb: ((lat: number, lon: number) => void) | null = null;

  function setGuess(lat: number, lon: number) {
    if (!guess) {
      guess = L.marker([lat, lon], { icon: pinIcon("pin-guess", "Twoja odpowiedź"), draggable: true, keyboard: false }).addTo(map);
      guess.on("dragend", () => {
        const p = guess!.getLatLng();
        placeCb?.(p.lat, p.lng);
      });
    } else guess.setLatLng([lat, lon]);
    placeCb?.(lat, lon);
  }

  map.on("click", (e: L.LeafletMouseEvent) => {
    if (!locked) setGuess(e.latlng.lat, e.latlng.lng);
  });

  return {
    map,
    onPlace: (cb) => (placeCb = cb),
    setGuess,
    getGuess: () => guess?.getLatLng() ?? null,
    reveal(answer, g) {
      const a = L.latLng(answer.lat, answer.lon);
      const line = L.polyline([[g.lat, g.lon], a], { color: css("--ink"), weight: 2, dashArray: "6 6", interactive: false }).addTo(map);
      const m = L.marker(a, { icon: pinIcon("pin-answer", "Poprawna odpowiedź"), interactive: false, zIndexOffset: 1000 }).addTo(map);
      extra.push(line, m);
      const b = L.latLngBounds([a, [g.lat, g.lon]]);
      map.flyToBounds(b, { paddingTopLeft: [50, 70], paddingBottomRight: [50, 30], maxZoom: 9, duration: 0.8 });
    },
    showMany(points) {
      for (const p of points) {
        const m = L.marker([p.lat, p.lon], { icon: pinIcon("pin-answer pin-small", p.label), interactive: false }).addTo(map);
        m.bindTooltip(p.label, { direction: "top", offset: [0, -30] });
        extra.push(m);
      }
    },
    reset() {
      for (const l of extra) l.remove();
      extra = [];
      guess?.remove();
      guess = null;
      map.flyToBounds(POLAND_BOUNDS, { padding: [8, 8], duration: 0.5 });
    },
    lock(v) {
      locked = v;
      if (guess) v ? guess.dragging?.disable() : guess.dragging?.enable();
    },
    invalidate: () => map.invalidateSize(),
  };
}
