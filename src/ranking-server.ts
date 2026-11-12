// Serwer rankingu: logika endpointów /api/score i /api/ranking (Cloudflare Pages Functions + D1).
// UWAGA: ten plik wolno importować tylko z functions/ i z testów. Wciąga całą pulę zagadek,
// więc nie może trafić do paczki przeglądarkowej.
import puzzlesFile from "../public/data/puzzles.json";
import scheduleFile from "../public/data/schedule.json";
import sponsoredFile from "../public/data/sponsored.json";
import { buildChallenge, todayKey } from "./daily";
import {
  TOP_N,
  isDeviceId,
  isReadableDay,
  isSubmittableDay,
  recomputeScore,
  validateNick,
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
  created_at: number;
}

export async function readRanking(db: D1Like, day: string, deviceHash: string | null): Promise<RankingData> {
  const [topRes, stat] = await Promise.all([
    db
      .prepare("SELECT device, nick, score, created_at FROM scores WHERE day = ? AND nick IS NOT NULL ORDER BY score DESC, created_at ASC LIMIT ?")
      .bind(day, TOP_N)
      .all<Row>(),
    db.prepare("SELECT n FROM day_stats WHERE day = ?").bind(day).first<{ n: number }>(),
  ]);
  const top: RankingEntry[] = topRes.results.map((r, i) => ({
    rank: i + 1,
    nick: r.nick,
    score: r.score,
    ...(deviceHash && r.device === deviceHash ? { me: true } : {}),
  }));
  let me: RankingEntry | null = top.find((e) => e.me) ?? null;
  if (!me && deviceHash) {
    const mine = await db
      .prepare("SELECT device, nick, score, created_at FROM scores WHERE day = ? AND device = ? AND nick IS NOT NULL")
      .bind(day, deviceHash)
      .first<Row>();
    if (mine) {
      const better = await db
        .prepare("SELECT COUNT(*) AS c FROM scores WHERE day = ? AND nick IS NOT NULL AND (score > ? OR (score = ? AND created_at < ?))")
        .bind(day, mine.score, mine.score, mine.created_at)
        .first<{ c: number }>();
      me = { rank: (better?.c ?? 0) + 1, nick: mine.nick, score: mine.score, me: true };
    }
  }
  return { day, total: Math.max(stat?.n ?? 0, top.length), top, me };
}

/** GET /api/ranking?day=RRRR-MM-DD (nagłówek X-Device: identyfikator urządzenia, opcjonalnie). */
export async function handleRanking(request: Request, env: Env, now: Date = new Date()): Promise<Response> {
  if (!env.DB) return fail(503, "Ranking jest chwilowo niedostępny.");
  const day = new URL(request.url).searchParams.get("day") ?? todayKey(now);
  if (!isReadableDay(day, now)) return fail(400, "Nieprawidłowy dzień.");
  const device = request.headers.get("x-device");
  const deviceHash = isDeviceId(device) ? await sha256(device) : null;
  return json(await readRanking(env.DB, day, deviceHash));
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
  if (added)
    await db.prepare("INSERT INTO day_stats (day, n) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET n = n + 1").bind(day).run();
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
  const stmts: D1Stmt[] = rows.results.map((r) => db.prepare("UPDATE day_stats SET n = MAX(n - 1, 0) WHERE day = ?").bind(r.day));
  // Dzisiejszy wpis zostaje bez nicka i bez wyniku (sama blokada ponownego zgłoszenia), starsze znikają całkiem.
  stmts.push(db.prepare("UPDATE scores SET nick = NULL, score = 0 WHERE device = ? AND day >= ?").bind(deviceHash, today));
  stmts.push(db.prepare("DELETE FROM scores WHERE device = ? AND day < ?").bind(deviceHash, today));
  stmts.push(db.prepare("DELETE FROM scores WHERE nick IS NULL AND day < ?").bind(today));
  await db.batch(stmts);
  return json({ removed: rows.results.length });
}
