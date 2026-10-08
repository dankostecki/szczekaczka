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
- Strona odświeża listę co 1, 5, 10 lub 15 minut (ustawienie). Nowe newsy dostają znacznik NOWE.
- **Obciążenie nie rośnie z liczbą użytkowników:** `/api/news` trzyma jedną wspólną kopię listy przez 50 s (`CACHE_SECONDS`), CDN Vercela odpowiada sam, a kanały bez zmian i rzadkie kanały GPW nie są ponownie przetwarzane. W nocy i w weekendy strona pyta najwyżej co 10 min, ukryta karta bez głosu i powiadomień nie pyta wcale. Szczegóły, pomiary i decyzje (czemu nie WebSockety): [`docs/wydajnosc-vercel.md`](docs/wydajnosc-vercel.md). Koszt każdego odświeżenia widać w nagłówku `Server-Timing` i w logach funkcji.
- Strona `/o-stronie` pokazuje wszystkie źródła, kanały i adresy RSS (generowane z `src/lib/sources.ts`).
- **Głos** (Web Speech API): do wyboru wszystkie polskie głosy przeglądarki i systemu, z opisem (kobieta / mężczyzna, naturalny) i odsłuchem. Zestaw zależy od przeglądarki: Edge ma naturalne głosy Microsoft (np. Zofia, Marek), Chrome „Google polski”, Mac i iPhone np. Zosię. Automatycznie wybierany jest najlepszy (naturalny, potem Google). Czyta nowe newsy z zaznaczonych kanałów. W ustawieniach: sam tytuł albo tytuł i lead (pełne zdania, bez daty i „(PAP)” na początku), „GPW:” przed komunikatami GPW. Stooq i ESPI bez nazwy źródła. Przy wielu naraz czyta najnowsze, a resztę podsumowuje.
- **Powiadomienia na pulpicie**: działają, dopóki strona jest otwarta w karcie.
- **Obserwowane spółki**: ESPI przysyła bardzo dużo raportów, więc na głos i w powiadomieniach są tylko spółki z tej listy (nazwy lub tickery po przecinku). Na liście widać wszystkie.
- KALENDARZ GPW jest domyślnie wyciszony (zapowiedzi zdarzeń, nie bieżące komunikaty). Każdy kanał można włączyć lub wyłączyć w ustawieniach.
- Do tego: filtry źródeł i kanałów, wyszukiwarka (`/`), zapisane na później, oznaczanie przeczytanych, jasny i ciemny motyw, „nie wygaszaj ekranu”.

Ustawienia, przeczytane i zapisane są trzymane tylko w przeglądarce (localStorage).

## Prywatność i regulamin

- `/polityka-prywatnosci` i `/regulamin`: treść opisuje dokładnie to, co robi aplikacja (bez cookies, bez analityki, bez zewnętrznych skryptów; localStorage na urządzeniu; logi hostingu Vercel; głosy chmurowe przeglądarki).
- Przy pierwszym wejściu pokazuje się okno informacyjne (nie zgoda: nie ma niczego opcjonalnego do zaakceptowania). W ustawieniach jest „Usuń wszystkie dane z tej przeglądarki”.
- Dane administratora i data obowiązywania są w `src/lib/site.ts` (`OPERATOR`, `LEGAL_DATE`). **Jeśli dodasz analitykę, reklamy, zewnętrzne czcionki lub inne skrypty z cudzych serwerów, zaktualizuj politykę prywatności, a dla narzędzi śledzących potrzebna będzie zgoda.**

## Uruchomienie

```bash
npm ci
npm run dev        # http://localhost:3000
npm run build
npm run typecheck
```

## Vercel

Projekt importuje się z GitHuba na vercel.com/new (framework: Next.js, bez zmiennych środowiskowych). Każdy merge do `main` publikuje nową wersję, a każdy PR dostaje własny podgląd.
