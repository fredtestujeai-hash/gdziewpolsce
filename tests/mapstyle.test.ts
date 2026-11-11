import { beforeAll, describe, expect, it } from "vitest";

// buildStyle czyta kolory ze zmiennych CSS — w testach podstawiamy atrapę przeglądarki
beforeAll(() => {
  const g = globalThis as Record<string, unknown>;
  g.document = { documentElement: {} };
  g.getComputedStyle = () => ({ getPropertyValue: () => "#123456" });
});

describe("styl mapy", () => {
  it("nie zawiera żadnych napisów: brak warstw tekstowych, czcionek i ikon", async () => {
    const { buildStyle } = await import("../src/mapstyle");
    const style = buildStyle({ places: [[19.94, 50.06, 1], [21.0, 52.2, 2], [20.0, 51.0, 3]] }, null);
    expect(style.glyphs).toBeUndefined();
    expect(style.sprite).toBeUndefined();
    for (const layer of style.layers) {
      expect(layer.type).not.toBe("symbol");
      expect(JSON.stringify(layer)).not.toMatch(/text-field|icon-image|"name"/);
    }
    // warstwy z nazwami w kafelkach nie są w ogóle używane
    const used = style.layers.map((l) => ("source-layer" in l ? l["source-layer"] : ""));
    for (const named of ["place", "transportation_name", "water_name", "poi", "housenumber", "mountain_peak", "aerodrome_label"]) {
      expect(used).not.toContain(named);
    }
  });
  it("pokazuje miejscowości w trzech rangach i nie przenosi ich nazw", async () => {
    const { buildStyle } = await import("../src/mapstyle");
    const style = buildStyle({ places: [[19.94, 50.06, 1], [21.0, 52.2, 2], [20.0, 51.0, 3]] }, null);
    const src = style.sources.places as { data: GeoJSON.FeatureCollection };
    expect(src.data.features).toHaveLength(3);
    expect(src.data.features.map((f) => Object.keys(f.properties ?? {}))).toEqual([["r"], ["r"], ["r"]]);
    for (const r of [1, 2, 3]) expect(style.layers.some((l) => l.id === `place-${r}`)).toBe(true);
  });
});
