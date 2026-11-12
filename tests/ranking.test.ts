import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { CONFIG } from "../src/config";
import { buildChallenge } from "../src/daily";
import { isProfane, isSubmittableDay, maxScore, recomputeScore, validateNick } from "../src/ranking-core";
import { SCHEMA, handleDelete, handleRanking, handleScore, rateLimited, type D1Like, type D1Stmt, type GameData } from "../src/ranking-server";
import type { Puzzle } from "../src/types";

/** D1 udawane przez SQLite wbudowany w Node: te same zapytania SQL co na produkcji. */
function fakeD1(): D1Like {
  const db = new DatabaseSync(":memory:");
  for (const sql of SCHEMA) db.exec(sql);
  const stmt = (sql: string, args: unknown[] = []): D1Stmt => ({
    bind: (...v) => stmt(sql, v),
    first: async () => (db.prepare(sql).get(...(args as never[])) as never) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...(args as never[])) as never[] }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(args as never[])).changes) } }),
  });
  return { prepare: (sql) => stmt(sql), batch: async (stmts) => Promise.all(stmts.map((s) => s.run())) };
}

const P = (id: string, lat: number, lon: number, year: number): Puzzle =>
  ({ id, lat, lon, year, difficulty: 1, name: id, category: "", place: "", img: "", imgW: 1, imgH: 1, author: "", license: "", licenseUrl: "", filePage: "", wiki: "", extract: "" }) as Puzzle;

const pool = Array.from({ length: CONFIG.rounds + 3 }, (_, i) => P("Q" + i, 50 + i * 0.3, 19 + i * 0.2, 1500 + i * 20));
const data: GameData = { puzzles: pool, schedule: { start: "2026-11-01", days: [pool.slice(0, CONFIG.rounds).map((p) => p.id)] }, campaigns: [] };
const DAY = "2026-11-01";
const NOON = new Date("2026-11-01T11:00:00Z");
const challenge = buildChallenge(data.puzzles, data.schedule, data.campaigns, DAY);
const perfect = challenge.puzzles.map((p) => ({ lat: p.lat, lon: p.lon, year: p.year }));
const MAX = maxScore(challenge.puzzles.length);
const dev = (n: number) => `device-000000000000-${String(n).padStart(4, "0")}`;

let ip = 0;
function post(body: unknown, method = "POST"): Request {
  return new Request("https://gra.test/api/score", { method, body: JSON.stringify(body), headers: { "cf-connecting-ip": `10.0.${ip >> 8}.${ip++ & 255}` } });
}
const get = (day: string, device?: string) =>
  new Request(`https://gra.test/api/ranking?day=${day}`, { headers: device ? { "x-device": device } : {} });

describe("nick", () => {
  it("przyjmuje zwykłe nicki, także z polskimi znakami", () => {
    for (const n of ["Ola", "Żółw_77", "Jan Kowalski", "x-man.2", "Łukasz", "Scipio", "Grzegorz"]) expect(validateNick(n), n).toMatchObject({ ok: true });
    expect(validateNick("  Ala   ma  ")).toEqual({ ok: true, nick: "Ala ma" });
  });
  it("odrzuca za krótkie, za długie i z niedozwolonymi znakami", () => {
    for (const n of ["", "a", "x".repeat(21), "<b>ala</b>", "😀😀😀", "...", 5, null]) expect(validateNick(n), String(n)).toMatchObject({ ok: false });
  });
  it("odrzuca wulgaryzmy, także przebrane", () => {
    for (const n of ["kurwa", "K.U.R.W.A", "kuuurwa", "Chuj123", "p1zda", "fuck you", "jebać", "to suka"]) expect(isProfane(n), n).toBe(true);
    for (const n of ["Sukces", "Pedałuję", "Essa", "Kasia"]) expect(isProfane(n), n).toBe(false);
  });
});

describe("dzień", () => {
  it("przyjmuje tylko dzisiejszy dzień w czasie polskim (z krótkim zapasem po północy)", () => {
    expect(isSubmittableDay("2026-11-01", NOON)).toBe(true);
    expect(isSubmittableDay("2026-10-31", NOON)).toBe(false);
    expect(isSubmittableDay("2026-11-02", NOON)).toBe(false);
    // 23:30 UTC = 00:30 w Polsce (zima): już 2 listopada
    expect(isSubmittableDay("2026-11-02", new Date("2026-11-01T23:30:00Z"))).toBe(true);
    expect(isSubmittableDay("2026-11-01", new Date("2026-11-01T23:10:00Z"))).toBe(true);
    expect(isSubmittableDay("2026-11-01", new Date("2026-11-01T23:40:00Z"))).toBe(false);
    expect(isSubmittableDay("bzdura", NOON)).toBe(false);
  });
});

describe("przeliczanie wyniku", () => {
  it("liczy tak samo jak gra i nie przekracza maksimum", () => {
    expect(recomputeScore(challenge.puzzles, perfect)).toBe(MAX);
    const far = perfect.map((g) => ({ ...g, lat: g.lat + 3, year: g.year + 80 }));
    const s = recomputeScore(challenge.puzzles, far)!;
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(MAX / 2);
  });
  it("podpowiedzi i rezygnacja liczą się tak samo jak w grze", () => {
    const full = CONFIG.maxLocationPoints + CONFIG.maxYearPoints;
    const cut = 1 - CONFIG.hintCost;
    const hinted = perfect.map((g, i) => (i === 0 ? { ...g, hintLoc: true, hintYear: true } : g));
    expect(recomputeScore(challenge.puzzles, hinted)).toBe(MAX - full + Math.round(CONFIG.maxLocationPoints * cut) + Math.round(CONFIG.maxYearPoints * cut));
    // dokładnie taki zapis rundy tworzy gra po „Pomiń tę zagadkę” i „Zakończ dzisiejsze wyzwanie”
    const zero = (gaveUp: string) => ({ lat: 0, lon: 0, year: 0, km: 0, yearDiff: 0, locPts: 0, yearPts: 0, gaveUp });
    const quit = perfect.map((g, i) => (i === 0 ? { ...g, hintLoc: true } : i === 1 ? zero("round") : zero("day")));
    expect(recomputeScore(challenge.puzzles, quit)).toBe(Math.round(CONFIG.maxLocationPoints * cut) + CONFIG.maxYearPoints);
    expect(recomputeScore(challenge.puzzles, perfect.map(() => zero("day")))).toBe(0);
    // punkty podane przez klienta są ignorowane, a nieznane wartości odrzucane
    expect(recomputeScore(challenge.puzzles, perfect.map((g) => ({ ...g, locPts: 9999, yearPts: 9999 })))).toBe(MAX);
    expect(recomputeScore(challenge.puzzles, perfect.map(() => zero("x")))).toBeNull();
    expect(recomputeScore(challenge.puzzles, perfect.map((g) => ({ ...g, hintLoc: "nie" })))).toBeNull();
  });
  it("odrzuca niepełne i bzdurne zgłoszenia", () => {
    expect(recomputeScore(challenge.puzzles, perfect.slice(1))).toBeNull();
    expect(recomputeScore(challenge.puzzles, [...perfect, perfect[0]])).toBeNull();
    expect(recomputeScore(challenge.puzzles, perfect.map((g) => ({ ...g, lat: 123 })))).toBeNull();
    expect(recomputeScore(challenge.puzzles, perfect.map((g) => ({ ...g, year: "1500" })))).toBeNull();
    expect(recomputeScore(challenge.puzzles, perfect.map((g) => ({ ...g, year: 99999 })))).toBeNull();
    expect(recomputeScore(challenge.puzzles, "x")).toBeNull();
  });
});

describe("API rankingu", () => {
  let env: { DB: D1Like };
  beforeEach(() => {
    env = { DB: fakeD1() };
  });
  const submit = (n: number, nick: string, guesses: unknown = perfect, extra: object = {}) =>
    handleScore(post({ day: DAY, device: dev(n), nick, guesses, ...extra }), env, NOON, data);

  it("zapisuje wynik przeliczony na serwerze i ignoruje wynik podany przez klienta", async () => {
    const r = await submit(1, "Ola", perfect, { score: 999999 });
    expect(r.status).toBe(200);
    const body = (await r.json()) as any;
    expect(body).toMatchObject({ day: DAY, total: 1, added: true, me: { rank: 1, nick: "Ola", score: MAX } });
  });

  it("liczy się pierwszy wynik z urządzenia", async () => {
    const worse = perfect.map((g) => ({ ...g, year: g.year + 50 }));
    await submit(1, "Ola", worse);
    const r = await submit(1, "Ola2", perfect);
    const body = (await r.json()) as any;
    expect(body.added).toBe(false);
    expect(body.total).toBe(1);
    expect(body.me.nick).toBe("Ola");
    expect(body.me.score).toBeLessThan(MAX);
  });

  it("układa ranking: wyższy wynik wyżej, przy remisie wcześniejszy; podaje miejsce spoza czołówki", async () => {
    for (let i = 0; i < 12; i++) await submit(i, "Gracz " + i, perfect.map((g) => ({ ...g, year: g.year + i })));
    await handleScore(post({ day: DAY, device: dev(50), nick: "Remis", guesses: perfect }), env, new Date(NOON.getTime() + 1000), data);
    const r = await handleRanking(get(DAY, dev(11)), env, NOON);
    const body = (await r.json()) as any;
    expect(body.total).toBe(13);
    expect(body.top).toHaveLength(10);
    expect(body.top[0].nick).toBe("Gracz 0");
    expect(body.top[1].nick).toBe("Remis");
    expect(body.top.every((e: any) => !e.me)).toBe(true);
    expect(body.me).toMatchObject({ rank: 13, nick: "Gracz 11" });
    const anon = (await (await handleRanking(get(DAY), env, NOON)).json()) as any;
    expect(anon.me).toBeNull();
    expect(JSON.stringify(anon)).not.toContain("device");
  });

  it("odrzuca zły dzień, zły nick, złe odpowiedzi i nieaktualną listę zagadek", async () => {
    expect((await handleScore(post({ day: "2026-10-31", device: dev(1), nick: "Ola", guesses: perfect }), env, NOON, data)).status).toBe(400);
    expect((await submit(1, "kurwa")).status).toBe(400);
    expect((await submit(1, "Ola", perfect.slice(1))).status).toBe(400);
    expect((await submit(1, "Ola", perfect, { ids: ["Q999"] })).status).toBe(409);
    expect((await handleScore(post({ day: DAY, device: "x", nick: "Ola", guesses: perfect }), env, NOON, data)).status).toBe(400);
    expect((await handleScore(new Request("https://gra.test/api/score", { method: "POST", body: "{" }), env, NOON, data)).status).toBe(400);
    expect(((await (await handleRanking(get(DAY), env, NOON)).json()) as any).total).toBe(0);
    expect((await handleRanking(get("2026-11-05"), env, NOON)).status).toBe(400);
  });

  it("usuwa wpisy gracza i nie pozwala zgłosić się ponownie tego samego dnia", async () => {
    await submit(1, "Ola");
    await submit(2, "Ela");
    const del = await handleDelete(post({ device: dev(1) }, "DELETE"), env, NOON);
    expect(await del.json()).toEqual({ removed: 1 });
    const again = (await (await submit(1, "Ola")).json()) as any;
    expect(again.added).toBe(false);
    expect(again.me).toBeNull();
    expect(again.total).toBe(1);
    expect(again.top.map((e: any) => e.nick)).toEqual(["Ela"]);
  });

  it("ogranicza liczbę zgłoszeń z jednego adresu i działa bez bazy", async () => {
    let limited = false;
    for (let i = 0; i < 20; i++) limited = rateLimited("1.2.3.4", 1000 + i);
    expect(limited).toBe(true);
    expect(rateLimited("1.2.3.4", 1000 + 120_000)).toBe(false);
    expect((await handleRanking(get(DAY), {}, NOON)).status).toBe(503);
  });
});
