// Ustawienia gry — jedno miejsce do zmiany nazwy, adresu i reguł.
import { EN, tr } from "./i18n";

export const CONFIG = {
  name: tr("Gdzie w Polsce?", "Where in Poland?"),
  tagline: tr("Codzienna podróż po Polsce", "A daily trip around Poland"),
  /** Adres publiczny gry — trafia do tekstu udostępniania wyniku. */
  siteUrl: EN ? "https://gdziewpolsce.com/en/" : "https://gdziewpolsce.com/",
  /** Kontakt dla miast i regionów zainteresowanych partnerstwem (puste = ukryte). */
  partnerEmail: "",
  /**
   * Adres anonimowego licznika zdarzeń (POST JSON; odczyt sum dnia pod tym samym adresem z „s” na końcu).
   * Liczymy rozgrywki, nie ludzi: bez identyfikatorów i ciasteczek. Puste = żadnych statystyk.
   */
  statsEndpoint: "/api/stat",
  /** Adres API rankingu (Cloudflare Workers). Puste = ranking wyłączony. */
  rankingApi: "/api",
  timezone: "Europe/Warsaw",
  /**
   * Liczba zagadek w nowych dniach harmonogramu: 2 łatwe, 2 średnie, 2 trudne.
   * Liczbę rund danego dnia wyznacza harmonogram (public/data/schedule.json) — dni rozegrane
   * według starszych reguł (np. 3 zagadki) zostają takie, jakie były.
   */
  rounds: 6,
  minYear: 1000,
  maxYear: new Date().getFullYear(),
  defaultYear: 1750,
  /** Ile punktów maksymalnie za lokalizację i za rok w jednej rundzie. */
  maxLocationPoints: 500,
  maxYearPoints: 500,
  /**
   * Koszt podpowiedzi: jaką część punktów gracz traci w rundzie, w której jej użył (0.3 = 30%).
   * „Województwo” obniża punkty za miejsce, „Wiek” — punkty za rok.
   */
  hintCost: 0.3,
};
