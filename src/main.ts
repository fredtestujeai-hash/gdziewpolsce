import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces";
import "./style.css";

import { buildChallenge, todayKey, type Challenge } from "./daily";
import { mount, toast } from "./dom";
import { EN, ROOT, tr } from "./i18n";
import { finishIntro } from "./intro";
import { loadDay, saveDay } from "./storage";
import type { Campaign, DayState, Puzzle, Schedule } from "./types";
import { renderStart } from "./views/start";
import { renderRound } from "./views/round";
import { renderSummary } from "./views/summary";
import { openAbout } from "./views/about";

const base = ROOT;

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

/** Angielskie teksty zagadki (public/data/puzzles.en.json, generuje scripts/fetch_en.py). */
interface EnText {
  name?: string;
  extract?: string;
  wiki?: string;
}

/**
 * Wersja angielska: podmienia nazwę, opis i link do Wikipedii tam, gdzie są angielskie. Gdy ich brakuje,
 * zostaje polska nazwa i link do polskiej Wikipedii, a polski opis jest chowany.
 */
function localize(puzzles: Puzzle[], en: Record<string, EnText>): void {
  for (const p of puzzles) {
    const t = en[p.id] ?? {};
    if (t.name) p.name = t.name;
    p.extract = t.extract ?? "";
    if (t.wiki) p.wiki = t.wiki;
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

  const [pool, schedule, sponsored, en] = await Promise.all([
    getJSON<{ puzzles: Puzzle[] }>("data/puzzles.json"),
    getJSON<Schedule>("data/schedule.json", { start: key, days: [] }),
    getJSON<{ campaigns: Campaign[] }>("data/sponsored.json", { campaigns: [] }),
    EN ? getJSON<{ puzzles: Record<string, EnText> }>("data/puzzles.en.json", { puzzles: {} }) : null,
  ]);

  if (en) localize(pool.puzzles.concat(sponsored.campaigns.flatMap((c) => c.puzzles)), en.puzzles);

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
      else if (view === "round")
        renderRound(game).catch((err) => {
          console.error(err);
          mount(`<main class="center"><div class="card narrow"><h1>${tr("Ups…", "Oops…")}</h1><p>${tr("Nie udało się uruchomić mapy. Gra wymaga przeglądarki z obsługą WebGL — spróbuj ją zaktualizować albo otwórz grę w innej.", "The map could not start. The game needs a browser with WebGL support — try updating it or open the game in another one.")}</p><button class="btn primary" onclick="location.reload()">${tr("Spróbuj ponownie", "Try again")}</button></div></main>`);
        });
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

  if (preview) toast(tr(`Podgląd wyzwania z ${key} — wynik nie jest zapisywany`, `Preview of the ${key} challenge — your score is not saved`));
  if (state.guesses.length >= challenge.puzzles.length) game.go("summary");
  else if (state.guesses.length > 0) game.go("round");
  else game.go("start");
  // Pierwszy ekran jest już gotowy pod spodem — odsłaniamy go, gdy obrys Polski się domknie
  await finishIntro();
}

boot().catch((err) => {
  console.error(err);
  void finishIntro(false);
  mount(`<main class="center"><div class="card narrow"><h1>${tr("Ups…", "Oops…")}</h1><p>${tr("Nie udało się wczytać gry. Sprawdź połączenie i odśwież stronę.", "The game could not load. Check your connection and refresh the page.")}</p><button class="btn primary" onclick="location.reload()">${tr("Odśwież", "Refresh")}</button></div></main>`);
});
