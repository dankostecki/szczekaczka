# Cloudflare: jak to działa i ile wytrzyma (październik 2026)

## Najważniejsze

- Całość działa na **darmowym planie Cloudflare Workers**. Strona to statyczne pliki (`next build` z `output: 'export'`), które Cloudflare serwuje bez limitu i bez uruchamiania kodu.
- **Źródła RSS sprawdza jeden proces dla wszystkich użytkowników**, a nie każda przeglądarka osobno. Koszt sprawdzania jest stały: tyle samo przy 1 i przy 1000 użytkowników.
- **Nowe newsy serwer wypycha sam przez WebSocket**. Przeglądarka nie pyta co minutę: łączy się raz i czeka. Z liczbą użytkowników rośnie tylko liczba połączeń.
- Przy **1000 użytkowników** zużycie to około 20–40% dziennych limitów darmowego planu (szczegóły niżej).

## Architektura

```
  Bankier (lista komunikatów + RSS), GPW, Stooq, PAP, CNBC (RSS)
            │  co 60 s (GPW i noc rzadziej), jeden kanał na raz
            ▼
  ┌───────────────────┐      zmiany (delta)      ┌──────────────┐
  │ Poller            │ ───────────────────────▶ │ Hub 0..3     │ ──WebSocket──▶ przeglądarki
  │ (Durable Object)  │   co ~50 s „h” (żyję)    │ (Durable     │
  │ stan kanałów      │                          │  Objects)    │
  └───────────────────┘                          └──────────────┘
            ▲
            │ GET /api/news (cała lista, tylko przy wejściu albo po przerwie)
     Worker (worker/index.ts): /api/news, /ws; reszta to pliki statyczne
```

- **`worker/poller.ts` (Poller)**: jeden obiekt na całą stronę. Budzi się alarmem, sprawdza **jeden** kanał, który najdłużej czeka, i ustawia następny alarm. Pyta źródło z `If-None-Match`/`If-Modified-Since`, a gdy treść jest ta sama (304 albo ten sam skrót sha1), niczego nie parsuje. Zmiany zapisuje w SQLite obiektu i nadaje numer wersji (`v`).
- **Ostatnie 24 godziny:** kanały trzymają tylko swoje ostatnie wpisy, więc Poller łączy to, co jest w kanale, z wpisami, które z niego wypadły w ciągu ostatnich 24 h od publikacji (najwyżej 500 na kanał). Do stron idą tylko nowe i poprawione wpisy oraz identyfikatory tych, które się zestarzały. Cała lista jest przez to większa (przy pełnym dniu ESPI około 1 MB JSON, po kompresji kilkaset KB), ale pobiera się ją tylko przy otwarciu strony; transfer na Cloudflare jest darmowy. Poller trzyma gotowy JSON każdego kanału osobno i po zmianie składa na nowo tylko jeden kanał.
- **Częstotliwość**: ESPI (lista komunikatów Bankiera, z zajawkami z jego RSS) i Stooq co 60 s w pon.–pt. 7:00–23:00, poza tym co 3 min. GPW: komunikaty co 2 min, prasa i aktualności co 10 min. PAP MediaRoom i CNBC: co 2 min. W nocy i w weekendy żaden kanał nie jest sprawdzany częściej niż co 3 min (`src/lib/sources.ts`).
- **`worker/hub.ts` (Hub 0–3)**: trzymają połączenia WebSocket przeglądarek (cztery, żeby rozłożyć ruch). Używają WebSocket Hibernation: między wiadomościami obiekt znika z pamięci i nic nie kosztuje, a połączenia zostają otwarte. Wiadomości wychodzące do przeglądarek są darmowe.
- **Protokół** (`src/lib/protocol.ts`, klient w `src/lib/live.ts`):
  - wejście na stronę: `GET /api/news` (cała lista z wersją `v`), równolegle WebSocket `/ws`;
  - pierwsza wiadomość po połączeniu: `{t:'v', v}`, czyli aktualna wersja; przeglądarka pobiera całą listę tylko wtedy, gdy coś jej umknęło (np. po powrocie do karty na telefonie);
  - dalej tylko zmiany jednego kanału `{t:'d', v, key, add, remove, error}`; przy luce w numeracji przeglądarka pobiera całą listę;
  - co około 50 s `h`, żeby Cloudflare nie zamknął bezczynnego połączenia (zamyka po około 100 s ciszy);
  - gdy WebSocket nie działa (np. sieć firmowa), lista odświeża się co 3 min zwykłym zapytaniem.
- **Cron co 10 min** tylko pilnuje, żeby pętla Pollera działała (sama startuje przy pierwszym wejściu).
- **Online:** huby przy każdym rozesłaniu odpowiadają, do ilu stron je wysłały. Poller sumuje te liczby i dołącza sumę do heartbeatu (`{t:'h', n}`) oraz pierwszej wiadomości po połączeniu, a strona pokazuje „· N online”. Nie kosztuje to żadnych dodatkowych zapytań. Liczba to otwarte karty (każda osobno, z obu adresów), odświeżana co około 50 s.
- `/ws` przyjmuje połączenia tylko ze stron tej samej domeny i z adresów z `ALLOWED_ORIGINS` (nagłówek `Origin`). Tak samo `/api/news` wysyła nagłówek CORS tylko tym adresom.
- **Ukrywanie kanałów** (oko w ustawieniach) to tylko filtr w przeglądarce. Serwer zawsze wysyła wszystkie kanały, więc ukrycie i ponowne pokazanie kanału nie wysyła żadnego zapytania, nawet przy częstym klikaniu. Osobne subskrypcje kanałów na serwerze kosztowałyby więcej (zapytanie przy każdym kliknięciu) i oszczędziłyby tylko trochę transferu, który na Cloudflare jest darmowy.
- **Kopia na GitHub Pages** (`dankostecki.github.io/szczekaczka`) to te same pliki strony, zbudowane z prefiksem `/szczekaczka` i adresem Workera. Korzysta z tego samego Pollera i tych samych hubów, więc limity niżej obejmują obie wersje razem. Pliki strony z GitHuba nie liczą się do limitów Cloudflare.

## Limity darmowego planu i zużycie przy 1000 użytkowników

Założenie: 1000 użytkowników, każdy średnio 10 połączeń dziennie (otwarcie strony, powrót do karty na telefonie, zmiana sieci), czyli około 10 tys. połączeń dziennie.

| Limit dzienny (plan Free) | Na co idzie | Zużycie / dzień | Wykorzystanie |
|---|---|---|---|
| Workers: 100 tys. zapytań | `/ws` (10 tys.) + `/api/news` (około 10 tys.) | około 20 tys. | około 20% |
| Durable Objects: 100 tys. zapytań | połączenia (10 tys.), listy (10 tys.), alarmy Pollera (około 9 tys. przy 13 kanałach), rozsyłanie do hubów (około 9 tys.) | około 38 tys. | około 38% |
| Durable Objects: 100 tys. zapisanych wierszy | alarmy (około 9 tys.), zmiany kanałów (około 5 tys.) | około 14 tys. | około 14% |
| Durable Objects: 13 tys. GB-s | Poller czeka na źródło przy każdym sprawdzeniu, huby tylko chwilę przy rozsyłaniu | poniżej 1 tys. | poniżej 10% |
| Pliki statyczne | strona, regulamin, polityka, źródła | dowolnie dużo | bez limitu |

- Koszt sprawdzania źródeł (alarmy, zapisy, rozsyłanie) jest stały i nie zależy od liczby użytkowników. Na każde połączenie przypadają około 2 zapytania Workera i 2 zapytania Durable Objects.
- Przy takim wzorcu zapasu wystarcza na około **3–4 tys. użytkowników**. Gdy ktoś trzyma kartę otwartą na komputerze cały dzień, to jedno połączenie, a nie 1440 zapytań.
- **Gdy limit dzienny się skończy** (zeruje się o 00:00 UTC): strona dalej się otwiera (pliki statyczne nie mają limitu), ale lista się nie załaduje i nie przyjdą nowe newsy aż do wyzerowania.

## Ryzyka

- **Limit CPU na jedno wywołanie (10 ms na planie Free).** Dlatego Poller sprawdza jeden kanał na raz. Pomiar lokalny: przetworzenie jednego kanału to około 1,5–4 ms CPU, cała runda wszystkich kanałów około 13 ms. Z jednego kanału brane jest najwyżej 100 newsów i najwyżej pierwsze 512 KB kanału, a z długich komunikatów (np. całe teksty w PAP MediaRoom) tylko pierwsze 4000 znaków. Koszt kanału ma więc górną granicę: najgorszy przypadek (kanał z pełnymi artykułami) to lokalnie około 3 ms. Lista komunikatów Bankiera to strona HTML (około 575 KB, bez odpowiedzi 304): czytana jest tylko lista (około 50 KB), a zajawki z małego kanału RSS. Całe sprawdzenie to lokalnie około 3–5 ms (najwięcej kosztuje odczytanie całej strony). Gdy strona przyjdzie bez listy, raporty biorą się z samego RSS (tylko część z nich), a ramka to mówi. Czekanie na odpowiedź źródła nie liczy się do CPU. Prawdziwe wartości widać w panelu Cloudflare (Workers → szczekaczka → Metrics, oraz logi). Jeśli wywołania zaczną przekraczać limit, rozwiązaniem jest plan **Workers Paid (5 USD miesięcznie)**: dłuższy limit CPU i limity liczone w milionach.
- **Źródła czasem nie odpowiadają** (np. GPW potrafi nie odpowiedzieć w kilka sekund). Serwer czeka 15 s, a po nieudanej próbie ponawia ją po 1, 2, 4… minutach (nie rzadziej niż zwykle). Ramkę „Chwilowo nie działa” strony pokazują dopiero po 3 nieudanych próbach z rzędu, więc pojedyncze przycięcie źródła jest niewidoczne. Ostatnie newsy z tego kanału zostają na liście. Kanał, z którego nie ma jeszcze żadnych newsów (np. nowo dodany), pokazuje błąd od pierwszej nieudanej próby, bo i tak nie ma czego wyświetlić. W logach Workera każda nieudana próba to wpis z powodem, np. `feed GPW:PRASA: failed check 1 in a row: źródło nie odpowiedziało w 15 s`.
- **Źródła mogą zmienić format albo blokować zapytania z chmury.** Wtedy błędy będą się powtarzać i ramka zostanie. Ostatnie newsy z tego kanału zostaną na liście, a kanał można ukryć w ustawieniach.
- **Liczby w tabeli to szacunek.** Rzeczywiste zużycie widać w panelu Cloudflare (Workers & Pages → Overview / Usage oraz Durable Objects).

## Czemu tak, a nie inaczej

- **Webhooki od źródeł:** Bankier, GPW, Stooq, PAP MediaRoom i CNBC udostępniają tylko kanały RSS i strony (lista komunikatów Bankiera), bez powiadomień (webhooków ani WebSub, czyli `rel="hub"` w kanale). Ktoś musi je odpytywać. Tutaj robi to jeden Poller dla wszystkich.
- **WebSocket w Durable Object z hibernacją zamiast SSE:** strumień SSE w Workerze trzyma otwarte wywołanie przez cały czas połączenia. WebSocket z hibernacją nie kosztuje nic między wiadomościami.
- **Durable Objects zamiast osobnej usługi Pub/Sub:** to standardowy i darmowy sposób Cloudflare na rozsyłanie wiadomości przez WebSockety, bez nowego dostawcy (a więc bez zmian w polityce prywatności).
- **Poprzednio (Vercel):** każda przeglądarka pytała co minutę, a funkcja przetwarzała kanały przy wygaśnięciu wspólnej kopii. Na darmowym planie Vercela limitem było CPU (4 h na 30 dni) i liczba zapytań rosła z liczbą użytkowników. Pomiar przed optymalizacją: około 0,17 s CPU na wywołanie, w tym 144 ms na tworzenie formatera dat dla każdej daty; po poprawce cała runda kosztuje około 13 ms.

## Testy lokalne

```bash
npm run preview            # next build + wrangler dev na http://localhost:8787
```

Do testów bez dostępu do prawdziwych źródeł: plik `.dev.vars` z `FEED_ORIGIN=http://127.0.0.1:4555` kieruje Pollera na lokalny serwer z udawanymi kanałami (adres `https://www.gpw.pl/rss_komunikaty` zamienia się w `http://127.0.0.1:4555/www.gpw.pl/rss_komunikaty`). Na produkcji tej zmiennej nie ustawiamy.
