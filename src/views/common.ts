import { CONFIG } from "../config";
import { esc, PIN_SVG } from "../dom";
import { EN, LOCALE, OTHER_LANG_HREF, tr } from "../i18n";
import type { Puzzle } from "../types";

export function topbar(center = ""): string {
  return `
  <header class="topbar">
    <a class="brand" href="./" aria-label="${esc(CONFIG.name)} — ${tr("strona główna", "home")}">${PIN_SVG}<span>${esc(CONFIG.name)}</span></a>
    <div class="topbar-center">${center}</div>
    <div class="topbar-end">
      <a class="lang-switch" href="${OTHER_LANG_HREF}" lang="${EN ? "pl" : "en"}" aria-label="${EN ? "Polska wersja" : "English version"}">${EN ? "PL" : "EN"}</a>
      <button class="icon-btn" data-about aria-label="${tr("Jak grać i o grze", "How to play and about")}">?</button>
    </div>
  </header>`;
}

export function formatDayLong(key: string): string {
  return new Intl.DateTimeFormat(LOCALE, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(key + "T12:00:00Z"),
  );
}

/** Wyraźny przycisk do artykułu w Wikipedii — taki sam w wyniku rundy i w podsumowaniu. */
export function wikiButton(p: Puzzle, small = false): string {
  if (!p.wiki) return "";
  return `<a class="wiki-btn${small ? " small" : ""}" href="${esc(p.wiki)}" target="_blank" rel="noopener" aria-label="${esc(p.name)} — ${tr("artykuł w Wikipedii", "Wikipedia article")}"><span class="wiki-w" aria-hidden="true">W</span>Wikipedia ↗</a>`;
}
