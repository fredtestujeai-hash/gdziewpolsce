import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";

/**
 * Styl mapy: dane OpenStreetMap (kafelki wektorowe w schemacie OpenMapTiles) narysowane
 * BEZ ŻADNYCH NAPISÓW — nie ma tu ani jednej warstwy tekstowej, więc styl nie pobiera
 * nawet czcionek. Widać rzeki, jeziora, lasy, zabudowę, drogi, tory i budynki.
 */
export const TILES_URL = "https://tiles.openfreemap.org/planet";
export const OSM = "osm";

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Grubość linii rosnąca z przybliżeniem: [zoom, px, zoom, px, ...] */
const w = (...stops: number[]): ExpressionSpecification =>
  ["interpolate", ["exponential", 1.5], ["zoom"], ...stops] as ExpressionSpecification;

const cls = (...classes: string[]): ExpressionSpecification => ["match", ["get", "class"], classes, true, false];

export interface PlacesData {
  places: [number, number, 1 | 2 | 3][];
}

export function buildStyle(places: PlacesData, outside: GeoJSON.Feature | null): StyleSpecification {
  const c = {
    land: css("--map-land"),
    outside: css("--map-land-other"),
    wood: css("--map-wood"),
    grass: css("--map-grass"),
    urban: css("--map-urban"),
    water: css("--map-water"),
    river: css("--map-river"),
    major: css("--map-road-major"),
    majorCase: css("--map-road-major-case"),
    road: css("--map-road"),
    roadCase: css("--map-road-case"),
    rail: css("--map-rail"),
    building: css("--map-building"),
    buildingLine: css("--map-building-line"),
    border: css("--map-border"),
    borderMinor: css("--map-border-other"),
    place: css("--map-place"),
    placeMinor: css("--map-place-minor"),
    ink: css("--ink"),
  };

  const road = (
    id: string,
    filter: ExpressionSpecification,
    minzoom: number,
    color: string,
    width: ExpressionSpecification,
    sourceLayer = "transportation",
  ): LayerSpecification => ({
    id,
    type: "line",
    source: OSM,
    "source-layer": sourceLayer,
    minzoom,
    filter,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": color, "line-width": width },
  });

  const lowFade = (layer: LayerSpecification): LayerSpecification =>
    ({ ...layer, paint: { ...(layer as { paint: object }).paint, "line-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.45, 9, 1] } }) as LayerSpecification;

  const layers: LayerSpecification[] = [
    { id: "land", type: "background", paint: { "background-color": c.land } },

    // --- pokrycie terenu -------------------------------------------------
    {
      id: "wood",
      type: "fill",
      source: OSM,
      "source-layer": "landcover",
      filter: cls("wood"),
      paint: { "fill-color": c.wood, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.55, 12, 0.8] },
    },
    {
      id: "grass",
      type: "fill",
      source: OSM,
      "source-layer": "landcover",
      minzoom: 9,
      filter: cls("grass"),
      paint: { "fill-color": c.grass, "fill-opacity": 0.7 },
    },
    {
      id: "urban",
      type: "fill",
      source: OSM,
      "source-layer": "landuse",
      filter: cls("residential", "suburb", "neighbourhood", "commercial", "industrial", "retail"),
      paint: { "fill-color": c.urban, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.9, 13, 0.6] },
    },

    // --- woda ------------------------------------------------------------
    // Przy oddaleniu: czytelna sieć ok. 25 głównych rzek (Natural Earth); od zoomu 8 — dokładne rzeki z OSM
    {
      id: "rivers-low",
      type: "line",
      source: "ne-rivers",
      maxzoom: 8,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": c.river,
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, ["*", 0.45, ["get", "w"]], 6, ["*", 0.75, ["get", "w"]], 8, ["*", 1.05, ["get", "w"]]],
      },
    },
    {
      id: "waterway",
      type: "line",
      source: OSM,
      "source-layer": "waterway",
      minzoom: 8,
      filter: ["all", ["!=", ["get", "brunnel"], "tunnel"], cls("river", "canal")],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": c.river, "line-width": w(8, 1.5, 10, 2, 13, 3, 17, 6.5) },
    },
    {
      id: "stream",
      type: "line",
      source: OSM,
      "source-layer": "waterway",
      minzoom: 11,
      filter: ["all", ["!=", ["get", "brunnel"], "tunnel"], cls("stream", "ditch", "drain")],
      paint: { "line-color": c.river, "line-width": w(11, 0.5, 15, 1.4, 18, 3), "line-opacity": 0.8 },
    },
    {
      id: "water",
      type: "fill",
      source: OSM,
      "source-layer": "water",
      filter: ["!=", ["get", "brunnel"], "tunnel"],
      paint: { "fill-color": c.water },
    },

    // --- drogi: najpierw obrysy, potem wypełnienia (od najmniejszych) -----
    {
      id: "path",
      type: "line",
      source: OSM,
      "source-layer": "transportation",
      minzoom: 14,
      filter: cls("path", "track"),
      paint: { "line-color": c.roadCase, "line-width": w(14, 0.8, 18, 2.5), "line-dasharray": [2, 1.5] },
    },
    road("runway", cls("runway", "taxiway"), 11, c.roadCase, w(11, 1, 15, 10, 18, 40), "aeroway"),
    road("service-case", cls("service"), 14, c.roadCase, w(14, 1.6, 16, 5, 18, 12)),
    road("minor-case", cls("minor"), 12.5, c.roadCase, w(12.5, 1.2, 14, 3.4, 16, 9, 18, 20)),
    road("mid-case", cls("secondary", "tertiary"), 9, c.roadCase, w(9, 1, 12, 3, 14, 5.5, 16, 12, 18, 24)),
    road("primary-case", cls("primary"), 7, c.roadCase, w(7, 1, 10, 2.6, 14, 7, 16, 14, 18, 26)),
    lowFade(road("major-case", cls("motorway", "trunk"), 6, c.majorCase, w(6, 0.8, 8, 2, 12, 5, 14, 8.5, 16, 16, 18, 28))),

    road("service", cls("service"), 14, c.road, w(14, 0.8, 16, 3.6, 18, 10)),
    road("minor", cls("minor"), 12.5, c.road, w(12.5, 0.6, 14, 2.2, 16, 7.4, 18, 18)),
    road("mid", cls("secondary", "tertiary"), 9, c.road, w(9, 0.5, 12, 1.8, 14, 4, 16, 10, 18, 22)),
    road("primary", cls("primary"), 7, c.road, w(7, 0.5, 10, 1.6, 14, 5.4, 16, 12, 18, 24)),
    lowFade(road("major", cls("motorway", "trunk"), 6, c.major, w(6, 0.5, 8, 1.2, 12, 3.4, 14, 6.6, 16, 14, 18, 25))),

    {
      id: "rail",
      type: "line",
      source: OSM,
      "source-layer": "transportation",
      minzoom: 8,
      filter: cls("rail"),
      paint: { "line-color": c.rail, "line-width": w(8, 0.6, 13, 1.2, 16, 2.4, 18, 4) },
    },
    {
      id: "rail-ties",
      type: "line",
      source: OSM,
      "source-layer": "transportation",
      minzoom: 13,
      filter: cls("rail"),
      paint: { "line-color": c.rail, "line-width": w(13, 3, 16, 6, 18, 10), "line-dasharray": [0.25, 2.5] },
    },
    {
      id: "tram",
      type: "line",
      source: OSM,
      "source-layer": "transportation",
      minzoom: 14,
      filter: cls("transit"),
      paint: { "line-color": c.rail, "line-width": w(14, 0.6, 18, 2), "line-opacity": 0.7 },
    },

    // --- budynki ---------------------------------------------------------
    {
      id: "building",
      type: "fill",
      source: OSM,
      "source-layer": "building",
      minzoom: 13,
      paint: {
        "fill-color": c.building,
        "fill-outline-color": c.buildingLine,
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0.5, 15, 1],
      },
    },
  ];

  // Przygaszenie terenów poza Polską (znika przy dużym przybliżeniu, gdzie widać prawdziwą granicę)
  if (outside) {
    layers.push({
      id: "outside",
      type: "fill",
      source: "outside",
      paint: { "fill-color": c.outside, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.72, 8, 0.5, 10.5, 0] },
    });
  }

  layers.push(
    {
      id: "border-voivodeship",
      type: "line",
      source: OSM,
      "source-layer": "boundary",
      minzoom: 5,
      filter: ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
      paint: { "line-color": c.borderMinor, "line-width": w(5, 0.6, 10, 1.2, 14, 2), "line-dasharray": [3, 2] },
    },
    {
      id: "border-country",
      type: "line",
      source: OSM,
      "source-layer": "boundary",
      filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
      layout: { "line-join": "round" },
      paint: { "line-color": c.border, "line-width": w(4, 1, 8, 1.8, 14, 3) },
    },

    // --- miejscowości bez nazw: gminne, powiatowe, wojewódzkie --------------
    {
      id: "place-3",
      type: "circle",
      source: "places",
      filter: ["==", ["get", "r"], 3],
      paint: {
        "circle-color": c.placeMinor,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 0.45, 6, 1, 8, 2.1, 12, 3.4],
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.55, 7, 0.9, 13, 0.95, 15, 0.45],
      },
    },
    {
      id: "place-2",
      type: "circle",
      source: "places",
      filter: ["==", ["get", "r"], 2],
      paint: {
        "circle-color": c.place,
        "circle-stroke-color": c.land,
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 4, 0.4, 7, 1],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 1.1, 6, 2.2, 8, 3.6, 12, 5.4],
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 13, 1, 15, 0.5],
        "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 13, 1, 15, 0.5],
      },
    },
    {
      id: "place-1",
      type: "circle",
      source: "places",
      filter: ["==", ["get", "r"], 1],
      paint: {
        "circle-color": c.land,
        "circle-stroke-color": c.place,
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 4, 1.1, 6, 1.7, 9, 2.4],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 2.6, 6, 4.6, 8, 6.6, 12, 9],
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 13, 1, 15, 0.5],
        "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 13, 1, 15, 0.5],
      },
    },
    {
      id: "place-1-dot",
      type: "circle",
      source: "places",
      filter: ["==", ["get", "r"], 1],
      paint: {
        "circle-color": c.place,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 0.9, 6, 1.7, 8, 2.7, 12, 3.8],
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 13, 1, 15, 0.5],
      },
    },

    // --- linia między odpowiedzią gracza a celem ----------------------------
    {
      id: "result-line",
      type: "line",
      source: "result",
      layout: { "line-cap": "round" },
      paint: { "line-color": c.ink, "line-width": 2, "line-dasharray": [2, 2.5] },
    },
  );

  return {
    version: 8,
    sources: {
      [OSM]: { type: "vector", url: TILES_URL },
      places: {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: places.places.map(([lon, lat, r]) => ({
            type: "Feature",
            properties: { r },
            geometry: { type: "Point", coordinates: [lon, lat] },
          })),
        },
      },
      result: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      "ne-rivers": { type: "geojson", data: `${import.meta.env.BASE_URL}map/rivers.json` },
      ...(outside ? { outside: { type: "geojson", data: outside } } : {}),
    },
    layers,
  };
}

/**
 * Warstwy awaryjne (Natural Earth) — dokładane tylko wtedy, gdy serwer kafelków nie odpowiada,
 * żeby gra działała dalej na uproszczonej mapie: granice, główne rzeki i jeziora.
 */
export function fallbackLayers(): LayerSpecification[] {
  const land = css("--map-land");
  return [
    { id: "fb-sea", type: "background", paint: { "background-color": css("--map-sea") } },
    {
      id: "fb-land",
      type: "fill",
      source: "fb-countries",
      paint: { "fill-color": ["case", ["==", ["get", "id"], "POL"], land, css("--map-land-other")], "fill-outline-color": css("--map-border-other") },
    },
    { id: "fb-border", type: "line", source: "fb-countries", filter: ["==", ["get", "id"], "POL"], paint: { "line-color": css("--map-border"), "line-width": 1.6 } },
    { id: "fb-lakes", type: "fill", source: "fb-lakes", paint: { "fill-color": css("--map-water") } },
    {
      id: "fb-rivers",
      type: "line",
      source: "ne-rivers",
      minzoom: 8,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": css("--map-river"), "line-width": ["interpolate", ["linear"], ["zoom"], 8, ["*", 1.05, ["get", "w"]], 12, ["*", 1.8, ["get", "w"]]] },
    },
  ];
}
