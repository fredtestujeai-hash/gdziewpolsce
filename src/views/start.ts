import { CONFIG } from "../config";
import { esc, mount, PIN_SVG } from "../dom";
import type { Game } from "../main";
import { loadStats } from "../storage";
import { formatDayLong, topbar } from "./common";

export function renderStart(game: Game): void {
  const { challenge } = game;
  const stats = loadStats();
  const sponsor = challenge.puzzles.find((p) => p.sponsor)?.sponsor;
  const app = mount(`
    ${topbar()}
    <main class="start">
      <section class="hero">
        <div class="hero-pin">${PIN_SVG}</div>
        <p class="eyebrow">Wyzwanie #${challenge.number} · ${esc(formatDayLong(challenge.key))}</p>
        <h1>Gdzie i kiedy?</h1>
        <p class="lead">${CONFIG.rounds} miejsc z całej Polski. Rozpoznaj je na zdjęciu, wbij pinezkę na mapie i zgadnij, w którym roku powstały.</p>

        <ol class="steps">
          <li><span class="step-n">1</span><div><b>Obejrzyj zdjęcie</b><span>zamek, kościół, ratusz, latarnia…</span></div></li>
          <li><span class="step-n">2</span><div><b>Wbij pinezkę</b><span>na mapie są tylko rzeki i jeziora</span></div></li>
          <li><span class="step-n">3</span><div><b>Ustaw rok</b><span>im bliżej, tym więcej punktów</span></div></li>
        </ol>

        <button class="btn primary big" id="play">Zagraj</button>
        <p class="fineprint">Do 1000 pkt za każde miejsce · bez reklam · bez logowania</p>
        ${stats.played ? `<p class="fineprint">Twoja seria: <b>${stats.streak}</b> ${stats.streak === 1 ? "dzień" : "dni"} · rozegrane: ${stats.played}</p>` : ""}
        ${sponsor ? `<p class="partner-line">Dzisiejsze wyzwanie współtworzy: <b>${esc(sponsor.name)}</b></p>` : ""}
      </section>
    </main>`);
  app.querySelector("#play")!.addEventListener("click", () => game.go("round"));
}
