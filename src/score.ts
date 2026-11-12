import { CONFIG } from "./config";
import type { Guess } from "./types";

/** Odległość po kole wielkim w km. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(lat2 - lat1);
  const dLon = r(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Punkty za lokalizację: pełna pula do 2 km, potem spadek wykładniczy.
 * 10 km ≈ 460, 50 km ≈ 310, 100 km ≈ 190, 200 km ≈ 70, 300 km ≈ 25.
 */
export function locationPoints(km: number, max = CONFIG.maxLocationPoints): number {
  if (km <= 2) return max;
  return Math.round(max * Math.exp(-(km - 2) / 100));
}

/**
 * Punkty za rok: pełna pula przy trafieniu co do roku, potem spadek wykładniczy.
 * ±5 lat ≈ 435, ±10 ≈ 375, ±25 ≈ 245, ±50 ≈ 120, ±100 ≈ 30.
 */
export function yearPoints(diff: number, max = CONFIG.maxYearPoints): number {
  const d = Math.abs(diff);
  if (d === 0) return max;
  return Math.round(max * Math.exp(-d / 35));
}

/** Punkty po odjęciu kosztu podpowiedzi (CONFIG.hintCost), jeśli jej użyto. */
export function afterHint(points: number, used: boolean | undefined, cost = CONFIG.hintCost): number {
  return used ? Math.round(points * (1 - cost)) : points;
}

/**
 * Punkty jednej rundy — jedyne miejsce, w którym są liczone. Korzysta z niego i gra (src/views/round.ts),
 * i serwer rankingu (recomputeScore w src/ranking-core.ts), więc oba wyniki są zawsze identyczne.
 * Runda z `gaveUp` (pominięta albo nierozegrana) ma 0 punktów; podpowiedź obniża punkty swojej części.
 */
export function scoreRound(
  puzzle: { lat: number; lon: number; year: number },
  answer: { lat: number; lon: number; year: number; hintLoc?: boolean; hintYear?: boolean; gaveUp?: unknown },
): { km: number; yearDiff: number; locPts: number; yearPts: number } {
  if (answer.gaveUp) return { km: 0, yearDiff: 0, locPts: 0, yearPts: 0 };
  const km = haversineKm(answer.lat, answer.lon, puzzle.lat, puzzle.lon);
  const yearDiff = answer.year - puzzle.year;
  return { km, yearDiff, locPts: afterHint(locationPoints(km), answer.hintLoc), yearPts: afterHint(yearPoints(yearDiff), answer.hintYear) };
}

/** Koszt podpowiedzi jako tekst, np. „30%”. */
export function hintCostText(cost = CONFIG.hintCost): string {
  return `${Math.round(cost * 100)}%`;
}

/** Suma punktów z rund. */
export function totalPoints(guesses: { locPts: number; yearPts: number }[]): number {
  return guesses.reduce((s, g) => s + g.locPts + g.yearPts, 0);
}

/** Kafelek rundy, z której gracz zrezygnował. */
export const TILE_GAVE_UP = "⬛";

/** Kafelek do udostępniania wyniku (jak w Wordle). */
export function tile(points: number, max: number): string {
  const r = points / max;
  if (r >= 0.8) return "🟩";
  if (r >= 0.5) return "🟨";
  if (r >= 0.2) return "🟧";
  return "🟥";
}

/** Kafelki rundy: za miejsce i za rok (⬛ = runda bez odpowiedzi). */
export const locTile = (g: Guess) => (g.gaveUp ? TILE_GAVE_UP : tile(g.locPts, CONFIG.maxLocationPoints));
export const yearTile = (g: Guess) => (g.gaveUp ? TILE_GAVE_UP : tile(g.yearPts, CONFIG.maxYearPoints));
const hintsWord = (n: number) => (n === 1 ? "podpowiedź" : "podpowiedzi");

/** Tekst do udostępnienia wyniku: kafelki, liczba podpowiedzi i rund bez odpowiedzi. */
export function shareLines(number: number, guesses: Guess[], rounds: number, url: string): string {
  const max = rounds * (CONFIG.maxLocationPoints + CONFIG.maxYearPoints);
  const hints = guesses.reduce((s, g) => s + (g.hintLoc ? 1 : 0) + (g.hintYear ? 1 : 0), 0);
  const skipped = guesses.filter((g) => g.gaveUp).length;
  const notes = [hints ? `💡 ${hints} ${hintsWord(hints)}` : "", skipped ? `⬛ ${skipped} bez odpowiedzi` : ""].filter(Boolean).join(" · ");
  return [
    `${CONFIG.name} #${number} — ${formatPoints(totalPoints(guesses))}/${formatPoints(max)}`,
    `📍 ${guesses.map(locTile).join("")}`,
    `📅 ${guesses.map(yearTile).join("")}`,
    notes,
    url,
  ]
    .filter(Boolean)
    .join("\n");
}


export function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1).replace(".", ",")} km`;
  return `${Math.round(km)} km`;
}

export function formatPoints(n: number): string {
  return n.toLocaleString("pl-PL");
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI", "XXII"];
export function century(year: number): string {
  return `${ROMAN[Math.floor((year - 1) / 100)] ?? "?"} w.`;
}

/** Stulecie jako podpowiedź: nazwa i zakres lat, np. 1364 -> „XIV wiek”, 1301–1400. */
export function centuryRange(year: number): { label: string; from: number; to: number } {
  const c = Math.floor((year - 1) / 100);
  return { label: `${ROMAN[c] ?? "?"} wiek`, from: c * 100 + 1, to: (c + 1) * 100 };
}

/** „miejsc” z poprawną polską odmianą: 1 miejsce, 3 miejsca, 5 miejsc. */
export function placesWord(n: number): string {
  if (n === 1) return "miejsce";
  const u = n % 10;
  const t = n % 100;
  return u >= 2 && u <= 4 && !(t >= 12 && t <= 14) ? "miejsca" : "miejsc";
}

/** „lat” z poprawną polską odmianą: 1 rok, 2 lata, 5 lat, 22 lata. */
export function yearsWord(n: number): string {
  const a = Math.abs(n);
  if (a === 1) return "rok";
  const u = a % 10;
  const t = a % 100;
  return u >= 2 && u <= 4 && !(t >= 12 && t <= 14) ? "lata" : "lat";
}

export function rating(total: number, max: number): string {
  const r = total / max;
  if (r >= 0.9) return "Przewodnik z uprawnieniami!";
  if (r >= 0.75) return "Obieżyświat";
  if (r >= 0.6) return "Krajoznawca";
  if (r >= 0.45) return "Turysta z mapą";
  if (r >= 0.3) return "Niedzielny wycieczkowicz";
  return "Czas ruszyć w Polskę!";
}
