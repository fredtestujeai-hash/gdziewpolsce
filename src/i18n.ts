// Dwie wersje językowe gry: polska pod adresem głównym i angielska pod /en/.
// Język wynika wyłącznie z adresu strony (nic nie zapisujemy i niczego nie zgadujemy z przeglądarki).
// Wyzwanie dnia, punktacja i ranking są wspólne dla obu wersji.
export type Lang = "pl" | "en";

function detect(): Lang {
  try {
    return /\/en(\/(index\.html)?)?$/.test(location.pathname) ? "en" : "pl";
  } catch {
    return "pl"; // serwer i testy: brak adresu strony
  }
}

export const LANG: Lang = detect();
export const EN = LANG === "en";
/** Tekst w języku strony. */
export const tr = <T>(pl: T, en: T): T => (EN ? en : pl);
export const LOCALE = EN ? "en-GB" : "pl-PL";
/** Katalog główny gry względem bieżącej strony (wersja angielska leży w podkatalogu en/). */
export const ROOT = EN ? "../" : "./";
/** Adres drugiej wersji językowej (przełącznik w nagłówku). */
export const OTHER_LANG_HREF = EN ? "../" : "./en/";

/** Kategorie obiektów po angielsku (klucze jak w puzzles.json). */
const CATEGORY_EN: Record<string, string> = {
  kościół: "church", zabytek: "monument", pałac: "palace", dworzec: "railway station", pomnik: "memorial", synagoga: "synagogue",
  zamek: "castle", stadion: "stadium", budynek: "building", most: "bridge", cerkiew: "Orthodox church", wieżowiec: "skyscraper",
  ratusz: "town hall", katedra: "cathedral", teatr: "theatre", willa: "villa", wieża: "tower", klasztor: "monastery",
  "latarnia morska": "lighthouse", kaplica: "chapel", hala: "hall", fortyfikacja: "fortification", "wieża ciśnień": "water tower",
  bazylika: "basilica", "brama miejska": "city gate", fort: "fort", "wieża widokowa": "observation tower", fontanna: "fountain",
  "sala koncertowa": "concert hall", "ruiny zamku": "castle ruins", "skocznia narciarska": "ski jump", opactwo: "abbey", dwór: "manor house",
  meczet: "mosque", molo: "pier", amfiteatr: "amphitheatre", kopiec: "mound", "zabytek techniki": "industrial monument", zapora: "dam",
  sąd: "courthouse", "atrakcja turystyczna": "tourist attraction", "budynek historyczny": "historic building",
};
export const categoryName = (pl: string): string => (EN ? (CATEGORY_EN[pl] ?? pl) : pl);

/** Nazwa województwa do podpowiedzi: po angielsku z dopiskiem, bo sama polska nazwa nic nie mówi. */
export const regionName = (woj: string): string => (EN ? `${woj[0].toUpperCase()}${woj.slice(1)} Voivodeship` : woj);
