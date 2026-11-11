# Gdzie w Polsce? — codzienna gra o Polsce

Przeglądarkowa gra o Polsce. Codziennie **10 zdjęć** zabytków i atrakcji, takich samych dla wszystkich graczy.
Dla każdego zdjęcia gracz:

1. **wbija pinezkę** na mapie Polski **bez żadnych nazw**: widać rzeki, jeziora, lasy, drogi i tory, a kropki oznaczają miasta wojewódzkie, powiatowe i siedziby gmin. Mapę można przybliżyć aż do pojedynczych ulic i budynków,
2. **ustawia na suwaku rok powstania** obiektu.

Im bliżej prawdy, tym więcej punktów: do 500 za miejsce i do 500 za rok, czyli maks. 10 000 dziennie.
Po każdej rundzie gracz poznaje nazwę, miejsce, datę, krótki opis z Wikipedii i link do niej.
Na koniec widzi podsumowanie z mapą „dzisiejszej trasy” i wynik do udostępnienia w stylu Wordle.

- **Bez reklam, bez logowania, bez ciasteczek.** Wynik i seria są zapisywane tylko w przeglądarce (`localStorage`).
- **Model finansowania: zagadki sponsorowane.** Miasto lub region staje się partnerem, a jego obiekt trafia do wyzwania jako wyraźnie oznaczona zagadka z zachętą do odwiedzin. Szczegóły: [docs/PARTNERZY.md](docs/PARTNERZY.md).

Gra jest publikowana na GitHub Pages: https://fredtestujeai-hash.github.io/gdziewpolsce/

## Uruchomienie

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testy punktacji, harmonogramu, stref czasowych
npm run build      # statyczna strona w dist/
```

Przydatne parametry adresu:

| Parametr | Działanie |
|---|---|
| `?demo` | włącza demonstracyjną kampanię partnera (zagadka sponsorowana w 5. rundzie) |
| `?dzien=2026-12-24` | podgląd wyzwania z dowolnego dnia, bez zapisywania wyniku; przydatny dla redakcji i na prezentacje dla partnerów |

## Jak to jest zbudowane

Gra jest w całości statyczna i nie ma serwera. Można ją hostować za darmo na GitHub Pages, Cloudflare Pages albo Netlify.

```
src/
  main.ts          start aplikacji, wczytanie danych, przełączanie ekranów
  daily.ts         data w czasie polskim, wyzwanie dnia, wstawianie zagadki sponsorowanej
  score.ts         punktacja (odległość po kole wielkim, różnica lat), odmiana „rok/lata/lat”
  map.ts           mapa MapLibre GL: pinezki, przybliżanie, tryb awaryjny przy braku kafelków
  mapstyle.ts      styl mapy bez napisów (kafelki wektorowe OpenStreetMap) + kropki miejscowości
  storage.ts       zapis postępu i statystyk w localStorage
  track.ts         opcjonalne anonimowe liczniki dla raportów partnerów (domyślnie wyłączone)
  views/           ekrany: start, runda, podsumowanie, „o grze”
public/
  data/puzzles.json     pula zagadek (generowana)
  data/schedule.json    harmonogram: dzień -> 10 id zagadek (generowany, tylko dopisywany)
  data/sponsored.json   kampanie partnerów (edytowane ręcznie)
  map/places.json       miejscowości bez nazw: [długość, szerokość, ranga 1–3] (generowane)
  map/*.json            obrys Polski i uproszczona mapa awaryjna (generowane)
scripts/                pipeline danych (Python 3 bez zależności + Node dla mapy)
data/                   surowe dane z Wikidata/Commons/Wikipedii, ręczne poprawki
```

## Mapa

Mapa to kafelki wektorowe z danymi OpenStreetMap, rysowane w przeglądarce własnym stylem (`src/mapstyle.ts`). Styl **nie ma ani jednej warstwy tekstowej** i nie pobiera czcionek, więc na mapie nie może pojawić się żadna nazwa; pilnuje tego test `tests/mapstyle.test.ts`.

- Przy oddaleniu widać granice, województwa (linia przerywana), ok. 25 głównych rzek, jeziora i kropki miejscowości w trzech rangach.
- Po przybliżeniu dochodzą lasy, zabudowa, drogi i tory, a od ok. 13. poziomu pojedyncze budynki.
- Kropki miejscowości (`public/map/places.json`): 18 miast wojewódzkich, 316 powiatowych i 1984 siedziby gmin.

## Dane

Wszystkie dane pochodzą z otwartych źródeł:

| Co | Skąd | Licencja |
|---|---|---|
| obiekty, współrzędne, daty powstania | Wikidata | CC0 |
| zdjęcia | Wikimedia Commons | różne (CC BY, CC BY-SA, PD); autor i licencja przy każdym zdjęciu |
| krótkie opisy | polska Wikipedia | CC BY-SA 4.0 (z linkiem do artykułu) |
| mapa: ulice, rzeki, jeziora, lasy, budynki | OpenStreetMap, kafelki wektorowe OpenFreeMap (schemat OpenMapTiles) | ODbL, z podpisem na mapie |
| miejscowości: wojewódzkie, powiatowe, gminne | Wikidata | CC0 |
| główne rzeki przy oddaleniu, obrys kraju, mapa awaryjna | Natural Earth | domena publiczna |

Pipeline:

```bash
npm run map                               # obrys Polski, główne rzeki i mapa awaryjna z Natural Earth
python3 scripts/fetch_places.py           # miejscowości w trzech rangach z Wikidata -> public/map/places.json
python3 scripts/fetch_wikidata.py         # kandydaci: ~40 klas obiektów w Polsce (zamki, kościoły, ratusze…)
python3 scripts/fetch_commons.py          # licencje i miniatury zdjęć + wstępy artykułów z plwiki
python3 scripts/build_puzzles.py          # filtrowanie i pula -> public/data/puzzles.json
python3 scripts/build_schedule.py         # harmonogram dni -> public/data/schedule.json
```

Reguły jakości w `build_puzzles.py`:
- licencja zdjęcia musi dopuszczać użycie z podaniem autora (CC0, PD, CC BY, CC BY-SA),
- zdjęcie ma min. 800 px szerokości, bez panoram, map, planów, herbów i wnętrz,
- data jest jednoznaczna, z dokładnością do roku, w przedziale 1000 – dziś,
- obiekt istnieje (pomijamy budowle rozebrane i zniszczone, bo gra ma zachęcać do odwiedzin),
- jeden obiekt na zdjęcie i na ~150 m,
- bez instytucji (muzeum, ośrodek; ich data to zwykle założenie, a nie budowa), cmentarzy i browarów (zdjęcia butelek, data założenia firmy),
- trudność wynika z rozpoznawalności, czyli liczby wersji językowych Wikipedii: łatwe ≥ 9, średnie 4–8, trudne ≤ 3.

Ręczne poprawki redakcyjne:
- `data/exclude.txt` to czarna lista QID, jeden na linię, np. obiekty z błędną datą,
- `data/curated.json` to obiekty dodane ręcznie, z rokiem podanym przez redakcję. Służy dla znanych miejsc, którym w Wikidata brakuje dokładnej daty (np. Wawel ma tam tylko „XI w.”).

**Stan obecny:** 1095 zagadek (185 łatwych, 418 średnich, 492 trudnych), a harmonogram bez powtórek wystarcza na 91 dni.

### Harmonogram dni

`build_schedule.py` układa każdy dzień według tych zasad: 2 łatwe, 4 średnie i 4 trudne zagadki; maks. 3 z tej samej kategorii; maks. 1 z tej samej miejscowości; nic bliżej niż 15 km od siebie; maks. 4 z jednego stulecia.
Plik jest **tylko dopisywany**, więc odświeżenie danych nie zmienia graczom dzisiejszego wyzwania. Gdy harmonogram się skończy, gra sama dobiera zagadki deterministycznie z daty.
Workflow `.github/workflows/data.yml` co miesiąc dopisuje kolejne dni.

## Zagadki sponsorowane

Kampanie partnerów są w `public/data/sponsored.json`:

```jsonc
{
  "campaigns": [{
    "id": "torun-2027-wiosna",            // trafia do utm_campaign w linku partnera
    "from": "2027-04-01", "to": "2027-04-30",
    "sponsor": { "name": "Urząd Miasta …", "url": "https://…", "cta": "Zaplanuj wizytę", "logo": "sponsors/…svg" },
    "puzzles": [ { /* pełny rekord zagadki jak w puzzles.json, może mieć własne zdjęcie partnera */ } ]
  }]
}
```

- Zagadka sponsorowana zastępuje **5. rundę**. Dziennie jest maks. jedna; kilka aktywnych kampanii rotuje.
- Zagadka ma etykietę **„Zagadka sponsorowana”** na zdjęciu i w wyniku, a link do partnera ma `rel="sponsored"` i parametry UTM.
- Po ustawieniu `statsEndpoint` w `src/config.ts` gra wysyła anonimowe zdarzenia (`start`, `finish`, `sponsor_view`, `sponsor_click`) z dniem i id kampanii. Nie ma w nich identyfikatorów ani ciasteczek, więc nie potrzeba banera zgód.

## Publikacja

1. Utwórz repozytorium na GitHubie i wypchnij kod.
2. W *Settings → Pages* wybierz źródło **GitHub Actions**. Workflow `deploy.yml` buduje i publikuje stronę po każdym pushu do `main`.
3. Ustaw `siteUrl` w `src/config.ts`, żeby trafiał do tekstu udostępniania, i opcjonalnie `partnerEmail`.

## Znane ograniczenia i następne kroki

- **Zdjęcia są ładowane prosto z Wikimedia (hotlinking).** Nazwa pliku w adresie bywa podpowiedzią („Zamek_w_Malborku.jpg”). Przed startem warto kopiować miniatury najbliższych dni na własny CDN pod zanonimizowanymi nazwami, np. w workflow publikacji. Przy okazji gra przestanie zależeć od limitów Wikimedia.
- **Odpowiedzi są w publicznym `puzzles.json`.** To normalne dla gier bez serwera (Wordle działał tak samo). Jeśli pojawią się rankingi, potrzebny będzie mały backend.
- **Mapa zależy od publicznego serwera OpenFreeMap** (darmowy, bez klucza i limitów, dozwolony komercyjnie, ale bez gwarancji dostępności). Gdy nie odpowiada, gra sama przełącza się na uproszczoną mapę z głównymi rzekami i kropkami miejscowości. Przy większym ruchu warto przenieść kafelki Polski na własny hosting (np. plik PMTiles na Cloudflare R2).
- **Daty z Wikidata bywają umowne:** początek budowy, ukończenie albo pierwsza wzmianka; dla instytucji (muzeum, teatr) czasem data założenia zamiast budowy. Pulę warto przejrzeć redakcyjnie, przynajmniej poziom „łatwy”, zaczynając od najbliższych tygodni harmonogramu.
- **Kategoria „zabytek”** (ok. 200 obiektów) jest ogólna. Można ją doprecyzować, pobierając drugie P31.
