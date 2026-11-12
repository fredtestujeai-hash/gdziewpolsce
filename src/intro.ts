/**
 * Animacja startowa: obrys Polski rysowany podczas ładowania gry.
 * Sam rysunek i jego style są w index.html (widać je, zanim wczyta się ten kod);
 * tutaj tylko czekamy na koniec rysowania i płynnie odsłaniamy pierwszy ekran.
 */

/** Zapas na wypadek, gdyby przeglądarka nie zgłosiła końca animacji. */
const MAX_WAIT_MS = 2500;

/** Czeka, aż obrys się domknie i pinezka wyląduje (pulsowanie w nieskończoność się nie liczy). */
function drawn(el: HTMLElement): Promise<unknown> {
  if (typeof el.getAnimations !== "function") return Promise.resolve();
  const finite = el
    .getAnimations({ subtree: true })
    .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
    .map((a) => a.finished.catch(() => undefined));
  return Promise.race([Promise.all(finite), new Promise((r) => setTimeout(r, MAX_WAIT_MS))]);
}

/**
 * Chowa ekran ładowania. Z `wait` (domyślnie) najpierw pozwala animacji dobiec do końca;
 * bez niego chowa od razu — np. gdy trzeba pokazać komunikat błędu.
 */
export async function finishIntro(wait = true): Promise<void> {
  const el = document.getElementById("intro");
  if (!el) return;
  if (wait) await drawn(el);
  const fade = parseFloat(getComputedStyle(el).transitionDuration) * 1000 || 0;
  el.classList.add("intro-out");
  if (fade > 0) await new Promise((r) => setTimeout(r, fade));
  el.remove();
}
