// Ranking po stronie przeglądarki: rozmowa z API i lokalna „tożsamość” gracza (bez konta).
// Gdy API nie odpowiada (np. gra działa na hostingu bez serwera), funkcje zwracają null i ranking się nie pokazuje.
import { CONFIG } from "./config";
import type { RankingData } from "./ranking-core";
import type { DayState } from "./types";

const KEY = "gdziewpolsce:ranking";
const TIMEOUT_MS = 7000;

export interface Identity {
  /** Losowy identyfikator tej przeglądarki; powstaje dopiero przy dołączeniu do rankingu. */
  device: string;
  nick: string;
}

export function loadIdentity(): Identity | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Identity | null;
    return v && typeof v.device === "string" && typeof v.nick === "string" ? v : null;
  } catch {
    return null;
  }
}

function saveIdentity(id: Identity | null): void {
  try {
    if (id) localStorage.setItem(KEY, JSON.stringify(id));
    else localStorage.removeItem(KEY);
  } catch {
    /* brak dostępu do pamięci przeglądarki: ranking zadziała tylko w tej sesji */
  }
}

function newDeviceId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function rankingEnabled(): boolean {
  return !!CONFIG.rankingApi;
}

function isRanking(v: unknown): v is RankingData {
  const r = v as RankingData;
  return !!r && typeof r === "object" && typeof r.day === "string" && typeof r.total === "number" && Array.isArray(r.top);
}

async function call(path: string, init: RequestInit = {}): Promise<{ status: number; body: unknown } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(CONFIG.rankingApi + path, { ...init, signal: ctrl.signal, cache: "no-store" });
    if (!(r.headers.get("content-type") ?? "").includes("application/json")) return null;
    return { status: r.status, body: await r.json() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Ranking dnia albo null, gdy serwer rankingu jest niedostępny. */
export async function fetchRanking(day: string): Promise<RankingData | null> {
  if (!rankingEnabled()) return null;
  const id = loadIdentity();
  const res = await call(`/ranking?day=${encodeURIComponent(day)}`, id ? { headers: { "x-device": id.device } } : {});
  return res && res.status === 200 && isRanking(res.body) ? res.body : null;
}

export type SubmitResult = { ok: true; data: RankingData } | { ok: false; error: string };

/** Dołącza do rankingu dnia. Wysyłamy odpowiedzi, a wynik liczy serwer. */
export async function submitScore(state: DayState, nick: string): Promise<SubmitResult> {
  const id: Identity = { device: loadIdentity()?.device ?? newDeviceId(), nick };
  const res = await call("/score", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ day: state.key, device: id.device, nick, ids: state.ids, guesses: state.guesses }),
  });
  if (res && res.status === 200 && isRanking(res.body)) {
    saveIdentity({ device: id.device, nick: res.body.me?.nick ?? nick });
    return { ok: true, data: res.body };
  }
  const error = (res?.body as { error?: string } | undefined)?.error;
  return { ok: false, error: typeof error === "string" ? error : "Nie udało się połączyć z rankingiem. Spróbuj ponownie." };
}

/** Usuwa z serwera wszystkie wpisy tej przeglądarki i zapomina jej identyfikator. */
export async function deleteMyEntries(): Promise<boolean> {
  const id = loadIdentity();
  if (!id) return true;
  const res = await call("/score", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ device: id.device }) });
  if (!res || res.status !== 200) return false;
  saveIdentity(null);
  return true;
}
