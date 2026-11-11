// Ustawienia gry — jedno miejsce do zmiany nazwy, adresu i reguł.
export const CONFIG = {
  name: "Gdzie w Polsce?",
  tagline: "Codzienna podróż po Polsce",
  /** Adres publiczny gry — trafia do tekstu udostępniania wyniku. */
  siteUrl: "",
  /** Kontakt dla miast i regionów zainteresowanych partnerstwem (puste = ukryte). */
  partnerEmail: "",
  /** Adres anonimowego licznika zdarzeń (POST JSON). Puste = żadnych statystyk. */
  statsEndpoint: "",
  timezone: "Europe/Warsaw",
  rounds: 10,
  minYear: 1000,
  maxYear: new Date().getFullYear(),
  defaultYear: 1750,
  /** Ile punktów maksymalnie za lokalizację i za rok w jednej rundzie. */
  maxLocationPoints: 500,
  maxYearPoints: 500,
};
