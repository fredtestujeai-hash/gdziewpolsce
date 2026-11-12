// Wspólne reguły rankingu: używane i w przeglądarce, i na serwerze (Cloudflare Workers), i w testach.
// Bez zależności od DOM ani od bazy.
import { CONFIG } from "./config";
import { addDays, todayKey } from "./daily";
import { scoreRound } from "./score";
import type { Puzzle } from "./types";

export const NICK_MIN = 2;
export const NICK_MAX = 20;
/** Ile miejsc pokazuje ranking. */
export const TOP_N = 10;
/** Jak długo po północy przyjmujemy jeszcze wynik z poprzedniego dnia (gracz kończył grę o północy). */
export const DAY_GRACE_MS = 30 * 60 * 1000;

export interface RankingEntry {
  rank: number;
  nick: string;
  score: number;
  me?: boolean;
}

export interface RankingData {
  day: string;
  /** Liczba graczy w rankingu tego dnia. */
  total: number;
  top: RankingEntry[];
  /** Wpis tego urządzenia (jeśli jest w rankingu). */
  me: RankingEntry | null;
}

/** Odpowiedź gracza wysyłana na serwer: tylko to, co potrzebne do przeliczenia punktów. */
export interface SubmittedGuess {
  lat: number;
  lon: number;
  year: number;
  /** Użyte podpowiedzi „Województwo” / „Wiek” — obniżają punkty tak samo jak w grze. */
  hintLoc?: boolean;
  hintYear?: boolean;
  /** Zagadka pominięta ("round") albo nierozegrana po zakończeniu dnia ("day") — 0 punktów. */
  gaveUp?: "round" | "day";
}

export type NickResult = { ok: true; nick: string } | { ok: false; error: string };

// Rdzenie wulgaryzmów szukane w dowolnym miejscu nicka (po uproszczeniu zapisu)…
const BAD_PARTS = [
  "kurw", "kurew", "chuj", "huj", "pizd", "jeb", "pierdol", "pierdal", "spierd", "kutas", "fiut", "cipk", "dziwk",
  "szmata", "skurw", "sukinsyn", "cwel", "pedofil", "debil", "fuck", "bitch", "cunt", "nigger", "nigga", "faggot",
  "hitler", "porn", "whore", "dick", "pussy", "asshole",
];
// …i krótkie słowa, które sprawdzamy tylko jako całe wyrazy (żeby nie blokować np. „Scipio”).
const BAD_WORDS = ["cipa", "cipy", "suka", "suki", "pedal", "pedaly", "nazi", "shit", "sex", "seks", "dupa", "gowno", "ss", "hwdp", "jp"];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "!": "i" };

function simplify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[013457@$!]/g, (c) => LEET[c] ?? c);
}

export function isProfane(nick: string): boolean {
  const s = simplify(nick);
  const words = s.split(/[^a-z]+/).filter(Boolean);
  if (words.some((w) => BAD_WORDS.includes(w))) return true;
  // sklejone litery, bez powtórzeń („kuuurwa”, „k.u.r.w.a”)
  const joined = s.replace(/[^a-z]/g, "");
  const squeezed = joined.replace(/(.)\1+/g, "$1");
  return BAD_PARTS.some((p) => joined.includes(p) || squeezed.includes(p));
}

/** Sprawdza i porządkuje nick: 2–20 znaków, litery (także polskie), cyfry, spacja, kropka, myślnik, podkreślnik. */
export function validateNick(raw: unknown): NickResult {
  if (typeof raw !== "string") return { ok: false, error: "Podaj nick." };
  const nick = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  const len = [...nick].length;
  if (len < NICK_MIN) return { ok: false, error: `Nick musi mieć co najmniej ${NICK_MIN} znaki.` };
  if (len > NICK_MAX) return { ok: false, error: `Nick może mieć najwyżej ${NICK_MAX} znaków.` };
  if (!/^[\p{L}\p{N} ._-]+$/u.test(nick)) return { ok: false, error: "Nick może zawierać litery, cyfry, spację, kropkę, myślnik i podkreślnik." };
  if (!/[\p{L}\p{N}]/u.test(nick)) return { ok: false, error: "Nick musi zawierać literę albo cyfrę." };
  if (isProfane(nick)) return { ok: false, error: "Wybierz inny nick." };
  return { ok: true, nick };
}

export function isDayKey(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
}

/** Czy wynik z dnia `day` można teraz zgłosić: dziś w czasie polskim albo wczoraj tuż po północy. */
export function isSubmittableDay(day: string, now: Date = new Date()): boolean {
  if (!isDayKey(day)) return false;
  return day === todayKey(now) || day === todayKey(new Date(now.getTime() - DAY_GRACE_MS));
}

/** Zakres dni, z których można czytać ranking: od początku gry do dziś. */
export function isReadableDay(day: string, now: Date = new Date()): boolean {
  return isDayKey(day) && day <= todayKey(now) && day >= addDays(todayKey(now), -366);
}

export function isDeviceId(s: unknown): s is string {
  return typeof s === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(s);
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Przelicza wynik dnia ze zgłoszonych odpowiedzi tą samą funkcją co gra (scoreRound):
 * koszt podpowiedzi z CONFIG.hintCost, runda pominięta albo nierozegrana = 0 punktów.
 * Zwraca null, gdy zgłoszenie jest niepełne albo ma wartości spoza zakresu.
 */
export function recomputeScore(puzzles: Pick<Puzzle, "lat" | "lon" | "year">[], guesses: unknown): number | null {
  if (!Array.isArray(guesses) || guesses.length !== puzzles.length || !puzzles.length) return null;
  // Rok „dziś” liczymy w chwili zgłoszenia: na serwerze zegar w momencie startu modułu stoi na 1970.
  const maxYear = new Date().getFullYear() + 1;
  let total = 0;
  for (let i = 0; i < puzzles.length; i++) {
    const g = guesses[i] as Record<string, unknown> | null;
    if (!g || typeof g !== "object") return null;
    if (g.gaveUp !== undefined) {
      if (g.gaveUp !== "round" && g.gaveUp !== "day") return null;
      continue; // 0 punktów; pinezka i rok nie mają znaczenia
    }
    for (const k of ["hintLoc", "hintYear"]) if (g[k] !== undefined && typeof g[k] !== "boolean") return null;
    const lat = num(g.lat);
    const lon = num(g.lon);
    const year = num(g.year);
    if (lat === null || lon === null || year === null) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    if (!Number.isInteger(year) || year < CONFIG.minYear || year > maxYear) return null;
    const r = scoreRound(puzzles[i], { lat, lon, year, hintLoc: g.hintLoc === true, hintYear: g.hintYear === true });
    total += r.locPts + r.yearPts;
  }
  return total;
}

export function maxScore(rounds: number): number {
  return rounds * (CONFIG.maxLocationPoints + CONFIG.maxYearPoints);
}
