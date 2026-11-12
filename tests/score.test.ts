import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/config";
import { afterHint, formatPoints, century, centuryRange, haversineKm, hintCostText, locationPoints, placesWord, shareLines, tile, totalPoints, yearPoints, yearsWord } from "../src/score";
import type { Guess } from "../src/types";

describe("punktacja", () => {
  it("odległość Kraków–Warszawa ≈ 252 km", () => {
    expect(haversineKm(50.0614, 19.9366, 52.2297, 21.0122)).toBeCloseTo(252, -1);
  });
  it("pełne punkty blisko celu i monotoniczny spadek", () => {
    expect(locationPoints(0)).toBe(500);
    expect(locationPoints(2)).toBe(500);
    expect(locationPoints(50)).toBeLessThan(locationPoints(10));
    expect(locationPoints(600)).toBe(1);
    expect(yearPoints(0)).toBe(500);
    expect(yearPoints(-10)).toBe(yearPoints(10));
    expect(yearPoints(100)).toBeLessThan(40);
  });
  it("kafelki i odmiana", () => {
    expect(tile(450, 500)).toBe("🟩");
    expect(tile(10, 500)).toBe("🟥");
    expect(century(1410)).toBe("XV w.");
    expect(century(1900)).toBe("XIX w.");
    expect(century(2001)).toBe("XXI w.");
    expect(["1", "2", "5", "12", "22", "25"].map((n) => yearsWord(Number(n)))).toEqual(["rok", "lata", "lat", "lat", "lata", "lat"]);
  });
  it("odmiana „miejsc”", () => {
    expect([1, 3, 5, 10, 12, 22].map(placesWord)).toEqual(["miejsce", "miejsca", "miejsc", "miejsc", "miejsc", "miejsca"]);
  });
});

describe("podpowiedzi i rezygnacja", () => {
  it("podpowiedź obniża punkty o CONFIG.hintCost (30%)", () => {
    expect(CONFIG.hintCost).toBe(0.3);
    expect(hintCostText()).toBe("30%");
    expect(afterHint(500, true)).toBe(350);
    expect(afterHint(500, false)).toBe(500);
    expect(afterHint(500, undefined)).toBe(500);
    expect(afterHint(245, true)).toBe(172);
    expect(afterHint(400, true, 0.5)).toBe(200);
  });
  it("stulecie z zakresem lat", () => {
    expect(centuryRange(1364)).toEqual({ label: "XIV wiek", from: 1301, to: 1400 });
    expect(centuryRange(1400)).toEqual({ label: "XIV wiek", from: 1301, to: 1400 });
    expect(centuryRange(1401).label).toBe("XV wiek");
    expect(centuryRange(2024)).toEqual({ label: "XXI wiek", from: 2001, to: 2100 });
    expect(centuryRange(1000)).toEqual({ label: "X wiek", from: 901, to: 1000 });
  });
  const g = (o: Partial<Guess>): Guess => ({ lat: 50, lon: 20, year: 1500, km: 0, yearDiff: 0, locPts: 500, yearPts: 500, ...o });
  const gaveUp = (kind: "round" | "day"): Guess => g({ lat: 0, lon: 0, year: 0, locPts: 0, yearPts: 0, gaveUp: kind });
  it("udostępniany wynik: maks. 3000, podpowiedzi i rundy bez odpowiedzi są zaznaczone", () => {
    expect(shareLines(7, [g({}), g({}), g({})], 3, "https://x")).toBe(`${CONFIG.name} #7 — ${formatPoints(3000)}/${formatPoints(3000)}\n📍 🟩🟩🟩\n📅 🟩🟩🟩\nhttps://x`);
    const mixed = [g({ locPts: 350, hintLoc: true }), gaveUp("round"), gaveUp("day")];
    expect(totalPoints(mixed)).toBe(850);
    const text = shareLines(7, mixed, 3, "https://x").split("\n");
    expect(text[0]).toContain("850/3");
    expect(text[1]).toBe("📍 🟨⬛⬛");
    expect(text[2]).toBe("📅 🟩⬛⬛");
    expect(text[3]).toBe("💡 1 podpowiedź · ⬛ 2 bez odpowiedzi");
  });
});
