import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/config";
import { locLevel, shareLines, tile, tileLevel, yearLevel } from "../src/score";
import { facebookShareUrl, shareImageName, whatsappShareUrl, xShareUrl } from "../src/share";
import type { Guess } from "../src/types";

const g = (o: Partial<Guess>): Guess => ({ lat: 50, lon: 20, year: 1500, km: 0, yearDiff: 0, locPts: 500, yearPts: 500, ...o });
const url = "https://gdziewpolsce.com/";

describe("udostępnianie wyniku", () => {
  const guesses = [g({}), g({ locPts: 300, hintYear: true, yearPts: 120 }), g({ locPts: 0, yearPts: 0, gaveUp: "round" })];
  const text = shareLines(12, guesses, 6, url);
  const noUrl = shareLines(12, guesses, 6, "");

  it("X: tekst bez linku, link osobno; polskie znaki i emoji zakodowane poprawnie", () => {
    const u = new URL(xShareUrl(noUrl, url));
    expect(u.origin + u.pathname).toBe("https://x.com/intent/post");
    expect(u.searchParams.get("text")).toBe(noUrl);
    expect(u.searchParams.get("url")).toBe(url);
    expect(noUrl).not.toContain("https://");
    expect(noUrl).toContain("💡 1 podpowiedź");
    const raw = xShareUrl("Gdzie w Polsce? żółć 🟩 #12 & co", url);
    expect(raw).toContain("%C5%BC%C3%B3%C5%82%C4%87"); // żółć w UTF-8
    expect(raw).toContain("%F0%9F%9F%A9"); // 🟩
    expect(raw).toContain("%3F"); // „?” nie może uciąć adresu
    expect(raw).toContain("%23"); // „#” nie może stać się kotwicą
    expect(raw).toContain("%26"); // „&” nie może uciąć parametru
  });

  it("Facebook: tylko adres strony", () => {
    const u = new URL(facebookShareUrl(url));
    expect(u.origin + u.pathname).toBe("https://www.facebook.com/sharer/sharer.php");
    expect([...u.searchParams.keys()]).toEqual(["u"]);
    expect(u.searchParams.get("u")).toBe(url);
  });

  it("WhatsApp: cały tekst z linkiem, link nie jest dublowany", () => {
    const u = new URL(whatsappShareUrl(text, url));
    expect(u.origin + u.pathname).toBe("https://wa.me/");
    expect(u.searchParams.get("text")).toBe(text);
    expect(u.searchParams.get("text")!.split(url).length).toBe(2);
    expect(new URL(whatsappShareUrl(noUrl, url)).searchParams.get("text")).toBe(`${noUrl}\n${url}`);
  });

  it("tekst: numer, wynik z maks. 6000, kafelki 6 rund", () => {
    const lines = text.split("\n");
    expect(lines[0]).toMatch(new RegExp(`^${CONFIG.name.replace("?", "\\?")} #12 — `));
    expect(lines[0]).toContain("/6000");
    expect(lines[1]).toBe("📍 🟩🟨⬛");
    expect(lines[lines.length - 1]).toBe(url);
  });

  it("poziomy kafelków do obrazka zgadzają się z emoji", () => {
    for (const p of [0, 99, 100, 249, 250, 399, 400, 500]) expect(tile(p, 500)).toBe(["🟩", "🟨", "🟧", "🟥"][tileLevel(p, 500)]);
    expect(guesses.map(locLevel)).toEqual([0, 1, "x"]);
    expect(guesses.map(yearLevel)).toEqual([0, 2, "x"]);
  });

  it("nazwa pliku obrazka", () => {
    expect(shareImageName(12, "story")).toBe("gdziewpolsce-12-relacja.png");
    expect(shareImageName(12, "square")).toBe("gdziewpolsce-12-kwadrat.png");
  });
});
