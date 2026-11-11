import { CONFIG } from "./config";

/**
 * Opcjonalne, anonimowe liczniki zdarzeń dla raportów dla partnerów
 * (ile osób zagrało, ile zobaczyło zagadkę partnera, ile kliknęło „Odwiedź”).
 * Bez ciasteczek, bez identyfikatorów, bez adresu strony źródłowej — wysyłamy tylko nazwę
 * zdarzenia, dzień i ewentualnie id kampanii. Gdy CONFIG.statsEndpoint jest pusty, nic nie jest wysyłane.
 */
export function track(event: "start" | "finish" | "sponsor_view" | "sponsor_click", data: Record<string, string | number> = {}): void {
  if (!CONFIG.statsEndpoint) return;
  try {
    const body = JSON.stringify({ event, ...data });
    if (!navigator.sendBeacon?.(CONFIG.statsEndpoint, new Blob([body], { type: "application/json" }))) {
      fetch(CONFIG.statsEndpoint, { method: "POST", body, keepalive: true, credentials: "omit" }).catch(() => {});
    }
  } catch {
    /* statystyki nigdy nie mogą zepsuć gry */
  }
}
