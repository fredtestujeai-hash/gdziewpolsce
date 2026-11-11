import { describe, expect, it } from "vitest";
import { century, haversineKm, locationPoints, tile, yearPoints, yearsWord } from "../src/score";

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
});
