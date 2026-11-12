import { CONFIG } from "../config";
import { $, esc, mount, partnerLink } from "../dom";
import type { Game } from "../main";
import { createMap, type GameMap } from "../map";
import { century, centuryRange, formatKm, formatPoints, hintCostText, scoreRound, totalPoints, yearsWord } from "../score";
import type { Guess, Puzzle } from "../types";
import { topbar, wikiButton } from "./common";
import { track } from "../track";

const TICKS = [1000, 1200, 1400, 1600, 1800, 2000];

export async function renderRound(game: Game): Promise<void> {
  const { challenge, state } = game;
  const n = challenge.puzzles.length;
  const span = CONFIG.maxYear - CONFIG.minYear;

  const app = mount(`
    ${topbar(`<div class="round-meta"><span id="round-label"></span><span class="dots" id="dots"></span><span id="score-label"></span></div>`)}
    <main class="game" id="game">
      <section class="photo-pane">
        <figure class="photo" id="photo">
          <div class="photo-skeleton" aria-hidden="true"></div>
          <img id="photo-img" alt="Zdjęcie miejsca do odgadnięcia" decoding="async" />
          <span class="badge-sponsored" id="badge-sponsored" hidden>Zagadka sponsorowana</span>
          <button class="photo-zoom" id="photo-zoom" aria-label="Powiększ zdjęcie">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>
          </button>
          <figcaption class="photo-credit" id="photo-credit"></figcaption>
        </figure>
      </section>

      <section class="map-pane">
        <div class="map-wrap"><div id="map" class="map" aria-label="Mapa Polski — kliknij, aby wbić pinezkę"></div>
          <p class="map-hint" id="map-hint">Wskaż miejsce na mapie — możesz przybliżyć aż do ulic</p>
          <ul class="map-legend" aria-label="Legenda: miejscowości bez nazw">
            <li><i class="lg lg-1"></i>wojewódzkie</li>
            <li><i class="lg lg-2"></i>powiatowe</li>
            <li><i class="lg lg-3"></i>gminne</li>
          </ul>
        </div>

        <div class="controls" id="controls">
          <div class="hints" aria-label="Podpowiedzi (obniżają punkty)">
            <button class="hint-btn" id="hint-loc" type="button"></button>
            <button class="hint-btn" id="hint-year" type="button"></button>
          </div>
          <div class="year">
            <div class="year-top">
              <label for="year-range">Rok powstania</label>
              <div class="year-readout">
                <input id="year-input" class="year-input" type="number" inputmode="numeric" min="${CONFIG.minYear}" max="${CONFIG.maxYear}" aria-label="Rok powstania" />
                <span class="century" id="century"></span>
              </div>
            </div>
            <div class="year-row">
              <button class="step-btn" data-step="-1" aria-label="Rok wcześniej (z Shift: 10 lat)">−</button>
              <div class="range-wrap">
<div class="hint-band-wrap" aria-hidden="true"><div class="hint-band" id="hint-band" hidden></div></div>
                <input id="year-range" type="range" min="${CONFIG.minYear}" max="${CONFIG.maxYear}" step="1" />
                <div class="ticks" aria-hidden="true">${TICKS.map((t) => `<span style="left:${((t - CONFIG.minYear) / span) * 100}%">${t}</span>`).join("")}</div>
              </div>
              <button class="step-btn" data-step="1" aria-label="Rok później (z Shift: 10 lat)">+</button>
            </div>
          </div>
          <div class="submit-row">
            <button class="btn secondary giveup-btn" id="giveup-open" type="button">Rezygnuję</button>
            <button class="btn primary submit" id="submit" disabled>Wbij pinezkę na mapie</button>
          </div>
        </div>

        <div class="result" id="result" hidden></div>
      </section>
    </main>

    <dialog class="giveup" id="giveup" aria-labelledby="giveup-title">
      <div class="giveup-body">
        <h2 id="giveup-title">Rezygnujesz?</h2>
        <button class="choice" data-act="skip" type="button">
          <b>Pomiń tę zagadkę</b>
          <span>0 punktów za tę rundę. Zobaczysz poprawną odpowiedź i zagrasz dalej.</span>
        </button>
        <button class="choice danger" data-act="quit" type="button">
          <b>Przerwij dzisiejsze wyzwanie</b>
          <span id="giveup-quit-text"></span>
        </button>
        <button class="btn primary" data-act="stay" type="button">Gram dalej</button>
      </div>
    </dialog>

    <dialog class="lightbox" id="lightbox" aria-label="Powiększone zdjęcie">
      <img id="lightbox-img" alt="" />
      <button class="icon-btn lightbox-close" aria-label="Zamknij">✕</button>
    </dialog>`);

  const els = {
    game: $("#game", app),
    img: $("#photo-img", app) as HTMLImageElement,
    photo: $("#photo", app),
    credit: $("#photo-credit", app),
    badge: $("#badge-sponsored", app),
    range: $("#year-range", app) as HTMLInputElement,
    yearInput: $("#year-input", app) as HTMLInputElement,
    century: $("#century", app),
    submit: $("#submit", app) as HTMLButtonElement,
    hintLoc: $("#hint-loc", app) as HTMLButtonElement,
    hintYear: $("#hint-year", app) as HTMLButtonElement,
    hintBand: $("#hint-band", app),
    giveup: $("#giveup", app) as HTMLDialogElement,
    giveupQuitText: $("#giveup-quit-text", app),
    controls: $("#controls", app),
    result: $("#result", app),
    hint: $("#map-hint", app),
    roundLabel: $("#round-label", app),
    scoreLabel: $("#score-label", app),
    dots: $("#dots", app),
    lightbox: $("#lightbox", app) as HTMLDialogElement,
    lightboxImg: $("#lightbox-img", app) as HTMLImageElement,
  };

  const gm: GameMap = await createMap($("#map", app));
  let index = state.guesses.length;
  let revealed = false;

  // --- rok ---------------------------------------------------------------
  const clampYear = (y: number) => Math.max(CONFIG.minYear, Math.min(CONFIG.maxYear, Math.round(y)));
  function setYear(y: number) {
    const v = clampYear(y);
    els.range.value = String(v);
    els.yearInput.value = String(v);
    els.century.textContent = century(v);
    els.range.style.setProperty("--fill", `${((v - CONFIG.minYear) / span) * 100}%`);
  }
  const year = () => clampYear(Number(els.range.value));
  els.range.addEventListener("input", () => setYear(Number(els.range.value)));
  els.yearInput.addEventListener("change", () => setYear(Number(els.yearInput.value) || CONFIG.defaultYear));
  app.querySelectorAll<HTMLButtonElement>("[data-step]").forEach((b) =>
    b.addEventListener("click", (e) => setYear(year() + Number(b.dataset.step) * ((e as MouseEvent).shiftKey ? 10 : 1))),
  );

  // --- pinezka -----------------------------------------------------------
  gm.onPlace(() => {
    if (revealed) return;
    els.submit.disabled = false;
    els.submit.textContent = "Sprawdź";
    els.hint.classList.add("gone");
  });

  // --- zdjęcie -----------------------------------------------------------
  els.img.addEventListener("load", () => els.photo.classList.add("loaded"));
  els.img.addEventListener("error", () => {
    els.photo.classList.add("error");
    els.credit.textContent = "Nie udało się wczytać zdjęcia — odśwież stronę.";
  });
  const openLightbox = () => {
    els.lightboxImg.src = els.img.src;
    els.lightbox.showModal();
  };
  $("#photo-zoom", app).addEventListener("click", openLightbox);
  els.img.addEventListener("click", openLightbox);
  els.lightbox.addEventListener("click", () => els.lightbox.close());

  // --- podpowiedzi ---------------------------------------------------------
  // Użyte podpowiedzi trzymamy w zapisie dnia, więc odświeżenie strony ich nie cofa.
  const hints = () => (state.hints?.round === index ? state.hints : { round: index });
  const cost = hintCostText();
  function renderHints() {
    const p = challenge.puzzles[index];
    const h = hints();
    els.hintLoc.hidden = !p.woj;
    els.hintLoc.disabled = !!h.loc;
    els.hintLoc.classList.toggle("used", !!h.loc);
    els.hintLoc.innerHTML = h.loc
      ? `<b>${esc(p.woj)}</b><span>województwo · −${cost} pkt za miejsce</span>`
      : `<b>💡 Województwo</b><span>kosztuje ${cost} pkt za miejsce</span>`;
    const c = centuryRange(p.year);
    els.hintYear.disabled = !!h.year;
    els.hintYear.classList.toggle("used", !!h.year);
    els.hintYear.innerHTML = h.year
      ? `<b>${c.label} (${c.from}–${c.to})</b><span>−${cost} pkt za rok</span>`
      : `<b>💡 Wiek</b><span>kosztuje ${cost} pkt za rok</span>`;
    const from = Math.max(c.from, CONFIG.minYear);
    const to = Math.min(c.to, CONFIG.maxYear);
    els.hintBand.hidden = !h.year;
    els.hintBand.style.left = `${((from - CONFIG.minYear) / span) * 100}%`;
    els.hintBand.style.width = `${((to - from) / span) * 100}%`;
    if (h.year && (year() < from || year() > to)) setYear(Math.round((from + to) / 2));
  }
  function useHint(kind: "loc" | "year") {
    if (revealed || hints()[kind]) return;
    state.hints = { ...hints(), [kind]: true };
    game.save();
    renderHints();
    if (kind === "loc") void gm.highlightRegion(challenge.puzzles[index].woj ?? "");
  }
  els.hintLoc.addEventListener("click", () => useHint("loc"));
  els.hintYear.addEventListener("click", () => useHint("year"));

  function header() {
    const total = totalPoints(state.guesses);
    els.roundLabel.textContent = `${Math.min(index + 1, n)}/${n}`;
    els.scoreLabel.textContent = `${formatPoints(total)} pkt`;
    els.dots.innerHTML = challenge.puzzles
      .map((_, i) => {
        const g = state.guesses[i];
        const cls = g ? ((g.locPts + g.yearPts) / 1000 >= 0.8 ? "good" : (g.locPts + g.yearPts) / 1000 >= 0.4 ? "mid" : "bad") : i === index ? "now" : "";
        return `<i class="${cls}"></i>`;
      })
      .join("");
  }

  function showRound(i: number) {
    const p = challenge.puzzles[i];
    revealed = false;
    els.game.classList.remove("revealed");
    els.photo.classList.remove("loaded", "error");
    els.img.src = p.img;
    els.photo.style.setProperty("--ratio", `${p.imgW} / ${p.imgH}`);
    // Atrybucja widoczna od razu (wymóg licencji CC BY), bez linku do pliku — jego nazwa zdradzałaby odpowiedź
    els.credit.textContent = `Fot. ${p.author} · ${p.license}`;
    els.badge.hidden = !p.sponsor;
    if (i === 0 && !state.guesses.length && !game.preview) track("start", { day: challenge.key });
    if (p.sponsor && !game.preview) track("sponsor_view", { day: challenge.key, campaign: p.campaign ?? "" });
    els.controls.hidden = false;
    els.result.hidden = true;
    els.result.innerHTML = "";
    els.submit.disabled = true;
    els.submit.textContent = "Wbij pinezkę na mapie";
    els.hint.classList.toggle("gone", i > 0);
    setYear(CONFIG.defaultYear);
    gm.reset();
    gm.lock(false);
    renderHints();
    if (hints().loc && p.woj) void gm.highlightRegion(p.woj);
    header();
    requestAnimationFrame(() => gm.invalidate());
    const next = challenge.puzzles[i + 1];
    if (next) new Image().src = next.img; // wczytaj z wyprzedzeniem
  }

  /** Wynik rundy, z której gracz zrezygnował: 0 punktów, bez pinezki i roku. */
  function gaveUpGuess(kind: "round" | "day", h: { loc?: boolean; year?: boolean } = {}): Guess {
    const g: Guess = { lat: 0, lon: 0, year: 0, km: 0, yearDiff: 0, locPts: 0, yearPts: 0, gaveUp: kind };
    if (h.loc) g.hintLoc = true;
    if (h.year) g.hintYear = true;
    return g;
  }

  function submit() {
    const pos = gm.getGuess();
    if (!pos || revealed) return;
    const p = challenge.puzzles[index];
    const h = hints();
    const answer: Pick<Guess, "lat" | "lon" | "year" | "hintLoc" | "hintYear"> = { lat: pos.lat, lon: pos.lng, year: year() };
    if (h.loc) answer.hintLoc = true;
    if (h.year) answer.hintYear = true;
    finishRound({ ...answer, ...scoreRound(p, answer) });
  }

  /** „Pomiń tę zagadkę”: 0 punktów, mapa leci do celu, zwykła karta wyniku. */
  function skip() {
    if (revealed) return;
    finishRound(gaveUpGuess("round", hints()));
  }

  /** „Przerwij dzisiejsze wyzwanie”: ta i następne zagadki są nierozegrane (0 pkt), dopóki gracz nie wróci z podsumowania. */
  function quit() {
    if (revealed) return;
    for (let i = index; i < n; i++) state.guesses[i] = gaveUpGuess("day", i === index ? hints() : {});
    delete state.hints;
    game.save();
    if (!game.preview) track("finish", { day: challenge.key, score: totalPoints(state.guesses) });
    game.go("summary");
  }

  function finishRound(g: Guess) {
    const p = challenge.puzzles[index];
    state.guesses[index] = g;
    delete state.hints;
    game.save();
    revealed = true;
    gm.lock(true);
    els.game.classList.add("revealed");
    els.controls.hidden = true;
    els.hint.classList.add("gone");
    gm.clearRegion();
    els.result.innerHTML = resultCard(p, g, index === n - 1, challenge.key);
    els.result.hidden = false;
    $(".result-scroll", els.result).scrollTop = 0;
    header();
    setTimeout(() => {
      gm.invalidate();
      gm.reveal({ lat: p.lat, lon: p.lon }, g.gaveUp ? null : { lat: g.lat, lon: g.lon });
    }, 60);
    $("#next", els.result).addEventListener("click", next);
    els.result.querySelector(".partner a")?.addEventListener("click", () => {
      if (!game.preview) track("sponsor_click", { day: challenge.key, campaign: p.campaign ?? "", where: "runda" });
    });
    ($("#next", els.result) as HTMLButtonElement).focus({ preventScroll: true });
  }

  function next() {
    index += 1;
    if (index >= n) {
      if (!game.preview) track("finish", { day: challenge.key, score: totalPoints(state.guesses) });
      game.go("summary");
    }
    else showRound(index);
  }

  els.submit.addEventListener("click", submit);

  // --- rezygnacja ----------------------------------------------------------
  $("#giveup-open", app).addEventListener("click", () => {
    const left = n - index - 1;
    els.giveupQuitText.textContent =
      (left > 0
        ? `Zobaczysz podsumowanie, a ta zagadka i ${left === 1 ? "następna" : `${left} następne`} zostaną nierozegrane. `
        : "Zobaczysz podsumowanie, a ta zagadka zostanie nierozegrana. ") +
      "Do północy możesz wrócić i dokończyć grę. Niedokończone wyzwanie przerywa Twoją serię.";
    els.giveup.showModal();
  });
  els.giveup.addEventListener("click", (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
    if (!act && e.target !== els.giveup) return; // klik w tło zamyka jak „Gram dalej”
    els.giveup.close();
    if (act === "skip") skip();
    else if (act === "quit") quit();
  });
  const onKey = (e: KeyboardEvent) => {
    if (!document.body.contains(els.game)) return document.removeEventListener("keydown", onKey);
    if (e.key !== "Enter" || els.lightbox.open || document.querySelector("dialog[open]")) return;
    if ((e.target as HTMLElement).tagName === "BUTTON") return; // przycisk obsłuży się sam
    if (revealed) next();
    else if (!els.submit.disabled) submit();
  };
  document.addEventListener("keydown", onKey);

  showRound(index);
}

function resultCard(p: Puzzle, g: Guess, last: boolean, key: string): string {
  const diff = g.yearDiff;
  const yearText =
    diff === 0 ? "co do roku!" : `${Math.abs(diff)} ${yearsWord(diff)} ${diff > 0 ? "za późno" : "za wcześnie"}`;
  const s = p.sponsor;
  const hintTag = (used?: boolean) => (used ? `<em class="hint-tag">💡 podpowiedź −${hintCostText()}</em>` : "");
  return `
    <div class="result-scroll">
      <div class="result-head">
        <span class="cat">${esc(p.category)}</span>
        <h2>${esc(p.name)}</h2>
        <p class="where">${p.place ? `${esc(p.place)} · ` : ""}<b>${p.year}</b> <span class="muted">(${century(p.year)})</span></p>
      </div>
      <div class="score-row">
        <div class="chip"><span class="lbl">📍 Miejsce${hintTag(g.hintLoc)}</span><b>+${g.locPts}</b><span>${g.gaveUp ? "zagadka pominięta" : `${formatKm(g.km)} od celu`}</span></div>
        <div class="chip"><span class="lbl">📅 Rok${hintTag(g.hintYear)}</span><b>+${g.yearPts}</b><span>${g.gaveUp ? "zagadka pominięta" : `${g.year} · ${yearText}`}</span></div>
      </div>
      ${
        s
          ? `<aside class="partner">
              <span class="partner-label">Zagadka sponsorowana</span>
              ${s.logo ? `<img src="${esc(import.meta.env.BASE_URL + s.logo)}" alt="" class="partner-logo" />` : ""}
              <p><b>${esc(s.name)}</b>${p.sponsorNote ? ` — ${esc(p.sponsorNote)}` : ""}</p>
              <a class="btn secondary" href="${esc(partnerLink(s.url, p.campaign ?? `wyzwanie-${key}`))}" target="_blank" rel="noopener sponsored">${esc(s.cta)} ↗</a>
            </aside>`
          : ""
      }
      ${p.extract ? `<p class="extract">${esc(p.extract)}</p>` : ""}
      <p class="credit-full">Zdjęcie: ${
        p.filePage ? `<a href="${esc(p.filePage)}" target="_blank" rel="noopener">${esc(p.author)}</a>` : esc(p.author)
      }, ${p.licenseUrl ? `<a href="${esc(p.licenseUrl)}" target="_blank" rel="noopener license">${esc(p.license)}</a>` : esc(p.license)}</p>
    </div>
    <div class="result-actions">
      ${wikiButton(p)}
      <button class="btn primary next" id="next">${last ? "Zobacz wynik" : "Następne miejsce →"}</button>
    </div>`;
}
