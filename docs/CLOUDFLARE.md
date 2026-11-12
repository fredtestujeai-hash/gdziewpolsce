# Cloudflare: hosting gry i ranking

Gra działa na **Cloudflare Workers**: pliki statyczne z `dist/` serwuje Cloudflare, a ranking obsługuje mały serwer (`worker/index.ts`) z bazą **D1**.
Cloudflare sam pobiera kod z GitHuba i publikuje grę po każdej zmianie w gałęzi `main`. W repozytorium nie ma żadnych haseł ani tokenów. Ustawienia są w pliku `wrangler.toml`.

Projekt jest w pełni osobny: własny Worker `gdziewpolsce`, własna baza `gdziewpolsce-ranking`, własna domena. Z innymi projektami na tym samym koncie Cloudflare nie dzieli niczego.

## Wdrożenie od zera (ok. 5 minut, wszystko w panelu Cloudflare)

### Krok 1. Projekt połączony z GitHubem

1. Wejdź na https://dash.cloudflare.com i zaloguj się.
2. W menu po lewej: **Compute (Workers) → Workers & Pages** → **Create** → **Import a repository**.
3. Połącz konto GitHub (daj dostęp **tylko** do repozytorium `gdziewpolsce`) i wybierz `fredtestujeai-hash/gdziewpolsce`.
4. Ustawienia:
   - **Project name:** `gdziewpolsce`
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
5. Kliknij **Create and deploy** i poczekaj 1–2 minuty. Adres gry (w rodzaju `https://gdziewpolsce.TWOJA-NAZWA.workers.dev`) jest widoczny na stronie projektu.

### Krok 2. Baza rankingu

Nic nie trzeba klikać. Przy wdrożeniu Cloudflare podpina bazę D1 o nazwie `gdziewpolsce-ranking` (jeśli jej nie ma, tworzy ją), a tabele zakłada sam serwer przy pierwszym zapytaniu.

Gdyby wdrożenie zgłosiło błąd dotyczący bazy: otwórz **Storage & Databases → D1 SQL Database → gdziewpolsce-ranking**, skopiuj **Database ID** i dopisz go w `wrangler.toml` jako linię `database_id = "…"` pod `database_name` (identyfikator nie jest sekretem).

### Krok 3. Sprawdzenie

Otwórz adres gry z dopiskiem `/api/ranking`. Powinien pokazać się tekst zaczynający się od `{"day":"…","total":0`.

### Krok 4. Własna domena

Gra ma domenę **gdziewpolsce.com**, kupioną w rejestratorze Cloudflare (**Domain Registration**), więc jest od razu na tym samym koncie i nie trzeba przepinać serwerów nazw.

1. W projekcie `gdziewpolsce`: **Settings → Domains & Routes → Add → Custom domain**.
2. Wpisz `gdziewpolsce.com` i zatwierdź. Cloudflare sam doda wpis DNS i certyfikat (zwykle kilka minut).
3. Opcjonalnie powtórz to dla `www.gdziewpolsce.com`.

Adres gry jest wpisany w kodzie w dwóch miejscach: `siteUrl` w `src/config.ts` (trafia do tekstu udostępniania wyniku) oraz adres kanoniczny i `og:url` w `index.html`.

Uwaga: rejestrator Cloudflare nie sprzedaje wszystkich końcówek (m.in. `.pl` najpewniej nie). Taką domenę kupuje się u innego rejestratora, dodaje w Cloudflare (**Add a domain**, plan Free) i przepina u rejestratora serwery nazw na podane przez Cloudflare.

## Jak to działa na co dzień

- Każdy push do `main` → Cloudflare buduje grę (`npm run build`) i publikuje ją razem z serwerem rankingu (`npx wrangler deploy`).
- Struktura bazy jest zapisana w `src/ranking-server.ts` (`SCHEMA`).
- Stary adres na GitHub Pages tylko przekierowuje na `gdziewpolsce.com` (strona `.github/pages-redirect.html`, podmieniana w `.github/workflows/deploy.yml`).

### Gdy nowe zmiany nie pojawiają się na stronie

Otwórz projekt w Cloudflare → **Settings → Build**. Jeśli na górze jest komunikat „This project is disconnected from your Git account”, Cloudflare stracił dostęp do repozytorium i nie buduje nowych zmian. Kliknij **Manage** i na GitHubie upewnij się, że aplikacja **Cloudflare Workers and Pages** ma dostęp do repozytorium `gdziewpolsce` (w razie potrzeby **Disconnect** i ponownie **Connect**). Budowanie ruszy przy następnej zmianie w `main`.

## Ranking

| Adres | Co robi |
|---|---|
| `GET /api/ranking?day=RRRR-MM-DD&period=day\|week\|month\|year` | 10 najlepszych wyników dnia albo sum punktów z tygodnia, miesiąca lub roku, liczba graczy, miejsce gracza (jeśli przeglądarka poda swój identyfikator w nagłówku `X-Device`) |
| `POST /api/score` | dołączenie do rankingu: `{day, device, nick, ids, guesses}` |
| `DELETE /api/score` | gracz usuwa wszystkie swoje wpisy: `{device}` |

Zasady:

- **Dobrowolnie i bez konta.** Gracz po ukończeniu wyzwania wpisuje nick. Przeglądarka losuje wtedy identyfikator i trzyma go w `localStorage`.
- **Jeden wynik na urządzenie na dzień, liczy się pierwszy.**
- **Cztery rankingi:** dzień, tydzień (poniedziałek–niedziela), miesiąc i rok kalendarzowy. Trzy ostatnie to suma punktów z dni, w których gracz dołączył do rankingu; przy remisie wyżej jest ten, kto wcześniej zdobył swoją sumę. Serwer trzyma gotowe sumy (tabela `totals`) i dopisuje do nich punkty przy każdym nowym wyniku, więc odczyt kosztuje tyle samo co ranking dnia.
- **Wynik liczy serwer.** Przeglądarka wysyła odpowiedzi (pinezka i rok), a serwer przelicza punkty tymi samymi wzorami co gra (`src/score.ts`) i dla zagadek z tego dnia. Liczby punktów od przeglądarki nie przyjmuje.
- **Dzień musi być dzisiejszy w czasie polskim** (z 30-minutowym zapasem po północy dla kończących grę).
- **Nick:** 2–20 znaków, litery, cyfry, spacja, kropka, myślnik, podkreślnik; prosty filtr wulgaryzmów (`src/ranking-core.ts`).
- **Limity:** najwyżej 8 zgłoszeń na minutę z jednego adresu (licznik tylko w pamięci, nigdzie niezapisywany) i 20 000 wpisów dziennie.
- **Co jest w bazie:** dzień, nick, wynik, czas zgłoszenia i skrót (SHA-256) identyfikatora urządzenia. **Adresów IP nie zapisujemy.**

### Usuwanie wpisów

- Gracz: link „Usuń moje wpisy z rankingu” pod rankingiem.
- Właściciel (np. wulgarny nick, który przeszedł filtr): w panelu Cloudflare otwórz bazę `gdziewpolsce-ranking` → **Console** i wykonaj:

```sql
-- podgląd dzisiejszych wpisów
SELECT day, nick, score FROM scores WHERE day = '2026-11-12' ORDER BY score DESC;
-- usunięcie wszystkich wpisów gracza o danym nicku (także z rankingów tygodnia, miesiąca i roku)
DELETE FROM totals WHERE device IN (SELECT device FROM scores WHERE nick = 'TenNick');
DELETE FROM scores WHERE nick = 'TenNick';
-- liczniki graczy („W rankingu: N”) poprawią się same przy następnym dniu; można je też przeliczyć:
UPDATE day_stats SET n = (SELECT COUNT(*) FROM scores WHERE scores.day = day_stats.day AND nick IS NOT NULL) WHERE day LIKE '20%';
UPDATE day_stats SET n = (SELECT COUNT(*) FROM totals WHERE totals.period = day_stats.day) WHERE day LIKE '_:%';
```

### Czy ranking da się oszukać?

Tak, i trzeba to powiedzieć wprost. Odpowiedzi do zagadek są w publicznym pliku `public/data/puzzles.json`, więc ktoś obeznany technicznie może wysłać idealne odpowiedzi.

Co mamy na start: serwer nie przyjmuje gotowego wyniku, tylko sam go liczy z odpowiedzi, więc nie da się wpisać „miliona punktów” ani wyniku z innego dnia; jedno urządzenie ma jeden wynik dziennie; są limity zgłoszeń. To wystarcza przeciw przypadkowym żartownisiom.

Czego to nie zatrzyma: wysłania bezbłędnych odpowiedzi podejrzanych w pliku, ani wyczyszczenia danych przeglądarki i zagrania drugi raz.

Pełniejsza ochrona (ok. 2–4 dni pracy): odpowiedzi znikają z publicznego pliku, każdą rundę ocenia serwer, a zdjęcia są serwowane z własnego adresu pod nazwami, które niczego nie zdradzają. Nawet wtedy ktoś może szukać zdjęcia w Google albo zagrać najpierw na drugim urządzeniu; z tym radzą sobie tylko konta graczy. Rozsądnie jest zacząć od obecnego poziomu i wrócić do tematu, jeśli ranking zacznie być psuty.

## Ile to kosztuje

Cel: **0 zł miesięcznie** poza domeną `gdziewpolsce.com`, odnawianą raz w roku w Cloudflare po cenie hurtowej (ok. 10 USD).

Darmowy plan Cloudflare (limity warto potwierdzić w panelu, bo bywają zmieniane):

- **Pliki statyczne:** nielimitowany ruch i transfer; 3000 minut budowania miesięcznie (jedno budowanie to ok. 2 minuty).
- **Serwer rankingu (Workers):** 100 000 wywołań dziennie; pliki gry się do tego nie liczą. Wejście na stronę startową i na podsumowanie to po jednym wywołaniu, dołączenie do rankingu to kolejne, czyli starcza na ok. 30 000 graczy dziennie.
- **D1:** 5 mln odczytanych i 100 tys. zapisanych wierszy dziennie, 5 GB danych. Jedno dołączenie do rankingu to kilkanaście zapisanych wierszy (wynik dnia plus sumy tygodnia, miesiąca i roku), więc ciasno robi się przy kilku tysiącach graczy w rankingu jednego dnia; wtedy pomoże krótka pamięć podręczna odpowiedzi albo płatny plan Workers Paid (5 USD miesięcznie).

Po przekroczeniu darmowych limitów Cloudflare niczego nie dolicza: ranking przestaje odpowiadać do końca dnia, a sama gra działa dalej.

Po podpięciu własnej domeny warto dodać w Cloudflare regułę ograniczania liczby zapytań: **Security → WAF → Rate limiting rules**, np. ścieżka `/api/score`, 10 zapytań na minutę z adresu (jedna reguła jest w planie darmowym).

## Uruchomienie lokalne (dla programisty)

```bash
npm run build
npx wrangler@4 dev        # http://localhost:8787, lokalna baza w .wrangler/
npm test                  # m.in. tests/ranking.test.ts
```
