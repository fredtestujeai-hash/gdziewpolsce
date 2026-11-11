import { CONFIG } from "../config";
import { esc, PIN_SVG } from "../dom";

export function topbar(center = ""): string {
  return `
  <header class="topbar">
    <a class="brand" href="./" aria-label="${esc(CONFIG.name)} — strona główna">${PIN_SVG}<span>${esc(CONFIG.name)}</span></a>
    <div class="topbar-center">${center}</div>
    <button class="icon-btn" data-about aria-label="Jak grać i o grze">?</button>
  </header>`;
}

export function formatDayLong(key: string): string {
  return new Intl.DateTimeFormat("pl-PL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(key + "T12:00:00Z"),
  );
}
