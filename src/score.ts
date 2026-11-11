import { CONFIG } from "./config";

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

/** Kafelek do udostępniania wyniku (jak w Wordle). */
export function tile(points: number, max: number): string {
  const r = points / max;
  if (r >= 0.8) return "🟩";
  if (r >= 0.5) return "🟨";
  if (r >= 0.2) return "🟧";
  return "🟥";
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
