// Ranking (dzień, tydzień, miesiąc, rok): karta w podsumowaniu i podgląd z ekranu startowego.
// Jeśli serwer rankingu nie odpowiada, nic się nie pokazuje, a gra działa jak zwykle.
import "../ranking.css";
import { esc, toast } from "../dom";
import { EN, tr } from "../i18n";
import type { Game } from "../main";
import { deleteMyEntries, fetchRanking, loadIdentity, rankingEnabled, submitScore } from "../ranking";
import { NICK_MAX, PERIODS, validateNick, type Period, type RankingData, type RankingEntry } from "../ranking-core";
import { formatPoints } from "../score";

function playersWord(n: number): string {
  if (EN) return n === 1 ? "player" : "players";
  if (n === 1) return "gracz";
  const u = n % 10;
  const t = n % 100;
  return u >= 2 && u <= 4 && !(t >= 12 && t <= 14) ? "gracze" : "graczy";
}

const daysWord = (n: number) => (EN ? (n === 1 ? "day" : "days") : n === 1 ? "dzień" : "dni");

const PERIOD_LABEL: Record<Period, string> = EN ? { day: "Today", week: "Week", month: "Month", year: "Year" } : { day: "Dziś", week: "Tydzień", month: "Miesiąc", year: "Rok" };
const PERIOD_NOTE: Record<Period, string> = {
  day: "",
  week: tr("Suma punktów od poniedziałku do niedzieli.", "Total points from Monday to Sunday."),
  month: tr("Suma punktów z tego miesiąca.", "Total points this month."),
  year: tr("Suma punktów z tego roku.", "Total points this year."),
};

function tabsMarkup(active: Period): string {
  return `<div class="rank-tabs" role="tablist" aria-label="${tr("Okres rankingu", "Leaderboard period")}">${PERIODS.map(
    (p) => `<button type="button" role="tab" class="rank-tab${p === active ? " is-active" : ""}" aria-selected="${p === active}" data-period="${p}">${PERIOD_LABEL[p]}</button>`,
  ).join("")}</div>`;
}

/** Przełączanie zakładek: pobiera ranking wybranego okresu i oddaje go do narysowania. */
function bindTabs(root: HTMLElement, day: string, show: (data: RankingData) => void): void {
  root.querySelectorAll<HTMLButtonElement>(".rank-tab").forEach((b) =>
    b.addEventListener("click", async () => {
      if (b.classList.contains("is-active")) return;
      b.disabled = true;
      const data = await fetchRanking(day, b.dataset.period as Period);
      if (data) show(data);
      else {
        b.disabled = false;
        toast(tr("Nie udało się wczytać rankingu", "The leaderboard could not load"));
      }
    }),
  );
}

const mineMarkup = (data: RankingData) => (data.me ? `<p class="rank-mine">${tr("Twoje miejsce", "Your place")}: <b>${data.me.rank}</b> ${tr("z", "of")} ${data.total}</p>` : "");

function row(e: RankingEntry): string {
  const days = e.days ? ` <span class="rank-days">${e.days} ${daysWord(e.days)}</span>` : "";
  return `<li class="rank-row${e.me ? " is-me" : ""}"><span class="rank-n">${e.rank}</span><span class="rank-nick">${esc(e.nick)}${e.me ? ` <i class="rank-you">${tr("Ty", "You")}</i>` : ""}${days}</span><span class="rank-pts">${formatPoints(e.score)}</span></li>`;
}

function listMarkup(data: RankingData): string {
  if (!data.top.length) return `<p class="muted rank-empty">${tr("Jeszcze nikogo tu nie ma. Pierwsze miejsce czeka!", "Nobody here yet. First place is waiting!")}</p>`;
  const outside = data.me && !data.top.some((e) => e.me) ? `<li class="rank-gap" aria-hidden="true">⋯</li>${row(data.me)}` : "";
  return `<ol class="rank-list">${data.top.map(row).join("")}${outside}</ol>
    <p class="muted small rank-total">${tr("W rankingu", "On the leaderboard")}: ${data.total} ${playersWord(data.total)}${PERIOD_NOTE[data.period ?? "day"] ? " · " + PERIOD_NOTE[data.period ?? "day"] : ""}</p>`;
}

/** Karta rankingu pod wynikiem dnia. Wywoływana raz z ekranu podsumowania. */
export function attachRanking(game: Game): void {
  if (!rankingEnabled()) return;
  const anchor = document.querySelector(".summary .hero-score");
  if (!anchor) return;
  const card = document.createElement("section");
  card.className = "card ranking";
  card.hidden = true;
  anchor.after(card);

  const demo = new URLSearchParams(location.search).has("demo");
  // wyzwanie przerwane (do którego można jeszcze wrócić) nie trafia do rankingu
  const finished = game.state.guesses.length >= game.challenge.puzzles.length && !game.state.guesses.some((g) => g.gaveUp === "day");
  const canJoin = !game.preview && !demo && finished;

  const render = (data: RankingData, error = "") => {
    if (!card.isConnected) return;
    const id = loadIdentity();
    const period = data.period ?? "day";
    const join =
      canJoin && !data.me && period === "day"
        ? `<form class="rank-join" novalidate>
            <label for="rank-nick">${tr("Dołącz do rankingu", "Join the leaderboard")}</label>
            <div class="rank-join-row">
              <input id="rank-nick" name="nick" type="text" maxlength="${NICK_MAX}" autocomplete="nickname" placeholder="${tr("Twój nick", "Your nickname")}" value="${esc(id?.nick ?? "")}" />
              <button class="btn primary" type="submit">${tr("Dołącz", "Join")}</button>
            </div>
            <p class="rank-error" role="alert">${esc(error)}</p>
            <p class="muted small">${tr("Udział jest dobrowolny. Na serwer trafią: nick, Twoje dzisiejsze odpowiedzi (z nich liczony jest wynik) i losowy identyfikator tej przeglądarki.", "Joining is optional. The server receives your nickname, today's answers (the score is computed from them) and a random identifier of this browser.")} <a href="#" data-about="prywatnosc">${tr("Więcej", "More")}</a></p>
          </form>`
        : "";
    const remove = id ? `<p class="small rank-remove"><a href="#" data-rank-remove>${tr("Usuń moje wpisy z rankingu", "Remove my leaderboard entries")}</a></p>` : "";
    card.innerHTML = `<h2>${tr("Ranking", "Leaderboard")}</h2>${tabsMarkup(period)}${mineMarkup(data)}${listMarkup(data)}${join}${remove}`;
    card.hidden = false;
    bindTabs(card, game.challenge.key, (d) => render(d));

    card.querySelector<HTMLFormElement>(".rank-join")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.currentTarget as HTMLFormElement;
      const input = form.querySelector<HTMLInputElement>("input")!;
      const btn = form.querySelector<HTMLButtonElement>("button")!;
      const nick = validateNick(input.value);
      if (!nick.ok) return render(data, nick.error);
      btn.disabled = true;
      const res = await submitScore(game.state, nick.nick);
      if (res.ok) {
        render(res.data);
        toast(res.data.me ? tr(`Jesteś w rankingu: miejsce ${res.data.me.rank}`, `You are on the leaderboard: place ${res.data.me.rank}`) : tr("Wynik z tego urządzenia był już dziś zgłoszony", "A score from this device was already submitted today"));
      } else render(data, res.error);
    });

    card.querySelector("[data-rank-remove]")?.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!confirm(tr("Usunąć z rankingu wszystkie wpisy z tej przeglądarki?", "Remove all leaderboard entries made from this browser?"))) return;
      if (await deleteMyEntries()) {
        toast(tr("Twoje wpisy zostały usunięte", "Your entries have been removed"));
        const fresh = await fetchRanking(game.challenge.key, period);
        if (fresh) render(fresh);
      } else toast(tr("Nie udało się usunąć wpisów. Spróbuj ponownie.", "The entries could not be removed. Please try again."));
    });
  };

  fetchRanking(game.challenge.key).then((data) => {
    if (data) render(data);
    else card.remove();
  });
}

function openRankingDialog(day: string, first: RankingData): void {
  document.querySelector("dialog.about")?.remove();
  const d = document.createElement("dialog");
  d.className = "about ranking-dialog";
  d.setAttribute("aria-label", tr("Ranking", "Leaderboard"));
  const show = (data: RankingData) => {
    const period = data.period ?? "day";
    d.innerHTML = `<div class="about-body">
      <button class="icon-btn about-close" aria-label="${tr("Zamknij", "Close")}">✕</button>
      <h2>${tr("Ranking", "Leaderboard")}</h2>
      ${tabsMarkup(period)}
      ${mineMarkup(data)}
      ${listMarkup(data)}
      ${data.me || period !== "day" ? "" : `<p class="muted small">${tr("Do rankingu możesz dołączyć po ukończeniu dzisiejszego wyzwania.", "You can join the leaderboard after finishing today's challenge.")}</p>`}
    </div>`;
    bindTabs(d, day, show);
  };
  show(first);
  document.body.append(d);
  d.addEventListener("click", (e) => {
    if (e.target === d || (e.target as HTMLElement).closest(".about-close")) d.close();
  });
  d.addEventListener("close", () => d.remove());
  d.showModal();
}

/** Link „Ranking” na ekranie startowym (pojawia się tylko, gdy serwer rankingu działa). */
export function attachRankingLink(game: Game): void {
  if (!rankingEnabled() || game.preview) return;
  const hero = document.querySelector(".start .hero");
  if (!hero) return;
  fetchRanking(game.challenge.key).then((data) => {
    if (!data || !hero.isConnected) return;
    const p = document.createElement("p");
    p.className = "fineprint rank-link";
    p.innerHTML = `<a href="#">🏆 ${tr("Ranking", "Leaderboard")}</a>${data.total ? ` · ${tr("dziś", "today")} ${data.total} ${playersWord(data.total)}` : ""}`;
    p.querySelector("a")!.addEventListener("click", async (e) => {
      e.preventDefault();
      openRankingDialog(game.challenge.key, (await fetchRanking(game.challenge.key)) ?? data);
    });
    hero.append(p);
  });
}
