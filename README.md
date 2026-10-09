# Szczekaczka

Prosty czytnik newsów z polskiego rynku: komunikaty spółek (ESPI/EBI), komunikaty GPW, newsy Stooq, komunikaty prasowe PAP MediaRoom i, po angielsku, wiadomości CNBC w jednej liście. Nowe nagłówki czyta na głos i pokazuje jako powiadomienia na pulpicie.

## Źródła

| W aplikacji | Kanał | RSS |
|---|---|---|
| ESPI | ESPI/EBI | `https://www.bankier.pl/rss/espi.xml` |
| GPW | KOMUNIKATY | `https://www.gpw.pl/rss_komunikaty` |
| GPW | PRASA | `https://www.gpw.pl/rss_komunikaty_prasowe` |
| GPW | AKTUALNOŚCI | `https://www.gpw.pl/rss_aktualnosci` |
| STOOQ | BIZNES / KRAJ / ŚWIAT | `https://static.stooq.pl/rss/pl/{b,c,w}.rss` |
| PAP | BIZNES | `https://pap-mediaroom.pl/kategoria/biznes-i-finanse/rss.xml` |
| PAP | NAUKA | `https://pap-mediaroom.pl/kategoria/nauka-i-technologie/rss.xml` |
| PAP | POLITYKA | `https://pap-mediaroom.pl/kategoria/polityka-i-społeczenstwo/rss.xml` |
| CNBC (po angielsku) | WYNIKI (Earnings) | `https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839135` |
| CNBC (po angielsku) | GOSPODARKA (Economy) | `https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258` |
| CNBC (po angielsku) | FINANSE (Finance) | `https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664` |

Lista jest w `src/lib/sources.ts`.

## Jak to działa

- Przeglądarka nie może czytać tych kanałów bezpośrednio (CORS), więc pobiera je serwer na **Cloudflare Workers**: jeden proces (Durable Object `Poller`) sprawdza kanały dla wszystkich użytkowników, co 60 s (rzadziej zmieniające się kanały GPW oraz noc i weekend rzadziej), parsuje je (także kodowania ISO-8859-2 / windows-1250) i zapamiętuje.
- **Lista pokazuje ostatnie 24 godziny.** Kanały RSS trzymają tylko kilka–kilkadziesiąt ostatnich wpisów (ESPI 10, PAP 10, Stooq 30, GPW 50), więc serwer zachowuje wpisy, które z nich wypadły, przez 24 h od publikacji (najwyżej 500 na kanał). Wpisy wciąż obecne w kanale zostają, nawet jeśli są starsze.
- **Nowe newsy przychodzą same przez WebSocket**, bez odświeżania strony: przy wejściu strona pobiera całą listę (`/api/news`), a potem serwer wysyła tylko zmiany. Nowe newsy dostają znacznik NOWE. Gdy WebSocket nie działa (np. sieć firmowa), lista odświeża się co 3 min.
- **Koszt sprawdzania źródeł nie rośnie z liczbą użytkowników.** Darmowy plan Cloudflare wystarcza z zapasem na około 1000 użytkowników. Architektura, limity, wyliczenia i ryzyka: [`docs/cloudflare.md`](docs/cloudflare.md).
- Strona `/o-stronie` pokazuje wszystkie źródła, kanały i adresy RSS (generowane z `src/lib/sources.ts`).
- **Głos** (Web Speech API): do wyboru wszystkie polskie głosy przeglądarki i systemu, z opisem (kobieta / mężczyzna, naturalny) i odsłuchem. Zestaw zależy od przeglądarki: Edge ma naturalne głosy Microsoft (np. Zofia, Marek), Chrome „Google polski”, Mac i iPhone np. Zosię. Automatycznie wybierany jest najlepszy (naturalny, potem Google). Czyta nowe newsy z zaznaczonych kanałów. W ustawieniach: sam tytuł albo tytuł i lead (pełne zdania, bez daty i „(PAP)” na początku), „GPW:” przed komunikatami GPW. Stooq, ESPI, PAP i CNBC bez nazwy źródła. Przy wielu naraz czyta najnowsze, a resztę podsumowuje.
- **Newsy po angielsku** (CNBC) czyta osobny głos angielski, wybierany w ustawieniach z listy angielskich głosów przeglądarki (z regionem, np. USA, UK). Automatycznie: naturalny, potem Google, akcent amerykański.
- **Powiadomienia na pulpicie**: działają, dopóki strona jest otwarta w karcie.
- **Obserwowane spółki**: ESPI przysyła bardzo dużo raportów, więc na głos i w powiadomieniach są tylko spółki z tej listy (nazwy lub tickery po przecinku). Na liście widać wszystkie.
- **Kanały na liście**: w ustawieniach („Kanały”) każdy kanał można ukryć lub pokazać (oko), a osobno włączyć mu czytanie na głos i powiadomienia. Ukryty kanał od razu znika z listy i nie jest czytany ani pokazywany w powiadomieniach. Serwer i tak wysyła wszystkie kanały, więc ukrywanie i pokazywanie działa od razu i nic nie kosztuje. Nowo dodany kanał jest od razu czytany i pokazywany w powiadomieniach, także u osób, które mają już zapisane ustawienia.
- Do tego: filtry źródeł i kanałów, wyszukiwarka (`/`), zapisane na później, oznaczanie przeczytanych, jasny i ciemny motyw, „nie wygaszaj ekranu”.

Ustawienia, przeczytane i zapisane są trzymane tylko w przeglądarce (localStorage).

## Prywatność i regulamin

- `/polityka-prywatnosci` i `/regulamin`: treść opisuje dokładnie to, co robi aplikacja (bez cookies, bez analityki, bez zewnętrznych skryptów; localStorage na urządzeniu; logi hostingu Cloudflare; głosy chmurowe przeglądarki).
- Przy pierwszym wejściu pokazuje się okno informacyjne (nie zgoda: nie ma niczego opcjonalnego do zaakceptowania). W ustawieniach jest „Usuń wszystkie dane z tej przeglądarki”.
- Dane administratora i data obowiązywania są w `src/lib/site.ts` (`OPERATOR`, `LEGAL_DATE`). **Jeśli dodasz analitykę, reklamy, zewnętrzne czcionki lub inne skrypty z cudzych serwerów, zaktualizuj politykę prywatności, a dla narzędzi śledzących potrzebna będzie zgoda.**

## Uruchomienie

```bash
npm ci
npm run dev        # sam interfejs na http://localhost:3000 (bez /api/news i /ws)
npm run preview    # całość jak na Cloudflare: next build + wrangler dev, http://localhost:8787
npm run typecheck  # strona i Worker
npm run deploy     # next build + wrangler deploy (zwykle robi to Cloudflare po merge do main)
```

## Adresy

- https://szczekaczka.dancoder2025.workers.dev: całość na Cloudflare.
- https://dankostecki.github.io/szczekaczka: ta sama strona na GitHub Pages. Pliki strony są na GitHubie, a lista i nowe newsy przychodzą z Workera na Cloudflare (Worker wpuszcza tę stronę: `ALLOWED_ORIGINS` w `wrangler.jsonc`). Ustawienia i zapisane newsy przeglądarka trzyma osobno dla każdego adresu.

## Cloudflare

Pliki: `wrangler.jsonc` (konfiguracja), `worker/` (Worker, `Poller`, `Hub`). Strona to statyczny eksport Next.js w `out/`.

Pierwsze podłączenie (raz):

1. Załóż darmowe konto na dash.cloudflare.com.
2. **Workers & Pages → Create → Import a repository** i wybierz `dankostecki/szczekaczka` (Cloudflare poprosi o dostęp do GitHuba).
3. Ustawienia builda: **Build command** `npm run build`, **Deploy command** `npx wrangler deploy` (domyślne), katalog główny `/`. Bez zmiennych środowiskowych.
4. Po pierwszym wdrożeniu strona jest pod `https://szczekaczka.<twoja-subdomena>.workers.dev`. Własną domenę dodaje się w Settings → Domains & Routes.

Potem każdy merge do `main` publikuje nową wersję. Zużycie limitów widać w panelu: Workers & Pages → szczekaczka → Metrics oraz w logach (wpisy `feed GPW:KOMUNIKATY: +1 -0 (v42)` przy każdej zmianie kanału).

## GitHub Pages

Workflow `.github/workflows/pages.yml` buduje stronę przy każdym merge do `main` z `PAGES_BASE_PATH=/szczekaczka` (wszystkie adresy z prefiksem) i `NEXT_PUBLIC_API_ORIGIN` (adres Workera), a potem publikuje `out/` na GitHub Pages.

Pierwsze włączenie (raz): w repozytorium **Settings → Pages → Build and deployment → Source: GitHub Actions**. Potem uruchom workflow „GitHub Pages” (zakładka Actions → Run workflow) albo poczekaj na następny merge.

Gdy zmienisz adres Workera (subdomena `workers.dev`, własna domena), popraw `NEXT_PUBLIC_API_ORIGIN` w workflow. Gdy zmienisz adres strony na GitHubie (np. własna domena dla GitHub Pages), dopisz go do `ALLOWED_ORIGINS` w `wrangler.jsonc`.
