/**
 * Okno „Udostępnij wynik”: X, Facebook, WhatsApp, Instagram (obrazek z wynikiem), kopiowanie tekstu
 * i systemowe udostępnianie. Bez SDK i skryptów serwisów — tylko zwykłe linki w nowej karcie.
 */
import { CONFIG } from "../config";
import { esc } from "../dom";
import { tr } from "../i18n";
import type { Game } from "../main";
import { shareLines } from "../score";
import { facebookShareUrl, shareImageName, type SharePlatform, whatsappShareUrl, xShareUrl } from "../share";
import { loadImageFonts, shareImageBlob, type ImageFormat, type ShareImageData } from "../share-image";
import { track } from "../track";

const svg = (body: string, view = "0 0 24 24") => `<svg viewBox="${view}" aria-hidden="true" focusable="false">${body}</svg>`;
const ICONS = {
  x: svg(`<path fill="currentColor" d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.83L7.08 4.13H5.12z"/>`),
  facebook: svg(`<path fill="currentColor" d="M13.5 22v-8.1h2.7l.4-3.2h-3.1V8.7c0-.9.3-1.5 1.6-1.5h1.7V4.3c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2v2.3H7.4v3.2h2.8V22z"/>`),
  whatsapp: svg(
    `<path fill="currentColor" d="M12 2.2a9.8 9.8 0 0 0-8.4 14.8L2.2 21.8l4.9-1.3A9.8 9.8 0 1 0 12 2.2zm0 17.9a8.1 8.1 0 0 1-4.2-1.2l-.3-.2-2.9.8.8-2.8-.2-.3A8.1 8.1 0 1 1 12 20.1z"/><path fill="currentColor" d="M16.5 14c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.6-.3z"/>`,
  ),
  instagram: svg(
    `<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.3" cy="6.7" r="1.3" fill="currentColor"/>`,
  ),
  copy: svg(
    `<rect x="8" y="8" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" fill="none" stroke="currentColor" stroke-width="2"/>`,
  ),
  more: svg(
    `<circle cx="6" cy="12" r="2.6" fill="currentColor"/><circle cx="17.5" cy="5.5" r="2.6" fill="currentColor"/><circle cx="17.5" cy="18.5" r="2.6" fill="currentColor"/><path d="M8 11l7.5-4.3M8 13l7.5 4.3" stroke="currentColor" stroke-width="2"/>`,
  ),
};

function shareUrl(): string {
  return CONFIG.siteUrl || location.origin + location.pathname;
}

/** Czy przeglądarka umie udostępnić plik przez systemowe menu (telefon: lista aplikacji z Instagramem). */
function canShareFile(file: File): boolean {
  try {
    return typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

const isTouch = () => matchMedia("(pointer: coarse)").matches;

export function openShare(game: Game): void {
  const { challenge, state } = game;
  const url = shareUrl();
  const rounds = challenge.puzzles.length;
  const text = shareLines(challenge.number, state.guesses, rounds, url);
  const textNoUrl = shareLines(challenge.number, state.guesses, rounds, "");
  const imgData: ShareImageData = { number: challenge.number, dayKey: challenge.key, guesses: state.guesses, rounds };
  const systemShare = typeof navigator.share === "function" && isTouch();

  document.querySelector("dialog.share-dialog")?.remove();
  const d = document.createElement("dialog");
  d.className = "share-dialog";
  d.setAttribute("aria-labelledby", "share-title");
  const btn = (p: SharePlatform, label: string, icon: string, href?: string) =>
    href
      ? `<a class="share-btn" data-p="${p}" href="${esc(href)}" target="_blank" rel="noopener noreferrer"><span class="share-ico ico-${p}">${icon}</span><span>${label}</span></a>`
      : `<button type="button" class="share-btn" data-p="${p}"><span class="share-ico ico-${p}">${icon}</span><span>${label}</span></button>`;
  d.innerHTML = `
    <div class="share-body">
      <button class="icon-btn share-close" aria-label="${tr("Zamknij", "Close")}">✕</button>
      <h2 id="share-title">${tr("Udostępnij wynik", "Share your score")}</h2>
      <pre class="share-preview">${esc(text)}</pre>
      <div class="share-grid">
        ${btn("x", "X", ICONS.x, xShareUrl(textNoUrl, url))}
        ${btn("facebook", "Facebook", ICONS.facebook, facebookShareUrl(url))}
        ${btn("whatsapp", "WhatsApp", ICONS.whatsapp, whatsappShareUrl(text, url))}
        ${btn("instagram", "Instagram", ICONS.instagram)}
        ${btn("copy", tr("Kopiuj tekst", "Copy text"), ICONS.copy)}
        ${systemShare ? btn("system", tr("Więcej…", "More…"), ICONS.more) : ""}
      </div>
      <p class="share-status" role="status" aria-live="polite"></p>
      <section class="share-ig" hidden aria-label="${tr("Obrazek z wynikiem do Instagrama", "Score image for Instagram")}">
        <div class="seg" role="radiogroup" aria-label="${tr("Format obrazka", "Image format")}">
          <button type="button" role="radio" aria-checked="true" data-f="story">${tr("Relacja 9:16", "Story 9:16")}</button>
          <button type="button" role="radio" aria-checked="false" data-f="square">Post 1:1</button>
        </div>
        <div class="ig-preview"><img alt="${tr("Obrazek z dzisiejszym wynikiem (bez odpowiedzi)", "Image with today's score (no answers)")}" /></div>
        <button type="button" class="btn primary" id="ig-go">${tr("Przygotowuję obrazek…", "Preparing the image…")}</button>
        <p class="small muted" id="ig-help"></p>
      </section>
      <p class="small muted share-privacy">${tr("Bez śledzenia: przyciski to zwykłe linki, gra nie wczytuje skryptów Facebooka ani X. Obrazek nie zdradza odpowiedzi.", "No tracking: the buttons are plain links and the game loads no Facebook or X scripts. The image does not give away the answers.")}</p>
    </div>`;
  document.body.append(d);
  d.showModal();

  const status = d.querySelector<HTMLElement>(".share-status")!;
  const say = (msg: string) => {
    status.textContent = msg;
  };
  const count = (p: SharePlatform) => {
    if (!game.preview) track("share", { day: game.challenge.key, platform: p });
  };
  const copy = async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const urls: string[] = [];
  const close = () => {
    d.close();
    d.remove();
    urls.forEach((u) => URL.revokeObjectURL(u));
  };
  d.querySelector(".share-close")!.addEventListener("click", close);
  d.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  d.addEventListener("click", (e) => {
    if (e.target === d) close(); // klik w tło
  });

  // ---------- linki i tekst ----------
  d.querySelector('[data-p="x"]')!.addEventListener("click", () => {
    count("x");
    say("");
  });
  d.querySelector('[data-p="whatsapp"]')!.addEventListener("click", () => {
    count("whatsapp");
    say("");
  });
  d.querySelector('[data-p="facebook"]')!.addEventListener("click", () => {
    // Facebook nie przyjmuje gotowego tekstu — kopiujemy go, a link otwiera się normalnie w nowej karcie
    count("facebook");
    copy().then((ok) => say(ok ? tr("Tekst skopiowany — wklej go w poście na Facebooku.", "Text copied — paste it into your Facebook post.") : tr("Facebook pokaże link do gry; tekst wyniku możesz przepisać z okna powyżej.", "Facebook will show a link to the game; you can copy the score text from the box above.")));
  });
  d.querySelector('[data-p="copy"]')!.addEventListener("click", async () => {
    count("copy");
    say((await copy()) ? tr("Wynik skopiowany — wklej go znajomym!", "Score copied — paste it to your friends!") : tr("Nie udało się skopiować. Zaznacz tekst powyżej i skopiuj ręcznie.", "Copying failed. Select the text above and copy it by hand."));
  });
  d.querySelector('[data-p="system"]')?.addEventListener("click", async () => {
    try {
      await navigator.share({ text });
      count("system");
    } catch {
      /* gracz zamknął systemowe okno */
    }
  });

  // ---------- Instagram: obrazek z wynikiem ----------
  const ig = d.querySelector<HTMLElement>(".share-ig")!;
  const igImg = ig.querySelector("img")!;
  const igGo = ig.querySelector<HTMLButtonElement>("#ig-go")!;
  const igHelp = ig.querySelector<HTMLElement>("#ig-help")!;
  let format: ImageFormat = "story";
  const files: Partial<Record<ImageFormat, File>> = {};
  const ready = loadImageFonts().then(async () => {
    for (const f of ["story", "square"] as ImageFormat[]) {
      const blob = await shareImageBlob(imgData, f);
      files[f] = new File([blob], shareImageName(challenge.number, f), { type: "image/png" });
    }
  });
  const showFormat = () => {
    const file = files[format];
    ig.querySelectorAll<HTMLElement>("[data-f]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.f === format)));
    ig.dataset.format = format;
    if (!file) return;
    const u = URL.createObjectURL(file);
    urls.push(u);
    igImg.src = u;
    const viaSystem = canShareFile(file);
    igGo.disabled = false;
    igGo.textContent = viaSystem ? tr("Udostępnij obrazek", "Share the image") : tr("Pobierz obrazek", "Download the image");
    igHelp.textContent = viaSystem
      ? tr("Wybierz Instagram z listy aplikacji, a potem Relację albo Post.", "Pick Instagram from the app list, then Story or Post.")
      : isTouch()
        ? tr("Zapisz obrazek (albo przytrzymaj go palcem), otwórz Instagram, wybierz + i dodaj go z galerii.", "Save the image (or press and hold it), open Instagram, tap + and add it from your gallery.")
        : tr("Instagram nie pozwala publikować ze strony. Pobierz obrazek, prześlij go na telefon i dodaj w aplikacji Instagram.", "Instagram does not allow posting from a website. Download the image, send it to your phone and add it in the Instagram app.");
  };
  igGo.disabled = true;
  ready.then(showFormat).catch(() => {
    igGo.textContent = tr("Nie udało się przygotować obrazka", "The image could not be prepared");
  });

  d.querySelector('[data-p="instagram"]')!.addEventListener("click", () => {
    ig.hidden = !ig.hidden;
    if (!ig.hidden) ig.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
  ig.querySelectorAll<HTMLElement>("[data-f]").forEach((b) =>
    b.addEventListener("click", () => {
      format = b.dataset.f as ImageFormat;
      showFormat();
    }),
  );
  igGo.addEventListener("click", async () => {
    const file = files[format];
    if (!file) return;
    count("instagram");
    if (canShareFile(file)) {
      try {
        await navigator.share({ files: [file] });
      } catch (e) {
        if ((e as DOMException)?.name !== "AbortError") download(file);
      }
      return;
    }
    download(file);
  });
  const download = (file: File) => {
    const a = document.createElement("a");
    const u = URL.createObjectURL(file);
    urls.push(u);
    a.href = u;
    a.download = file.name;
    d.append(a);
    a.click();
    a.remove();
    say(tr("Obrazek zapisany w pobranych plikach.", "Image saved to your downloads."));
  };
}
