import type { DayState } from "./types";
import { addDays } from "./daily";

// Wszystko trzymamy wyłącznie w przeglądarce gracza: bez kont, bez ciasteczek, bez serwera.
const KEY_DAY = "gdziewpolsce:day";
const KEY_STATS = "gdziewpolsce:stats";

export interface Stats {
  played: number;
  streak: number;
  maxStreak: number;
  best: number;
  total: number;
  lastKey: string;
  /** wynik z każdego dnia: RRRR-MM-DD -> punkty */
  history: Record<string, number>;
}

const emptyStats = (): Stats => ({ played: 0, streak: 0, maxStreak: 0, best: 0, total: 0, lastKey: "", history: {} });

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* tryb prywatny / brak miejsca — gra działa dalej, tylko bez zapisu */
  }
}

export function loadDay(key: string): DayState | null {
  const s = read<DayState>(KEY_DAY);
  return s && s.key === key ? s : null;
}

export function saveDay(state: DayState): void {
  write(KEY_DAY, state);
}

export function loadStats(): Stats {
  return { ...emptyStats(), ...(read<Stats>(KEY_STATS) ?? {}) };
}

/** Zapisuje ukończone wyzwanie (idempotentnie — drugi zapis tego samego dnia nic nie zmienia). */
export function recordResult(key: string, score: number): Stats {
  const s = loadStats();
  if (s.history[key] !== undefined) return s;
  s.history[key] = score;
  s.played += 1;
  s.total += score;
  s.best = Math.max(s.best, score);
  s.streak = s.lastKey === addDays(key, -1) ? s.streak + 1 : 1;
  s.maxStreak = Math.max(s.maxStreak, s.streak);
  s.lastKey = key;
  write(KEY_STATS, s);
  return s;
}
