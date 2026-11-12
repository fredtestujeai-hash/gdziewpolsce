// Buduje obrys Polski dla animacji startowej i wstawia go do index.html.
//
// Źródło: public/map/poland.json (Natural Earth, patrz build_map.mjs). Obrys jest upraszczany
// do kilkuset punktów, przeliczany na odwzorowanie Mercatora i zapisywany jako zwarta ścieżka SVG.
// Skrypt podmienia w index.html atrybuty viewBox i d oraz położenie pinezki; reszta
// animacji (style, znaczniki) jest pisana ręcznie w index.html.
//
// Użycie: npm run intro
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import mapshaper from "mapshaper";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "public", "map", "poland.json");
const HTML = join(ROOT, "index.html");

const POINTS = 300; // docelowa liczba punktów obrysu
const WIDTH = 600; // szerokość rysunku w jednostkach SVG (współrzędne są zaokrąglane do całości)
const PAD = 14; // margines na grubość linii i odbicie pinezki
const PIN = [21.012, 52.23]; // pinezka: Warszawa

const merc = ([lon, lat]) => [(lon * Math.PI) / 180, -Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))];

// 1. Uproszczenie w mapshaperze (algorytm Visvalingama), już po rzutowaniu, żeby zachować kształt na ekranie
const source = JSON.parse(await readFile(SRC, "utf8"));
const total = source.geometry.coordinates[0].length;
const pct = Math.min(100, (POINTS / total) * 100).toFixed(2);
const out = await mapshaper.applyCommands(
  `-i poland.json -proj merc -simplify weighted ${pct}% keep-shapes -proj wgs84 -o precision=0.0001 format=geojson simple.json`,
  { "poland.json": JSON.stringify(source) },
);
const simple = JSON.parse(out["simple.json"].toString());
const geom = simple.features ? simple.features[0].geometry : simple.geometry ?? simple.geometries[0];
let ring = (geom.type === "Polygon" ? geom.coordinates : geom.coordinates[0])[0].slice(0, -1);

// 2. Początek rysowania: północno-zachodni kraniec wybrzeża (okolice Świnoujścia), dalej zgodnie z ruchem wskazówek zegara
const area = ring.reduce((s, p, i) => {
  const q = ring[(i + 1) % ring.length];
  return s + p[0] * q[1] - q[0] * p[1];
}, 0);
if (area > 0) ring.reverse(); // dodatnie pole = przeciwnie do wskazówek zegara (szerokość rośnie w górę)
const start = ring.reduce((best, p, i) => (p[1] - p[0] > ring[best][1] - ring[best][0] ? i : best), 0);
ring = [...ring.slice(start), ...ring.slice(0, start)];

// 3. Mercator -> jednostki SVG
const projected = ring.map(merc);
const xs = projected.map((p) => p[0]);
const ys = projected.map((p) => p[1]);
const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
const k = (WIDTH - 2 * PAD) / (maxX - minX);
const toSvg = ([x, y]) => [Math.round(PAD + (x - minX) * k), Math.round(PAD + (y - minY) * k)];
const height = Math.round((maxY - minY) * k + 2 * PAD);

const pts = projected.map(toSvg).filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
let d = `M${pts[0][0]} ${pts[0][1]}l`;
for (let i = 1; i < pts.length; i++) {
  const dx = pts[i][0] - pts[i - 1][0];
  const dy = pts[i][1] - pts[i - 1][1];
  d += (i > 1 && dx >= 0 ? " " : "") + dx + (dy >= 0 ? " " : "") + dy;
}
d += "z";
const [pinX, pinY] = toSvg(merc(PIN));

// 4. Podmiana w index.html
let html = await readFile(HTML, "utf8");
const swap = (re, value, what) => {
  if (!re.test(html)) throw new Error(`index.html: nie znaleziono miejsca na ${what}`);
  html = html.replace(re, value);
};
swap(/(<svg class="intro-map" viewBox=")[^"]*(")/, `$10 0 ${WIDTH} ${height}$2`, "viewBox");
swap(/(<path class="intro-outline"[^>]*? d=")[^"]*(")/, `$1${d}$2`, "ścieżkę obrysu");
swap(/(<g class="intro-pin" transform=")[^"]*(")/, `$1translate(${pinX} ${pinY})$2`, "pinezkę");
await writeFile(HTML, html);
console.log(`obrys: ${total} -> ${pts.length} punktów, ścieżka ${d.length} B, viewBox 0 0 ${WIDTH} ${height}, pinezka ${pinX},${pinY}`);
