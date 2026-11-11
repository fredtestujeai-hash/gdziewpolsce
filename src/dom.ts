/** Minimalne pomocniki DOM — bez frameworka, żeby gra ładowała się błyskawicznie. */
export function esc(s: string | number | undefined | null): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((out, s, i) => out + s + (i < values.length ? String(values[i] ?? "") : ""), "");
}

export function $(sel: string, root: ParentNode = document): HTMLElement {
  const el = root.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`Brak elementu ${sel}`);
  return el;
}

export function mount(markup: string): HTMLElement {
  const app = $("#app");
  app.innerHTML = markup;
  window.scrollTo(0, 0);
  return app;
}

let toastTimer = 0;
export function toast(msg: string): void {
  let el = document.querySelector<HTMLElement>(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove("show"), 2400);
}

export const PIN_SVG = `<svg class="logo-pin" viewBox="0 0 32 44" aria-hidden="true"><path d="M16 1C8 1 1.5 7.4 1.5 15.3c0 10.6 12.6 25.4 13.4 26.4a1.4 1.4 0 0 0 2.2 0c.8-1 13.4-15.8 13.4-26.4C30.5 7.4 24 1 16 1z"/><circle cx="16" cy="15" r="5.5"/></svg>`;

/** Link do partnera z parametrami UTM — partner widzi w swojej analityce ruch z gry. */
export function partnerLink(url: string, campaign: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", "pinezka");
    u.searchParams.set("utm_medium", "gra");
    u.searchParams.set("utm_campaign", campaign);
    return u.toString();
  } catch {
    return url;
  }
}
