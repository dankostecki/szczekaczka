# Szczekaczka

**Wersja BETA (testowa)**: mogą pojawiać się błędy.

Prosty czytnik newsów z polskiego rynku: komunikaty spółek (ESPI/EBI), komunikaty GPW, newsy Stooq, komunikaty prasowe PAP MediaRoom, a także zapowiedzi danych makro 10 minut przed publikacją i wydarzeń giełdowych przed sesją (z kalendarium MacroNext), w jednej liście. Nowe nagłówki czyta na głos i pokazuje jako powiadomienia na pulpicie.

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
| MACRONEXT | MAKRO | `https://macronext.pl/pl/kalendarium-dzis` (kalendarium na dziś, nie RSS): zapowiedzi tworzy serwer |
| MACRONEXT | GIEŁDA | `https://macronext.pl/pl/dzis-na-gieldzie` (kalendarium giełdowe na dziś, nie RSS): zapowiedzi tworzy serwer |

Lista jest w `src/lib/sources.ts`.

## Jak to działa

- Przeglądarka nie może czytać tych kanałów bezpośrednio (CORS), więc pobiera je serwer na **Cloudflare Workers**: jeden proces (Durable Object `Poller`) sprawdza kanały dla wszystkich użytkowników, co 60 s (rzadziej zmieniające się kanały GPW oraz noc i weekend rzadziej), parsuje je (także kodowania ISO-8859-2 / windows-1250) i zapamiętuje.
- **ESPI z listy komunikatów Bankiera.** Kanał RSS Bankiera ma tylko część raportów (10 naraz, wiele nigdy się w nim nie pojawia), więc serwer czyta stronę z listą komunikatów Bankier.pl (godzina, tytuł, link; czytana jest tylko lista, około 26 ostatnich raportów). Zajawki bierze z kanału RSS, gdy raport w nim jest. Gdy strona z listą nie przyjdzie, kanał bierze raporty z samego RSS (jak dawniej), a od trzeciej takiej próby ramka mówi „są tylko raporty z RSS”. Listy ESPI/EBI z PAP Biznes nie da się czytać z Cloudflare (PAP odsyła serwerom Cloudflare stronę bez listy).
- **Zapowiedzi danych makro (MacroNext · MAKRO).** Serwer czyta kalendarium MacroNext na dziś (https://macronext.pl/pl/kalendarium-dzis, strona sama pokazuje bieżący dzień) o 0:30 i 6:30 (czas polski); publikacje sprzed około 0:40 nie są zapowiadane. Gdy po północy strona pokazuje jeszcze poprzedni dzień, odczyt jest ponawiany po 1, 2, 4… minutach. Serwer i 10 minut przed każdą publikacją wysyła zapowiedź z liczbą minut i godziną publikacji: „Za 10 minut o godzinie 14:30 dane makro z Kanady”, w leadzie „Stopa bezrobocia za wrzesień, konsensus 6,5%, poprzednio 6,4%. …”. Głos czyta to samo, z godziną słowami („o godzinie czternastej 30”); przeczytana po publikacji mówi „O godzinie czternastej 30…”. Spóźniona zapowiedź (np. po nieudanym odczycie) mówi, ile minut zostało: „Za 4 minuty o godzinie…”. Publikacje o tej samej godzinie idą w jednej zapowiedzi. Brane są dane o wysokiej i średniej wadze i wszystkie wydarzenia banków centralnych (wystąpienia, protokoły, decyzje), bez zwykłych danych z Węgier, Rumunii, Czech i Słowacji (`src/lib/macronext.ts`). Raport z podpunktami (np. „Inflacja konsumencka”) jest czytany podpunktami. Skróty są czytane słowami: n.s.a. – dane niewyrównane sezonowo, s.a. – wyrównane sezonowo, w.d.a. – wyrównane o liczbę dni roboczych, fin. – odczyt finalny, wst. – odczyt wstępny, wg – według, (r/r) – rok do roku, (m/m) – miesiąc do miesiąca. Kolumna „Prognoza” jest czytana jako konsensus. Wydarzenia bez godziny („?”) mają wspólną zapowiedź rano, o 6:40 (po porannym odczycie): „Dziś bez podanej godziny: dane makro z Polski”. Kraje są odmienione („z USA i Kanady”, „ze strefy euro”); kraj spoza listy w `src/lib/macronext.ts` jest podany bez odmiany („dane makro: Islandia”). Gdy w jednej zapowiedzi jest kilka krajów, w leadzie nazwa kraju stoi przed jego danymi. Wystąpienia i spotkania są nazwane w tytule, bez kraju: „Za 10 minut o godzinie 22:00 wystąpienie szefowej Fed z Bostonu (Susan Collins)”, a gdy o tej samej godzinie są też dane: „… dane makro z USA oraz wystąpienie …”. Zapowiedź prowadzi do kalendarium MacroNext na dziś.
- **Kalendarium giełdowe (MacroNext · GIEŁDA).** Z https://macronext.pl/pl/dzis-na-gieldzie (też czytanej o 0:30 i 6:30) serwer składa trzy zapowiedzi:
  - o 8:50 przed sesją na GPW: „Dziś na giełdzie GPW i NewConnect”, w leadzie wydarzenia spółek („LPP: Dzień ustalenia prawa do dywidendy 500 zł na akcję. …”);
  - przed sesją w Nowym Jorku (NYSE, Nasdaq) o 5:15 czasu nowojorskiego, czyli zwykle 11:15 polskiego: „Dziś na NYSE przed sesją”, w leadzie spółki zebrane przy tym samym wydarzeniu („Raport za III kwartał 2026 roku opublikują: Citigroup, Goldman Sachs …”); spółki bez podanej godziny są na końcu, z dopiskiem „– nie podano godziny publikacji”;
  - po sesji o 15:55 czasu nowojorskiego (zwykle 21:55 polskiego): „Dziś na NYSE po sesji”.
  Godziny nowojorskie są przeliczane z uwzględnieniem tego, że USA i Polska zmieniają czas w różne weekendy (wtedy 10:15 i 20:55). Inne giełdy (np. LSE) są pomijane. Spóźniona zapowiedź (np. po nieudanym odczycie) jest wysyłana do 2 godzin po swojej porze.
- **Lista pokazuje ostatnie 24 godziny.** Kanały RSS trzymają tylko kilka–kilkadziesiąt ostatnich wpisów (ESPI 10, PAP 10, Stooq 30, GPW 50), więc serwer zachowuje wpisy, które z nich wypadły, przez 24 h od publikacji (najwyżej 500 na kanał). Wpisy wciąż obecne w kanale zostają, nawet jeśli są starsze.
- **Nowe newsy przychodzą same przez WebSocket**, bez odświeżania strony: przy wejściu strona pobiera całą listę (`/api/news`), a potem serwer wysyła tylko zmiany. Nowe newsy dostają znacznik NOWE. Gdy WebSocket nie działa (np. sieć firmowa), lista odświeża się co 3 min.
- **Koszt sprawdzania źródeł nie rośnie z liczbą użytkowników.** Darmowy plan Cloudflare wystarcza z zapasem na około 1000 użytkowników. Architektura, limity, wyliczenia i ryzyka: [`docs/cloudflare.md`](docs/cloudflare.md).
- Strona `/o-stronie` pokazuje wszystkie źródła, kanały i adresy RSS (generowane z `src/lib/sources.ts`).
- **Głos** (Web Speech API): do wyboru wszystkie polskie głosy przeglądarki i systemu, z opisem (kobieta / mężczyzna, naturalny) i odsłuchem. Zestaw zależy od przeglądarki: Edge ma naturalne głosy Microsoft (np. Zofia, Marek), Chrome „Google polski”, Mac i iPhone np. Zosię. Automatycznie wybierany jest najlepszy (naturalny, potem Google). Czyta nowe newsy z zaznaczonych kanałów. Domyślnie czyta same tytuły; tytuł i lead (pełne zdania, bez daty i „(PAP)” na początku) można włączyć dla każdego źródła lub kanału osobno (kolumna „Lead” w ustawieniach). Zapowiedzi MacroNext czyta domyślnie z danymi. Raporty spółek z „Nowe ESPI:” na początku, komunikaty GPW z „GPW:”, pozostałe bez nazwy źródła. Nazwy pisane wielkimi literami czyta jak słowa (ARCHICOM jako „Archicom”, DI VOLIO jako „Di Volio”), bo głosy literują nieznane słowa w wersalikach; krótkie skróty dalej literuje (PKO, GPW, KGHM, CD), a „S.A.”, „Sp. z o.o.”, „Bp” czyta w pełnym brzmieniu. Czyta jak lektor, według ogólnych zasad (`src/lib/say.ts`, `sayAloud`):
  - dwukropek po słowie to wyraźna pauza, jak kropka („Błaszczak: PiS składa” → „Błaszczak. PiS składa”, „Nowe ESPI: BUMECH SA: …” → „Nowe ESPI. Bumech spółka akcyjna. …”);
  - kwartały i lata słowami, w przypadku zależnym od słowa przed nimi („w III kw. '26” → „w trzecim kwartale dwa tysiące dwudziestego szóstego roku”, „za II kw.” → „za drugi kwartał”, „w 2026 r.” → „w dwa tysiące dwudziestym szóstym roku”, „w 3Q26”);
  - liczba z łącznikiem jako jedno słowo („19-latka” → „dziewiętnastolatka”, „3-krotnie” → „trzykrotnie”, „15-proc. wzrost” → „piętnastoprocentowy wzrost”);
  - liczby z jednostkami w odpowiedniej formie („5 mln zł” → „5 milionów złotych”, „0,25 pkt proc.”, „50 pb”, „5 proc.”, „-1,2” → „minus 1,2”);
  - skróty słowami (NWZA, ZWZA, ws., m.in., tj., r/r, m/m, k/k);
  - angielskie skróty po angielsku (AI → „ej aj”, IPO → „aj pi ou”, NFP, FDA, CEO, IT, GPT, BBC…), USGS jako „United States Geological Survey” wymówione po angielsku, „Pay” w nazwach jako „pej” (OPay → „O pej”, PayPal, PayU); pozostałe skróty po polsku (PKB, NBP, USA);
  - rynki: WIG, mWIG, sWIG jako słowo („WIG20” → „wig 20”), S&P 500 → „es and pi 500”, „na FX/FI” → „na rynku walutowym i obligacji”, pary walut literami po polsku (EUR/PLN → „euro pe el en”, USD/PLN → „u es de pe el en”);
  - godzina zapowiedzi MacroNext tuż po północy jako minuty po północy („Za 10 minut, 30 minut po północy, dane makro z Japonii”). Przy wielu naraz czyta najnowsze, a resztę podsumowuje. Na telefonie czyta tylko, gdy strona jest na ekranie (przy wygaszonym ekranie lub w innej aplikacji przeglądarka usypia stronę). Mowa, która utknęła w kolejce (telefony nie zawsze wznawiają ją po włączeniu ekranu), jest czyszczona przed kolejnym newsem. Gdy przeglądarka odmówi czytania bez dotknięcia strony, pojawia się przycisk „Wznów czytanie”.
- **Powiadomienia na pulpicie**: działają, dopóki strona jest otwarta w karcie.
- **Obserwowane spółki**: ESPI przysyła bardzo dużo raportów, więc na głos i w powiadomieniach są tylko spółki z tej listy (nazwy lub tickery po przecinku). Na liście widać wszystkie.
- **Pasek źródeł** na wąskim ekranie przewija się w bok: strona, po której są kolejne zakładki, wygasa i ma strzałkę (dotknięcie przewija dalej), a wybrana zakładka jest przewijana do widoku (`src/components/ScrollRow.tsx`).
- **Kanały na liście**: w ustawieniach („Kanały”) jest wiersz na każde źródło (ESPI, GPW, Stooq, PAP, MacroNext), który ustawia wszystkie jego kanały naraz; strzałka rozwija kanały, żeby ustawić każdy osobno. Kanał można ukryć lub pokazać (oko), a osobno włączyć mu czytanie na głos, powiadomienia i czytanie leadu. Ukryty kanał od razu znika z listy i nie jest czytany ani pokazywany w powiadomieniach. Serwer i tak wysyła wszystkie kanały, więc ukrywanie i pokazywanie działa od razu i nic nie kosztuje. Nowo dodany kanał jest od razu czytany i pokazywany w powiadomieniach, także u osób, które mają już zapisane ustawienia.
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
