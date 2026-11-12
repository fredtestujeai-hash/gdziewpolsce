import type { DayState } from "./types";
import { addDays, todayKey } from "./daily";

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
  /**
   * Wyzwanie przerwane przez „Zakończ dzisiejsze wyzwanie”, do którego gracz może jeszcze wrócić.
   * Jeśli nie dokończy go do północy, dzień trafia do statystyk z tym wynikiem, a seria się zeruje.
   */
  pending?: { key: string; score: number };
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

/** Statystyki na dzień `today`: seria jest zerowana, gdy gracz opuścił dzień albo nie dokończył wyzwania. */
export function loadStats(today: string = todayKey()): Stats {
  const s = { ...emptyStats(), ...(read<Stats>(KEY_STATS) ?? {}) };
  if (s.pending && s.pending.key !== today) {
    // przerwane wyzwanie z innego dnia nie zostało dokończone: liczy się jako rozegrane, ale przerywa serię
    const { key, score } = s.pending;
    delete s.pending;
    if (s.history[key] === undefined) {
      s.history[key] = score;
      s.played += 1;
      s.total += score;
      s.best = Math.max(s.best, score);
      s.streak = 0;
    }
    write(KEY_STATS, s);
  }
  if (s.lastKey && s.lastKey < addDays(today, -1)) s.streak = 0; // wczoraj bez ukończonej gry
  return s;
}

/**
 * Zapisuje wynik dnia (idempotentnie — drugi zapis tego samego ukończonego dnia nic nie zmienia).
 * `complete = false`: gracz przerwał wyzwanie i może do niego wrócić — wynik tylko czeka (pending).
 */
export function recordResult(key: string, score: number, complete = true): Stats {
  const s = loadStats(key);
  if (s.history[key] !== undefined) return s;
  if (!complete) {
    s.pending = { key, score };
    write(KEY_STATS, s);
    return s;
  }
  delete s.pending;
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
