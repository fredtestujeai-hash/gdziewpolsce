import { CONFIG } from "../config";
import { esc } from "../dom";
import { EN, LOCALE, tr } from "../i18n";
import { hintCostText, locationPoints, placesWord, yearPoints } from "../score";

export function openAbout(section?: string): void {
  document.querySelector("dialog.about")?.remove();
  const d = document.createElement("dialog");
  d.className = "about";
  d.setAttribute("aria-label", tr("O grze", "About the game"));
  const ex = (km: number) => `${km} km → ${locationPoints(km)} ${tr("pkt", "pts")}`;
  const ey = (y: number) => `${y} ${tr("lat", "years")} → ${yearPoints(y)} ${tr("pkt", "pts")}`;
  d.innerHTML = EN ? `
    <div class="about-body">
      <button class="icon-btn about-close" aria-label="Close">✕</button>
      <h2>How to play</h2>
      <p>A new challenge is waiting every day at midnight Polish time: <b>${CONFIG.rounds} ${placesWord(CONFIG.rounds)} from all over Poland</b> — castles, churches, town halls, lighthouses, railway stations, skyscrapers… The puzzles get harder as you go: easy first, then medium, then hard. Everyone gets the same challenge and you can play it only once.</p>
      <ol>
        <li>Look at the photo (you can enlarge it).</li>
        <li>Drop a pin on the map. The map has <b>no names at all</b>, but it shows rivers, lakes, forests, roads and railways, and the dots mark regional capitals, county towns and municipal seats. You can zoom in down to single streets and buildings, and move the pin.</li>
        <li>Set the year the place was built on the slider and click <b>Check</b>.</li>
      </ol>
      <p class="small">The game is hard, especially if you do not live in Poland: half of the points is a very good score.</p>
      <h3>Scoring</h3>
      <p>Each place gives up to <b>${CONFIG.maxLocationPoints}</b> points for the location and up to <b>${CONFIG.maxYearPoints}</b> for the year — at most ${(CONFIG.rounds * (CONFIG.maxLocationPoints + CONFIG.maxYearPoints)).toLocaleString(LOCALE)} points a day.</p>
      <p class="muted small">Location: ${[ex(2), ex(25), ex(50), ex(100), ex(200)].join(" · ")}<br/>Year: ${[ey(0), ey(10), ey(25), ey(50), ey(100)].join(" · ")}</p>

      <h3>Hints</h3>
      <p>You can take two hints in every round. Each costs <b>${hintCostText()}</b> of the points for the part of the round it helps with:</p>
      <ul>
        <li><b>Region</b> — you learn the name of the voivodeship (one of Poland's 16 regions) and its area lights up on the map. Location points in this round are ${hintCostText()} lower.</li>
        <li><b>Century</b> — you learn the century, e.g. “14th century (1301–1400)”, also marked on the slider. Year points in this round are ${hintCostText()} lower.</li>
      </ul>
      <p class="small">Hints you used are marked in the round result, in the summary and in the score you share (💡).</p>

      <h3>Giving up</h3>
      <p>The <b>Give up</b> button lets you <b>skip a puzzle</b> (0 points, you will see the correct answer) or <b>stop today's challenge</b>. You can return to a stopped game until midnight (the “Back to the game” button in the summary); puzzles you do not play score 0 points and their answers stay hidden until you decide not to come back. <b>A challenge left unfinished at the end of the day breaks your streak.</b> After every puzzle, skipped ones included, you get a link to Wikipedia.</p>

      <h3 id="about-partnerzy">For cities and regions</h3>
      <p>The game has <b>no ads</b>. It is supported by partners — local governments, tourism organisations and cultural institutions — whose places appear as <b>sponsored puzzles</b>. Every such puzzle is clearly labelled, and after answering the player gets a short invitation to visit and a link to the partner's website.</p>
      ${CONFIG.partnerEmail ? `<p><a class="btn secondary" href="mailto:${esc(CONFIG.partnerEmail)}?subject=${encodeURIComponent("Partnership — " + CONFIG.name)}">Write to us</a></p>` : ""}

      <h3 id="about-zrodla">Sources and licences</h3>
      <ul class="small">
        <li>Descriptions and dates: <a href="https://www.wikidata.org" target="_blank" rel="noopener">Wikidata</a> (CC0) and <a href="https://en.wikipedia.org" target="_blank" rel="noopener">Wikipedia</a> (CC BY-SA 4.0).</li>
        <li>Photos: <a href="https://commons.wikimedia.org" target="_blank" rel="noopener">Wikimedia Commons</a> — the author and licence are given with every photo.</li>
        <li>Map: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors, tiles by <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> / <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a>; towns: Wikidata; country outline and fallback map: <a href="https://www.naturalearthdata.com" target="_blank" rel="noopener">Natural Earth</a>.</li>
      </ul>
      <p class="small">Dates come from open databases and can be a matter of convention (for example the start of construction or the first mention). Where a place has no English Wikipedia article, the game shows its Polish name and links to the Polish article. Spotted a mistake? Fix it in Wikidata — everyone benefits.</p>

      <h3 id="about-prywatnosc">Privacy</h3>
      <p class="small">No accounts, no cookies, no tracking. Your scores and streak are stored in this browser.</p>
      <p class="small"><b>We count games, not people.</b> The game only counts how many times the daily challenge was started and finished, how the scores were distributed (hence “better than X% of players”), how many times a score was shared, and how many times a sponsored puzzle was shown and clicked. These are daily totals only: no identifiers, no IP addresses, no profiles.</p>
      <p class="small"><b>The leaderboard is optional.</b> If you join it after finishing a challenge, the game server receives your nickname, today's answers (the score is computed from them) and a random identifier of this browser, which ensures one score per device per day. Your nickname and score are visible to everyone. We do not store your IP address or any other data. You can remove your entries at any time with the “Remove my leaderboard entries” link under the leaderboard${CONFIG.partnerEmail ? `, or write to <a href="mailto:${esc(CONFIG.partnerEmail)}">${esc(CONFIG.partnerEmail)}</a>` : ""}.</p>
    </div>` : `
    <div class="about-body">
      <button class="icon-btn about-close" aria-label="Zamknij">✕</button>
      <h2>Jak grać</h2>
      <p>Codziennie o północy czeka nowe wyzwanie: <b>${CONFIG.rounds} ${placesWord(CONFIG.rounds)} z całej Polski</b> — zamki, kościoły, ratusze, latarnie, dworce, wieżowce… Zagadki są coraz trudniejsze: najpierw łatwe, potem średnie, na końcu trudne. Wyzwanie jest takie samo dla wszystkich graczy i można je rozegrać tylko raz.</p>
      <ol>
        <li>Obejrzyj zdjęcie (możesz je powiększyć).</li>
        <li>Wbij pinezkę na mapie. Mapa nie ma <b>żadnych nazw</b>, ale pokazuje rzeki, jeziora, lasy, drogi i tory, a kropki oznaczają miasta wojewódzkie, powiatowe i siedziby gmin. Możesz ją przybliżyć aż do pojedynczych ulic i budynków, a pinezkę przesuwać.</li>
        <li>Ustaw na suwaku rok powstania obiektu i kliknij <b>Sprawdź</b>.</li>
      </ol>
      <h3>Punktacja</h3>
      <p>Za każde miejsce do <b>${CONFIG.maxLocationPoints}</b> pkt za lokalizację i do <b>${CONFIG.maxYearPoints}</b> pkt za rok — razem maks. ${(CONFIG.rounds * (CONFIG.maxLocationPoints + CONFIG.maxYearPoints)).toLocaleString("pl-PL")} pkt dziennie.</p>
      <p class="muted small">Lokalizacja: ${[ex(2), ex(25), ex(50), ex(100), ex(200)].join(" · ")}<br/>Rok: ${[ey(0), ey(10), ey(25), ey(50), ey(100)].join(" · ")}</p>

      <h3>Podpowiedzi</h3>
      <p>W każdej rundzie możesz wziąć dwie podpowiedzi. Każda kosztuje <b>${hintCostText()}</b> punktów z tej części rundy, której dotyczy:</p>
      <ul>
        <li><b>Województwo</b> — poznajesz nazwę województwa, a jego obszar podświetla się na mapie. Punkty za miejsce w tej rundzie są niższe o ${hintCostText()}.</li>
        <li><b>Wiek</b> — poznajesz stulecie, np. „XIV wiek (1301–1400)”, zaznaczone też na suwaku. Punkty za rok w tej rundzie są niższe o ${hintCostText()}.</li>
      </ul>
      <p class="small">Użyte podpowiedzi są zaznaczone w wyniku rundy, w podsumowaniu i w udostępnianym wyniku (💡).</p>

      <h3>Rezygnacja</h3>
      <p>Przycisk <b>Rezygnuję</b> pozwala <b>pominąć zagadkę</b> (0 punktów, zobaczysz poprawną odpowiedź) albo <b>przerwać dzisiejsze wyzwanie</b>. Do przerwanej gry możesz wrócić do północy (przycisk „Wróć do gry” w podsumowaniu); zagadki, których nie rozegrasz, dostają 0 punktów, a ich odpowiedzi zobaczysz dopiero, gdy zrezygnujesz z powrotu. <b>Wyzwanie niedokończone do końca doby przerywa serię dni.</b> Po każdej zagadce, także pominiętej, dostajesz link do Wikipedii.</p>

      <h3 id="about-partnerzy">Dla miast i regionów</h3>
      <p>Gra jest <b>bez reklam</b>. Utrzymują ją partnerzy — samorządy, lokalne organizacje turystyczne i instytucje kultury — których miejsca pojawiają się jako <b>zagadki sponsorowane</b>. Każda taka zagadka jest wyraźnie oznaczona, a po odpowiedzi gracz dostaje krótką zachętę do odwiedzin i link do strony partnera.</p>
      ${CONFIG.partnerEmail ? `<p><a class="btn secondary" href="mailto:${esc(CONFIG.partnerEmail)}?subject=${encodeURIComponent("Partnerstwo — " + CONFIG.name)}">Napisz do nas</a></p>` : ""}

      <h3 id="about-zrodla">Źródła i licencje</h3>
      <ul class="small">
        <li>Opisy obiektów i daty: <a href="https://www.wikidata.org" target="_blank" rel="noopener">Wikidata</a> (CC0) i <a href="https://pl.wikipedia.org" target="_blank" rel="noopener">polska Wikipedia</a> (CC BY-SA 4.0).</li>
        <li>Zdjęcia: <a href="https://commons.wikimedia.org" target="_blank" rel="noopener">Wikimedia Commons</a> — autor i licencja podane przy każdym zdjęciu.</li>
        <li>Mapa: © autorzy <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, kafelki <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> / <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a>; miejscowości: Wikidata; obrys kraju i mapa awaryjna: <a href="https://www.naturalearthdata.com" target="_blank" rel="noopener">Natural Earth</a>.</li>
      </ul>
      <p class="small">Daty pochodzą z otwartych baz i bywają umowne (np. rozpoczęcie budowy albo pierwsza wzmianka). Widzisz błąd? Popraw go w Wikidata — skorzystają wszyscy.</p>

      <h3 id="about-prywatnosc">Prywatność</h3>
      <p class="small">Bez kont, bez ciasteczek, bez śledzenia. Twoje wyniki i seria są zapisywane w tej przeglądarce.</p>
      <p class="small"><b>Liczymy rozgrywki, nie ludzi.</b> Gra zlicza tylko, ile razy danego dnia wyzwanie rozpoczęto i ukończono, jak rozłożyły się wyniki (stąd „lepiej niż X% graczy”), ile razy udostępniono wynik oraz ile razy wyświetlono i kliknięto zagadkę sponsorowaną. To same sumy dzienne: bez identyfikatorów, bez adresów IP, bez profili.</p>
      <p class="small"><b>Ranking jest dobrowolny.</b> Jeśli po ukończeniu wyzwania do niego dołączysz, na serwer gry trafią: Twój nick, dzisiejsze odpowiedzi (z nich liczony jest wynik) oraz losowy identyfikator tej przeglądarki, dzięki któremu jedno urządzenie ma jeden wynik dziennie. Nick i wynik są widoczne dla wszystkich. Nie zapisujemy adresu IP ani żadnych innych danych. Swoje wpisy usuniesz w każdej chwili linkiem „Usuń moje wpisy z rankingu” pod rankingiem${CONFIG.partnerEmail ? `, możesz też napisać na <a href="mailto:${esc(CONFIG.partnerEmail)}">${esc(CONFIG.partnerEmail)}</a>` : ""}.</p>
    </div>`;
  document.body.append(d);
  d.addEventListener("click", (e) => {
    if (e.target === d || (e.target as HTMLElement).closest(".about-close")) d.close();
  });
  d.addEventListener("close", () => d.remove());
  d.showModal();
  if (section) d.querySelector(`#about-${section}`)?.scrollIntoView({ block: "start" });
}
