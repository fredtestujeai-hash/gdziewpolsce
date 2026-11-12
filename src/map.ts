import type { GeoJSONSource, LngLatBoundsLike, Map as MLMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildStyle, fallbackLayers, OSM, type PlacesData } from "./mapstyle";

// Mapa wektorowa z OpenStreetMap bez żadnych nazw: można ją przybliżyć aż do ulic i budynków.
// Na wierzchu kropki miejscowości (wojewódzkie, powiatowe, gminne) jako punkty orientacyjne.
const POLAND_BOUNDS: LngLatBoundsLike = [
  [14.1, 49.0],
  [24.15, 54.85],
];
const MAX_BOUNDS: LngLatBoundsLike = [
  [8.5, 46.2],
  [29.5, 57.8],
];
const FIT = { padding: 10 };

const base = import.meta.env.BASE_URL;
const getJSON = <T>(name: string): Promise<T> => fetch(`${base}map/${name}.json`).then((r) => r.json() as Promise<T>);

let overlays: Promise<[PlacesData, GeoJSON.Feature | null]> | null = null;
function loadOverlays() {
  overlays ??= Promise.all([
    getJSON<PlacesData>("places").catch(() => ({ places: [] }) as PlacesData),
    getJSON<GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>>("poland")
      .then(outsideOf)
      .catch(() => null),
  ]);
  return overlays;
}

/** „Cały świat z dziurą w kształcie Polski” — do przygaszenia terenów za granicą. */
function outsideOf(poland: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>): GeoJSON.Feature {
  const g = poland.geometry;
  const outers = (g.type === "Polygon" ? [g.coordinates] : g.coordinates).map((poly) => poly[0]);
  const world = [
    [-30, 20],
    [80, 20],
    [80, 80],
    [-30, 80],
    [-30, 20],
  ];
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [world, ...outers] } };
}

function pinElement(cls: string, label: string): HTMLElement {
  const el = document.createElement("div");
  el.className = `pin ${cls}`;
  el.innerHTML = `<svg viewBox="0 0 32 44" aria-hidden="true"><path d="M16 1C8 1 1.5 7.4 1.5 15.3c0 10.6 12.6 25.4 13.4 26.4a1.4 1.4 0 0 0 2.2 0c.8-1 13.4-15.8 13.4-26.4C30.5 7.4 24 1 16 1z"/><circle cx="16" cy="15" r="5.5"/></svg><span class="sr-only"></span>`;
  el.querySelector("span")!.textContent = label;
  return el;
}

export interface GameMap {
  onPlace(cb: (lat: number, lon: number) => void): void;
  setGuess(lat: number, lon: number): void;
  getGuess(): { lat: number; lng: number } | null;
  /** Pokazuje poprawną odpowiedź; bez `guess` (zagadka pominięta) mapa leci prosto do celu. */
  reveal(answer: { lat: number; lon: number }, guess?: { lat: number; lon: number } | null): void;
  /** Podświetla obszar województwa o podanej nazwie i przybliża do niego mapę (podpowiedź). */
  highlightRegion(name: string): Promise<boolean>;
  clearRegion(): void;
  showMany(points: { lat: number; lon: number; label: string }[]): void;
  reset(): void;
  lock(locked: boolean): void;
  invalidate(): void;
}

type Regions = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { name: string }>;
let regions: Promise<Regions> | null = null;
/** Granice województw — pobierane dopiero przy pierwszej podpowiedzi. */
function loadRegions(): Promise<Regions> {
  regions ??= getJSON<Regions>("wojewodztwa").catch((e) => {
    regions = null;
    throw e;
  });
  return regions;
}

/** Wczytuje bibliotekę mapy z wyprzedzeniem (np. na ekranie startowym), żeby runda ruszała od razu. */
export function preloadMap(): void {
  void import("maplibre-gl");
  void loadOverlays();
}

const live: MLMap[] = [];

export async function createMap(el: HTMLElement): Promise<GameMap> {
  // MapLibre jest duży — ładujemy go dopiero, gdy potrzebna jest mapa (ekran startowy zostaje lekki)
  const [{ default: maplibregl }, [places, outside]] = await Promise.all([import("maplibre-gl"), loadOverlays()]);

  // zwolnij mapy z poprzednich ekranów (każda trzyma kontekst WebGL)
  for (let i = live.length - 1; i >= 0; i--) {
    if (!document.body.contains(live[i].getContainer())) live.splice(i, 1)[0].remove();
  }

  const map = new maplibregl.Map({
    container: el,
    style: buildStyle(places, outside),
    bounds: POLAND_BOUNDS,
    fitBoundsOptions: FIT,
    maxBounds: MAX_BOUNDS,
    minZoom: 4,
    maxZoom: 18,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    renderWorldCopies: false,
    attributionControl: false,
    doubleClickZoom: false,
  });
  live.push(map);
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "Miejscowości: Wikidata" }), "bottom-right");
  // Podpis źródeł domyślnie zwinięty do przycisku „i” (rozwija się po kliknięciu) — nie zasłania legendy
  const collapseAttribution = () => {
    const a = el.querySelector(".maplibregl-ctrl-attrib");
    a?.classList.remove("maplibregl-compact-show");
    a?.removeAttribute("open");
  };
  collapseAttribution();
  map.once("styledata", collapseAttribution);

  // --- tryb awaryjny: gdy kafelki OSM nie dochodzą, pokaż uproszczoną mapę z Natural Earth ---
  let tilesOk = false;
  let fallbackOn = false;
  async function enableFallback() {
    if (tilesOk || fallbackOn) return;
    fallbackOn = true;
    try {
      const [countries, lakes] = await Promise.all(["countries", "lakes"].map((n) => getJSON<GeoJSON.FeatureCollection>(n)));
      if (tilesOk || !map.getStyle()) return;
      map.addSource("fb-countries", { type: "geojson", data: countries });
      map.addSource("fb-lakes", { type: "geojson", data: lakes });
      for (const layer of fallbackLayers()) map.addLayer(layer, "wood");
    } catch {
      /* zostaje samo tło z kropkami miejscowości */
    }
  }
  function disableFallback() {
    if (!fallbackOn) return;
    fallbackOn = false;
    for (const l of fallbackLayers()) if (map.getLayer(l.id)) map.removeLayer(l.id);
    for (const s of ["fb-countries", "fb-lakes"]) if (map.getSource(s)) map.removeSource(s);
  }
  map.on("data", (e) => {
    const ev = e as { dataType?: string; sourceId?: string; tile?: unknown };
    if (ev.dataType === "source" && ev.sourceId === OSM && ev.tile && !tilesOk) {
      tilesOk = true;
      disableFallback();
    }
  });
  map.on("error", () => void enableFallback());
  const fallbackTimer = window.setTimeout(() => void enableFallback(), 7000);
  map.once("remove", () => clearTimeout(fallbackTimer));

  // Czekamy tylko na sam styl (jest wbudowany, więc to chwila) — nie na kafelki z sieci,
  // żeby brak połączenia z serwerem map nigdy nie zablokował rundy.
  await new Promise<void>((resolve) => {
    const t = window.setTimeout(resolve, 4000);
    map.once("style.load", () => {
      clearTimeout(t);
      resolve();
    });
  });

  let guess: Marker | null = null;
  let extra: Marker[] = [];
  let locked = false;
  let placeCb: ((lat: number, lon: number) => void) | null = null;
  const resultSource = () => map.getSource("result") as GeoJSONSource | undefined;

  function setGuess(lat: number, lon: number) {
    if (!guess) {
      guess = new maplibregl.Marker({ element: pinElement("pin-guess", "Twoja odpowiedź"), anchor: "bottom", draggable: !locked })
        .setLngLat([lon, lat])
        .addTo(map);
      guess.on("dragend", () => {
        const p = guess!.getLngLat();
        placeCb?.(p.lat, p.lng);
      });
    } else guess.setLngLat([lon, lat]);
    placeCb?.(lat, lon);
  }

  map.on("click", (e) => {
    if (!locked) setGuess(e.lngLat.lat, e.lngLat.lng);
  });

  return {
    onPlace: (cb) => (placeCb = cb),
    setGuess,
    getGuess: () => (guess ? { lat: guess.getLngLat().lat, lng: guess.getLngLat().lng } : null),
    reveal(answer, g) {
      if (!g) {
        guess?.remove();
        guess = null;
        extra.push(
          new maplibregl.Marker({ element: pinElement("pin-answer", "Poprawna odpowiedź"), anchor: "bottom" }).setLngLat([answer.lon, answer.lat]).addTo(map),
        );
        map.flyTo({ center: [answer.lon, answer.lat], zoom: 9.5, duration: 1200 });
        return;
      }
      resultSource()?.setData({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: [[g.lon, g.lat], [answer.lon, answer.lat]] },
      });
      extra.push(
        new maplibregl.Marker({ element: pinElement("pin-answer", "Poprawna odpowiedź"), anchor: "bottom" }).setLngLat([answer.lon, answer.lat]).addTo(map),
      );
      map.fitBounds(
        [
          [Math.min(g.lon, answer.lon), Math.min(g.lat, answer.lat)],
          [Math.max(g.lon, answer.lon), Math.max(g.lat, answer.lat)],
        ],
        { padding: { top: 70, bottom: 40, left: 70, right: 50 }, maxZoom: 15, duration: 900 },
      );
    },
    async highlightRegion(name) {
      try {
        const feature = (await loadRegions()).features.find((f) => f.properties.name === name);
        if (!feature || !map.getStyle()) return false;
        const src = map.getSource("hint-region") as GeoJSONSource | undefined;
        if (src) src.setData(feature);
        else {
          const color = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#c41e3a";
          const before = map.getLayer("place-3") ? "place-3" : undefined; // pod kropkami miejscowości
          map.addSource("hint-region", { type: "geojson", data: feature });
          map.addLayer({ id: "hint-region-fill", type: "fill", source: "hint-region", paint: { "fill-color": color, "fill-opacity": 0.16 } }, before);
          map.addLayer({ id: "hint-region-line", type: "line", source: "hint-region", layout: { "line-join": "round" }, paint: { "line-color": color, "line-width": 2.5 } }, before);
        }
        let [w, s, e, n] = [180, 90, -180, -90];
        const g = feature.geometry;
        for (const poly of g.type === "Polygon" ? [g.coordinates] : g.coordinates)
          for (const [x, y] of poly[0]) {
            w = Math.min(w, x);
            e = Math.max(e, x);
            s = Math.min(s, y);
            n = Math.max(n, y);
          }
        map.fitBounds([[w, s], [e, n]], { padding: 28, maxZoom: 9, duration: 900 });
        return true;
      } catch {
        return false;
      }
    },
    clearRegion() {
      (map.getSource("hint-region") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] });
    },
    showMany(points) {
      for (const p of points) {
        const elPin = pinElement("pin-answer pin-small", p.label);
        elPin.title = p.label;
        extra.push(new maplibregl.Marker({ element: elPin, anchor: "bottom" }).setLngLat([p.lon, p.lat]).addTo(map));
      }
    },
    reset() {
      for (const m of extra) m.remove();
      extra = [];
      guess?.remove();
      guess = null;
      resultSource()?.setData({ type: "FeatureCollection", features: [] });
      (map.getSource("hint-region") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] });
      map.fitBounds(POLAND_BOUNDS, { ...FIT, duration: 500 });
    },
    lock(v) {
      locked = v;
      guess?.setDraggable(!v);
      el.classList.toggle("locked", v);
    },
    invalidate: () => map.resize(),
  };
}
