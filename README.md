# Szczekaczka

Prosty czytnik newsów z polskiego rynku: komunikaty spółek (ESPI/EBI), komunikaty GPW, newsy Stooq, komunikaty prasowe PAP MediaRoom, po angielsku nagłówki Reuters, a także zapowiedzi danych makro 10 minut przed publikacją (z kalendarium MacroNext), w jednej liście. Nowe nagłówki czyta na głos i pokazuje jako powiadomienia na pulpicie.

## Źródła

| W aplikacji | Kanał | RSS |
|---|---|---|
| ESPI | BANKIER | `https://www.bankier.pl/gielda/wiadomosci/komunikaty-spolek` (strona z listą komunikatów, nie RSS); zajawki z `https://www.bankier.pl/rss/espi.xml` |
| GPW | KOMUNIKATY | `https://www.gpw.pl/rss_komunikaty` |
| GPW | PRASA | `https://www.gpw.pl/rss_komunikaty_prasowe` |
| GPW | AKTUALNOŚCI | `https://www.gpw.pl/rss_aktualnosci` |
| STOOQ | BIZNES / KRAJ / ŚWIAT | `https://static.stooq.pl/rss/pl/{b,c,w}.rss` |
| PAP | BIZNES | `https://pap-mediaroom.pl/kategoria/biznes-i-finanse/rss.xml` |
| PAP | NAUKA | `https://pap-mediaroom.pl/kategoria/nauka-i-technologie/rss.xml` |
| PAP | POLITYKA | `https://pap-mediaroom.pl/kategoria/polityka-i-społeczenstwo/rss.xml` |
| REUTERS (po angielsku) | MARKETS | `https://news.google.com/rss/search?q=site:reuters.com/markets+when:1d&hl=en-US&gl=US&ceid=US:en` |
| REUTERS (po angielsku) | BUSINESS | `https://news.google.com/rss/search?q=site:reuters.com/business+when:1d&hl=en-US&gl=US&ceid=US:en` |
| REUTERS (po angielsku) | WORLD | `https://news.google.com/rss/search?q=site:reuters.com/world+when:1d&hl=en-US&gl=US&ceid=US:en` |
| MACRONEXT | MAKRO | `https://macronext.pl/pl/dane-makro/d/2026-10-9` (kalendarium dnia, nie RSS): zapowiedzi tworzy serwer |

Lista jest w `src/lib/sources.ts`.

## Jak to działa

- Przeglądarka nie może czytać tych kanałów bezpośrednio (CORS), więc pobiera je serwer na **Cloudflare Workers**: jeden proces (Durable Object `Poller`) sprawdza kanały dla wszystkich użytkowników, co 60 s (rzadziej zmieniające się kanały GPW oraz noc i weekend rzadziej), parsuje je (także kodowania ISO-8859-2 / windows-1250) i zapamiętuje.
- **ESPI z listy komunikatów Bankiera.** Kanał RSS Bankiera ma tylko część raportów (10 naraz, wiele nigdy się w nim nie pojawia), więc serwer czyta stronę z listą komunikatów Bankier.pl (godzina, tytuł, link; czytana jest tylko lista, około 26 ostatnich raportów). Zajawki bierze z kanału RSS, gdy raport w nim jest. Gdy strona z listą nie przyjdzie, kanał bierze raporty z samego RSS (jak dawniej), a od trzeciej takiej próby ramka mówi „są tylko raporty z RSS”. Listy ESPI/EBI z PAP Biznes nie da się czytać z Cloudflare (PAP odsyła serwerom Cloudflare stronę bez listy).
- **Zapowiedzi danych makro (MacroNext).** Serwer czyta kalendarium MacroNext na dziś i jutro o 0:01 i 6:30 (czas polski) i 10 minut przed każdą publikacją wysyła zapowiedź: „Za 10 minut dane makro: Kanada. Stopa bezrobocia za wrzesień, konsensus 6,5%, poprzednio 6,4%. …”. Publikacje o tej samej godzinie idą w jednej zapowiedzi. Brane są dane o wysokiej i średniej wadze i wszystkie wydarzenia banków centralnych (wystąpienia, protokoły, decyzje), bez zwykłych danych z Węgier, Rumunii, Czech i Słowacji (`src/lib/macronext.ts`). Raport z podpunktami (np. „Inflacja konsumencka”) jest czytany podpunktami. Skróty są czytane słowami: n.s.a. – dane niewyrównane sezonowo, s.a. – wyrównane sezonowo, w.d.a. – wyrównane o liczbę dni roboczych, fin. – odczyt finalny, wst. – odczyt wstępny, wg – według, (r/r) – rok do roku, (m/m) – miesiąc do miesiąca. Kolumna „Prognoza” jest czytana jako konsensus. Wydarzenia bez godziny („?”) mają wspólną zapowiedź rano, o 6:40 (po porannym odczycie): „Dziś dane makro bez podanej godziny: Polska. Decyzja w sprawie stóp procentowych…”. Gdy w jednej zapowiedzi jest kilka krajów, nazwa kraju stoi przed jego danymi. Zapowiedź prowadzi do strony dnia w MacroNext.
- **Reuters przez Google News.** Reuters nie udostępnia publicznego RSS, więc kanały REUTERS to wyszukiwania Google News ograniczone do działów reuters.com (`site:reuters.com/markets` itd.) z `when:1d`, czyli z ostatniej doby. Bez tego dodatku wyszukiwanie zwraca też wyniki sprzed dni i lat (w Markets tylko 8 ze 100 było z ostatnich 24 h), a i tak serwer odrzuca wpisy starsze niż 24 h. Są tylko tytuł i godzina (bez zajawki); końcówkę „ - Reuters” serwer obcina, a link prowadzi przez Google News. Google pokazuje do 100 wyników na zapytanie.
- **Lista pokazuje ostatnie 24 godziny.** Kanały RSS trzymają tylko kilka–kilkadziesiąt ostatnich wpisów (ESPI 10, PAP 10, Stooq 30, GPW 50), więc serwer zachowuje wpisy, które z nich wypadły, przez 24 h od publikacji (najwyżej 500 na kanał). Wpisy wciąż obecne w kanale zostają, nawet jeśli są starsze.
- **Nowe newsy przychodzą same przez WebSocket**, bez odświeżania strony: przy wejściu strona pobiera całą listę (`/api/news`), a potem serwer wysyła tylko zmiany. Nowe newsy dostają znacznik NOWE. Gdy WebSocket nie działa (np. sieć firmowa), lista odświeża się co 3 min.
- **Koszt sprawdzania źródeł nie rośnie z liczbą użytkowników.** Darmowy plan Cloudflare wystarcza z zapasem na około 1000 użytkowników. Architektura, limity, wyliczenia i ryzyka: [`docs/cloudflare.md`](docs/cloudflare.md).
- Strona `/o-stronie` pokazuje wszystkie źródła, kanały i adresy RSS (generowane z `src/lib/sources.ts`).
- **Głos** (Web Speech API): do wyboru wszystkie polskie głosy przeglądarki i systemu, z opisem (kobieta / mężczyzna, naturalny) i odsłuchem. Zestaw zależy od przeglądarki: Edge ma naturalne głosy Microsoft (np. Zofia, Marek), Chrome „Google polski”, Mac i iPhone np. Zosię. Automatycznie wybierany jest najlepszy (naturalny, potem Google). Czyta nowe newsy z zaznaczonych kanałów. Domyślnie czyta same tytuły; tytuł i lead (pełne zdania, bez daty i „(PAP)” na początku) można włączyć dla każdego źródła lub kanału osobno (kolumna „Lead” w ustawieniach). Zapowiedzi MacroNext czyta domyślnie z danymi. Komunikaty GPW zawsze z „GPW:” na początku, pozostałe bez nazwy źródła. Przy wielu naraz czyta najnowsze, a resztę podsumowuje.
- **Newsy po angielsku** (Reuters) czyta osobny głos angielski, wybierany w ustawieniach z listy angielskich głosów przeglądarki (z regionem, np. USA, UK). Automatycznie: naturalny, potem Google, akcent amerykański.
- **Powiadomienia na pulpicie**: działają, dopóki strona jest otwarta w karcie.
- **Obserwowane spółki**: ESPI przysyła bardzo dużo raportów, więc na głos i w powiadomieniach są tylko spółki z tej listy (nazwy lub tickery po przecinku). Na liście widać wszystkie.
- **Kanały na liście**: w ustawieniach („Kanały”) jest wiersz na każde źródło (ESPI, GPW, Stooq, PAP, Reuters, MacroNext), który ustawia wszystkie jego kanały naraz; strzałka rozwija kanały, żeby ustawić każdy osobno. Kanał można ukryć lub pokazać (oko), a osobno włączyć mu czytanie na głos, powiadomienia i czytanie leadu. Ukryty kanał od razu znika z listy i nie jest czytany ani pokazywany w powiadomieniach. Serwer i tak wysyła wszystkie kanały, więc ukrywanie i pokazywanie działa od razu i nic nie kosztuje. Nowo dodany kanał jest od razu czytany i pokazywany w powiadomieniach, także u osób, które mają już zapisane ustawienia.
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
