import { CONFIG } from "./config";
import type { DayStats, StatEvent } from "./stats-core";

/**
 * Anonimowe liczniki gry: ile rozgrywek rozpoczęto i ukończono, jak rozkładają się wyniki dnia,
 * ile razy wyświetlono i kliknięto zagadkę partnera, gdzie udostępniono wynik.
 * Liczymy rozgrywki, nie ludzi: wysyłamy tylko nazwę zdarzenia, dzień i krótki klucz (wynik, id kampanii,
 * nazwa serwisu, źródło wejścia z linku). Bez ciasteczek i identyfikatorów; serwer nie zapisuje adresu IP.
 * Gdy CONFIG.statsEndpoint jest pusty, nic nie jest wysyłane.
 */
const SENT_KEY = "gdziewpolsce:sent";
/** Zdarzenia liczone najwyżej raz na dzień w tej przeglądarce (odświeżenie strony nie zawyża liczników). */
const ONCE: StatEvent[] = ["start", "finish", "quit", "sponsor_view"];

function firstToday(event: StatEvent, day: string): boolean {
  try {
    const v = JSON.parse(localStorage.getItem(SENT_KEY) ?? "null") as { day: string; ev: string[] } | null;
    const sent = v && v.day === day && Array.isArray(v.ev) ? v.ev : [];
    if (sent.includes(event)) return false;
    localStorage.setItem(SENT_KEY, JSON.stringify({ day, ev: [...sent, event] }));
  } catch {
    /* brak pamięci przeglądarki: liczymy mimo to */
  }
  return true;
}

export function track(event: StatEvent, data: Record<string, string | number> = {}): void {
  if (!CONFIG.statsEndpoint) return;
  try {
    if (ONCE.includes(event) && typeof data.day === "string" && !firstToday(event, data.day)) return;
    const body = JSON.stringify({ event, ...data });
    if (!navigator.sendBeacon?.(CONFIG.statsEndpoint, new Blob([body], { type: "application/json" }))) {
      fetch(CONFIG.statsEndpoint, { method: "POST", body, keepalive: true, credentials: "omit" }).catch(() => {});
    }
  } catch {
    /* statystyki nigdy nie mogą zepsuć gry */
  }
}

/** Źródło wejścia z linku (np. gdziewpolsce.com/?z=wykop): pozwala policzyć, który kanał przyprowadził rozgrywki. */
export function entrySource(): string {
  try {
    const z = new URLSearchParams(location.search).get("z") ?? "";
    return /^[a-z0-9][a-z0-9-]{0,19}$/.test(z) ? z : "";
  } catch {
    return "";
  }
}

/** Sumy dnia (do porównania „lepiej niż X% graczy”); null, gdy liczniki są wyłączone albo serwer nie odpowiada. */
export async function fetchDayStats(day: string): Promise<DayStats | null> {
  if (!CONFIG.statsEndpoint) return null;
  try {
    const r = await fetch(`${CONFIG.statsEndpoint}s?day=${encodeURIComponent(day)}`, { credentials: "omit", signal: AbortSignal.timeout(7000) });
    return r.ok ? ((await r.json()) as DayStats) : null;
  } catch {
    return null;
  }
}
