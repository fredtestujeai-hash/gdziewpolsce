// Anonimowe liczniki gry: reguły wspólne dla przeglądarki i serwera.
// Liczymy rozgrywki, nie ludzi: zdarzenie + dzień + krótki klucz (np. przedział wyniku albo id kampanii).
// Bez identyfikatorów, bez ciasteczek, bez zapisywania adresu IP.

export const STAT_EVENTS = ["start", "finish", "quit", "share", "sponsor_view", "sponsor_click"] as const;
export type StatEvent = (typeof STAT_EVENTS)[number];

/** Szerokość przedziału wyniku w histogramie dnia (punkty). */
export const SCORE_BUCKET = 250;
export const bucketOf = (score: number): number => Math.max(0, Math.floor(score / SCORE_BUCKET));

/** Dozwolony kształt klucza: małe litery, cyfry, myślnik (id kampanii, nazwa serwisu, źródło wejścia). */
export const cleanKey = (v: unknown): string => {
  const s = typeof v === "string" || typeof v === "number" ? String(v).toLowerCase() : "";
  return /^[a-z0-9][a-z0-9-]{0,39}$/.test(s) ? s : "";
};

export interface DayStats {
  day: string;
  /** Rozgrywki rozpoczęte, ukończone i przerwane, udostępnienia. */
  start: number;
  finish: number;
  quit: number;
  share: number;
  /** Histogram ukończonych gier: hist[i] = liczba wyników z przedziału [i*250, (i+1)*250). */
  hist: number[];
  /** Skąd przyszły rozgrywki (parametr ?z= w linku), udostępnienia wg serwisu, kampanie partnerów. */
  sources: Record<string, number>;
  shares: Record<string, number>;
  sponsors: Record<string, { views: number; clicks: number }>;
}

/** Ile minimum ukończonych gier, żeby porównanie „lepiej niż X%” miało sens. */
export const MIN_FOR_PERCENTILE = 10;

/**
 * Wynik na tle innych: odsetek ukończonych dziś gier z niższym wynikiem (remisy w tym samym przedziale liczone w połowie,
 * bez własnej gry) i przybliżona średnia dnia. null, gdy graczy jest za mało.
 */
export function compare(hist: number[], score: number): { pct: number; avg: number; n: number } | null {
  const n = hist.reduce((s, v) => s + v, 0);
  if (n < MIN_FOR_PERCENTILE) return null;
  const b = bucketOf(score);
  const below = hist.slice(0, b).reduce((s, v) => s + v, 0);
  const same = Math.max(0, (hist[b] ?? 0) - 1);
  const others = Math.max(1, n - 1);
  const pct = Math.round(((below + same / 2) / others) * 100);
  const avg = Math.round(hist.reduce((s, v, i) => s + v * (i + 0.5) * SCORE_BUCKET, 0) / n);
  return { pct: Math.min(100, Math.max(0, pct)), avg, n };
}
