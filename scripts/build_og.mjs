// Obrazek podglądu linku (Open Graph, 1200×630) -> public/og.png.
//
// Facebook, X, WhatsApp i komunikatory pokazują go przy linku do gry. Rysunek to zwykła strona HTML
// (obrys Polski z src/outline.ts, czcionki gry z node_modules), którą Playwright zapisuje jako PNG.
// Po zmianie: npm run og, potem odświeżenie podglądu w Facebook Sharing Debugger.
//
// Użycie: npm run og
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

// Playwright nie jest zależnością projektu: używamy zainstalowanego w systemie (npm i -g playwright)
const { chromium } = createRequire(import.meta.url)("playwright");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "og.png");

// obrys z pliku generowanego przez build_intro.mjs
const src = await readFile(join(ROOT, "src", "outline.ts"), "utf8");
const OUTLINE = {
  width: Number(src.match(/width: (\d+)/)[1]),
  height: Number(src.match(/height: (\d+)/)[1]),
  d: src.match(/d: "([^"]+)"/)[1],
  pin: src.match(/pin: \[(\d+), (\d+)\]/).slice(1).map(Number),
};

const font = (pkg, file) => pathToFileURL(join(ROOT, "node_modules", "@fontsource-variable", pkg, "files", file)).href;
const PIN = "M16 1C8 1 1.5 7.4 1.5 15.3c0 10.6 12.6 25.4 13.4 26.4a1.4 1.4 0 0 0 2.2 0c.8-1 13.4-15.8 13.4-26.4C30.5 7.4 24 1 16 1z";
const [px, py] = OUTLINE.pin;
const TILES = ["#2f9e5b", "#2f9e5b", "#e3ad12", "#2f9e5b", "#e8772e", "#e3ad12"];

const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><style>
@font-face { font-family: Fraunces; font-weight: 100 900; src: url(${font("fraunces", "fraunces-latin-wght-normal.woff2")}); unicode-range: U+0000-00FF; }
@font-face { font-family: Fraunces; font-weight: 100 900; src: url(${font("fraunces", "fraunces-latin-ext-wght-normal.woff2")}); unicode-range: U+0100-024F, U+1E00-1EFF, U+2000-206F; }
@font-face { font-family: Inter; font-weight: 100 900; src: url(${font("inter", "inter-latin-wght-normal.woff2")}); unicode-range: U+0000-00FF; }
@font-face { font-family: Inter; font-weight: 100 900; src: url(${font("inter", "inter-latin-ext-wght-normal.woff2")}); unicode-range: U+0100-024F, U+1E00-1EFF, U+2000-206F; }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; overflow: hidden; background: #f5efe4; color: #1e1b17; font-family: Inter, sans-serif; display: flex; align-items: center; gap: 20px; padding: 0 64px 0 72px; }
.text { flex: 1; min-width: 0; }
.brand { display: flex; align-items: center; gap: 18px; }
.brand svg { width: 52px; height: 72px; flex: none; }
h1 { white-space: nowrap; font: 700 70px/1 Fraunces, serif; letter-spacing: -.015em; }
.tag { margin-top: 26px; font: 600 38px/1.2 Inter, sans-serif; }
.how { margin-top: 18px; font: 400 27px/1.45 Inter, sans-serif; color: #6d665c; }
.tiles { display: flex; gap: 8px; margin-top: 34px; }
.tiles i { width: 40px; height: 40px; border-radius: 8px; }
.pill { display: inline-block; margin-top: 34px; padding: 14px 30px; border-radius: 999px; background: #c41e3a; color: #fff; font: 700 30px Inter, sans-serif; }
.map { width: 400px; flex: none; }
.map svg { width: 100%; height: auto; overflow: visible; display: block; }
</style></head><body>
<div class="text">
  <div class="brand"><svg viewBox="0 0 32 44"><path d="${PIN}" fill="#c41e3a"/><circle cx="16" cy="15" r="5.5" fill="#f5efe4"/></svg><h1>Gdzie w Polsce?</h1></div>
  <p class="tag">Codzienna gra o Polsce</p>
  <p class="how">Zobacz zdjęcie zabytku, wbij pinezkę<br>na mapie i zgadnij rok powstania.</p>
  <div class="tiles">${TILES.map((c) => `<i style="background:${c}"></i>`).join("")}</div>
  <p class="pill">gdziewpolsce.com</p>
</div>
<div class="map"><svg viewBox="0 0 ${OUTLINE.width} ${OUTLINE.height}">
  <path d="${OUTLINE.d}" fill="#fffcf6" stroke="#c41e3a" stroke-width="5" stroke-linejoin="round"/>
  <ellipse cx="${px}" cy="${py}" rx="26" ry="11" fill="#c41e3a" opacity=".25"/>
  <g transform="translate(${px - 24} ${py - 63}) scale(1.5)"><path d="${PIN}" fill="#c41e3a"/><circle cx="16" cy="15" r="5.5" fill="#fffcf6"/></g>
</svg></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
// strona z pliku (nie setContent), żeby mogła wczytać czcionki z dysku
const dir = await mkdtemp(join(tmpdir(), "og-"));
await writeFile(join(dir, "og.html"), html);
await page.goto(pathToFileURL(join(dir, "og.html")).href, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await writeFile(OUT, await page.screenshot({ type: "png" }));
await browser.close();
await rm(dir, { recursive: true });
console.log(`zapisano ${OUT}`);
