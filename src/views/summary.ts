import { CONFIG } from "../config";
import { msUntilNextChallenge } from "../daily";
import { $, esc, mount, partnerLink, toast } from "../dom";
import type { Game } from "../main";
import { createMap } from "../map";
import { formatPoints, hintCostText, locTile, rating, shareLines, totalPoints, yearTile } from "../score";
import { loadStats, recordResult } from "../storage";
import { formatDayLong, topbar, wikiButton } from "./common";
import { track } from "../track";
import { attachRanking } from "./ranking";

export function shareText(game: Game): string {
  const { challenge, state } = game;
  return shareLines(challenge.number, state.guesses, challenge.puzzles.length, CONFIG.siteUrl || location.origin + location.pathname);
}

export function renderSummary(game: Game): void {
  const { challenge, state } = game;
  const total = totalPoints(state.guesses);
  const max = challenge.puzzles.length * (CONFIG.maxLocationPoints + CONFIG.maxYearPoints);
  const anyHint = state.guesses.some((g) => g.hintLoc || g.hintYear);
  const stats = game.preview ? loadStats() : recordResult(challenge.key, total);
  const avg = stats.played ? Math.round(stats.total / stats.played) : 0;
  const sponsors = challenge.puzzles.filter((p) => p.sponsor);

  const app = mount(`
    ${topbar(`<div class="round-meta"><span>Wyzwanie #${challenge.number}</span></div>`)}
    <main class="summary">
      <section class="card hero-score">
        <p class="eyebrow">${esc(formatDayLong(challenge.key))}</p>
        <div class="total"><span class="total-n" id="total-n">0</span><span class="total-max">/ ${formatPoints(max)}</span></div>
        <p class="rating">${esc(rating(total, max))}</p>
        <div class="tiles" aria-label="Wyniki rund">
          <div><span>📍</span>${state.guesses.map((g) => `<i>${locTile(g)}</i>`).join("")}</div>
          <div><span>📅</span>${state.guesses.map((g) => `<i>${yearTile(g)}</i>`).join("")}</div>
        </div>
        ${anyHint ? `<p class="hint-note">💡 Z podpowiedzią (−${hintCostText()} pkt): ${state.guesses.map((g, i) => (g.hintLoc || g.hintYear ? `runda ${i + 1}` : "")).filter(Boolean).join(", ")}</p>` : ""}
        <button class="btn primary big" id="share">Udostępnij wynik</button>
        <p class="countdown">Następne wyzwanie za <b id="countdown">--:--:--</b></p>
      </section>

      <section class="card stats">
        <div><b>${stats.played}</b><span>rozegrane</span></div>
        <div><b>${stats.streak}</b><span>seria dni</span></div>
        <div><b>${stats.maxStreak}</b><span>najdłuższa seria</span></div>
        <div><b>${formatPoints(avg)}</b><span>średni wynik</span></div>
        <div><b>${formatPoints(stats.best)}</b><span>najlepszy</span></div>
      </section>

      <section class="card recap">
        <h2>Dzisiejsza trasa</h2>
        <p class="muted">Wszystkie te miejsca możesz odwiedzić. Może weekendowy wypad?</p>
        <div class="recap-map" id="recap-map"></div>
        <ol class="places">
          ${challenge.puzzles
            .map((p, i) => {
              const g = state.guesses[i];
              const pts = g ? g.locPts + g.yearPts : 0;
              const tags = [
                !g || g.gaveUp === "day" ? `<span class="tag">nierozegrana</span>` : g.gaveUp ? `<span class="tag">pominięta</span>` : "",
                g?.hintLoc ? `<span class="tag hint">💡 województwo</span>` : "",
                g?.hintYear ? `<span class="tag hint">💡 wiek</span>` : "",
              ].join("");
              return `<li class="place${p.sponsor ? " is-sponsored" : ""}">
                <span class="thumb"><img src="${esc(p.img)}" alt="" loading="lazy" onerror="this.remove()" /></span>
                <div class="place-body">
                  <b class="place-name">${esc(p.name)}</b>
                  <span class="muted">${p.place ? esc(p.place) + " · " : ""}${p.year}</span>
                  <span class="place-links">${wikiButton(p, true)}${tags}</span>
                  ${p.sponsor ? `<a class="partner-mini" href="${esc(partnerLink(p.sponsor.url, p.campaign ?? `podsumowanie-${challenge.key}`))}" target="_blank" rel="noopener sponsored">Sponsorowane · ${esc(p.sponsor.cta)} ↗</a>` : ""}
                </div>
                <span class="place-pts">${pts}</span>
              </li>`;
            })
            .join("")}
        </ol>
      </section>

      ${
        sponsors.length
          ? `<p class="partner-line center-text">Dzisiejsze wyzwanie współtworzy: ${sponsors.map((p) => `<b>${esc(p.sponsor!.name)}</b>`).join(", ")}. Dziękujemy!</p>`
          : ""
      }
      <footer class="foot">
        <a href="#" data-about>Jak grać</a> · <a href="#" data-about="partnerzy">Dla miast i regionów</a> · <a href="#" data-about="zrodla">Źródła i licencje</a>
      </footer>
    </main>`);

  attachRanking(game);

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

  $("#share", app).addEventListener("click", async () => {
    const text = shareText(game);
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast("Wynik skopiowany — wklej go znajomym!");
    } catch {
      toast("Nie udało się skopiować wyniku");
    }
  });

  app.querySelectorAll<HTMLAnchorElement>(".partner-mini").forEach((a, i) =>
    a.addEventListener("click", () => {
      if (!game.preview) track("sponsor_click", { day: challenge.key, campaign: sponsors[i]?.campaign ?? "", where: "podsumowanie" });
    }),
  );

  createMap($("#recap-map", app)).then((gm) => {
    gm.lock(true);
    gm.showMany(challenge.puzzles.map((p) => ({ lat: p.lat, lon: p.lon, label: p.name })));
  });
}
