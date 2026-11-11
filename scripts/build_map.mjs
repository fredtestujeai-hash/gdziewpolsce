// Buduje pomocnicze warstwy mapy z Natural Earth (domena publiczna) do public/map/*.json:
//  - poland.json: obrys Polski (maska „poza krajem”),
//  - countries/rivers/lakes.json: uproszczona mapa awaryjna, gdy kafelki OSM nie odpowiadają.
// Właściwa mapa (ulice, rzeki, budynki — bez nazw) to kafelki wektorowe, patrz src/mapstyle.ts.
//
// Użycie: npm run map
import { mkdir, writeFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import mapshaper from "mapshaper";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "data", "raw", "ne");
const OUT = join(ROOT, "public", "map");
const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/";
const FILES = [
  "ne_10m_admin_0_countries",
  "ne_10m_rivers_lake_centerlines",
  "ne_10m_rivers_europe",
  "ne_10m_lakes",
  "ne_10m_lakes_europe",
];
// Okno mapy: Polska + sąsiedzi (ląd szerzej, żeby na szerokich ekranach nie było „dziur”)
const BBOX = "12.0,47.8,26.0,56.2";
const LAND_BBOX = "4.0,44.0,34.0,60.0";

async function ensureSources() {
  await mkdir(SRC, { recursive: true });
  for (const f of FILES) {
    const path = join(SRC, f + ".geojson");
    try {
      await access(path);
    } catch {
      console.log("pobieram", f);
      const res = await fetch(NE + f + ".geojson");
      if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
      await writeFile(path, Buffer.from(await res.arrayBuffer()));
    }
  }
}

async function run(cmd) {
  console.log("mapshaper", cmd.slice(0, 120));
  await mapshaper.runCommands(cmd);
}

await ensureSources();
await mkdir(OUT, { recursive: true });
const s = (f) => join(SRC, f + ".geojson");

await run(
  `-i ${s("ne_10m_admin_0_countries")} -clip bbox=${LAND_BBOX} ` +
    `-filter-fields ADM0_A3 -rename-fields id=ADM0_A3 ` +
    `-simplify 20% keep-shapes -o precision=0.001 format=geojson ${join(OUT, "countries.json")}`,
);

// Dokładny obrys Polski — do przygaszenia terenów za granicą na mapie wektorowej
await run(
  `-i ${s("ne_10m_admin_0_countries")} -filter "ADM0_A3 == 'POL'" -filter-fields ADM0_A3 ` +
    `-o precision=0.0001 format=geojson geojson-type=Feature ${join(OUT, "poland.json")}`,
);

await run(
  `-i ${s("ne_10m_rivers_lake_centerlines")} ${s("ne_10m_rivers_europe")} combine-files ` +
    `-merge-layers force -clip bbox=${BBOX} ` +
    `-each "name = name_pl || name; w = Math.max(1, Math.min(4, 7 - (scalerank||6)))" ` +
    `-filter-fields name,w -dissolve name,w ` +
    `-simplify 50% -o precision=0.001 format=geojson ${join(OUT, "rivers.json")}`,
);

await run(
  `-i ${s("ne_10m_lakes")} ${s("ne_10m_lakes_europe")} combine-files ` +
    `-merge-layers force -clip bbox=${BBOX} -each "name = name_pl || name || ''" ` +
    `-filter-fields name -simplify 50% -o precision=0.001 format=geojson ${join(OUT, "lakes.json")}`,
);

// Natural Earth ma część nazw tylko po angielsku — ujednolicamy na polskie
const PL_NAMES = {
  Vistula: "Wisła", Oder: "Odra", Elbe: "Łaba", Danube: "Dunaj", Donau: "Dunaj",
  Neman: "Niemen", Pripyat: "Prypeć", "Zakhidnyy Buh": "Bug", Mukhavyets: "Muchawiec",
  Dniester: "Dniestr", Vltava: "Wełtawa", Morava: "Morawa", Neris: "Wilia",
  Yasyelda: "Jasiołda", Pissa: "Pisa", Hornad: "Hornad", Wag: "Wag",
};
const { readFile } = await import("node:fs/promises");
for (const layer of ["rivers.json", "lakes.json"]) {
  const path = join(OUT, layer);
  const gj = JSON.parse(await readFile(path, "utf8"));
  for (const f of gj.features) {
    const n = f.properties.name;
    f.properties.name = PL_NAMES[n] ?? (n === "?" ? "" : n);
  }
  await writeFile(path, JSON.stringify(gj));
}

console.log("gotowe:", OUT);
