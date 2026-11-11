import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces";
import "./style.css";

import { buildChallenge, todayKey, type Challenge } from "./daily";
import { mount, toast } from "./dom";
import { loadDay, saveDay } from "./storage";
import type { Campaign, DayState, Puzzle, Schedule } from "./types";
import { renderStart } from "./views/start";
import { renderRound } from "./views/round";
import { renderSummary } from "./views/summary";
import { openAbout } from "./views/about";

const base = import.meta.env.BASE_URL;

async function getJSON<T>(path: string, fallback?: T): Promise<T> {
  try {
    const r = await fetch(base + path, { cache: "no-cache" });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return (await r.json()) as T;
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw e;
  }
}

export interface Game {
  challenge: Challenge;
  state: DayState;
  /** Tryb podglądu (?dzien=RRRR-MM-DD): nie zapisuje wyników ani statystyk. */
  preview: boolean;
  save(): void;
  go(view: "start" | "round" | "summary"): void;
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const demo = params.has("demo");
  const previewDay = params.get("dzien");
  const preview = !!previewDay && /^\d{4}-\d{2}-\d{2}$/.test(previewDay);
  const key = preview ? previewDay! : todayKey();

  const [pool, schedule, sponsored] = await Promise.all([
    getJSON<{ puzzles: Puzzle[] }>("data/puzzles.json"),
    getJSON<Schedule>("data/schedule.json", { start: key, days: [] }),
    getJSON<{ campaigns: Campaign[] }>("data/sponsored.json", { campaigns: [] }),
  ]);

  const saved = preview ? null : loadDay(key);
  const challenge = buildChallenge(pool.puzzles, schedule, sponsored.campaigns, key, { demo, savedIds: saved?.ids });
  const ids = challenge.puzzles.map((p) => p.id);
  // Zapis z tego dnia, ale z inną listą zagadek (np. zagadkę usunięto z puli) — zaczynamy od nowa
  const state: DayState = saved && saved.ids.join() === ids.join() ? saved : { key, ids, guesses: [] };

  const game: Game = {
    challenge,
    state,
    preview,
    save: () => {
      if (!preview) saveDay(state);
    },
    go(view) {
      if (view === "start") renderStart(game);
      else if (view === "round") renderRound(game);
      else renderSummary(game);
    },
  };
  game.save();

  document.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest("[data-about]");
    if (t) {
      e.preventDefault();
      openAbout(t.getAttribute("data-about") || undefined);
    }
  });

  if (preview) toast(`Podgląd wyzwania z ${key} — wynik nie jest zapisywany`);
  if (state.guesses.length >= challenge.puzzles.length) game.go("summary");
  else if (state.guesses.length > 0) game.go("round");
  else game.go("start");
}

boot().catch((err) => {
  console.error(err);
  mount(`<main class="center"><div class="card narrow"><h1>Ups…</h1><p>Nie udało się wczytać gry. Sprawdź połączenie i odśwież stronę.</p><button class="btn primary" onclick="location.reload()">Odśwież</button></div></main>`);
});
