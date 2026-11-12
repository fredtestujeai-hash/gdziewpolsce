import { beforeEach, describe, expect, it } from "vitest";
import { loadStats, recordResult } from "../src/storage";

beforeEach(() => {
  const mem = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
  };
});

describe("statystyki i seria", () => {
  it("kolejne ukończone dni budują serię, a zapis jest jednorazowy", () => {
    recordResult("2026-11-11", 2000);
    recordResult("2026-11-12", 1000);
    const s = recordResult("2026-11-12", 3000);
    expect(s).toMatchObject({ played: 2, streak: 2, maxStreak: 2, best: 2000, total: 3000 });
  });
  it("przerwane wyzwanie czeka; po powrocie i dokończeniu tego samego dnia seria trwa", () => {
    recordResult("2026-11-11", 2000);
    const p = recordResult("2026-11-12", 400, false);
    expect(p).toMatchObject({ played: 1, streak: 1, pending: { key: "2026-11-12", score: 400 } });
    expect(loadStats("2026-11-12").streak).toBe(1);
    const s = recordResult("2026-11-12", 1900);
    expect(s).toMatchObject({ played: 2, streak: 2, total: 3900 });
    expect(s.pending).toBeUndefined();
  });
  it("wyzwanie niedokończone do końca doby liczy się jako rozegrane, ale przerywa serię", () => {
    recordResult("2026-11-10", 2000);
    recordResult("2026-11-11", 2000);
    recordResult("2026-11-12", 400, false);
    const next = loadStats("2026-11-13");
    expect(next).toMatchObject({ played: 3, streak: 0, maxStreak: 2, total: 4400, history: { "2026-11-12": 400 } });
    expect(next.pending).toBeUndefined();
    expect(recordResult("2026-11-13", 1000)).toMatchObject({ played: 4, streak: 1, maxStreak: 2 });
  });
  it("opuszczony dzień zeruje pokazywaną serię", () => {
    recordResult("2026-11-11", 2000);
    expect(loadStats("2026-11-12").streak).toBe(1);
    expect(loadStats("2026-11-13").streak).toBe(0);
  });
});
