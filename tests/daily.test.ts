import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildChallenge, daysBetween, fallbackIds, msUntilNextChallenge, todayKey } from "../src/daily";
import type { Campaign, Puzzle, Schedule } from "../src/types";

const pool: Puzzle[] = JSON.parse(readFileSync("public/data/puzzles.json", "utf8")).puzzles;
const schedule: Schedule = JSON.parse(readFileSync("public/data/schedule.json", "utf8"));
const campaigns: Campaign[] = JSON.parse(readFileSync("public/data/sponsored.json", "utf8")).campaigns;

describe("data i czas polski", () => {
  it("północ w Polsce, nie UTC", () => {
    // 23:30 UTC 11 listopada = 00:30 12 listopada w Warszawie (CET)
    expect(todayKey(new Date("2026-11-11T23:30:00Z"))).toBe("2026-11-12");
    expect(todayKey(new Date("2026-07-01T21:59:00Z"))).toBe("2026-07-01");
    expect(todayKey(new Date("2026-07-01T22:01:00Z"))).toBe("2026-07-02");
    expect(daysBetween("2026-11-11", "2027-01-01")).toBe(51);
    const ms = msUntilNextChallenge(new Date("2026-11-11T22:00:00Z")); // 23:00 w Warszawie
    expect(Math.round(ms / 60000)).toBe(60);
  });
});

describe("wyzwanie dnia", () => {
  it("harmonogram: 10 różnych, istniejących zagadek każdego dnia", () => {
    const ids = new Set(pool.map((p) => p.id));
    for (const day of schedule.days) {
      expect(day).toHaveLength(10);
      expect(new Set(day).size).toBe(10);
      for (const id of day) expect(ids.has(id)).toBe(true);
    }
  });
  it("brak powtórek w pierwszych 90 dniach", () => {
    const seen = new Set<string>();
    for (const day of schedule.days.slice(0, 90)) for (const id of day) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });
  it("to samo wyzwanie dla wszystkich i ten sam numer", () => {
    const a = buildChallenge(pool, schedule, campaigns, "2026-11-20");
    const b = buildChallenge(pool, schedule, campaigns, "2026-11-20");
    expect(a.number).toBe(10);
    expect(a.puzzles.map((p) => p.id)).toEqual(b.puzzles.map((p) => p.id));
  });
  it("kampania demo tylko z ?demo, zawsze w 5. rundzie, nadal 10 rund", () => {
    const normal = buildChallenge(pool, schedule, campaigns, "2026-11-20");
    const demo = buildChallenge(pool, schedule, campaigns, "2026-11-20", { demo: true });
    expect(normal.puzzles.some((p) => p.sponsor)).toBe(false);
    expect(demo.puzzles).toHaveLength(10);
    expect(demo.puzzles[4].sponsor?.name).toBeTruthy();
    expect(demo.puzzles.filter((p) => p.sponsor)).toHaveLength(1);
  });
  it("obiekt kampanii w zwykłym harmonogramie nie dostaje oznaczenia partnera poza kampanią", () => {
    const sp = campaigns[0].puzzles[0];
    const day = schedule.days.findIndex((d) => d.includes(sp.id));
    expect(day).toBeGreaterThanOrEqual(0); // w obecnych danych obiekt demo jest też w harmonogramie
    const key = new Date(Date.parse(schedule.start + "T00:00:00Z") + day * 86_400_000).toISOString().slice(0, 10);
    const normal = buildChallenge(pool, schedule, campaigns, key);
    expect(normal.puzzles.some((p) => p.id === sp.id)).toBe(true);
    expect(normal.puzzles.some((p) => p.sponsor)).toBe(false);
    const demo = buildChallenge(pool, schedule, campaigns, key, { demo: true });
    expect(demo.puzzles).toHaveLength(10);
    expect(demo.puzzles.filter((p) => p.id === sp.id)).toHaveLength(1);
    expect(demo.puzzles[4].sponsor).toBeTruthy();
  });
  it("zapisana lista wygrywa z harmonogramem (aktualizacja danych w trakcie dnia)", () => {
    const saved = schedule.days[0].slice().reverse();
    const c = buildChallenge(pool, schedule, campaigns, "2026-11-11", { savedIds: saved });
    expect(c.puzzles.map((p) => p.id)).toEqual(saved);
  });
  it("awaryjny dobór po końcu harmonogramu jest deterministyczny", () => {
    expect(fallbackIds(pool, "2030-01-01")).toEqual(fallbackIds(pool, "2030-01-01"));
    expect(new Set(fallbackIds(pool, "2030-01-01")).size).toBe(10);
    const c = buildChallenge(pool, schedule, campaigns, "2030-01-01");
    expect(c.puzzles).toHaveLength(10);
  });
});
