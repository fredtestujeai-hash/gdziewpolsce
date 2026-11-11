import { CONFIG } from "../config";
import { msUntilNextChallenge } from "../daily";
import { $, esc, mount, partnerLink, toast } from "../dom";
import type { Game } from "../main";
import { createMap } from "../map";
import { formatPoints, rating, tile } from "../score";
import { loadStats, recordResult } from "../storage";
import { formatDayLong, topbar } from "./common";
import { track } from "../track";

export function shareText(game: Game): string {
  const { challenge, state } = game;
  const total = state.guesses.reduce((s, g) => s + g.locPts + g.yearPts, 0);
  const max = challenge.puzzles.length * (CONFIG.maxLocationPoints + CONFIG.maxYearPoints);
  const loc = state.guesses.map((g) => tile(g.locPts, CONFIG.maxLocationPoints)).join("");
  const yr = state.guesses.map((g) => tile(g.yearPts, CONFIG.maxYearPoints)).join("");
  const url = CONFIG.siteUrl || location.origin + location.pathname;
  return `${CONFIG.name} #${challenge.number} — ${formatPoints(total)}/${formatPoints(max)}\n📍 ${loc}\n📅 ${yr}\n${url}`;
}

export function renderSummary(game: Game): void {
  const { challenge, state } = game;
  const total = state.guesses.reduce((s, g) => s + g.locPts + g.yearPts, 0);
  const max = challenge.puzzles.length * (CONFIG.maxLocationPoints + CONFIG.maxYearPoints);
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
          <div><span>📍</span>${state.guesses.map((g) => `<i>${tile(g.locPts, CONFIG.maxLocationPoints)}</i>`).join("")}</div>
          <div><span>📅</span>${state.guesses.map((g) => `<i>${tile(g.yearPts, CONFIG.maxYearPoints)}</i>`).join("")}</div>
        </div>
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
              return `<li class="place${p.sponsor ? " is-sponsored" : ""}">
                <span class="thumb"><img src="${esc(p.img)}" alt="" loading="lazy" onerror="this.remove()" /></span>
                <div class="place-body">
                  <a href="${esc(p.wiki)}" target="_blank" rel="noopener"><b>${esc(p.name)}</b></a>
                  <span class="muted">${p.place ? esc(p.place) + " · " : ""}${p.year}</span>
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
