// Angielska strona startowa en/index.html, wyprowadzona z index.html (ten sam układ i animacja, angielskie metadane).
// Uruchamiana przed `vite` i `vite build` (patrz package.json); pliku en/index.html nie edytujemy ręcznie.
// Każda zamiana musi trafić dokładnie raz: gdy index.html się zmieni, skrypt zgłosi błąd zamiast po cichu zostawić polski tekst.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const TITLE = "Where in Poland? — a daily game about Poland";
const DESC = "A daily game about Poland: photos of landmarks and sights. Drop a pin on a map with no names and guess the year each was built. No ads, no sign-up.";
const ALT = "Where in Poland? A daily game about Poland: a map of Poland with a pin and the address gdziewpolsce.com";

const swaps = [
  ['<html lang="pl">', '<html lang="en">'],
  ["<title>Gdzie w Polsce? — codzienna gra o Polsce</title>", `<title>${TITLE}</title>`],
  [/(<meta name="description" content=")[^"]*"/, `$1${DESC}"`],
  [/(<meta property="og:title" content=")[^"]*"/, `$1Where in Poland? — guess where and when"`],
  [/(<meta property="og:description" content=")[^"]*"/, `$1${DESC}"`],
  ['<meta property="og:url" content="https://gdziewpolsce.com/" />', '<meta property="og:url" content="https://gdziewpolsce.com/en/" />'],
  ['<meta property="og:site_name" content="Gdzie w Polsce?" />', '<meta property="og:site_name" content="Where in Poland?" />'],
  ['<meta property="og:locale" content="pl_PL" />', '<meta property="og:locale" content="en_GB" />'],
  [/(<meta property="og:image:alt" content=")[^"]*"/, `$1${ALT}"`],
  [/(<meta name="twitter:title" content=")[^"]*"/, `$1Where in Poland? — guess where and when"`],
  [/(<meta name="twitter:description" content=")[^"]*"/, `$1${DESC}"`],
  [/(<meta name="twitter:image:alt" content=")[^"]*"/, `$1${ALT}"`],
  ['<link rel="canonical" href="https://gdziewpolsce.com/" />', '<link rel="canonical" href="https://gdziewpolsce.com/en/" />'],
  ['href="./favicon.svg"', 'href="../favicon.svg"'],
  ['aria-label="Wczytywanie gry"', 'aria-label="Loading the game"'],
  ['<p class="intro-title">Gdzie w Polsce?</p>', '<p class="intro-title">Where in Poland?</p>'],
  ["Gra wymaga włączonego JavaScriptu.", "The game needs JavaScript to be enabled."],
];

let html = readFileSync("index.html", "utf8");
for (const [from, to] of swaps) {
  const hits = typeof from === "string" ? html.split(from).length - 1 : (html.match(new RegExp(from.source, "g")) ?? []).length;
  if (hits !== 1) throw new Error(`build_en_html: oczekiwano 1 wystąpienia, jest ${hits}: ${from}`);
  html = html.replace(from, to);
}
mkdirSync("en", { recursive: true });
writeFileSync("en/index.html", html);
console.log("en/index.html gotowy");
