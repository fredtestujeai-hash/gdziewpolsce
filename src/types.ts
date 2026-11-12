export interface Sponsor {
  /** Nazwa wyświetlana, np. „Urząd Miasta Torunia”. */
  name: string;
  /** Strona turystyczna partnera (link „Odwiedź”). */
  url: string;
  /** Tekst przycisku, np. „Zaplanuj wizytę w Toruniu”. */
  cta: string;
  /** Opcjonalne logo (ścieżka względna od public/). */
  logo?: string;
}

export interface Puzzle {
  id: string;
  name: string;
  category: string;
  place: string;
  lat: number;
  lon: number;
  year: number;
  /** Województwo, np. „małopolskie” (podpowiedź „Województwo”). */
  woj?: string;
  img: string;
  imgW: number;
  imgH: number;
  author: string;
  license: string;
  licenseUrl: string;
  filePage: string;
  wiki: string;
  extract: string;
  difficulty: 1 | 2 | 3;
  /** Ustawiane tylko dla zagadek sponsorowanych. */
  sponsor?: Sponsor;
  /** Dodatkowy tekst partnera pokazywany po odpowiedzi. */
  sponsorNote?: string;
  /** Id kampanii (ustawiane automatycznie dla zagadek sponsorowanych). */
  campaign?: string;
}

export interface Campaign {
  id: string;
  sponsor: Sponsor;
  /** Zakres dat (włącznie), format RRRR-MM-DD, czas polski. */
  from: string;
  to: string;
  /** Kampanie demonstracyjne działają tylko z parametrem ?demo w adresie. */
  demo?: boolean;
  puzzles: Puzzle[];
}

export interface Schedule {
  start: string;
  days: string[][];
}

/**
 * Wynik jednej rundy. Suma punktów rundy to zawsze `locPts + yearPts` —
 * koszt podpowiedzi jest już odjęty, a runda pominięta ma 0 + 0.
 */
export interface Guess {
  /** Pinezka i rok gracza. Dla rund z `gaveUp` te pola (oraz `km`, `yearDiff`) są zerami bez znaczenia. */
  lat: number;
  lon: number;
  year: number;
  km: number;
  yearDiff: number;
  /** Punkty za miejsce, po odjęciu kosztu podpowiedzi „Województwo”. */
  locPts: number;
  /** Punkty za rok, po odjęciu kosztu podpowiedzi „Wiek”. */
  yearPts: number;
  /** Gracz użył podpowiedzi „Województwo”. */
  hintLoc?: boolean;
  /** Gracz użył podpowiedzi „Wiek”. */
  hintYear?: boolean;
  /**
   * Gracz zrezygnował: "round" = pominął tę zagadkę, "day" = zakończył wyzwanie
   * przed rozegraniem tej rundy. W obu przypadkach 0 punktów.
   */
  gaveUp?: "round" | "day";
}

export interface DayState {
  key: string;
  ids: string[];
  guesses: Guess[];
  /** Podpowiedzi użyte w trwającej rundzie (zapisane, żeby odświeżenie strony ich nie „zwracało”). */
  hints?: { round: number; loc?: boolean; year?: boolean };
}
