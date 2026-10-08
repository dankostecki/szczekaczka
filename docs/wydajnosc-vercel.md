# Wydajność i limity Vercela (audyt, październik 2026)

## Najważniejsze

- Na darmowym planie Hobby realnym limitem jest **Fluid Active CPU: 4 h na 30 dni**, wspólne dla całego konta Vercel. Pozostałe limity (wywołania, transfer, pamięć) są daleko.
- CPU zużywa wyłącznie funkcja `/api/news`, czyli pobranie i przetworzenie 9 kanałów RSS. Strony (lista, regulamin, polityka, źródła) są statyczne i nie zużywają CPU.
- Pomiar na żywym projekcie przed tymi zmianami: **około 0,17 s CPU na wywołanie** i niemal każde odświeżenie karty kończyło się wywołaniem. Jedna karta otwarta 24/7 z odświeżaniem co minutę zużywała około 2 h CPU miesięcznie, czyli około 50% limitu.

## Skąd brało się CPU

Pomiar lokalny na 9 kanałach o realistycznej wielkości (około 260 KB XML, 430 newsów):

| Etap | CPU na jedną rundę |
|---|---|
| Parsowanie XML (fast-xml-parser) | około 14 ms |
| Czyszczenie tekstu (HTML, encje) | około 4 ms |
| **Przeliczanie dat „+0100/+0200” na czas polski (przed poprawką)** | **około 144 ms** |
| To samo po poprawce | około 1,5 ms |
| **Cała runda: przed / po** | **około 107 ms / około 20 ms** |

Przyczyną był `new Intl.DateTimeFormat(...)` tworzony od nowa dwa razy dla każdej daty. Polskie kanały podają daty ze strefą „+0100/+0200”, więc dotyczyło to prawie każdego newsa. Teraz jest jeden formater, a przesunięcie strefy jest zapamiętywane na każdą godzinę.

## Co zostało zrobione

1. **Daty**: około 5 razy mniej CPU na każde wywołanie.
2. **Kanały bez zmian nie są ponownie przetwarzane.** Serwer pyta źródło z `If-None-Match`/`If-Modified-Since`. Gdy dostanie 304 albo identyczną treść (sprawdzaną przez skrót sha1), używa wyniku z poprzedniego razu. Działa, dopóki instancja funkcji jest „ciepła”, co przy odświeżaniu co minutę zdarza się zwykle.
3. **Rzadko zmieniające się kanały GPW są sprawdzane rzadziej**: komunikaty co 2 min, indeksy co 5 min, prasa i aktualności co 10 min, kalendarz co 15 min.
4. **Gdy źródło padnie**, pokazywane są jego ostatnie newsy, a błąd widać w ramce.
5. **Wspólna kopia w CDN: 50 s + 10 s stale-while-revalidate** zamiast 30 s + 60 s.
   - Strona pytająca co minutę dostaje świeżą listę, a nie kopię sprzed minuty.
   - Przy wielu użytkownikach na region przypada najwyżej około jedno wywołanie na 50–60 s.
   - Kopia z pamięci funkcji trafia do CDN tylko na pozostały czas ważności.
6. **Wolniej w nocy i w weekendy** (domyślnie włączone): poza pon.–pt. 7:00–23:00 strona pyta najwyżej co 10 min. Odświeżanie co minutę obejmuje 80 h ze 168 h w tygodniu, więc liczba wywołań przy karcie otwartej 24/7 spada mniej więcej o połowę.
7. **Ukryta karta** bez głosu i powiadomień nie pyta wcale i nadrabia po powrocie (już wcześniej).
8. **Pomiar w każdej odpowiedzi:**
   - nagłówek `Server-Timing` (`cpu;dur=…`, `feeds;desc="fetched…, parsed…, unchanged…, skipped…"`), widoczny w karcie Network przeglądarki;
   - linia `news refresh: …` w logach funkcji na Vercelu.
9. **`maxDuration = 15`**: zawieszone wywołanie nie zużyje więcej.

## Prognoza (do potwierdzenia pomiarem na Vercelu)

**Zastrzeżenie:** pierwsze wywołanie w świeżej instancji funkcji (cold start) kosztuje więcej, lokalnie około 150–200 ms CPU nawet bez parsowania (ładowanie modułów, przygotowanie połączeń). Przy stałym ruchu co minutę Vercel zwykle trzyma instancję „ciepłą” i wtedy liczy się koszt około 20–40 ms. Rzeczywisty koszt pokaże nagłówek `Server-Timing` (`cpu;dur=`) i logi `news refresh`. Jeśli większość wywołań okaże się zimna, zostaje rzadsze odpytywanie (tryb nocny, dłuższa kopia).

Przy około 20–40 ms CPU na ciepłe wywołanie (zamiast 170 ms):

| Scenariusz | Wywołania / 30 dni | Active CPU / 30 dni |
|---|---|---|
| 1 karta 24/7, co 1 min, z trybem nocnym | około 23 tys. | około 0,15–0,25 h (4–6% limitu) |
| 1 karta 24/7, co 1 min, bez trybu nocnego | około 43 tys. | około 0,25–0,5 h |
| Dowolnie wielu użytkowników (sufit z CDN, 1 region) | najwyżej około 52 tys. | najwyżej około 0,3–0,6 h |

Każde odświeżenie u każdego użytkownika to jednak nadal jedno zapytanie do CDN (Edge Request) i trochę transferu. Te limity rosną z liczbą użytkowników, nie CPU. Przy kilkudziesięciu kartach otwartych non stop warto patrzeć na zakładkę Usage.

## Czy da się bez odpytywania (webhooki, WebSockety)?

- **Webhooki od źródeł:** Bankier, GPW i Stooq udostępniają tylko kanały RSS. Nie widać tam mechanizmu powiadamiania (webhooków ani WebSub, czyli `rel="hub"` w kanale). Bez tego ktoś musi źródła odpytywać, a to odpytywanie jest właśnie kosztem CPU. Natychmiastowe ESPI oferują tylko płatne serwisy danych (np. agencje informacyjne).
- **WebSockety na Vercelu:** funkcje Vercela nie utrzymują połączeń WebSocket. Strumień SSE jest możliwy, ale każde otwarte połączenie trzyma instancję funkcji: zużywa limit pamięci (GB-h) i musi się co kilka minut łączyć od nowa (limit czasu funkcji). Na Hobby wyszłoby drożej niż obecne odpytywanie z CDN.
- **Zewnętrzna usługa „realtime”** (np. Ably, Pusher): zastąpiłaby tylko odpytywanie przeglądarka→serwer, które przy CDN i tak prawie nic nie kosztuje. Nadal potrzebny byłby proces odpytujący źródła. Do tego doszedłby nowy podmiot przetwarzający dane, czyli zmiana polityki prywatności.
- **Cron na Vercelu** jako jedyny pobierający: na Hobby cron działa raz dziennie, więc nie nadaje się.
- **Wniosek:** przy tej skali najtańsze jest obecne rozwiązanie, czyli odpytywanie z jedną wspólną kopią w CDN. Funkcja działa „leniwie” (tylko gdy ktoś pyta i kopia wygasła), a jej koszt nie rośnie z liczbą użytkowników.

## Gdyby kiedyś było za mało

- **Cloudflare Worker z Cron Trigger** (co minutę) pobiera RSS i zapisuje gotowy JSON (KV/R2). Strona czyta ten JSON z CDN, a Vercel tylko serwuje statyczną stronę, bez żadnego CPU. Darmowy plan Workers ma limit CPU na wywołanie, więc parsowanie trzeba by zmierzyć.
- **Powiadomienia przy zamkniętej przeglądarce (Web Push)** wymagają takiego właśnie stałego procesu oraz bazy subskrypcji. To osobny projekt.
- **Vercel Pro** (20 USD miesięcznie) znosi problem limitów przy średniej skali.
