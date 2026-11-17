import { CONFIG } from "../config";
import { esc, mount, PIN_SVG } from "../dom";
import { EN, tr } from "../i18n";
import type { Game } from "../main";
import { preloadMap } from "../map";
import { placesWord } from "../score";
import { loadStats } from "../storage";
import { formatDayLong, topbar } from "./common";
import { attachRankingLink } from "./ranking";

export function renderStart(game: Game): void {
  const { challenge } = game;
  const stats = loadStats();
  const sponsor = challenge.puzzles.find((p) => p.sponsor)?.sponsor;
  const app = mount(`
    ${topbar()}
    <main class="start">
      <section class="hero">
        <div class="hero-pin">${PIN_SVG}</div>
        <p class="eyebrow">${tr("Wyzwanie", "Challenge")} #${challenge.number} · ${esc(formatDayLong(challenge.key))}</p>
        <h1>${esc(CONFIG.name)}</h1>
        <p class="lead">${challenge.puzzles.length} ${placesWord(challenge.puzzles.length)} ${tr("z całej Polski, od łatwego do trudnego. Rozpoznaj je na zdjęciu, wbij pinezkę na mapie i zgadnij, w którym roku powstały.", "from all over Poland, from easy to hard. Recognise each one in a photo, drop a pin on the map and guess the year it was built.")}</p>

        <ol class="steps">
          <li><span class="step-n">1</span><div><b>${tr("Obejrzyj zdjęcie", "Look at the photo")}</b><span>${tr("zamek, kościół, ratusz, latarnia…", "a castle, a church, a town hall, a lighthouse…")}</span></div></li>
          <li><span class="step-n">2</span><div><b>${tr("Wbij pinezkę", "Drop a pin")}</b><span>${tr("mapa bez nazw — przybliżaj aż do ulic", "a map with no names — zoom in down to the streets")}</span></div></li>
          <li><span class="step-n">3</span><div><b>${tr("Ustaw rok", "Set the year")}</b><span>${tr("im bliżej, tym więcej punktów", "the closer you are, the more points")}</span></div></li>
        </ol>

        <button class="btn primary big" id="play">${tr("Zagraj", "Play")}</button>
        <p class="fineprint">${tr("Do 1000 pkt za każde miejsce · bez reklam · bez logowania", "Up to 1,000 points per place · no ads · no sign-up")}</p>
        ${stats.played ? `<p class="fineprint">${tr("Twoja seria", "Your streak")}: <b>${stats.streak}</b> ${EN ? (stats.streak === 1 ? "day" : "days") : stats.streak === 1 ? "dzień" : "dni"} · ${tr("rozegrane", "played")}: ${stats.played}</p>` : ""}
        ${sponsor ? `<p class="partner-line">${tr("Dzisiejsze wyzwanie współtworzy", "Today's challenge is supported by")}: <b>${esc(sponsor.name)}</b></p>` : ""}
      </section>
    </main>`);
  app.querySelector("#play")!.addEventListener("click", () => game.go("round"));
  attachRankingLink(game);
  setTimeout(preloadMap, 300);
}
