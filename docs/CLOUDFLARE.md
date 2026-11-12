# Cloudflare: hosting gry i ranking

Gra działa na **Cloudflare Pages** (pliki statyczne z `dist/`), a ranking na **Pages Functions** (katalog `functions/`) z bazą **D1**.
Cloudflare sam pobiera kod z GitHuba i publikuje grę po każdej zmianie w gałęzi `main`. W repozytorium nie ma żadnych haseł ani tokenów.

Projekt jest w pełni osobny: własny projekt Pages `gdziewpolsce`, własna baza `gdziewpolsce-ranking`, własna domena. Z innymi projektami na tym samym koncie Cloudflare nie dzieli niczego.

## Wdrożenie od zera (ok. 10 minut, wszystko w panelu Cloudflare)

### Krok 1. Baza rankingu

1. Wejdź na https://dash.cloudflare.com i zaloguj się.
2. W menu po lewej: **Storage & Databases → D1 SQL Database**.
3. Kliknij **Create Database**. Nazwa: `gdziewpolsce-ranking`. Lokalizacja: **Eastern Europe (EEUR)** albo zostaw automatyczną. Kliknij **Create**.
4. Otwórz nową bazę i przejdź do zakładki **Console**.
5. Otwórz plik [`migrations/0001_ranking.sql`](../migrations/0001_ranking.sql). Ma cztery linie. Wklejaj je **po jednej**: wklej linię, kliknij **Execute**, potem następną.
   W zakładce **Tables** powinny pojawić się tabele `scores` i `day_stats`.

Co jest w bazie: `scores` to wpisy rankingu (jeden na urządzenie na dzień, liczy się pierwszy). `device` to skrót SHA-256 losowego identyfikatora z przeglądarki. `nick` pusty (NULL) oznacza wpis usunięty przez gracza. `day_stats` to licznik wpisów na dzień. Plik celowo nie ma komentarzy, bo konsola Cloudflare skleja wklejony tekst w jedną linię i komentarz wyłączyłby wszystko po nim.

### Krok 2. Projekt Pages

1. W menu po lewej: **Compute (Workers) → Workers & Pages** → **Create**.
2. Wybierz zakładkę **Pages** (na nowszym ekranie: link „Looking to deploy Pages? Get started” na dole) → **Import an existing Git repository**.
3. Połącz konto GitHub (jeśli Cloudflare o to poprosi, daj dostęp **tylko** do repozytorium `gdziewpolsce`) i wybierz repozytorium `fredtestujeai-hash/gdziewpolsce`.
4. Ustawienia:
   - **Project name:** `gdziewpolsce`
   - **Production branch:** `main`
   - **Framework preset:** `None`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
5. Kliknij **Save and Deploy** i poczekaj, aż budowanie się skończy (1–2 minuty). Gra jest już pod adresem `https://gdziewpolsce.pages.dev` (jeśli nazwa była zajęta, Cloudflare pokaże nieco inny adres).

### Krok 3. Podpięcie bazy do projektu

1. W projekcie `gdziewpolsce`: **Settings → Bindings → Add → D1 database**.
2. **Variable name:** `DB` (dokładnie tak, wielkimi literami). **D1 database:** `gdziewpolsce-ranking`. Zapisz.
3. Wejdź w **Deployments**, przy najnowszym wdrożeniu kliknij trzy kropki → **Retry deployment** (podpięcie bazy zaczyna działać od następnego wdrożenia).

Sprawdzenie: adres `https://gdziewpolsce.pages.dev/api/ranking` powinien pokazać tekst zaczynający się od `{"day":"…","total":0`.
Jeśli pokazuje „Ranking jest chwilowo niedostępny”, baza nie jest podpięta (wróć do kroku 3).

### Krok 4. Własna domena

1. Kup domenę. Rejestrator Cloudflare najpewniej **nie obsługuje końcówki `.pl`** (sprawdzisz to w panelu: **Domain Registration → Register Domains**, wpisz nazwę). Domenę `.pl` kupuje się więc u dowolnego polskiego rejestratora (np. OVH, nazwa.pl, home.pl, cyber_Folks; zwróć uwagę na cenę **odnowienia**, a nie tylko pierwszego roku).
2. W Cloudflare: **Account Home → Add a domain**, wpisz domenę, wybierz plan **Free**. Cloudflare poda dwa adresy serwerów nazw (np. `xxx.ns.cloudflare.com`).
3. U rejestratora, w ustawieniach domeny, zamień serwery nazw (DNS/NS) na te dwa z Cloudflare. Zmiana zaczyna działać zwykle w ciągu godziny, czasem do doby.
4. W projekcie Pages `gdziewpolsce`: **Custom domains → Set up a custom domain**, wpisz domenę i zatwierdź. Cloudflare sam doda wpis DNS i certyfikat.
5. Na koniec w kodzie trzeba ustawić adres gry: `siteUrl` w `src/config.ts` oraz adres kanoniczny i `og:url` w `index.html`.

## Jak to działa na co dzień

- Każdy push do `main` → Cloudflare buduje grę (`npm run build`) i publikuje ją razem z funkcjami z katalogu `functions/`.
- Zmiany w strukturze bazy to kolejne pliki w `migrations/`; ich treść wkleja się w konsoli bazy (krok 1.5).
- GitHub Pages działa równolegle jak dotąd. Tam nie ma serwera, więc ranking się po prostu nie pokazuje.

## Ranking

| Adres | Co robi |
|---|---|
| `GET /api/ranking?day=RRRR-MM-DD` | 10 najlepszych wyników dnia, liczba graczy, miejsce gracza (jeśli przeglądarka poda swój identyfikator w nagłówku `X-Device`) |
| `POST /api/score` | dołączenie do rankingu: `{day, device, nick, ids, guesses}` |
| `DELETE /api/score` | gracz usuwa wszystkie swoje wpisy: `{device}` |

Zasady:

- **Dobrowolnie i bez konta.** Gracz po ukończeniu wyzwania wpisuje nick. Przeglądarka losuje wtedy identyfikator i trzyma go w `localStorage`.
- **Jeden wynik na urządzenie na dzień, liczy się pierwszy.**
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
-- usunięcie wpisu
DELETE FROM scores WHERE day = '2026-11-12' AND nick = 'TenNick';
UPDATE day_stats SET n = n - 1 WHERE day = '2026-11-12';
```

### Czy ranking da się oszukać?

Tak, i trzeba to powiedzieć wprost. Odpowiedzi do zagadek są w publicznym pliku `public/data/puzzles.json`, więc ktoś obeznany technicznie może wysłać idealne odpowiedzi.

Co mamy na start: serwer nie przyjmuje gotowego wyniku, tylko sam go liczy z odpowiedzi, więc nie da się wpisać „miliona punktów” ani wyniku z innego dnia; jedno urządzenie ma jeden wynik dziennie; są limity zgłoszeń. To wystarcza przeciw przypadkowym żartownisiom.

Czego to nie zatrzyma: wysłania bezbłędnych odpowiedzi podejrzanych w pliku, ani wyczyszczenia danych przeglądarki i zagrania drugi raz.

Pełniejsza ochrona (ok. 2–4 dni pracy): odpowiedzi znikają z publicznego pliku, każdą rundę ocenia serwer, a zdjęcia są serwowane z własnego adresu pod nazwami, które niczego nie zdradzają. Nawet wtedy ktoś może szukać zdjęcia w Google albo zagrać najpierw na drugim urządzeniu; z tym radzą sobie tylko konta graczy. Rozsądnie jest zacząć od obecnego poziomu i wrócić do tematu, jeśli ranking zacznie być psuty.

## Ile to kosztuje

Cel: **0 zł miesięcznie** (poza domeną, zwykle kilkadziesiąt złotych rocznie za `.pl`).

Darmowy plan Cloudflare (limity warto potwierdzić w panelu, bo bywają zmieniane):

- **Pages:** nielimitowany ruch i transfer dla plików statycznych, 500 budowań miesięcznie (każdy push do `main` to jedno budowanie).
- **Pages Functions:** 100 000 wywołań dziennie. Wejście na stronę startową i na podsumowanie to po jednym wywołaniu, dołączenie do rankingu to kolejne, czyli starcza na ok. 30 000 graczy dziennie.
- **D1:** 5 mln odczytanych i 100 tys. zapisanych wierszy dziennie, 5 GB danych. Ciasno robi się przy kilku tysiącach graczy w rankingu jednego dnia; wtedy pomoże krótka pamięć podręczna odpowiedzi albo płatny plan Workers (5 USD miesięcznie).

Po przekroczeniu darmowych limitów Cloudflare niczego nie dolicza: ranking przestaje odpowiadać do końca dnia, a sama gra działa dalej.

Po podpięciu własnej domeny warto dodać w Cloudflare regułę ograniczania liczby zapytań: **Security → WAF → Rate limiting rules**, np. ścieżka `/api/score`, 10 zapytań na minutę z adresu (jedna reguła jest w planie darmowym).

## Uruchomienie lokalne (dla programisty)

```bash
npm run build
npx wrangler@4 d1 migrations apply gdziewpolsce-ranking --local   # lokalna baza w .wrangler/
npx wrangler@4 pages dev dist                                      # http://localhost:8788
npm test                                                           # m.in. tests/ranking.test.ts
```
