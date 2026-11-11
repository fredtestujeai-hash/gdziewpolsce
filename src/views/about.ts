import { CONFIG } from "../config";
import { esc } from "../dom";
import { locationPoints, yearPoints } from "../score";

export function openAbout(section?: string): void {
  document.querySelector("dialog.about")?.remove();
  const d = document.createElement("dialog");
  d.className = "about";
  d.setAttribute("aria-label", "O grze");
  const ex = (km: number) => `${km} km → ${locationPoints(km)} pkt`;
  const ey = (y: number) => `${y} lat → ${yearPoints(y)} pkt`;
  d.innerHTML = `
    <div class="about-body">
      <button class="icon-btn about-close" aria-label="Zamknij">✕</button>
      <h2>Jak grać</h2>
      <p>Codziennie o północy czeka nowe wyzwanie: <b>${CONFIG.rounds} miejsc z całej Polski</b> — zamki, kościoły, ratusze, latarnie, dworce, wieżowce… Takie samo dla wszystkich graczy.</p>
      <ol>
        <li>Obejrzyj zdjęcie (możesz je powiększyć).</li>
        <li>Wbij pinezkę na mapie. Mapa nie ma <b>żadnych nazw</b>, ale pokazuje rzeki, jeziora, lasy, drogi i tory, a kropki oznaczają miasta wojewódzkie, powiatowe i siedziby gmin. Możesz ją przybliżyć aż do pojedynczych ulic i budynków, a pinezkę przesuwać.</li>
        <li>Ustaw na suwaku rok powstania obiektu i kliknij <b>Sprawdź</b>.</li>
      </ol>
      <h3>Punktacja</h3>
      <p>Za każde miejsce do <b>${CONFIG.maxLocationPoints}</b> pkt za lokalizację i do <b>${CONFIG.maxYearPoints}</b> pkt za rok — razem maks. ${(CONFIG.rounds * (CONFIG.maxLocationPoints + CONFIG.maxYearPoints)).toLocaleString("pl-PL")} pkt dziennie.</p>
      <p class="muted small">Lokalizacja: ${[ex(2), ex(25), ex(50), ex(100), ex(200)].join(" · ")}<br/>Rok: ${[ey(0), ey(10), ey(25), ey(50), ey(100)].join(" · ")}</p>

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

      <h3>Prywatność</h3>
      <p class="small">Bez kont, bez ciasteczek, bez śledzenia. Twoje wyniki i seria są zapisywane wyłącznie w tej przeglądarce.</p>
    </div>`;
  document.body.append(d);
  d.addEventListener("click", (e) => {
    if (e.target === d || (e.target as HTMLElement).closest(".about-close")) d.close();
  });
  d.addEventListener("close", () => d.remove());
  d.showModal();
  if (section) d.querySelector(`#about-${section}`)?.scrollIntoView({ block: "start" });
}
