// Serwer anonimowych liczników: POST /api/stat (dopisz zdarzenie) i GET /api/stats?day= (odczyt sum dnia).
// W bazie jest tylko: dzień, nazwa zdarzenia, krótki klucz i licznik. Adres IP służy wyłącznie do limitu
// zgłoszeń w pamięci działającej funkcji i nigdzie nie jest zapisywany.
import { isReadableDay, isSubmittableDay, maxScore } from "./ranking-core";
import type { D1Like } from "./ranking-server";
import { STAT_EVENTS, bucketOf, cleanKey, type DayStats, type StatEvent } from "./stats-core";

const MAX_BODY_BYTES = 500;
/** Bezpiecznik: najwięcej różnych kluczy jednego zdarzenia dziennie (chroni bazę przed zaśmiecaniem). */
const MAX_KEYS_PER_EVENT = 60;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const hits = new Map<string, { n: number; t: number }>();
function limited(ip: string, now = Date.now()): boolean {
  if (!ip) return false;
  if (hits.size > 5000) hits.clear();
  const h = hits.get(ip);
  if (!h || now - h.t > RATE_WINDOW_MS) {
    hits.set(ip, { n: 1, t: now });
    return false;
  }
  h.n += 1;
  return h.n > RATE_MAX;
}

const json = (body: unknown, status = 200, cache = "no-store") =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache } });

const isEvent = (v: unknown): v is StatEvent => typeof v === "string" && (STAT_EVENTS as readonly string[]).includes(v);

/** Klucz licznika wyliczony z treści zdarzenia; null = zdarzenie do odrzucenia. */
export function statKey(event: StatEvent, body: Record<string, unknown>, rounds = 6): string | null {
  switch (event) {
    case "finish": {
      const score = Number(body.score);
      if (!Number.isFinite(score) || score < 0 || score > maxScore(rounds)) return null;
      return `b${bucketOf(score)}`;
    }
    case "start":
      return cleanKey(body.src);
    case "share":
      return cleanKey(body.platform);
    case "sponsor_view":
    case "sponsor_click":
      return cleanKey(body.campaign) || null;
    default:
      return "";
  }
}

export async function handleStat(request: Request, db: D1Like | undefined, now = new Date()): Promise<Response> {
  if (!db) return json({ ok: false }, 503);
  if (limited(request.headers.get("cf-connecting-ip") ?? "")) return json({ ok: false }, 429);
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return json({ ok: false }, 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return json({ ok: false }, 400);
  }
  const { event, day } = body;
  if (!isEvent(event) || typeof day !== "string" || !isSubmittableDay(day, now)) return json({ ok: false }, 400);
  const key = statKey(event, body);
  if (key === null) return json({ ok: false }, 400);
  const known = await db.prepare("SELECT COUNT(*) AS c FROM events WHERE day = ? AND event = ?").bind(day, event).first<{ c: number }>();
  const exists = await db.prepare("SELECT 1 AS x FROM events WHERE day = ? AND event = ? AND key = ?").bind(day, event, key).first();
  if (!exists && (known?.c ?? 0) >= MAX_KEYS_PER_EVENT) return json({ ok: false }, 429);
  await db.prepare("INSERT INTO events (day, event, key, n) VALUES (?, ?, ?, 1) ON CONFLICT (day, event, key) DO UPDATE SET n = n + 1").bind(day, event, key).run();
  return json({ ok: true });
}

export async function readStats(db: D1Like, day: string): Promise<DayStats> {
  const rows = await db.prepare("SELECT event, key, n FROM events WHERE day = ?").bind(day).all<{ event: string; key: string; n: number }>();
  const s: DayStats = { day, start: 0, finish: 0, quit: 0, share: 0, hist: [], sources: {}, shares: {}, sponsors: {} };
  const sponsor = (id: string) => (s.sponsors[id] ??= { views: 0, clicks: 0 });
  for (const r of rows.results) {
    if (r.event === "start") {
      s.start += r.n;
      if (r.key) s.sources[r.key] = r.n;
    } else if (r.event === "finish") {
      s.finish += r.n;
      const b = Number(r.key.slice(1));
      if (Number.isInteger(b) && b >= 0 && b < 100) s.hist[b] = (s.hist[b] ?? 0) + r.n;
    } else if (r.event === "quit") s.quit += r.n;
    else if (r.event === "share") {
      s.share += r.n;
      if (r.key) s.shares[r.key] = r.n;
    } else if (r.event === "sponsor_view") sponsor(r.key).views += r.n;
    else if (r.event === "sponsor_click") sponsor(r.key).clicks += r.n;
  }
  s.hist = Array.from(s.hist, (v) => v ?? 0);
  return s;
}

export async function handleStats(request: Request, db: D1Like | undefined, now = new Date()): Promise<Response> {
  if (!db) return json({ error: "Statystyki są chwilowo niedostępne." }, 503);
  const day = new URL(request.url).searchParams.get("day") ?? "";
  if (!isReadableDay(day, now)) return json({ error: "Nieprawidłowy dzień." }, 400);
  return json(await readStats(db, day), 200, "public, max-age=60");
}
