// Serwer rankingu: logika endpointów /api/score i /api/ranking (Cloudflare Workers + D1).
// UWAGA: ten plik wolno importować tylko z worker/ i z testów. Wciąga całą pulę zagadek,
// więc nie może trafić do paczki przeglądarkowej.
import puzzlesFile from "../public/data/puzzles.json";
import scheduleFile from "../public/data/schedule.json";
import sponsoredFile from "../public/data/sponsored.json";
import { buildChallenge, todayKey } from "./daily";
import {
  TOP_N,
  isDeviceId,
  isPeriod,
  periodKey,
  isReadableDay,
  isSubmittableDay,
  recomputeScore,
  validateNick,
  type Period,
  type RankingData,
  type RankingEntry,
} from "./ranking-core";
import type { Campaign, Puzzle, Schedule } from "./types";

/** Minimalny wycinek interfejsu D1, z którego korzystamy (żeby nie dodawać zależności tylko dla typów). */
export interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes?: number } }>;
}
export interface D1Like {
  prepare(sql: string): D1Stmt;
  batch(stmts: D1Stmt[]): Promise<unknown[]>;
}
export interface Env {
  DB?: D1Like;
}

export interface GameData {
  puzzles: Puzzle[];
  schedule: Schedule;
  campaigns: Campaign[];
}

const DATA: GameData = {
  puzzles: (puzzlesFile as unknown as { puzzles: Puzzle[] }).puzzles,
  schedule: scheduleFile as Schedule,
  campaigns: (sponsoredFile as unknown as { campaigns: Campaign[] }).campaigns,
};

/**
 * Struktura bazy. `scores`: jeden wpis na urządzenie na dzień (liczy się pierwszy); `device` to skrót SHA-256
 * losowego identyfikatora z przeglądarki, `nick` = NULL oznacza wpis usunięty przez gracza.
 * `day_stats`: licznik wpisów na dzień. Adresów IP nie zapisujemy.
 */
export const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS scores (day TEXT NOT NULL, device TEXT NOT NULL, nick TEXT, score INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (day, device))",
  "CREATE INDEX IF NOT EXISTS scores_rank ON scores (day, score DESC, created_at) WHERE nick IS NOT NULL",
  "CREATE INDEX IF NOT EXISTS scores_device ON scores (device)",
  "CREATE TABLE IF NOT EXISTS day_stats (day TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0)",
  // Gotowe sumy punktów na tydzień, miesiąc i rok (klucze jak w periodKey), dopisywane przy każdym nowym wyniku:
  // dzięki nim odczyt tych rankingów jest równie tani jak rankingu dnia. Liczniki graczy okresu trzymamy w day_stats.
  "CREATE TABLE IF NOT EXISTS totals (period TEXT NOT NULL, device TEXT NOT NULL, nick TEXT NOT NULL, score INTEGER NOT NULL, days INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (period, device))",
  "CREATE INDEX IF NOT EXISTS totals_rank ON totals (period, score DESC, updated_at)",
  "CREATE INDEX IF NOT EXISTS totals_device ON totals (device)",
];

// Jednorazowe przeliczenie sum z wyników zapisanych, zanim powstały rankingi tygodnia, miesiąca i roku.
const BACKFILL_MARK = "backfill:totals-1";
const backfillSql = (keyExpr: string) =>
  `INSERT OR IGNORE INTO totals (period, device, nick, score, days, updated_at) SELECT ${keyExpr} AS p, device, nick, SUM(score), COUNT(*), MAX(created_at) FROM scores WHERE nick IS NOT NULL GROUP BY p, device`;
const BACKFILL = [
  backfillSql("'w:' || date(day, 'weekday 0', '-6 days')"),
  backfillSql("'m:' || substr(day, 1, 7)"),
  backfillSql("'y:' || substr(day, 1, 4)"),
  "INSERT OR REPLACE INTO day_stats (day, n) SELECT period, COUNT(*) FROM totals GROUP BY period",
  `INSERT OR REPLACE INTO day_stats (day, n) VALUES ('${BACKFILL_MARK}', 1)`,
];
async function prepareDb(db: D1Like): Promise<void> {
  await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
  const done = await db.prepare("SELECT n FROM day_stats WHERE day = ?").bind(BACKFILL_MARK).first();
  if (!done) await db.batch(BACKFILL.map((sql) => db.prepare(sql)));
}

let schemaReady: Promise<unknown> | null = null;
/** Zakłada tabele, jeśli ich nie ma (raz na uruchomienie serwera; nic nie kosztuje, gdy już istnieją). */
export function ensureSchema(db: D1Like): Promise<unknown> {
  schemaReady ??= prepareDb(db).catch((e) => {
    schemaReady = null;
    throw e;
  });
  return schemaReady;
}

/** Największa liczba wpisów jednego dnia: bezpiecznik chroniący darmowy limit bazy. */
export const MAX_ENTRIES_PER_DAY = 20_000;
const MAX_BODY_BYTES = 8_000;

// Limit zgłoszeń na adres: licznik żyje wyłącznie w pamięci działającej funkcji (nigdzie nie jest zapisywany).
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 8;
const hits = new Map<string, { n: number; t: number }>();
export function rateLimited(ip: string, now = Date.now()): boolean {
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
const fail = (status: number, error: string) => json({ error }, status);

export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface Row {
  device: string;
  nick: string;
  score: number;
  /** Czas zgłoszenia (ranking dnia) albo ostatniego dopisania punktów (sumy): rozstrzyga remisy. */
  t: number;
  days: number;
}

export async function readRanking(db: D1Like, day: string, deviceHash: string | null, period: Period = "day"): Promise<RankingData> {
  // Ranking dnia czytamy z wyników dnia, pozostałe z gotowych sum; oba mają ten sam układ kolumn.
  const key = period === "day" ? day : periodKey(day, period);
  const from =
    period === "day"
      ? "SELECT device, nick, score, created_at AS t, 1 AS days FROM scores WHERE day = ? AND nick IS NOT NULL"
      : "SELECT device, nick, score, updated_at AS t, days FROM totals WHERE period = ?";
  const [topRes, stat] = await Promise.all([
    db.prepare(`${from} ORDER BY score DESC, t ASC LIMIT ?`).bind(key, TOP_N).all<Row>(),
    db.prepare("SELECT n FROM day_stats WHERE day = ?").bind(key).first<{ n: number }>(),
  ]);
  const entry = (r: Row, rank: number): RankingEntry => ({
    rank,
    nick: r.nick,
    score: r.score,
    ...(period === "day" ? {} : { days: r.days }),
    ...(deviceHash && r.device === deviceHash ? { me: true } : {}),
  });
  const top = topRes.results.map((r, i) => entry(r, i + 1));
  let me: RankingEntry | null = top.find((e) => e.me) ?? null;
  if (!me && deviceHash) {
    const mine = await db.prepare(`${from} AND device = ?`).bind(key, deviceHash).first<Row>();
    if (mine) {
      const count =
        period === "day"
          ? "SELECT COUNT(*) AS c FROM scores WHERE day = ? AND nick IS NOT NULL AND (score > ? OR (score = ? AND created_at < ?))"
          : "SELECT COUNT(*) AS c FROM totals WHERE period = ? AND (score > ? OR (score = ? AND updated_at < ?))";
      const better = await db.prepare(count).bind(key, mine.score, mine.score, mine.t).first<{ c: number }>();
      me = entry(mine, (better?.c ?? 0) + 1);
    }
  }
  return { day, period, total: Math.max(stat?.n ?? 0, top.length), top, me };
}

/** GET /api/ranking?day=RRRR-MM-DD&period=day|week|month|year (nagłówek X-Device: identyfikator urządzenia, opcjonalnie). */
export async function handleRanking(request: Request, env: Env, now: Date = new Date()): Promise<Response> {
  if (!env.DB) return fail(503, "Ranking jest chwilowo niedostępny.");
  const day = new URL(request.url).searchParams.get("day") ?? todayKey(now);
  if (!isReadableDay(day, now)) return fail(400, "Nieprawidłowy dzień.");
  const device = request.headers.get("x-device");
  const deviceHash = isDeviceId(device) ? await sha256(device) : null;
  const period = new URL(request.url).searchParams.get("period") ?? "day";
  if (!isPeriod(period)) return fail(400, "Nieprawidłowy okres.");
  return json(await readRanking(env.DB, day, deviceHash, period));
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return null;
    const body = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** POST /api/score {day, device, nick, ids, guesses}: dołączenie do rankingu dnia. */
export async function handleScore(request: Request, env: Env, now: Date = new Date(), data: GameData = DATA): Promise<Response> {
  if (!env.DB) return fail(503, "Ranking jest chwilowo niedostępny.");
  if (rateLimited(request.headers.get("cf-connecting-ip") ?? "", now.getTime())) return fail(429, "Za dużo zgłoszeń. Spróbuj za chwilę.");
  const body = await readBody(request);
  if (!body) return fail(400, "Nieprawidłowe zgłoszenie.");

  const { day, device } = body;
  if (!isDeviceId(device)) return fail(400, "Nieprawidłowe zgłoszenie.");
  if (typeof day !== "string" || !isSubmittableDay(day, now)) return fail(400, "To wyzwanie już się skończyło. Odśwież stronę.");
  const nick = validateNick(body.nick);
  if (!nick.ok) return fail(400, nick.error);

  // Wynik liczymy sami ze zgłoszonych odpowiedzi; liczby podanej przez przeglądarkę nie przyjmujemy.
  const challenge = buildChallenge(data.puzzles, data.schedule, data.campaigns, day);
  if (Array.isArray(body.ids) && body.ids.join() !== challenge.puzzles.map((p) => p.id).join())
    return fail(409, "Gra została zaktualizowana. Odśwież stronę.");
  const score = recomputeScore(challenge.puzzles, body.guesses);
  if (score === null) return fail(400, "Nieprawidłowe zgłoszenie.");

  const db = env.DB;
  const stat = await db.prepare("SELECT n FROM day_stats WHERE day = ?").bind(day).first<{ n: number }>();
  if ((stat?.n ?? 0) >= MAX_ENTRIES_PER_DAY) return fail(429, "Ranking na dziś jest już pełny.");

  const deviceHash = await sha256(device);
  // Liczy się pierwszy wynik: kolejne zgłoszenie z tego samego urządzenia niczego nie zmienia.
  const ins = await db
    .prepare("INSERT OR IGNORE INTO scores (day, device, nick, score, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(day, deviceHash, nick.nick, score, now.getTime())
    .run();
  const added = (ins.meta.changes ?? 0) > 0;
  if (added) {
    const bump = "INSERT INTO day_stats (day, n) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET n = n + 1";
    const stmts = [db.prepare(bump).bind(day)];
    // Dopisanie punktów do sum tygodnia, miesiąca i roku; licznik graczy okresu rośnie tylko przy pierwszym wpisie gracza.
    for (const period of ["week", "month", "year"] as const) {
      const key = periodKey(day, period);
      const had = await db.prepare("SELECT 1 AS x FROM totals WHERE period = ? AND device = ?").bind(key, deviceHash).first();
      stmts.push(
        db
          .prepare(
            "INSERT INTO totals (period, device, nick, score, days, updated_at) VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT(period, device) DO UPDATE SET score = score + excluded.score, days = days + 1, nick = excluded.nick, updated_at = excluded.updated_at",
          )
          .bind(key, deviceHash, nick.nick, score, now.getTime()),
      );
      if (!had) stmts.push(db.prepare(bump).bind(key));
    }
    await db.batch(stmts);
  }
  return json({ ...(await readRanking(db, day, deviceHash)), added });
}

/** DELETE /api/score {device}: gracz usuwa wszystkie swoje wpisy z rankingu. */
export async function handleDelete(request: Request, env: Env, now: Date = new Date()): Promise<Response> {
  if (!env.DB) return fail(503, "Ranking jest chwilowo niedostępny.");
  if (rateLimited(request.headers.get("cf-connecting-ip") ?? "", now.getTime())) return fail(429, "Za dużo zgłoszeń. Spróbuj za chwilę.");
  const body = await readBody(request);
  if (!body || !isDeviceId(body.device)) return fail(400, "Nieprawidłowe zgłoszenie.");
  const db = env.DB;
  const deviceHash = await sha256(body.device);
  const today = todayKey(now);
  const rows = await db.prepare("SELECT day FROM scores WHERE device = ? AND nick IS NOT NULL").bind(deviceHash).all<{ day: string }>();
  const sums = await db.prepare("SELECT period AS day FROM totals WHERE device = ?").bind(deviceHash).all<{ day: string }>();
  const stmts: D1Stmt[] = [...rows.results, ...sums.results].map((r) => db.prepare("UPDATE day_stats SET n = MAX(n - 1, 0) WHERE day = ?").bind(r.day));
  stmts.push(db.prepare("DELETE FROM totals WHERE device = ?").bind(deviceHash));
  // Dzisiejszy wpis zostaje bez nicka i bez wyniku (sama blokada ponownego zgłoszenia), starsze znikają całkiem.
  stmts.push(db.prepare("UPDATE scores SET nick = NULL, score = 0 WHERE device = ? AND day >= ?").bind(deviceHash, today));
  stmts.push(db.prepare("DELETE FROM scores WHERE device = ? AND day < ?").bind(deviceHash, today));
  stmts.push(db.prepare("DELETE FROM scores WHERE nick IS NULL AND day < ?").bind(today));
  await db.batch(stmts);
  return json({ removed: rows.results.length });
}
