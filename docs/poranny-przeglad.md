# Poranny przegląd rynków: jak działa, jak go włączyć, ile kosztuje (październik 2026)

## Najważniejsze

- **Po wdrożeniu przegląd jest wyłączony.** Bez `BRIEFING_MODE=live` i sekretów nic się nie dzieje, nic nie jest płatne, a w aplikacji nie widać żadnego przycisku. Strona `/poranek` istnieje, ale do pierwszego wydania mówi tylko, że przegląd się jeszcze nie ukazał.
- Wydanie z dnia D obejmuje wiadomości **opublikowane od 19:00 dnia D−1 do zamknięcia wydania** (domyślnie 6:00), czas Europe/Warsaw, z poprawnym czasem letnim i zimowym. Ukazuje się o **7:45**, od poniedziałku do soboty. Tuż przed nim, o 7:30, 7:35 i 7:40, aplikacja powtarza kalendarium dnia z MacroNext (niżej). Nagranie trwa **około 3 minut**.
- Każda informacja w przeglądzie jest **sprawdzona w kodzie, nie tylko przez model**:
  - cytaty muszą dosłownie występować w stronach, które przeczytał serwer;
  - liczby muszą być w tych cytatach;
  - potrzebne są **co najmniej 2 niezależne źródła**, w tym **pierwotne** (instytucja, spółka, giełda, agencja komunikatów) dla danych, decyzji, cytatów i zdarzeń.
- **Nic nie jest publikowane częściowo.** Gdy któryś etap zawiedzie (OpenAI, wyszukiwanie, weryfikacja, Google TTS, zapis), wydanie się nie ukazuje, a strona pokazuje poprzednie.
- Szacunkowy koszt jednego wydania (z założonych liczb tokenów, nie z pomiaru): przy `gpt-6.1-terra` i średnim wysiłku rozumowania około **0,9 USD** w typową noc (0,5–1,5 USD), przy `gpt-6.1-sol` około **1,5 USD** (0,8–2,5 USD). Około 0,3 USD z tego to wyszukiwanie. Głos mieści się w darmowym milionie znaków miesięcznie Google. Twarde limity: domyślnie 2 USD na wydanie i 40 USD na miesiąc.
- **Bez API też jest materiał:** codziennie o 7:45 serwer składa wsad dla ChatGPT (zadanie, kalendarium dnia i wiadomości z nocy) pod stałym adresem, który podajesz ChatGPT. Nic przy tym nie kosztuje (niżej).
- **Nic tu nie było testowane na żywych usługach.** Nie było kluczy, a sieć środowiska nie miała dostępu do OpenAI, Google ani do stron źródeł. Testy (177) sprawdzają logikę i kształt zapytań na symulowanych odpowiedziach. Pierwsze prawdziwe wydanie trzeba obejrzeć ręcznie (krok 6 niżej).

## Architektura

```
cron co 10 min ──▶ Briefing.kick()        (worker/index.ts; ten sam cron co dla Pollera)
                        │ ustawia alarm, gdy przegląd jest włączony
                        ▼
   Durable Object Briefing (worker/briefing/do.ts), własny SQLite:
   alarm → tick() → JEDEN krok → zapis wyniku → następny alarm za 0,5 s (albo ponowienie po 1, 2, 4… min)

   prepare   sprawdza model (GET /v1/models/{id}) i głos (GET /v1/voices?languageCode=pl-PL)
   collect   wiadomości z okna od Pollera (RPC briefingItems), wg daty publikacji
   rank      łączenie duplikatów i nagłówków jednego tematu z jednej godziny, ranking, najwyżej 50 kandydatów (najwyżej 40% z jednego źródła)
   triage    OpenAI: wybór do 10 historii, rozbicie na twierdzenia, zapytania do wyszukiwarki
   dla każdej historii:
     search  wyszukiwarka (OpenAI web_search albo Tavily): adresy stron
     page×n  serwer sam czyta do 5 stron (SSRF, robots.txt, paywall, limit rozmiaru)
     verify  OpenAI ocenia twierdzenia wobec fragmentów stron, kod sprawdza (verify.ts)
   select    deterministycznie: do 8 sprawdzonych historii, budżet słów
   write     OpenAI: tekst po polsku (segment na historię)
   validate  kod (script.ts) + OpenAI (drugi model/instrukcja); do 3 prób z listą błędów
   tts×n     Google Text-to-Speech, części ≤ 1800 bajtów, granice zdań
   assemble  złożenie MP3, sprawdzenie długości i skrótów, manifest
   publish   o 7:45 (albo od razu, jeśli później), albo czeka na zatwierdzenie
   → Poller.setBriefing(): wskaźnik w liście newsów (/api/news), aplikacja pokazuje przycisk „Przegląd”

   Worker: GET /api/briefing, /api/briefing/editions/<data>, /api/briefing/audio/<data>-<sha>.mp3 (Range),
           /api/briefing/admin/… (token)
```

Pliki: `worker/briefing/` (`config`, `time`, `collect`, `prompts`, `schemas`, `llm`, `search`, `web`, `verify`, `script`, `mp3`, `tts`, `pipeline`, `store`, `sqlite`, `mock`, `do`, `api`), `src/lib/briefing.ts` (to, co dostaje strona), `src/components/Briefing.tsx`, `src/app/poranek/page.tsx`, testy w `test/briefing/`.

### Dlaczego tak

- **Jeden krok na alarm.** Darmowy plan Workers daje 10 ms CPU i 50 zapytań na wywołanie, a alarm Durable Object do 15 minut czasu. Czekanie na OpenAI, Google czy stronę nie liczy się do CPU. Dlatego każdy krok to jedno wywołanie usługi albo jedna strona, a wynik zapisuje się od razu. Krok raz zrobiony nigdy nie jest powtarzany ani płacony drugi raz, także po restarcie obiektu czy wdrożeniu.
- **Pomiary CPU** (lokalnie, Node, ta sama maszyna V8; na Cloudflare wartości będą inne):
  - noc 700 wiadomości: `collect` około 4 ms, `rank` około 4–10 ms (na nagłówkach z realistycznym rozkładem słów około 10 ms);
  - czytanie strony 1 MB: około 7 ms;
  - reszta kroków to głównie JSON i czekanie.
  To mieści się w limicie, ale blisko niego. Jeśli w logach pojawi się „Exceeded CPU”, rozwiązaniem jest **Workers Paid (5 USD miesięcznie)**: 30 s CPU, bez zmian w kodzie.
- **Nagranie w SQLite Durable Object, nie w R2.** R2 wymaga osobnej aktywacji z kartą, a wdrożenie z powiązaniem do nieistniejącego bucketu mogłoby się nie udać. MP3 32 kbps × 3 min to około 720 KB, w kawałkach po 1 MB (limit wiersza to 2 MB). Wydania żyją 30 dni (`BRIEFING_RETENTION_DAYS`). Przy wielu słuchaczach warto przenieść nagrania do R2, bo każde pobranie to zapytanie do Durable Object. Nie zrobiłem tego, żeby nie zależeć od płatnej subskrypcji.
- **Cron.** Nie dodałem nowego (darmowe konto ma limit 5). Istniejący `*/10 * * * *` budzi też przegląd, a dalej działa on na alarmach w czasie warszawskim. Cron jest w UTC, alarmy nie mają strefy, a strefę liczy kod (`time.ts`).
- **Wskaźnik w liście newsów** zamiast osobnego zapytania przy każdym otwarciu aplikacji. Oszczędza to około 10 tys. zapytań Durable Object dziennie przy 1000 użytkowników.

## Paczka przed przeglądem: kalendarium dnia z MacroNext

Radio wychodzi o 7:45. Tuż przed nim, na liście newsów (źródło MacroNext), pojawia się paczka trzech zapowiedzi na cały dzień, dla kogoś, kto słucha poranka za jednym razem. Dalej w ciągu dnia zostają tylko pojedyncze zapowiedzi: dane makro 10 minut przed publikacją oraz osobne wpisy przed sesją w Nowym Jorku (wyniki przed sesją) i przed jej końcem (kto raportuje po sesji). Osobnej zapowiedzi GPW o 8:50 już nie ma, bo byłaby powtórką tej z 7:35.

| Godzina (czas polski) | Zapowiedź | Treść |
|---|---|---|
| 7:30 | „Dziś w kalendarium makro” | publikacje danych makro i wydarzenia banków centralnych **od 7:30 do końca dnia** z konsensusem i poprzednim odczytem, plus te bez podanej godziny. Wcześniejsze były już zapowiedziane o swojej porze i ich prognozy tylko by myliły |
| 7:35 | „Dziś na giełdzie GPW (i NewConnect)” | wydarzenia spółek z GPW i NewConnect (jedyna zapowiedź GPW na dzień; spóźniona jest jeszcze robiona do otwarcia sesji o 9:00) |
| 7:40 | „Dziś na NYSE … przed sesją i po sesji” | wyniki spółek z Nowego Jorku, przed sesją i po niej w jednej zapowiedzi, z nagłówkami „Przed sesją” i „Po sesji”. Osobne wpisy w ciągu dnia zostają: przed sesją i przed jej końcem |

- Zapowiedź powstaje tylko wtedy, gdy jest o czym mówić (nie ma pustych).
- Czytane są tak jak zwykłe zapowiedzi (godziny słownie, „nowojorska giełda”, tytuł i wiersze).
- Spóźniona zapowiedź (np. po awarii) jest jeszcze robiona do 45 minut po swojej porze, potem pomijana, żeby nie wchodziła w drogę radiu. Wyjątek to GPW, która ma tylko tę jedną zapowiedź: robi się do otwarcia sesji, o 9:00.
- Każda ma własny link (`…-rano`), żeby lista nie wzięła jej za zapowiedź publikacji o tej samej godzinie.
- Źródłem jest odczyt kalendarium o 6:30 (`worker/macro.ts`, `src/lib/macronext.ts`: `DIGEST_AT`). Przy wdrożeniu `MACRO_VERSION` wymusza ponowny odczyt, więc zapowiedzi są od razu na dziś.
- Same te zapowiedzi nie przechodzą weryfikacji przeglądu (nie są wiadomościami, tylko kalendarium MacroNext, jednym źródłem). Przegląd o 7:45 ich nie powtarza i nie zależy od nich.

## Wsad dla ChatGPT bez API

Zanim podepniesz API, możesz robić przegląd sam w aplikacji ChatGPT. W dni wydań (domyślnie od poniedziałku do soboty) o **7:45** serwer składa jeden tekst w Markdown, to samo, co płatny potok dałby modelom:

- **Zadanie** w roli redaktora serwisu radiowego: scenariusz dla słuchaczy na 5–6 minut (650–800 słów), wybór od 6 do 8 historii, sprawdzenie każdej w sieci (źródło pierwotne i niezależne redakcje), podanie każdej jako całej historii na cztery pytania (co się stało, co za tym stało, jak zareagowały rynki, dlaczego to ważne), zasady polszczyzny do czytania na głos (bez skrótów i symboli, godziny słownie), powitanie z datą i oknem słownie, na końcu lista źródeł i naprawdę pominiętych historii. Jak podawać to, czego nie wiadomo na pewno, opisuje akapit „Pewność, przypisanie i długość” niżej.
- **Kalendarium na dziś** z porannych paczek MacroNext (7:30 makro, 7:35 GPW, 7:40 Nowy Jork), wiersz po wierszu. Bez nich zadanie mówi, żeby tę część pominąć.
- **Wiadomości z nocy:** do 50 najważniejszych historii (ten sam wybór i łączenie co w potoku, opis niżej) z wiadomości opublikowanych od 19:00 dnia poprzedniego **do chwili złożenia, czyli 7:45** (płatny potok zamyka wydanie o 6:00, bo potrzebuje czasu na sprawdzanie). Przy każdej: źródło, godzina, zajawka, tłumaczenie wiadomości angielskiej, do 3 linków. Na górze są też kanały, które w nocy miały błędy.

W zadaniu są też osobne instrukcje o **kryptowalutach i surowcach** (krok 3): ChatGPT ma niezależnie od materiału sprawdzić w sieci, czy od wieczora wydarzyło się coś ważnego (duży ruch bitcoina, hack giełdy, zamrożenie środków, decyzja OPEC, duży ruch ropy, złota, miedzi), i jeśli tak, zrobić z tego osobną historię z kursami, skalą i godziną, nawet gdy materiał ma o tym jeden nagłówek albo nic. Ten sam akapit jest w prompcie wyboru historii w płatnym przeglądzie (`TRIAGE`, `PROMPT_VERSION` `2026-10-30.1`), który widzi jednak tylko kandydatów z kanałów, bez wyszukiwania. Wydarzenia, którego nie ma w kanałach, płatny przegląd sam nie znajdzie.

**Pewność, przypisanie i długość (od 31 października 2026).** Pierwsza wersja zadania kazała podawać tylko to, co potwierdzą dwa niezależne źródła, i nie dodawać przyczyn ani tła. ChatGPT zrobił z tego około 280 słów zamiast 420: tylko notowania, a trzy historie pominął (doniesienia o możliwym ataku na Iran, które ruszyły notowaniami ropy; zmiana celu finansowania OpenAI według Financial Times; przedłużenie porozumień Grupy Azoty), bo nie znalazł drugiego źródła. Teraz poziom pewności decyduje o tym, jak historię podać, a nie czy ją podać: potwierdzoną w co najmniej dwóch źródłach jako fakt; opartą na jednym źródle z przypisaniem („według Financial Times”, „według Axios”) i z informacją dla słuchacza, że to jedno źródło; niepotwierdzoną, plotkę lub spekulację rynku wyraźnie jako takie („według niepotwierdzonych doniesień”, „na rynku spekuluje się, że”). Pomijać wolno tylko to, co nie ma żadnego nazwanego źródła albo jest stare.

**Styl i głębia (od 31 października 2026, według wytycznych właściciela).** Zadanie każe pisać scenariusz dla słuchaczy, nie listę nagłówków: pełne zdania, krótkie przejścia, opis skali słowami (słuchacz nie widzi wykresu), wyjaśnienie skrótów i terminów przy pierwszym użyciu, bez sensacji i waty słownej. Każda historia (około 80–120 słów) odpowiada na cztery pytania w tej kolejności: co się stało (wydarzenie, data, godzina), co za tym stało (potwierdzony powód), jak zareagowały rynki (skala i porównanie; ruch indeksu odróżniony od ruchu spółki lub sektora), dlaczego to ważne. Przy ruchach rynku ChatGPT ma ustalić, co za nimi stało: czy spadek był szeroki, czy skupiony w kilku spółkach, i wymienić spółkę jako przyczynę ruchu indeksu tylko po sprawdzeniu, że jej udział był istotny (sam spadek jej kursu tego dnia tego nie dowodzi). Przy rekordach („największy spadek od 1974 roku”) ma ustalić miernik (zmiana procentowa czy kwotowa, zamknięcie czy notowania w trakcie sesji, okres porównania) i podać źródło oraz potwierdzony powód. Fakty są oddzielone od interpretacji: najpierw dokument pierwotny, potem rzetelna redakcja; gdy źródła nie wskazują wyraźnej przyczyny, ma to powiedzieć wprost, a interpretację przypisać jej autorowi; spekulacji nie podaje jako ustalonej przyczyny; przy jednym wiarygodnym źródle mówi o tym słuchaczowi. Liczby tylko tam, gdzie pomagają zrozumieć skalę, z porównaniem i godziną pomiaru.

**Długość: 650–800 słów i skracanie zamiast spekulacji.** Docelowa długość to 650–800 słów, około 5–6 minut czytania na głos (stałe `PACK_WORDS` i `PACK_MIN_STORIES` w `worker/briefing/pack.ts`, niezależne od `BRIEFING_TARGET_SECONDS` płatnego potoku). To zastąpiło wcześniejsze „co najmniej 400 słów”. Jeśli brakuje zweryfikowanych informacji, ChatGPT ma skrócić tekst, zamiast wypełniać go spekulacją, ale najpierw dodać historie z jednego źródła albo niepotwierdzone (z przypisaniem) i tło potwierdzone w źródłach. Skutek uboczny: to osłabia twarde minimum. Jeśli ChatGPT znów odda tekst o połowę krótszy od celu, ten zapis jest pierwszym podejrzanym. Granice zostają: nie wymyślać liczb, cytatów, nazwisk ani źródeł, nie podawać własnego przypuszczenia jako faktu, nie dawać rekomendacji. Hipotezy i przyczyny podawane są z przypisaniem albo w trybie przypuszczającym („być może”, „mogło to oznaczać”). To zwiększa ryzyko, że ChatGPT dopisze coś błędnego (przyczyna, która brzmi wiarygodnie, a jest zgadywaniem), więc wynik trzeba przeczytać przed użyciem, a przypisania i oznaczenia „niepotwierdzone” sprawdzić ze źródłami pod tekstem. Płatny potok zostaje przy zasadach ścisłych: tam cytaty i liczby są porównywane w kodzie z pobranymi stronami, a niepotwierdzona informacja do przeglądu nie trafia; zmiana tego byłaby osobną decyzją. Nie sprawdzałem, czy ChatGPT trzyma się długości i przypisań; wynik zależy od modelu.

**Bez agentów (od 31 października 2026).** Przez chwilę zadanie kazało ChatGPT pracować w czterech rolach (agent zbierający, redagujący, sprawdzający informacje i sprawdzający tekst). Zostało to cofnięte: ChatGPT ma po prostu wykonać polecenie po kolei, według punktów 1–7, bez dzielenia pracy na agentów i bez opisywania procesu w odpowiedzi. Zasady sprawdzania przyczyn, rekordów i ruchów rynku (punkt 2) oraz liczenia słów (punkt 6) zostały w tych punktach.

**Ocena ważności to tylko wskazówka, a ważne wydarzenia ChatGPT ma znaleźć sam.** Oceny małego modelu (Clef, z samego nagłówka) bywają za niskie także przy bardzo ważnych wydarzeniach: 30 października 2026 hack Binance, o którym pisały wszystkie media, miał w aplikacji 6,6 na 10. Dlatego zadanie mówi wprost: nagłówek wsadu, że model bywa w błędzie w obie strony; krok 1, że nie wolno pomijać historii dlatego, że stoi nisko albo ma niską ocenę, a historia z kilku kanałów albo z wieloma nagłówkami jest zwykle ważna; krok 3, żeby przy kryptowalutach i surowcach nie kierować się oceną; i krok 4 **Kompletność**: przed pisaniem ChatGPT sprawdza w sieci, o czym od wieczora najwięcej piszą duże serwisy finansowe (Reuters, Bloomberg, CNBC, Financial Times, PAP Biznes, Bankier.pl, Parkiet), we wszystkich tematach, i dodaje wydarzenie, którego brakuje w materiale albo które ma w nim niską ocenę, sprawdzając je jak każde inne. To samo zastrzeżenie (niska `helperImportance` nie jest powodem do pominięcia) ma prompt wyboru historii w płatnym potoku; on jednak nie szuka w sieci historii spoza kandydatów.

**Nowa treść zadania od razu pod adresem.** Wsad zapamiętuje, z jakimi ustawieniami oceny i z jaką wersją zadania (`TASK_VERSION` w `worker/briefing/pack.ts`) powstał. Po wdrożeniu, które zmienia jedno z nich, dzisiejszy wsad jest składany jeszcze raz z tych samych wiadomości (do chwili pierwszego wsadu dnia), w ciągu około 10 minut. Przy zmianie treści zadania trzeba więc podnieść `TASK_VERSION`.

Wsad powstaje **niezależnie od `BRIEFING_MODE`** (także przy `off`) i nie woła żadnej płatnej usługi. Składa się w dwóch krokach alarmu `Briefing` (`worker/briefing/pack.ts`). Pierwszy wsad po wdrożeniu, w dzień wydania po 7:45, powstaje od razu, z wiadomościami do tej chwili.

**Gdzie jest.** Zawsze pod jednym adresem, z treścią z ostatniego dnia: <https://szczekaczka.dancoder2025.workers.dev/api/briefing/pack.md> (do pierwszego wsadu odpowiada 404). Service worker go nie kopiuje.

**Jak użyć w ChatGPT.**

- Podaj link z prośbą w swojej wiadomości, np. „Wykonaj zadanie z tego pliku: https://szczekaczka.dancoder2025.workers.dev/api/briefing/pack.md”. ChatGPT traktuje treść strony jako materiał, nie polecenie, więc prośba musi być w Twojej wiadomości.
- `robots.txt` Szczekaczki zabrania pobierania wszystkim automatom, z jednym wyjątkiem: `ChatGPT-User` (ChatGPT otwierający link na prośbę użytkownika) może czytać tylko `/api/briefing/pack.md`. Inne roboty, także crawlery AI (`GPTBot`, `OAI-SearchBot`), nie mogą.
- Nie sprawdzałem, czy ChatGPT otworzy link. Jeśli nie otworzy, otwórz go sam, skopiuj cały tekst i wklej.

| Zmienna | Domyślnie | |
|---|---|---|
| `BRIEFING_PACK` | `on` | `off` wyłącza wsad |
| `BRIEFING_PACK_AT` | `07:45` | 03:00–12:00. Kalendarium MacroNext jest we wsadzie tylko po 7:40 |

## Jak wybierane są historie z nocy (`rank`)

- **Duplikaty** to jedna historia: ten sam link albo nagłówki o co najmniej 55% wspólnych słów (Jaccard), w odstępie do 6 godzin.
- **Nagłówki jednego tematu z jednej godziny** to też jedna historia. Temat to pierwsze słowo nagłówka: „MICROSOFT 1Q REV…”, „WARSH: …”, „FED'S …”, „Orlen: …”. Nie liczą się słowa, od których zaczynają się nagłówki o czymkolwiek: „U.S.”, „USA:”, nazwy krajów (ich dane i ich rynki to różne wiadomości), „Spółka”, „Raport” i podobne. Wyniki spółki przychodzą od Waltera Bloomberga jako kilkanaście jednowierszowych nagłówków (przychody, zysk, prognoza, kurs po sesji), a decyzja Fed jako komunikat i zdania z konferencji. Liczone osobno, każdy był małą wiadomością i przegrywał z tym, co przyszło wcześniej wieczorem. Na odtworzonej nocy 28/29 października 2026 (test w `collect.test.ts`, nagłówki ułożone na wzór Waltera, nie pobrane z kanału) decyzja Fed o 19:00 i konferencja Warsha zajęły wszystkie 20 miejsc Waltera, zanim o 21:05 przyszły wyniki Microsoftu i Alphabetu. Teraz takie nagłówki to jeden kandydat. Pozostałe nagłówki idą razem z nim do modelu (`moreHeadlines`) i do wsadu dla ChatGPT („Dalsze nagłówki tej historii”), więc błędne połączenie dwóch tematów nie gubi żadnej informacji.
- **Sekcje, które nie są wiadomościami:** wpisy investingLive z sekcji analizy technicznej, edukacji i zleceń FX (po adresie wpisu: `/technical-analysis/…`, `/education/…`, `/forex-orders/…`) odpadają jak rutynowe komunikaty: opisują poziomy wykresu, nie fakty, które da się potwierdzić w dwóch źródłach. Nazwy dwóch ostatnich sekcji nie były widoczne w sprawdzonym kanale (tylko `technical-analysis`); są z listy kategorii kanału na stronie serwisu.
- **Kryptowaluty i surowce mają zagwarantowane miejsca** (`FLOOR` w `worker/briefing/collect.ts`): po zwykłym wyborze (najwyżej 50, nie więcej niż 40% z jednego źródła) do kandydatów dochodzą, jeśli ich nie ma, po trzy najlepsze historie o kryptowalutach i po trzy o surowcach, a miejsce robią najgorzej oceniane historie bez takiego tematu. Powód: nagłówek „Binance appears hacked, CZ says, as Tether and Circle freeze $1.79B in stablecoins” nie ma żadnego ze słów, które podbijają wynik (banki centralne, dane makro, wyniki), więc w gorącej nocy przegrywał z komunikatami spółek i nie trafiał do modelu. Na odtworzonej nocy (prawdziwe wpisy investingLive z 29/30 października 2026 i 220 dopisanych nagłówków z innych kanałów) historia o hacku odpadała, a po zmianie jest w kandydatach. Słowa obu tematów (Binance, Tether, stablecoin, hack, ETF, ropa, gaz, złoto, srebro, miedź, OPEC i inne) podbijają też wynik jak pozostałe słowa rynkowe.
- **Ranking:** waga źródła, kilka źródeł jednej historii, jej liczba nagłówków i słowa, które poruszają rynek (banki centralne, dane makro, wyniki, cła, przejęcia, indeksy, surowce). Najwyżej 40% miejsc z jednego źródła.

### Ocena ważności przez model (Workers AI), z przełącznikiem

Reguły wyżej nie rozumieją treści: nagłówek bez słów z ich listy dostaje niski wynik, choćby opisywał największy hack roku. Dlatego `worker/briefing/importance.ts` prosi model z Cloudflare Workers AI o ocenę każdej historii z nocy od 0 do 10. Model wybiera zmienna `BRIEFING_AI_RANK_MODEL`; są dwa rodzaje:

- **Clef, modele decyzyjne Cloudflare (domyślnie `@cf/cloudflare/clef`, 27B; tańszy `@cf/cloudflare/clef-flash`, 9B).** Clef nie pisze tekstu: dostaje „stan” i pytania z typowanymi odpowiedziami, a zwraca prawdopodobieństwo każdego wariantu (format z dokumentacji Cloudflare, sprawdzony 30 października 2026: [Clef](https://developers.cloudflare.com/workers-ai/models/clef/), [Clef-flash](https://developers.cloudflare.com/workers-ai/models/clef-flash/)). Dla każdego nagłówka zadajemy jedno pytanie typu `score` z pięcioma poziomami (0: to nie wiadomość, 1: rutyna lub drobiazg, 2: ważne dla jednej spółki lub branży, 3: ważne dla całego rynku, sektora lub klasy aktywów, 4: porusza światowe rynki). Nagłówek, źródła, liczba nagłówków historii i początek zajawki (do 140 znaków) są w treści pytania, więc każda odpowiedź jest związana ze swoim nagłówkiem. Odpowiedź to średni poziom ważony prawdopodobieństwami (może wypaść między poziomami), przeliczany na 0–10 z jednym miejscem po przecinku. W jednym zapytaniu jest 40 pytań (limit modelu to 64). Skoro model nie generuje tekstu, nagłówek (treść z zewnątrz) może co najwyżej przesunąć własną ocenę, nie ma jak wydać mu polecenia.
- **Modele czatowe (np. `@cf/google/gemma-4-26b-a4b-it`, ten sam co tłumaczy wiadomości).** Dostają polecenie z kryteriami 0–10 i przykładem, a nagłówki jako dane z zewnątrz; z odpowiedzi czytane są tylko linie „numer: ocena”. Model czatowy może nie trzymać się formatu (wtedy ranking z samych reguł z powodem w statusie).

Język: Clef działa na bazie wielojęzycznych modeli Qwen, ale Cloudflare nie opublikował oceny jakości poza angielskim. Nagłówki idą w oryginale (po angielsku z Waltera i investingLive, po polsku z ESPI, GPW, PAP i Stooq), nie w tłumaczeniu, bo ocena nie musi być po polsku i nie zużywa przez to tłumaczeń. Jak Clef radzi sobie z polskimi komunikatami, trzeba obejrzeć na prawdziwej nocy.

- **Oceny z listy (zakładka Top).** Każda wiadomość dostaje ocenę 0–10 już wtedy, gdy przychodzi (Clef-flash, `worker/rate.ts`, README). Ranking porannego przeglądu bierze ją: ocena historii to najwyższa ocena jej wiadomości, a model jest pytany tylko o historie bez oceny (np. z kanałów, których lista nie ocenia przy `NEWS_AI_RANK_LANGS=en`). Gdy wszystkie mają ocenę, wsad nie wysyła żadnego zapytania. `BRIEFING_AI_RANK_FROM_LIST=off` wraca do pytania o wszystkie historie modelem `BRIEFING_AI_RANK_MODEL`; `BRIEFING_AI_RANK=off` wyłącza ocenę w przeglądzie całkiem, niezależnie od listy. Zmiana `BRIEFING_AI_RANK_FROM_LIST` też składa dzisiejszy wsad jeszcze raz. Oceny listy robi mniejszy model (9B) niż domyślny w przeglądzie (27B); który daje lepszą kolejność, nie sprawdzałem.
- **Jak liczy się wynik.** Wynik końcowy to wynik reguł plus `BRIEFING_AI_RANK_WEIGHT` (domyślnie 0,3) razy ocena modelu. Reguły dają zwykle od 0,5 do 3,5 punktu, ocena 0–10 przy wadze 0,3 od 0 do 3, więc oba mają podobny wpływ: historia, którą reguły oceniły nisko, a model wysoko, wchodzi do kandydatów. Zostają bez zmian limit 40% miejsc z jednego źródła i zagwarantowane miejsca kryptowalut i surowców (`FLOOR`). Historia, której model nie ocenił (nieudane zapytanie), dostaje środkową ocenę z pozostałych, żeby brak oceny nie był ani zyskiem, ani stratą.
- **Co jest oceniane.** Najlepsze `BRIEFING_AI_RANK_POOL` historii (domyślnie 200) według wyniku reguł, po 40 w jednym zapytaniu, nie więcej niż 4 zapytania naraz. Zwykła noc to 3–5 zapytań.
- **Dokąd trafia ocena.** Do wsadu dla ChatGPT: przy historii stoi „ważność N/10” (z przecinkiem przy Clef, np. „6,5/10”), a w nagłówku wsadu jest zdanie, że to wskazówka (decyduje ChatGPT, według zadania). Do płatnego potoku: kandydaci mają `importance`, a model wybierający historie dostaje ją jako `helperImportance` z zastrzeżeniem w prompcie, że to tylko wskazówka, i sam sprawdza każdą historię. Ocena modelu pomocniczego nie zastępuje weryfikacji w źródłach: historia z wysoką oceną, której nie da się potwierdzić, do przeglądu nie trafia.
- **Włącznik.** `BRIEFING_AI_RANK=off` (zmienna w panelu Cloudflare, bez wdrożenia; `on` domyślnie) wyłącza ocenę: żadne zapytanie nie wychodzi, a ranking, wsad i potok są dokładnie takie jak przed dodaniem tej funkcji (test w `test/briefing/pack.test.ts` porównuje oba wsady znak po znaku). Tak samo działa brak wiązania `AI` (lokalnie) i tryb `mock`. Zmiana ustawień oceny (włączenie, wyłączenie, model, waga, pula) składa dzisiejszy wsad jeszcze raz, z tych samych wiadomości (do chwili, w której powstał pierwszy wsad dnia, o 7:45; późniejsze nie wchodzą), w ciągu około 10 minut, bo tyle trwa odstęp crona. Stary wsad zostaje pod adresem do końca składania, a wyłączenie oceny przywraca wsad z samych reguł, taki jak o 7:45. Wsad zrobiony przed dodaniem oceny (bez zapisanych ustawień) jest składany jeszcze raz po wdrożeniu. Nieudana próba (usługa nie odpowiada) nie powtarza się sama: wsad mówi o niej jednym zdaniem w nagłówku („Ocena ważności przez model pomocniczy nie powiodła się…”), a żeby spróbować jeszcze raz, trzeba zmienić ustawienie (np. wyłączyć i włączyć). Każde składanie z oceną zużywa zapytania z dziennego limitu (zwykle 5 z 12). Żeby porównać modele, zmień `BRIEFING_AI_RANK_MODEL` (Clef, Clef-flash, Gemma) albo wyłącz ocenę i porównaj wsady.
- **Awarie nie zatrzymują przeglądu.** Błąd usługi, wyczerpany dzienny limit neuronów (10 000 na dobę dla wszystkich funkcji, w tym tłumaczeń), odpowiedź bez ocen, mniej niż połowa historii oceniona albo wyczerpany dzienny limit zapytań (`BRIEFING_AI_RANK_MAX_CALLS`, domyślnie 12) dają ranking z samych reguł. Powód jest w `ranking.reason` wsadu, w wydaniu (krok `rank`) i w `GET /api/briefing/admin/status` (`aiRank`: ustawienia, wiązanie i liczba zapytań z dzisiaj; `pack.latest.ranking`).
- **Koszt** (cennik Workers AI, 30 października 2026: Clef 21 818 neuronów za milion tokenów wejścia, Clef-flash 3 455, Gemma 4 9 091 za milion wejścia i 27 273 za milion wyjścia; Clef nie liczy wyjścia). Zapytanie z 40 nagłówkami to około 7 000 tokenów wejścia przy Clef (pytania z rubryką powtarzają się dla każdego nagłówka; szacunek z długości tekstu, nie pomiar), czyli około 160 neuronów przy Clef, około 25 przy Clef-flash i około 25 przy Gemmie (2 000 tokenów wejścia i do 200 wyjścia). Zwykła noc, 3–5 zapytań, to około 800 neuronów przy Clef, 125 przy Clef-flash. Darmowe jest 10 000 neuronów na dobę dla wszystkiego, a tłumaczenia mają własne limity (do około 6 000 w najgorszym dniu), więc przy Clef limit zapytań (12 na dobę, najwyżej około 1 900 neuronów) zostawia zapas. Dzień limitu liczy się tak jak u Cloudflare, według UTC. Gdyby neuronów brakowało, `clef-flash` jest sześć razy tańszy.
- **Czego nie sprawdziłem.** Nie wywołałem prawdziwego modelu: testy używają zasymulowanych odpowiedzi w formacie z dokumentacji. Nie wiadomo więc, jak Clef ocenia prawdziwe nagłówki (w tym polskie), czy dobrze radzi sobie z 40 pytaniami w jednym zapytaniu (dokumentacja podaje 64 jako limit, nie jako zalecenie) ani czy poprawia wybór. Po pierwszych wsadach warto porównać oceny z listą z `BRIEFING_AI_RANK=off`.

## Okno, zamknięcie wydania, publikacja

| Ustawienie | Domyślnie | Znaczenie |
|---|---|---|
| `BRIEFING_WINDOW_START` | `19:00` | początek okna, dzień przed wydaniem |
| `BRIEFING_WINDOW_END` | `07:00` | koniec okna, o który prosisz (zapisywany przy wydaniu) |
| `BRIEFING_CUTOFF` | `06:00` | zamknięcie wydania: start pracy; wiadomości opublikowane później nie wchodzą |
| `BRIEFING_PUBLISH_AT` | `07:45` | publikacja gotowego wydania (wcześniej czeka, później idzie od razu, z oznaczeniem „z opóźnieniem”) |
| `BRIEFING_DEADLINE` | `10:00` | po tej godzinie żadnych ponowień: wydanie „nie ukazało się” |
| `BRIEFING_DAYS` | `1-6` | dni ISO (1 pon … 7 niedz), np. `1-5`, `1-7` |

- **Rzeczywiste zamknięcie** to chwila zebrania wiadomości: tuż po `BRIEFING_CUTOFF`, nigdy po końcu okna. Zapisuje się przy wydaniu, a strona je pokazuje („wiadomości od wtorku, godz. 19:00, do środy, godz. 6:00”). Wydanie ma też zapisane okno żądane, czas przygotowania (`generatedAt`) i publikacji (`publishedAt`).
- **Czas zimowy i letni.** Okno nocy zmiany czasu ma 13 godzin (październik) albo 11 (marzec). Testy obejmują obie noce.
- **Data wiadomości.** Liczy się data publikacji, którą kanał podał przy pierwszym odczycie (`worker/feeds.ts` jej nie nadpisuje). Wiadomości nie dostają daty pobrania ani aktualizacji. Wpis bez daty albo z datą z przyszłości jest pomijany. Każde źródło ma opisane, co oznacza jego data (`DATE_KIND` w `collect.ts`): wszędzie jest to data publikacji.
- **Daty stron źródłowych.** Data publikacji i data aktualizacji są trzymane osobno (`article:published_time`, `article:modified_time`, JSON-LD `datePublished`/`dateModified`). Strona z samą datą aktualizacji nie dostaje daty publikacji. Data zdarzenia to jeszcze trzecia rzecz: podaje ją weryfikator na podstawie treści.
- **Jedno wydanie na dzień.** Identyfikator to polska data. Ponowny start tego samego dnia nic nie robi. Ręczny start istniejącego wydania wymaga `force=1`, bo kosztuje drugi raz.
- **Ponowienia.** Krok, który zawiedzie w sposób do powtórzenia (429, 5xx, timeout, zła odpowiedź modelu), jest ponawiany po 1, 2, 4, 8… min (najwyżej 15 min, `Retry-After` jest respektowane). Robi tak do `BRIEFING_MAX_STEP_ATTEMPTS` (4) razy i nigdy po terminie. Błąd stały (zły klucz, brak środków, nieznany model, zablokowany głos) kończy wydanie od razu. Historia, której wyszukiwanie lub weryfikacja nie wyszła, jest pomijana, a reszta idzie dalej. Za mało historii (`BRIEFING_MIN_STORIES`, 3) oznacza brak wydania.

## Weryfikacja: co dokładnie jest sprawdzane

1. **Zbieranie wiadomości.** Odpadają rutynowe komunikaty: dywidendy, transkrypcje, art. 19 MAR, transakcje, rejestracje akcji itp.
2. **Duplikaty.** Ten sam tytuł z kilku źródeł albo ten sam link to jedna historia, z datą najwcześniejszej publikacji.
3. **Triage (model).** Wybiera historie i rozbija je na atomowe twierdzenia. Pierwsze twierdzenie to sedno historii. Każde ma rodzaj: `event`, `figure`, `official`, `quote`, `market` albo `forecast`.
4. **Wyszukiwanie.** Do stron trafiają tylko adresy, które wyszukiwarka naprawdę zwróciła albo zacytowała (`web_search_call.action.sources` i `url_citation`). Adresu, który model napisał sam, serwer nie pobiera. Odpadają adresy niedozwolone, a z każdej witryny bierze się jedną stronę, źródła pierwotne najpierw.
5. **Czytanie stron** (`web.ts`):
   - tylko `https`, nazwy publiczne (bez IP, bez `localhost`/`.local`/`.internal`), bez portów i loginów w adresie, bez domen zablokowanych (sieci społecznościowe, fora, agregatory) i bez tej strony;
   - każde przekierowanie jest sprawdzane osobno, najwyżej 3;
   - respektowany jest `robots.txt` (RFC 9309; błąd serwera oznacza zakaz) i reguła `noai`;
   - 401/402/403 albo `isAccessibleForFree: false` oznacza, że strona nie jest używana, nawet jeśli ma tekst. Serwer nie używa cookies, kont, archiwów ani usług obchodzących paywall;
   - limit to 1,5 MB, tylko HTML; PDF jest pomijany, a to ograniczenie dla części publikacji banków centralnych;
   - zostaje do 3000 znaków najbardziej związanych akapitów, a po publikacji tylko krótkie cytaty (prawa autorskie).
6. **Weryfikacja** (model + `verify.ts`). Twierdzenie zostaje tylko wtedy, gdy spełnia wszystkie warunki:
   - model mówi „supported”, a żaden cytowany fragment mu nie przeczy (sprzeczne źródła oznaczają odrzucenie);
   - każdy cytat jest dosłownie w przeczytanej treści wskazanej strony (z tolerancją na cudzysłowy, myślniki, spacje i wielkość liter);
   - każda liczba ze sprawdzonego sformułowania jest w cytatach (zapis polski i angielski: `2,5` = `2.5`, `1 234` = `1,234`);
   - ma co najmniej `BRIEFING_MIN_SOURCES` (2) niezależnych źródeł. Wydawca liczy się raz, kopie jednego tekstu agencyjnego liczą się raz, a własne źródło RSS historii (np. stooq.pl) się nie liczy, chyba że jest źródłem oficjalnym;
   - dla rodzajów z `BRIEFING_PRIMARY_FOR` (domyślnie `figure,official,quote,event`) jedno ze źródeł jest pierwotne. Pierwotne to domeny `.gov` i podobne, lista instytucji i giełd, agencje komunikatów (Business Wire, PR Newswire, GlobeNewswire…) albo strona samej spółki, rozpoznana po nazwie;
   - twierdzenie rynkowe ma instrument, sesję i rodzaj notowania: zamknięcie, bieżące albo orientacyjne (kontrakty, handel po sesji).

   Historia odpada bez swojego sedna albo gdy jest **stara**: model mówi, że zdarzenie było dawno, data zdarzenia jest sprzed okna minus `BRIEFING_STALE_HOURS` (36 h), albo wszystkie źródła mają datę publikacji sprzed tego czasu. Data aktualizacji nie czyni historii nową.
7. **Tekst** (`script.ts` + model). Kod odrzuca:
   - adresy, formatowanie, emoji, symbole (`%`, `$`, `€`), skróty (`mld`, `mln`, `r/r`, `ok.`…), kody walut, tickery, nawiasy;
   - zdania powyżej 300 znaków;
   - liczby, których nie ma w cytowanych twierdzeniach;
   - powołania na niesprawdzone twierdzenia, brakujące albo podwójne historie;
   - tekst za krótki albo za długi (60–130% celu).

   Potem drugi model porównuje każdy segment z twierdzeniami: brak pokrycia, liczby, czas, przypisanie, wydźwięk, polszczyzna. Do 3 prób z listą błędów; potem wydanie się nie ukazuje. Powitanie (data i godziny słownie) i zakończenie (z informacją o głosie AI) tworzy kod, nie model.
8. **Nagranie.**
   - Części tnie się na granicach zdań, z bajtami UTF-8 liczonymi dokładnie (ą, ę, ł to 2 bajty), nigdy w środku znaku. Limit API to 5000 bajtów, domyślnie bierze się 1800.
   - Każda część musi być poprawnym MP3, a jej długość pasuje do długości tekstu: około 15 znaków na sekundę, dopuszczalnie 5–40. Inaczej część jest ponawiana, a potem wydanie się nie ukazuje.
   - Przy łączeniu wycina się tagi ID3 i ramki Xing/Info, a format wszystkich części musi być jednakowy.
   - Długość złożonego pliku musi się zgadzać z sumą części, a części razem muszą być dokładnie tekstem skryptu.
   - Manifest (`assemble` w `/api/briefing/admin/editions/<data>`) wiąże nagranie z tekstem:
     - sha256 skryptu, każdej części tekstu, każdej części audio i całego pliku;
     - głos, język, endpoint, tempo;
     - modele OpenAI (wersja z odpowiedzi);
     - wersje potoku i promptów.

## Bezpieczeństwo

- **Prompt injection.** Wszystko z zewnątrz (RSS, strony, nawet twierdzenia napisane przez model z RSS) trafia do modelu jako JSON w oznaczonym bloku. Instrukcja mówi, że to dane, a polecenia w nich mają być ignorowane. JSON nie pozwala zamknąć bloku, bo nowe linie są kodowane. Usuwane są znaki niewidoczne i sterujące. Odpowiedź modelu jest zawsze sprawdzana schematem i w kodzie (punkty 4–8 wyżej). Model nie ma żadnych narzędzi, które coś robią: jedynie wyszukiwarkę w kroku `search`. Nie wybiera też adresów do pobrania.
- **SSRF.** Patrz punkt 5. Runtime Workers i tak wychodzi tylko do publicznego internetu, ale kod na tym nie polega.
- **Sekrety** tylko jako sekrety Workera (nigdy w repozytorium):
  - `OPENAI_API_KEY`;
  - `GOOGLE_TTS_API_KEY` albo `GOOGLE_SERVICE_ACCOUNT_JSON`;
  - `TAVILY_API_KEY` (opcjonalnie);
  - `BRIEFING_ADMIN_TOKEN`.

  Klucz Google idzie w nagłówku `x-goog-api-key`, nigdy w adresie. Podpisany JWT konta serwisowego idzie tylko do `https://oauth2.googleapis.com/token`, bez względu na `token_uri` w pliku klucza. Do OpenAI zapytania idą z `store: false`.
- **Strona nie pokazuje** modeli, promptów, błędów usług, kosztów ani niczego wewnętrznego. Pokazuje to tylko `/api/briefing/admin/…` z tokenem; bez sekretu `BRIEFING_ADMIN_TOKEN` (co najmniej 24 znaki) tych adresów nie ma.
- Wydanie testowe (`mock`) jest oznaczone na stronie i w API. **Na produkcji nie ustawiaj `BRIEFING_MODE=mock`**: opublikowałoby wydanie testowe.

## Koszty i limity

Ceny z cenników z 28.10.2026, odczytane przez wyszukiwarkę, bo strony były niedostępne z maszyny, na której to powstawało. **Sprawdź je przed włączeniem.**

| Usługa | Cena | Na jedno wydanie (szacunek) |
|---|---|---|
| OpenAI `gpt-6.1-sol` | 2 USD / 1M wejścia, 0,10 zbuforowane, 10 USD / 1M wyjścia | około 150–250 tys. tokenów wejścia i 20–40 tys. wyjścia (z rozumowaniem): około 0,5–0,9 USD |
| OpenAI `gpt-6.1-terra` | 1 / 0,05 / 5 USD | około połowa powyższego |
| OpenAI web search | 10 USD / 1000 wyszukiwań, czytane strony jako tokeny wejścia | około 10–25 wyszukiwań: 0,10–0,25 USD |
| Tavily (zamiast powyższego) | 1000 darmowych kredytów / mies., potem 0,008 USD | do 20 kredytów; w darmowej puli przy 26 wydaniach |
| Google Chirp 3: HD | 1M znaków / mies. za darmo, potem 30 USD / 1M | około 3000 znaków: 0 USD (około 80 tys. znaków / mies.) |

- **Limity w kodzie.** Przed każdym wywołaniem modelu liczony jest najgorszy możliwy koszt: całe wejście przy około 3 znakach na token, wszystkie `max_output_tokens` i wyszukiwania.
  - Gdy przekroczyłby `BRIEFING_MAX_COST_USD` (2 USD), wywołania nie ma. W badaniu historii limit to 75% tej kwoty, a pozostałe historie są pomijane, żeby zostało na tekst. Poza tym wydanie się nie ukazuje.
  - Tak samo działa `BRIEFING_MAX_MONTHLY_COST_USD` (40 USD), liczony od początku miesiąca UTC z zapisanego zużycia.
- **Logi zużycia.** Każde wywołanie, także nieudane, ale opłacone, trafia do tabeli `usage` (tokeny wejścia, zbuforowane, wyjścia, rozumowania, wyszukiwania, znaki, szacowany koszt, `x-request-id`). Pojawia się też wiersz w logach Workera: `briefing 2026-10-28 usage openai/verify gpt-6.1-sol-…: in 5200 (cached 0) out 900 (reasoning 300) searches 0 ≈ $0.0194 estimated`.
  - To **szacunek** z cennika w kodzie (`LIST_PRICES` w `config.ts`, nadpisywany przez `BRIEFING_OPENAI_PRICES`).
  - Rachunek jest w panelach OpenAI, Google Cloud i Tavily.
  - Koszt Google jest liczony z darmową pulą według znaków z tej tabeli. Google liczy miesiąc po swojemu.
  - Według nieoficjalnych relacji jedno „użycie narzędzia” web search bywa liczone jako kilka wyszukiwań. Tabela liczy wywołania `web_search_call` typu `search`.
- **Ustaw też limity u dostawców:**
  - w OpenAI: limit wydatków projektu;
  - w Google Cloud: budżet z alertem i limit zapytań na minutę dla Text-to-Speech;
  - w Tavily: plan bez dopłat.

## Konfiguracja

Zwykłe zmienne mogą być w `wrangler.jsonc` → `vars` (wtedy są w repozytorium) albo w panelu Cloudflare (Settings → Variables and Secrets). `keep_vars: true` w `wrangler.jsonc` sprawia, że zmienne z panelu zostają po wdrożeniu. Sekrety dodaje się tylko jako **Secret**.

| Zmienna | Domyślnie | |
|---|---|---|
| `BRIEFING_MODE` | `off` | `off`, `mock` (bez płatnych usług, tylko lokalnie), `live` |
| `BRIEFING_OPENAI_MODEL` | brak | **wymagane w `live`**; model dla wszystkich etapów |
| `BRIEFING_OPENAI_MODEL_TRIAGE` / `_RESEARCH` / `_VERIFY` / `_WRITE` / `_VALIDATE` | `BRIEFING_OPENAI_MODEL` | inny model dla etapu (np. tańszy do `research`) |
| `BRIEFING_OPENAI_REASONING_EFFORT` | brak (domyślne modelu) | `none` … `max`; nie każdy model przyjmuje każdą wartość |
| `BRIEFING_OPENAI_PRICES` | wbudowane dla 4 modeli | JSON `{"id":{"input":2,"cached":0.1,"output":10}}` (USD / 1M) |
| `BRIEFING_SEARCH_PROVIDER` | `openai` | `openai` albo `tavily` |
| `BRIEFING_SEARCH_CONTEXT_SIZE` | `low` | dla `openai`: `low`, `medium`, `high` (więcej kosztuje) |
| `BRIEFING_TTS_VOICE` | `pl-PL-Chirp3-HD-Aoede` | inny głos Chirp 3: HD, np. `pl-PL-Chirp3-HD-Charon`; sprawdzany przy każdym wydaniu |
| `BRIEFING_TTS_SPEAKING_RATE` | brak | 0,25–2; dokumentacja Chirp 3: HD jest tu niespójna, więc domyślnie nie jest wysyłane |
| `BRIEFING_TTS_ENDPOINT` | `https://texttospeech.googleapis.com` | albo `https://eu-texttospeech.googleapis.com` |
| `BRIEFING_APPROVAL` | `auto` | `manual`: gotowe wydanie czeka na `POST /api/briefing/admin/approve/<data>` |
| `BRIEFING_TARGET_SECONDS`, `BRIEFING_WORDS_PER_MINUTE` | `180`, `140` | długość płatnego potoku (około 420 słów); wsad dla ChatGPT ma własną: 650–800 słów |
| `BRIEFING_MAX_STORIES`, `BRIEFING_MIN_STORIES`, `BRIEFING_MAX_RESEARCH`, `BRIEFING_MAX_CANDIDATES` | `8`, `3`, `10`, `50` | |
| `BRIEFING_MIN_SOURCES`, `BRIEFING_PRIMARY_FOR`, `BRIEFING_STALE_HOURS` | `2`, `figure,official,quote,event`, `36` | reguły weryfikacji |
| `BRIEFING_MAX_COST_USD`, `BRIEFING_MAX_MONTHLY_COST_USD` | `2`, `40` | |
| `BRIEFING_MAX_STEP_ATTEMPTS`, `BRIEFING_RETENTION_DAYS`, `BRIEFING_SOURCES`, `BRIEFING_BLOCKED_DOMAINS` | `4`, `30`, `WALTER,INVESTINGLIVE,STOOQ,ESPI,GPW,PAP`, brak | `BRIEFING_SOURCES`: źródła listy newsów, z których idą wiadomości. Domyślnie bez Seeking Alpha (kanał nie ma opisów, a po sesji w USA zalewa listę jednowierszowymi wynikami, których nie da się sprawdzić) i bez zapowiedzi MacroNext (to nie newsy). Seeking Alpha można dopisać. |
| `BRIEFING_PACK`, `BRIEFING_PACK_AT` | `on`, `07:45` | wsad dla ChatGPT (wyżej) |
| `BRIEFING_AI_RANK`, `BRIEFING_AI_RANK_MODEL`, `BRIEFING_AI_RANK_WEIGHT` | `on`, `@cf/cloudflare/clef`, `0.3` | ocena ważności historii przez model Workers AI (wyżej); `off` wraca do rankingu z samych reguł. Model: `@cf/cloudflare/clef`, `@cf/cloudflare/clef-flash` albo model czatowy, np. `@cf/google/gemma-4-26b-a4b-it`. Waga 0–1 |
| `BRIEFING_AI_RANK_FROM_LIST` | `on` | brać oceny, które wiadomości dostały na liście (zakładka Top), i pytać tylko o historie bez nich |
| `BRIEFING_AI_RANK_POOL`, `BRIEFING_AI_RANK_MAX_CALLS` | `200`, `12` | ile historii oceniać (20–320) i ile zapytań na dobę UTC (1–200) |
| **Sekrety:** `OPENAI_API_KEY`, `GOOGLE_TTS_API_KEY` albo `GOOGLE_SERVICE_ACCOUNT_JSON`, `TAVILY_API_KEY`, `BRIEFING_ADMIN_TOKEN` | | |

Zła wartość nie psuje reszty: zostaje domyślna, a błąd widać w `GET /api/briefing/admin/status` (`problems`) i w wydaniu z tego dnia („not configured: …”).

**Modele.** W kodzie nie ma domyślnego modelu. W SDK OpenAI (`openai@7.45.1`, 27.10.2026) i na stronie cennika są `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-luna`. Według przewodnika OpenAI web search obsługują modele GPT-6. Polecam `gpt-6.1-sol` (jakość i cena). Tańsza wersja to `gpt-6.1-terra` do `research` i `write`, z `gpt-6.1-sol` do `verify` i `validate`. Każde wydanie najpierw pyta `GET /v1/models/<id>`, więc niedostępny model zatrzymuje wydanie przed jakimkolwiek kosztem.

## Uruchomienie krok po kroku

1. **OpenAI.** Na platform.openai.com załóż osobny projekt, np. „szczekaczka-briefing”, i ustaw w nim limit wydatków (np. 40 USD / mies.). Utwórz klucz API projektu z uprawnieniami ograniczonymi do Responses i Models (jeśli panel na to pozwala).
   ```bash
   npx wrangler secret put OPENAI_API_KEY
   ```
2. **Google Cloud.** Załóż osobny projekt z włączonym rozliczeniem, bez którego API nie działa nawet w darmowej puli. Włącz **Cloud Text-to-Speech API**. Ustaw budżet z alertem i ewentualnie obniż limit `Chirp3RequestsPerMinutePerProject`. Potem wybierz uwierzytelnianie:
   - **Zalecane: klucz API ograniczony do jednego API.** APIs & Services → Credentials → Create credentials → API key, potem „Restrict key” → API restrictions → Cloud Text-to-Speech API. Albo poleceniem:
     ```bash
     gcloud services api-keys create --display-name=szczekaczka-tts --api-target=service=texttospeech.googleapis.com
     npx wrangler secret put GOOGLE_TTS_API_KEY
     ```
     Dlaczego klucz API: Worker nie ma własnej tożsamości OIDC, więc Workload Identity Federation wymagałby i tak trzymania długotrwałego klucza podpisującego w sekrecie. Klucz konta serwisowego to też długotrwały sekret, a przy tym daje więcej niż jedno API, jeśli konto dostanie role. Klucz ograniczony do Text-to-Speech pozwala tylko na syntezę mowy na Twój rachunek, w granicach budżetu i limitów.
   - **Alternatywa: konto serwisowe** (gdy organizacja zakazuje kluczy API). Utwórz konto bez żadnych ról w tym projekcie; samo włączone API powinno wystarczyć, co trzeba sprawdzić. Następnie Keys → Add key → JSON i całą zawartość pliku zapisz jako sekret:
     ```bash
     npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON < klucz.json
     ```
     Potem usuń plik. Worker sam podpisuje JWT (RS256) i co godzinę bierze token dostępu.
   - **Rotacja co 90 dni**, albo od razu, gdy klucz mógł wyciec:
     - dla klucza API: utwórz nowy, `wrangler secret put`, sprawdź `admin/status` (`prepare` sprawdza głos) albo następne wydanie, usuń stary;
     - dla konta serwisowego: dodaj nowy klucz, podmień sekret, usuń stary klucz w IAM.
3. **Tavily (opcjonalnie, zamiast wyszukiwarki OpenAI).** Konto na app.tavily.com, potem:
   ```bash
   npx wrangler secret put TAVILY_API_KEY
   ```
   i `BRIEFING_SEARCH_PROVIDER=tavily`. Brave Search API nie jest użyte: jego warunki zabraniają przechowywania wyników, a przegląd zapisuje adresy źródeł.
4. **Token operatora.** Wygeneruj go i zapisz jako sekret:
   ```bash
   openssl rand -hex 24
   npx wrangler secret put BRIEFING_ADMIN_TOKEN
   ```
5. **Zmienne.** Ustaw `BRIEFING_OPENAI_MODEL=gpt-6.1-sol` (albo inny z listy), na początek `BRIEFING_APPROVAL=manual`, a na końcu `BRIEFING_MODE=live`. Możesz to zrobić w panelu Cloudflare (Workers & Pages → szczekaczka → Settings → Variables and Secrets) albo w `wrangler.jsonc` → `vars`, przez PR.
6. **Pierwsze wydanie ręcznie, z kontrolą.**
   ```bash
   T=…token…; W=https://szczekaczka.dancoder2025.workers.dev
   curl -s -H "Authorization: Bearer $T" $W/api/briefing/admin/status | jq .        # missing: [] i problems: []
   curl -s -X POST -H "Authorization: Bearer $T" "$W/api/briefing/admin/run"         # dziś; po 7:45 publikuje od razu, gdy gotowe (albo czeka na approve)
   curl -s -H "Authorization: Bearer $T" $W/api/briefing/admin/editions/$(TZ=Europe/Warsaw date +%F) | jq '.edition.status, .next, .edition.failure, .edition.costUsd'
   ```
   Całość to kilkadziesiąt kroków, zwykle 10–20 minut. Logi Workera mają wiersze `briefing <data>: …`.
   - W szczegółach wydania są wyniki kroków:
     - które historie odpadły i dlaczego: `select.output.dropped`, `verify:*.output.checked.claims[].reason`;
     - jakie strony przeczytano: `page:*`;
     - tekst: `write:n`;
     - uwagi kontroli: `validate:n`;
     - manifest: `assemble`;
     - zużycie: `usage`.
   - Posłuchaj nagrania i przeczytaj `/poranek`. Potem zatwierdź albo wycofaj:
     ```bash
     curl -s -X POST -H "Authorization: Bearer $T" $W/api/briefing/admin/approve/<data>
     curl -s -X POST -H "Authorization: Bearer $T" "$W/api/briefing/admin/reject/<data>?reason=…"
     ```
     Wycofanie działa też po publikacji: wydanie znika ze strony, a przycisk w aplikacji wraca do poprzedniego.
7. Po kilku dobrych wydaniach ustaw `BRIEFING_APPROVAL=auto`. Od tej chwili wydanie powstaje samo, po `BRIEFING_CUTOFF`.

## Test lokalny bez płatnych usług

```bash
npm test                                   # 177 testów: czas i DST, okno, daty, duplikaty, sprzeczne źródła, weryfikacja, skrypt,
                                           # części dla głosu, MP3, OpenAI/Google/Tavily na symulowanych odpowiedziach, SSRF, robots,
                                           # cały potok (ponowienia, idempotencja, terminy, brak sekretów, limity kosztów, zatwierdzanie)
npm run build && npx wrangler dev          # z .dev.vars: BRIEFING_MODE=mock, BRIEFING_ADMIN_TOKEN=…, FEED_ORIGIN=… (lokalne kanały)
curl -X POST -H "Authorization: Bearer …" http://127.0.0.1:8787/api/briefing/admin/run
```

W trybie `mock` wiadomości pochodzą z prawdziwego Pollera (albo z lokalnych kanałów przez `FEED_ORIGIN`). Model, wyszukiwarka, strony i głos (cisza w prawdziwych ramkach MP3) są udawane w `worker/briefing/mock.ts`. Wydanie jest oznaczone jako testowe.

## Ograniczenia i to, czego nie sprawdziłem

- **Żadna żywa usługa nie była wywołana.** Kształty zapytań i odpowiedzi pochodzą:
  - z typów oficjalnego SDK OpenAI (`openai@7.45.1`);
  - z dokumentu discovery i proto Google Text-to-Speech;
  - z kodu źródłowego dokumentacji Cloudflare;
  - z dokumentacji Tavily (tylko z wyników wyszukiwania).

  Strony dokumentacji OpenAI i Google były niedostępne z tej maszyny. Do sprawdzenia przy pierwszym wydaniu:
  - czy wybrany model działa z `web_search` i `json_schema` naraz;
  - czy `reasoning.effort` jest przyjmowany;
  - czy głos `pl-PL-Chirp3-HD-Aoede` istnieje: jest sprawdzany przy każdym wydaniu, a nazwę potwierdzał tylko notatnik Google;
  - jak brzmią liczby i godziny w Chirp 3: HD;
  - czy łączone MP3 grają płynnie na iOS.
- Strony w PDF i strony renderowane tylko JavaScriptem nie dają tekstu, więc takie źródło się nie liczy. Część komunikatów banków centralnych może przez to nie mieć źródła pierwotnego i taka historia odpadnie: to wybór ostrożny.
- Rozpoznawanie źródła pierwotnego jest heurystyką (lista domen i nazwa spółki w domenie).
- Wykrywanie kopii tekstu agencyjnego jest przybliżone (wspólne ciągi 6 słów).
- Kandydaci są wybierani z kanałów, które Szczekaczka już czyta. Ważna wiadomość, której tam nie było, do przeglądu nie trafi.
- Darmowy plan: CPU blisko limitu przy dużych stronach i pełnej nocy (patrz wyżej).
- Pobranie nagrania przechodzi przez Durable Object (bez R2), co przy dużej liczbie słuchaczy obciąża dzienne limity zapytań.
- Nie zrobiłem osobnego źródła notowań na serwerze (licencje). Liczby z rynków przechodzą tę samą weryfikację co inne twierdzenia: dwa źródła, sesja i rodzaj notowania.
