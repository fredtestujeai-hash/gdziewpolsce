import { CONFIG } from "../config";
import { msUntilNextChallenge } from "../daily";
import { $, esc, mount, partnerLink } from "../dom";
import { EN, tr } from "../i18n";
import type { Game } from "../main";
import { createMap } from "../map";
import { formatPoints, hintCostText, locTile, rating, totalPoints, yearTile } from "../score";
import { loadStats, recordResult } from "../storage";
import { formatDayLong, topbar, wikiButton } from "./common";
import { compare } from "../stats-core";
import { fetchDayStats, track } from "../track";
import { attachRanking } from "./ranking";
import { openShare } from "./share";

export function renderSummary(game: Game): void {
  const { challenge, state } = game;
  const total = totalPoints(state.guesses);
  const max = challenge.puzzles.length * (CONFIG.maxLocationPoints + CONFIG.maxYearPoints);
  const anyHint = state.guesses.some((g) => g.hintLoc || g.hintYear);
  // Wyzwanie przerwane („Zakończ dzisiejsze wyzwanie”): do północy można wrócić do nierozegranych zagadek
  const firstUnplayed = state.guesses.findIndex((g) => g.gaveUp === "day");
  const unfinished = firstUnplayed >= 0;
  /** Można jeszcze wrócić do gry — odpowiedzi nierozegranych zagadek muszą zostać ukryte. */
  const resumable = unfinished && !state.closed;
  const hidden = (i: number) => resumable && state.guesses[i]?.gaveUp === "day";
  const stats = game.preview ? loadStats() : recordResult(challenge.key, total, !unfinished);
  const avg = stats.played ? Math.round(stats.total / stats.played) : 0;
  const sponsors = challenge.puzzles.filter((p) => p.sponsor);

  const app = mount(`
    ${topbar(`<div class="round-meta"><span>${tr("Wyzwanie", "Challenge")} #${challenge.number}</span></div>`)}
    <main class="summary">
      <section class="card hero-score">
        <p class="eyebrow">${esc(formatDayLong(challenge.key))}</p>
        <div class="total"><span class="total-n" id="total-n">0</span><span class="total-max">/ ${formatPoints(max)}</span></div>
        <p class="rating">${esc(rating(total, max))}</p>
        <p class="versus" id="versus" hidden></p>
        <div class="tiles" aria-label="${tr("Wyniki rund", "Round results")}">
          <div><span>📍</span>${state.guesses.map((g) => `<i>${locTile(g)}</i>`).join("")}</div>
          <div><span>📅</span>${state.guesses.map((g) => `<i>${yearTile(g)}</i>`).join("")}</div>
        </div>
        ${anyHint ? `<p class="hint-note">💡 ${tr("Z podpowiedzią", "With a hint")} (−${hintCostText()} ${tr("pkt", "pts")}): ${state.guesses.map((g, i) => (g.hintLoc || g.hintYear ? `${tr("runda", "round")} ${i + 1}` : "")).filter(Boolean).join(", ")}</p>` : ""}
        ${
          resumable
            ? `<div class="resume">
                <p>${tr("<b>Wyzwanie niedokończone.</b> Do północy możesz wrócić do nierozegranych zagadek. Niedokończone wyzwanie przerywa serię.", "<b>Challenge unfinished.</b> You can return to the unplayed puzzles until midnight (Polish time). An unfinished challenge breaks your streak.")}</p>
                <button class="btn primary big" id="resume">${tr("Wróć do gry", "Back to the game")}</button>
              </div>`
            : ""
        }
        <button class="btn ${resumable ? "secondary" : "primary"} big" id="share">${tr("Udostępnij wynik", "Share your score")}</button>
        <p class="countdown">${tr("Następne wyzwanie za", "Next challenge in")} <b id="countdown">--:--:--</b></p>
      </section>

      <section class="card stats">
        <div><b>${stats.played}</b><span>${tr("rozegrane", "played")}</span></div>
        <div><b>${stats.streak}</b><span>${tr("seria dni", "day streak")}</span></div>
        <div><b>${stats.maxStreak}</b><span>${tr("najdłuższa seria", "longest streak")}</span></div>
        <div><b>${formatPoints(avg)}</b><span>${tr("średni wynik", "average score")}</span></div>
        <div><b>${formatPoints(stats.best)}</b><span>${tr("najlepszy", "best")}</span></div>
      </section>

      <section class="card recap">
        <h2>${tr("Dzisiejsza trasa", "Today's route")}</h2>
        <p class="muted">${tr("Wszystkie te miejsca możesz odwiedzić. Może weekendowy wypad?", "You can visit every one of these places. A weekend trip, perhaps?")}</p>
        <div class="recap-map" id="recap-map"></div>
        <ol class="places">
          ${challenge.puzzles
            .map((p, i) => {
              const g = state.guesses[i];
              const pts = g ? g.locPts + g.yearPts : 0;
              const tags = [
                !g || g.gaveUp === "day" ? `<span class="tag">${tr("nierozegrana", "unplayed")}</span>` : g.gaveUp ? `<span class="tag">${tr("pominięta", "skipped")}</span>` : "",
                g?.hintLoc ? `<span class="tag hint">💡 ${tr("województwo", "region")}</span>` : "",
                g?.hintYear ? `<span class="tag hint">💡 ${tr("wiek", "century")}</span>` : "",
              ].join("");
              if (hidden(i))
                return `<li class="place">
                <span class="thumb thumb-hidden" aria-hidden="true">?</span>
                <div class="place-body">
                  <b class="place-name">${tr("Zagadka", "Puzzle")} ${i + 1} — ${tr("nierozegrana", "unplayed")}</b>
                  <span class="muted">${tr("Odpowiedź jest ukryta, dopóki możesz wrócić do gry.", "The answer stays hidden while you can still return to the game.")}</span>
                </div>
                <span class="place-pts">0</span>
              </li>`;
              return `<li class="place${p.sponsor ? " is-sponsored" : ""}">
                <span class="thumb"><img src="${esc(p.img)}" alt="" loading="lazy" onerror="this.remove()" /></span>
                <div class="place-body">
                  <b class="place-name">${esc(p.name)}</b>
                  <span class="muted">${p.place ? esc(p.place) + " · " : ""}${p.year}</span>
                  <span class="place-links">${wikiButton(p, true)}${tags}</span>
                  ${p.sponsor ? `<a class="partner-mini" href="${esc(partnerLink(p.sponsor.url, p.campaign ?? `podsumowanie-${challenge.key}`))}" target="_blank" rel="noopener sponsored">${tr("Sponsorowane", "Sponsored")} · ${esc(p.sponsor.cta)} ↗</a>` : ""}
                </div>
                <span class="place-pts">${pts}</span>
              </li>`;
            })
            .join("")}
        </ol>
        ${resumable ? `<p class="small reveal-all"><a href="#" id="reveal-all">${tr("Nie wracam do gry — pokaż odpowiedzi", "I am not coming back — show the answers")}</a></p>` : ""}
      </section>

      ${
        sponsors.length
          ? `<p class="partner-line center-text">${tr("Dzisiejsze wyzwanie współtworzy", "Today's challenge is supported by")}: ${sponsors.map((p) => `<b>${esc(p.sponsor!.name)}</b>`).join(", ")}. ${tr("Dziękujemy!", "Thank you!")}</p>`
          : ""
      }
      <footer class="foot">
        <a href="#" data-about>${tr("Jak grać", "How to play")}</a> · <a href="#" data-about="partnerzy">${tr("Dla miast i regionów", "For cities and regions")}</a> · <a href="#" data-about="zrodla">${tr("Źródła i licencje", "Sources and licences")}</a>
      </footer>
    </main>`);

  attachRanking(game);

  // Wynik na tle innych: pokazujemy dopiero, gdy dzień ukończyło dość graczy, żeby porównanie coś znaczyło.
  if (!unfinished && !game.preview)
    fetchDayStats(challenge.key).then((s) => {
      const c = s && compare(s.hist, total);
      const el = app.querySelector<HTMLElement>("#versus");
      if (!c || !el) return;
      el.textContent = EN
        ? `${c.pct >= 50 ? `Better than ${c.pct}% of today's players` : `${formatPoints(c.n)} games finished today`} · today's average: about ${formatPoints(c.avg)} pts`
        : `${c.pct >= 50 ? `Lepiej niż ${c.pct}% dzisiejszych graczy` : `Dziś ukończono już ${formatPoints(c.n)} gier`} · średnia dnia ok. ${formatPoints(c.avg)} pkt`;
      el.hidden = false;
    });

  app.querySelector("#resume")?.addEventListener("click", () => {
    state.guesses.length = firstUnplayed; // nierozegrane rundy wracają do gry; pominięte i rozegrane zostają
    game.save();
    game.go("round");
  });

  app.querySelector("#reveal-all")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (!confirm(tr("Pokazać odpowiedzi? Nie będzie już można wrócić do dzisiejszego wyzwania, a seria zostanie przerwana.", "Show the answers? You will not be able to return to today's challenge and your streak will be broken."))) return;
    state.closed = true;
    game.save();
    game.go("summary");
  });

  // licznik punktów
  const totalEl = $("#total-n", app);
  const t0 = performance.now();
  const anim = (t: number) => {
    const k = Math.min(1, (t - t0) / 900);
    totalEl.textContent = formatPoints(Math.round(total * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(anim);
  };
  requestAnimationFrame(anim);

  // odliczanie do północy
  const cd = $("#countdown", app);
  const tick = () => {
    if (!document.body.contains(cd)) return clearInterval(timer);
    const ms = msUntilNextChallenge();
    if (ms < 1000 && !game.preview) location.reload();
    const s = Math.floor(ms / 1000);
    cd.textContent = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((v) => String(v).padStart(2, "0")).join(":");
  };
  const timer = window.setInterval(tick, 1000);
  tick();

  $("#share", app).addEventListener("click", () => openShare(game));

  app.querySelectorAll<HTMLAnchorElement>(".partner-mini").forEach((a, i) =>
    a.addEventListener("click", () => {
      if (!game.preview) track("sponsor_click", { day: challenge.key, campaign: sponsors[i]?.campaign ?? "", where: "podsumowanie" });
    }),
  );

  createMap($("#recap-map", app)).then((gm) => {
    gm.lock(true);
    gm.showMany(challenge.puzzles.filter((_, i) => !hidden(i)).map((p) => ({ lat: p.lat, lon: p.lon, label: p.name })));
  });
}
