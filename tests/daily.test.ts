import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CONFIG } from "../src/config";
import { buildChallenge, daysBetween, difficultyLayout, fallbackIds, msUntilNextChallenge, sponsorSlot, todayKey } from "../src/daily";
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
  const byId = new Map(pool.map((p) => [p.id, p]));
  const keyOf = (i: number) => new Date(Date.parse(schedule.start + "T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10);
  // Od 14 listopada 2026 wyzwanie ma 6 zagadek; dni 11–13 listopada rozegrano według starych reguł (3 zagadki)
  const SIX_FROM = daysBetween(schedule.start, "2026-11-14");

  it("harmonogram: rozegrane dni po 3 zagadki, od 14.11 po 6 — od łatwych do trudnych", () => {
    expect(schedule.start).toBe("2026-11-11");
    expect(SIX_FROM).toBe(3);
    expect(schedule.days.length).toBeGreaterThanOrEqual(300);
    schedule.days.forEach((day, i) => {
      const n = i < SIX_FROM ? 3 : CONFIG.rounds;
      expect(day).toHaveLength(n);
      expect(new Set(day).size).toBe(n);
      expect(day.map((id) => byId.get(id)?.difficulty)).toEqual(difficultyLayout(n));
    });
    expect(CONFIG.rounds).toBe(6);
    expect(difficultyLayout(6)).toEqual([1, 1, 2, 2, 3, 3]);
  });
  it("brak powtórek przez pierwsze 130 dni z 6 zagadkami", () => {
    const seen = new Set<string>();
    for (const day of schedule.days.slice(SIX_FROM, SIX_FROM + 130)) for (const id of day) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });
  it("to samo wyzwanie dla wszystkich i ten sam numer", () => {
    const a = buildChallenge(pool, schedule, campaigns, "2026-11-20");
    const b = buildChallenge(pool, schedule, campaigns, "2026-11-20");
    expect(a.number).toBe(10);
    expect(a.puzzles).toHaveLength(6);
    expect(a.puzzles.map((p) => p.id)).toEqual(b.puzzles.map((p) => p.id));
  });
  it("dzień rozegrany według starych reguł zostaje z 3 zagadkami, a zapis gracza jest honorowany", () => {
    const c = buildChallenge(pool, schedule, campaigns, "2026-11-13");
    expect(c.puzzles.map((p) => p.id)).toEqual(schedule.days[2]);
    const saved = buildChallenge(pool, schedule, campaigns, "2026-11-13", { savedIds: schedule.days[2] });
    expect(saved.puzzles.map((p) => p.id)).toEqual(schedule.days[2]);
  });
  it("kampania demo tylko z ?demo, zawsze w środku wyzwania, liczba rund bez zmian", () => {
    expect(sponsorSlot(3)).toBe(1);
    expect(sponsorSlot(6)).toBe(2);
    const normal = buildChallenge(pool, schedule, campaigns, "2026-11-20");
    const demo = buildChallenge(pool, schedule, campaigns, "2026-11-20", { demo: true });
    expect(normal.puzzles.some((p) => p.sponsor)).toBe(false);
    expect(demo.puzzles).toHaveLength(6);
    expect(demo.puzzles[2].sponsor?.name).toBeTruthy();
    expect(demo.puzzles.filter((p) => p.sponsor)).toHaveLength(1);
    // w starym dniu z 3 zagadkami sponsor nadal trafia do 2. rundy
    const old = buildChallenge(pool, schedule, campaigns, "2026-11-12", { demo: true });
    expect(old.puzzles).toHaveLength(3);
    expect(old.puzzles[1].sponsor).toBeTruthy();
  });
  it("obiekt kampanii w zwykłym harmonogramie nie dostaje oznaczenia partnera poza kampanią", () => {
    const sp = campaigns[0].puzzles[0];
    const day = schedule.days.findIndex((d) => d.includes(sp.id));
    expect(day).toBeGreaterThanOrEqual(0); // w obecnych danych obiekt demo jest też w harmonogramie
    const key = keyOf(day);
    const normal = buildChallenge(pool, schedule, campaigns, key);
    expect(normal.puzzles.some((p) => p.id === sp.id)).toBe(true);
    expect(normal.puzzles.some((p) => p.sponsor)).toBe(false);
    const demo = buildChallenge(pool, schedule, campaigns, key, { demo: true });
    const n = schedule.days[day].length;
    expect(demo.puzzles).toHaveLength(n);
    expect(demo.puzzles.filter((p) => p.id === sp.id)).toHaveLength(1);
    expect(demo.puzzles[sponsorSlot(n)].sponsor).toBeTruthy();
  });
  it("zapisana lista wygrywa z harmonogramem (aktualizacja danych w trakcie dnia)", () => {
    const saved = schedule.days[5].slice().reverse();
    const c = buildChallenge(pool, schedule, campaigns, keyOf(5), { savedIds: saved });
    expect(c.puzzles.map((p) => p.id)).toEqual(saved);
  });
  it("zapis o innej liczbie rund niż harmonogram dnia jest ignorowany", () => {
    const old = schedule.days[5].slice(0, 3);
    const c = buildChallenge(pool, schedule, campaigns, keyOf(5), { savedIds: old });
    expect(c.puzzles.map((p) => p.id)).toEqual(schedule.days[5]);
  });
  it("awaryjny dobór po końcu harmonogramu jest deterministyczny", () => {
    expect(fallbackIds(pool, "2030-01-01")).toEqual(fallbackIds(pool, "2030-01-01"));
    expect(new Set(fallbackIds(pool, "2030-01-01")).size).toBe(6);
    const c = buildChallenge(pool, schedule, campaigns, "2030-01-01");
    expect(c.puzzles.map((p) => p.difficulty)).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

describe("warstwa miejscowości", () => {
  const places: [number, number, number][] = JSON.parse(readFileSync("public/map/places.json", "utf8")).places;
  it("18 miast wojewódzkich, kilkaset powiatowych, ok. 2 tys. gminnych — wszystkie w Polsce", () => {
    const n = (r: number) => places.filter((p) => p[2] === r).length;
    expect(n(1)).toBe(18);
    expect(n(2)).toBeGreaterThan(280);
    expect(n(3)).toBeGreaterThan(1800);
    for (const [lon, lat] of places) {
      expect(lon).toBeGreaterThan(14);
      expect(lon).toBeLessThan(24.2);
      expect(lat).toBeGreaterThan(49);
      expect(lat).toBeLessThan(54.9);
    }
  });
});

describe("województwa (podpowiedź)", () => {
  const woj: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { name: string }> = JSON.parse(readFileSync("public/map/wojewodztwa.json", "utf8"));
  const names = new Set(woj.features.map((f) => f.properties.name));
  const inRing = (lon: number, lat: number, ring: number[][]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  it("16 województw w pliku z wielokątami", () => {
    expect(names.size).toBe(16);
    expect(names.has("małopolskie")).toBe(true);
  });
  it("każda zagadka (także sponsorowana) ma województwo z tej listy", () => {
    for (const p of [...pool, ...campaigns.flatMap((c) => c.puzzles)]) expect(names.has(p.woj ?? ""), p.name).toBe(true);
  });
  it("znane miejsca trafiają do właściwych województw, a punkt leży w podświetlanym obszarze", () => {
    const find = (name: string) => pool.find((p) => p.name === name)!;
    expect(find("Zamek w Ciechanowie").woj).toBe("mazowieckie");
    expect(campaigns[0].puzzles[0].woj).toBe("świętokrzyskie");
    let inside = 0;
    for (const p of pool) {
      const g = woj.features.find((f) => f.properties.name === p.woj)!.geometry;
      const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
      if (polys.some((poly) => inRing(p.lon, p.lat, poly[0]))) inside++;
    }
    // poza obrysem mogą być tylko pojedyncze obiekty na samym brzegu (latarnie, falochrony)
    expect(pool.length - inside).toBeLessThan(15);
  });
});
