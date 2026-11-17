import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { SCHEMA, type D1Like, type D1Stmt } from "../src/ranking-server";
import { MIN_FOR_PERCENTILE, bucketOf, cleanKey, compare } from "../src/stats-core";
import { handleStat, handleStats, readStats, statKey } from "../src/stats-server";

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

const DAY = "2026-11-20";
const NOW = new Date("2026-11-20T11:00:00Z");
let ip = 0;
const post = (body: unknown) => new Request("https://gra.test/api/stat", { method: "POST", body: JSON.stringify(body), headers: { "cf-connecting-ip": `10.9.${ip >> 8}.${ip++ & 255}` } });

describe("anonimowe liczniki", () => {
  it("klucze: przedział wyniku, kampania, serwis, źródło", () => {
    expect(bucketOf(0)).toBe(0);
    expect(bucketOf(2499)).toBe(9);
    expect(statKey("finish", { score: 2500 })).toBe("b10");
    expect(statKey("finish", { score: 99999 })).toBeNull();
    expect(statKey("finish", { score: "abc" })).toBeNull();
    expect(statKey("sponsor_view", { campaign: "torun-2027" })).toBe("torun-2027");
    expect(statKey("sponsor_click", {})).toBeNull();
    expect(statKey("start", { src: "wykop" })).toBe("wykop");
    expect(statKey("start", { src: "<script>" })).toBe("");
    expect(cleanKey("Ala ma kota")).toBe("");
  });

  it("zlicza zdarzenia i oddaje sumy dnia", async () => {
    const db = fakeD1();
    for (const score of [500, 600, 3000]) expect((await handleStat(post({ event: "finish", day: DAY, score }), db, NOW)).status).toBe(200);
    await handleStat(post({ event: "start", day: DAY, src: "wykop" }), db, NOW);
    await handleStat(post({ event: "start", day: DAY }), db, NOW);
    await handleStat(post({ event: "share", day: DAY, platform: "whatsapp" }), db, NOW);
    await handleStat(post({ event: "sponsor_view", day: DAY, campaign: "demo" }), db, NOW);
    await handleStat(post({ event: "sponsor_click", day: DAY, campaign: "demo", where: "runda" }), db, NOW);
    const s = await readStats(db, DAY);
    expect(s.start).toBe(2);
    expect(s.sources).toEqual({ wykop: 1 });
    expect(s.finish).toBe(3);
    expect(s.hist[2]).toBe(2);
    expect(s.hist[12]).toBe(1);
    expect(s.hist.every((v) => typeof v === "number")).toBe(true);
    expect(s.shares).toEqual({ whatsapp: 1 });
    expect(s.sponsors).toEqual({ demo: { views: 1, clicks: 1 } });
    const res = await handleStats(new Request(`https://gra.test/api/stats?day=${DAY}`), db, NOW);
    expect(((await res.json()) as { finish: number }).finish).toBe(3);
  });

  it("odrzuca nieznane zdarzenia, stare dni i śmieci", async () => {
    const db = fakeD1();
    expect((await handleStat(post({ event: "hack", day: DAY }), db, NOW)).status).toBe(400);
    expect((await handleStat(post({ event: "start", day: "2026-01-01" }), db, NOW)).status).toBe(400);
    expect((await handleStat(new Request("https://gra.test/api/stat", { method: "POST", body: "{" }), db, NOW)).status).toBe(400);
    expect((await handleStat(post({ event: "start", day: DAY, x: "y".repeat(600) }), db, NOW)).status).toBe(413);
    expect((await readStats(db, DAY)).start).toBe(0);
    expect((await handleStats(new Request("https://gra.test/api/stats?day=zle"), db, NOW)).status).toBe(400);
  });

  it("w bazie nie ma nic poza dniem, zdarzeniem, kluczem i licznikiem", async () => {
    const db = fakeD1();
    await handleStat(post({ event: "finish", day: DAY, score: 1234, nick: "Ala", device: "abc" }), db, NOW);
    const rows = await db.prepare("SELECT * FROM events").all();
    expect(rows.results).toEqual([{ day: DAY, event: "finish", key: "b4", n: 1 }]);
  });

  it("limit zgłoszeń z jednego adresu", async () => {
    const db = fakeD1();
    const one = () => new Request("https://gra.test/api/stat", { method: "POST", body: JSON.stringify({ event: "share", day: DAY, platform: "x" }), headers: { "cf-connecting-ip": "10.77.0.1" } });
    let last = 200;
    for (let i = 0; i < 40; i++) last = (await handleStat(one(), db, NOW)).status;
    expect(last).toBe(429);
    expect((await readStats(db, DAY)).share).toBe(30);
  });

  it("porównanie z innymi graczami", () => {
    expect(compare([1, 2, 3], 500)).toBeNull();
    const hist = [0, 0, 4, 4, 2]; // 10 gier
    expect(hist.reduce((a, b) => a + b, 0)).toBe(MIN_FOR_PERCENTILE);
    expect(compare(hist, 1100)!.pct).toBe(94); // 8 gorszych + pół z 1 remisu, na 9 pozostałych
    expect(compare(hist, 600)!.pct).toBe(17);
    expect(compare(hist, 5000)!.pct).toBe(100);
    expect(compare(hist, 600)!.avg).toBe(825);
  });
});
