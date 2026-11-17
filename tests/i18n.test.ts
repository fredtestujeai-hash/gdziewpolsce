import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LANG, categoryName, regionName, tr } from "../src/i18n";
import { ordinal } from "../src/score";

describe("wersje językowe", () => {
  it("bez adresu strony (serwer, testy) obowiązuje polski", () => {
    expect(LANG).toBe("pl");
    expect(tr("tak", "yes")).toBe("tak");
    expect(categoryName("zamek")).toBe("zamek");
    expect(regionName("małopolskie")).toBe("małopolskie");
  });

  it("angielskie liczebniki porządkowe wieków", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 14, 21, 22].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "14th", "21st", "22nd"]);
  });

  it("każda kategoria z puli ma angielską nazwę", () => {
    const src = readFileSync("src/i18n.ts", "utf8");
    const puzzles = (JSON.parse(readFileSync("public/data/puzzles.json", "utf8")) as { puzzles: { category: string }[] }).puzzles;
    const missing = [...new Set(puzzles.map((p) => p.category))].filter((c) => !new RegExp(`(^|[ {,"])${c.replace(/ /g, " ")}"?: "`, "m").test(src));
    expect(missing).toEqual([]);
  });

  it("angielskie teksty zagadek pasują do puli", () => {
    const ids = new Set((JSON.parse(readFileSync("public/data/puzzles.json", "utf8")) as { puzzles: { id: string }[] }).puzzles.map((p) => p.id));
    const en = (JSON.parse(readFileSync("public/data/puzzles.en.json", "utf8")) as { puzzles: Record<string, { name?: string; extract?: string; wiki?: string }> }).puzzles;
    const known = Object.keys(en).filter((id) => ids.has(id));
    expect(known.length).toBeGreaterThan(ids.size * 0.9);
    for (const id of known) {
      const w = en[id].wiki;
      if (w) expect(w.startsWith("https://en.wikipedia.org/wiki/")).toBe(true);
    }
  });
});
