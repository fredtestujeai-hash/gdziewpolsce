# Gdzie w Polsce? — codzienna gra o Polsce

Przeglądarkowa gra o Polsce. Codziennie **3 zdjęcia** zabytków i atrakcji (łatwe, średnie i trudne), takie same dla wszystkich graczy.
Dla każdego zdjęcia gracz:

1. **wbija pinezkę** na mapie Polski **bez żadnych nazw**: widać rzeki, jeziora, lasy, drogi i tory, a kropki oznaczają miasta wojewódzkie, powiatowe i siedziby gmin. Mapę można przybliżyć aż do pojedynczych ulic i budynków,
2. **ustawia na suwaku rok powstania** obiektu.

Im bliżej prawdy, tym więcej punktów: do 500 za miejsce i do 500 za rok, czyli maks. 3000 dziennie.
Po każdej rundzie gracz poznaje nazwę, miejsce, datę, krótki opis z Wikipedii i przycisk „Wikipedia” (także gdy zagadkę pominął).

W każdej rundzie są też:

- **dwie podpowiedzi**, każda za 30% punktów z tej części rundy, której dotyczy: „Województwo” (nazwa i podświetlony obszar na mapie, taniej o 30% punkty za miejsce) i „Wiek” (stulecie, np. „XIV wiek (1301–1400)”, zaznaczone na suwaku, taniej o 30% punkty za rok). Koszt to jedna stała `hintCost` w `src/config.ts`;
- przycisk **„Rezygnuję”** z trzema opcjami: „Pomiń tę zagadkę” (0 punktów, gra pokazuje poprawną odpowiedź), „Przerwij dzisiejsze wyzwanie” (gracz trafia do podsumowania i do północy może wrócić przyciskiem „Wróć do gry”; nierozegrane zagadki mają 0 punktów, a wyzwanie niedokończone do końca doby przerywa serię) i „Gram dalej”.

Na koniec widzi podsumowanie z mapą „dzisiejszej trasy” i wynik do udostępnienia w stylu Wordle.

- **Bez reklam, bez logowania, bez ciasteczek.** Wynik i seria są zapisywane w przeglądarce (`localStorage`).
- **Dobrowolny ranking dnia** (nick zamiast konta), działa na Cloudflare Pages + D1. Szczegóły: [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md).
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
| `?demo` | włącza demonstracyjną kampanię partnera (zagadka sponsorowana w 2. rundzie) |
| `?dzien=2026-12-24` | podgląd wyzwania z dowolnego dnia, bez zapisywania wyniku; przydatny dla redakcji i na prezentacje dla partnerów |

## Jak to jest zbudowane

Gra jest w całości statyczna i nie ma serwera. Można ją hostować za darmo na GitHub Pages, Cloudflare Pages albo Netlify.

```
src/
  main.ts          start aplikacji, wczytanie danych, przełączanie ekranów
  daily.ts         data w czasie polskim, wyzwanie dnia, wstawianie zagadki sponsorowanej
  score.ts         punktacja (odległość po kole wielkim, różnica lat, koszt podpowiedzi), tekst do udostępnienia
  map.ts           mapa MapLibre GL: pinezki, przybliżanie, tryb awaryjny przy braku kafelków
  mapstyle.ts      styl mapy bez napisów (kafelki wektorowe OpenStreetMap) + kropki miejscowości
  intro.ts         chowa animację startową (obrys Polski w index.html), gdy gra jest gotowa
  storage.ts       zapis postępu i statystyk w localStorage
  track.ts         opcjonalne anonimowe liczniki dla raportów partnerów (domyślnie wyłączone)
  views/           ekrany: start, runda, podsumowanie, „o grze”, ranking
  ranking*.ts      ranking dnia: reguły wspólne (core), klient API, logika serwera (server)
functions/api/     Cloudflare Pages Functions: /api/score i /api/ranking
migrations/        struktura bazy D1 rankingu
public/
  data/puzzles.json     pula zagadek (generowana)
  data/schedule.json    harmonogram: dzień -> 3 id zagadek (generowany, tylko dopisywany)
  data/sponsored.json   kampanie partnerów (edytowane ręcznie)
  map/places.json       miejscowości bez nazw: [długość, szerokość, ranga 1–3] (generowane)
  map/wojewodztwa.json  granice województw do podpowiedzi „Województwo” (generowane)
  map/*.json            obrys Polski i uproszczona mapa awaryjna (generowane)
scripts/                pipeline danych (Python 3 bez zależności + Node dla mapy)
data/                   surowe dane z Wikidata/Commons/Wikipedii, ręczne poprawki
```

## Mapa

Mapa to kafelki wektorowe z danymi OpenStreetMap, rysowane w przeglądarce własnym stylem (`src/mapstyle.ts`). Styl **nie ma ani jednej warstwy tekstowej** i nie pobiera czcionek, więc na mapie nie może pojawić się żadna nazwa; pilnuje tego test `tests/mapstyle.test.ts`.

- Przy oddaleniu widać granice, województwa (linia przerywana), ok. 25 głównych rzek, jeziora i kropki miejscowości w trzech rangach.
- Po przybliżeniu dochodzą lasy, zabudowa, drogi i tory, a od ok. 13. poziomu pojedyncze budynki.
- Kropki miejscowości (`public/map/places.json`): 18 miast wojewódzkich, 316 powiatowych i 1984 siedziby gmin.

## Animacja startowa

Podczas ładowania czerwona linia obrysowuje granicę Polski, potem w mapę wbija się pinezka (za każdym razem w inne, losowe miasto) i pojawia się tytuł (ok. 1,8 s). Rysunek SVG i jego style są wpisane wprost w `index.html`, więc widać je, zanim wczyta się reszta gry. `src/intro.ts` czeka na domknięcie obrysu i płynnie odsłania pierwszy ekran; przy wolnym łączu gotowy obrys zostaje, a przy pinezce pulsuje kółko. Przy ustawieniu „ogranicz ruch” (`prefers-reduced-motion`) obrys pokazuje się od razu, bez animacji. Ścieżkę obrysu generuje `npm run intro` (`scripts/build_intro.mjs`) z `public/map/poland.json`.

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
| granice województw (podpowiedź) | Państwowy Rejestr Granic (GUGiK), w wersji GeoJSON z repozytorium ppatrzyk/polska-geojson | dane publiczne bez opłat |

Pipeline:

```bash
npm run map                               # obrys Polski, główne rzeki, mapa awaryjna i granice województw
npm run intro                             # uproszczony obrys Polski (ok. 300 punktów) dla animacji startowej -> index.html
python3 scripts/fetch_places.py           # miejscowości w trzech rangach z Wikidata -> public/map/places.json
python3 scripts/fetch_wikidata.py         # kandydaci: ~40 klas obiektów w Polsce (zamki, kościoły, ratusze…)
python3 scripts/fetch_commons.py          # licencje i miniatury zdjęć + wstępy artykułów z plwiki
python3 scripts/build_puzzles.py          # filtrowanie, województwo każdej zagadki i pula -> public/data/puzzles.json
python3 scripts/build_schedule.py         # harmonogram dni -> public/data/schedule.json
```

Reguły jakości w `build_puzzles.py`:
- licencja zdjęcia musi dopuszczać użycie z podaniem autora (CC0, PD, CC BY, CC BY-SA),
- zdjęcie ma min. 800 px szerokości, bez panoram, map, planów, herbów i wnętrz,
- data jest jednoznaczna, z dokładnością do roku, w przedziale 1000 – dziś,
- obiekt istnieje (pomijamy budowle rozebrane i zniszczone, bo gra ma zachęcać do odwiedzin),
- jeden obiekt na zdjęcie i na ~150 m,
- bez instytucji (muzeum, ośrodek; ich data to zwykle założenie, a nie budowa), cmentarzy i browarów (zdjęcia butelek, data założenia firmy),
- każda zagadka dostaje pole `woj` (np. „małopolskie”): punkt jest sprawdzany w wielokątach z `public/map/wojewodztwa.json`, czyli tych samych, które gra podświetla; skrypt uzupełnia to pole także w `public/data/sponsored.json`. Granice z Natural Earth okazały się za mało dokładne (ok. 1% zagadek przy granicach trafiało do złego województwa), dlatego użyto Państwowego Rejestru Granic,
- trudność wynika z rozpoznawalności, czyli liczby wersji językowych Wikipedii: łatwe ≥ 9, średnie 4–8, trudne ≤ 3.

Ręczne poprawki redakcyjne:
- `data/exclude.txt` to czarna lista QID, jeden na linię, np. obiekty z błędną datą,
- `data/curated.json` to obiekty dodane ręcznie, z rokiem podanym przez redakcję. Służy dla znanych miejsc, którym w Wikidata brakuje dokładnej daty (np. Wawel ma tam tylko „XI w.”).

**Stan obecny:** 1095 zagadek (185 łatwych, 418 średnich, 492 trudnych). Harmonogram ma 185 dni (od 11.11.2026 do 14.05.2027) bez żadnej powtórki; potem zaczną się powtarzać zagadki łatwe, bo jest ich 185.

### Harmonogram dni

`build_schedule.py` układa każdy dzień według tych zasad: 1 łatwa, 1 średnia i 1 trudna zagadka, w tej kolejności; trzy różne kategorie, trzy różne województwa i trzy różne stulecia; nic bliżej niż 15 km od siebie.
Plik jest **tylko dopisywany**, więc odświeżenie danych nie zmienia graczom dzisiejszego wyzwania. Wyjątkiem jest `python3 scripts/build_schedule.py --rebuild`, które układa wszystko od nowa z zachowaniem daty startu (do użycia tylko przed premierą). Gdy harmonogram się skończy, gra sama dobiera zagadki deterministycznie z daty.
Workflow `.github/workflows/data.yml` co miesiąc dopisuje kolejne dni.

## Zapis gry (dla rankingu i innych modułów)

Postęp dnia jest w `localStorage` pod kluczem `gdziewpolsce:day` jako `DayState` (`src/types.ts`). Każda runda to jeden `Guess`:

| Pole | Znaczenie |
|---|---|
| `locPts`, `yearPts` | punkty za miejsce i za rok **po odjęciu kosztu podpowiedzi**. Wynik dnia to zawsze suma `locPts + yearPts` ze wszystkich rund (`totalPoints` w `src/score.ts`), maks. 3000 |
| `lat`, `lon`, `year`, `km`, `yearDiff` | odpowiedź gracza; dla rund z `gaveUp` są zerami bez znaczenia |
| `hintLoc`, `hintYear` | `true`, gdy gracz użył podpowiedzi „Województwo” / „Wiek” (pola nieobecne = bez podpowiedzi) |
| `gaveUp` | `"round"` = zagadka pominięta, `"day"` = runda nierozegrana po „Przerwij dzisiejsze wyzwanie” (znika, gdy gracz wróci do gry); w obu przypadkach 0 punktów |

Punkty rundy liczy jedna funkcja `scoreRound` w `src/score.ts`; używa jej i gra, i serwer rankingu (`recomputeScore` w `src/ranking-core.ts`), który dostaje całe `guesses` i sam przelicza wynik z pól `lat`, `lon`, `year`, `hintLoc`, `hintYear`, `gaveUp`.

`DayState.hints` przechowuje podpowiedzi użyte w trwającej rundzie, żeby odświeżenie strony ich nie cofało. Po przerwaniu dnia tablica `guesses` jest pełna (rundy `"day"`), ale wynik tylko czeka w `Stats.pending` (`src/storage.ts`): gdy gracz wróci i dokończy, dzień liczy się normalnie; gdy nie dokończy do północy, dzień trafia do statystyk z osiągniętym wynikiem, a seria się zeruje. Takiego wyniku nie da się zgłosić do rankingu, dopóki gra nie jest dokończona. Dopóki można wrócić, podsumowanie ukrywa odpowiedzi nierozegranych zagadek; link „Nie wracam do gry — pokaż odpowiedzi” ustawia `DayState.closed` i odsłania je (z przyciskami „Wikipedia”), ale zamyka powrót. Pominięcie pojedynczej zagadki („Pomiń tę zagadkę”) nie przerywa serii.

## Zagadki sponsorowane

Kampanie partnerów są w `public/data/sponsored.json`:

```jsonc
{
  "campaigns": [{
    "id": "torun-2027-wiosna",            // trafia do utm_campaign w linku partnera
    "from": "2027-04-01", "to": "2027-04-30",
    "sponsor": { "name": "Urząd Miasta …", "url": "https://…", "cta": "Zaplanuj wizytę", "logo": "sponsors/…svg" },
    "puzzles": [ { /* pełny rekord zagadki jak w puzzles.json (z polem woj), może mieć własne zdjęcie partnera */ } ]
  }]
}
```

- Zagadka sponsorowana zastępuje **2. rundę** (z trzech). Dziennie jest maks. jedna; kilka aktywnych kampanii rotuje.
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
