# Szczekaczka

Prosty czytnik newsów z polskiego rynku: komunikaty spółek (ESPI/EBI), komunikaty GPW i newsy Stooq w jednej liście. Nowe nagłówki czyta na głos i pokazuje jako powiadomienia na pulpicie.

## Źródła

| W aplikacji | Kanał | RSS |
|---|---|---|
| ESPI | ESPI/EBI | `https://www.bankier.pl/rss/espi.xml` |
| GPW | KOMUNIKATY | `https://www.gpw.pl/rss_komunikaty` |
| GPW | INDEKSY | `https://www.gpw.pl/rss_komunikaty_indeksowe` |
| GPW | KALENDARZ | `https://www.gpw.pl/rss-kalendarium-zdarzen` |
| GPW | PRASA | `https://www.gpw.pl/rss_komunikaty_prasowe` |
| GPW | AKTUALNOŚCI | `https://www.gpw.pl/rss_aktualnosci` |
| STOOQ | BIZNES / KRAJ / ŚWIAT | `https://static.stooq.pl/rss/pl/{b,c,w}.rss` |

Lista jest w `src/lib/sources.ts`.

## Jak to działa

- Przeglądarka nie może czytać tych kanałów bezpośrednio (CORS), więc pobiera je serwer: `/api/news` na Vercel ściąga wszystkie kanały równolegle przy każdym odświeżeniu, parsuje je (także kodowania ISO-8859-2 / windows-1250) i zwraca jedną listę bez duplikatów.
- Strona odświeża listę co minutę. Nowe newsy dostają znacznik NOWE.
- **Głos** (Web Speech API, polski głos z systemu): czyta nowe newsy z zaznaczonych kanałów. GPW z przedrostkiem „GPW:”, ESPI i Stooq samym tytułem. Przy wielu naraz czyta najnowsze, a resztę podsumowuje.
- **Powiadomienia na pulpicie**: działają, dopóki strona jest otwarta w karcie.
- **Obserwowane spółki**: ESPI przysyła bardzo dużo raportów, więc na głos i w powiadomieniach są tylko spółki z tej listy (nazwy lub tickery po przecinku). Na liście widać wszystkie.
- KALENDARZ GPW jest domyślnie wyciszony (zapowiedzi zdarzeń, nie bieżące komunikaty). Każdy kanał można włączyć lub wyłączyć w ustawieniach.
- Do tego: filtry źródeł i kanałów, wyszukiwarka (`/`), zapisane na później, oznaczanie przeczytanych, jasny i ciemny motyw, „nie wygaszaj ekranu”.

Ustawienia, przeczytane i zapisane są trzymane tylko w przeglądarce (localStorage).

## Uruchomienie

```bash
npm ci
npm run dev        # http://localhost:3000
npm run build
npm run typecheck
```

## Vercel

Projekt importuje się z GitHuba na vercel.com/new (framework: Next.js, bez zmiennych środowiskowych). Każdy merge do `main` publikuje nową wersję, a każdy PR dostaje własny podgląd.
