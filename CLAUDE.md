# Szczekaczka: zasady pracy nad repozytorium

Opis projektu, uruchomienie i wdrożenie są w `README.md`.

## Każda zmiana aktualizuje też PWA

Szczekaczka działa jako PWA (manifest, service worker, instalacja). Przy każdej zmianie sprawdź, czy dotyczy ona też PWA, i dokończ to w tym samym PR-ze.

- **Użytkownik aplikacji ma dostać najnowszą wersję od razu po wdrożeniu.** Pilnują tego: `public/sw.js` (stronę, pliki bez hasha i `/api/news` bierze najpierw z sieci, z `cache: 'no-cache'`; `version.json` zostawia w spokoju) oraz `src/lib/version.ts` (otwarta aplikacja porównuje swoją wersję z `/version.json` przy starcie, po powrocie na ekran, po powrocie sieci i co 10 minut; po powrocie sama się przeładowuje, a gdy czyta głos, pokazuje pasek „Jest nowa wersja”). Nazwa wersji powstaje w `next.config.js` z drzew gita `src/`, `public/`, `package-lock.json` i `next.config.js`. Nie psuj tego: żadnego długiego `Cache-Control` na stronie i na `sw.js`, żadnej kopii `version.json` w workerze, żadnych plików strony bez hasha w `_next/static`.
- Zmieniasz reguły kopiowania w `public/sw.js` albo coś, co mogłoby zepsuć stare kopie w telefonach: podnieś `CACHE` (`szczekaczka-v2` itd.) i poprawiaj tę nazwę w polityce prywatności i w README.
- Zmieniasz logo, kolory strony lub nazwę: odśwież ikony `public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (rysunek w `src/lib/duck.ts`, obrazy robi `node scripts/render-assets.mjs icons`), obrazy startowe iPhone'a i iPada `public/splash` (`node scripts/render-assets.mjs splash`; kolory jasny i ciemny muszą być kolorami strony z `src/app/globals.css`, a lista ekranów jest w `src/lib/splash-screens.json`), kolor ekranu startowego Androida w `src/app/manifest.ts` (`SPLASH`; `theme_color` z paskami aplikacji zostaje biały, czerwony wyglądał tam źle) i kolory pasków systemu w `src/lib/theme.ts`.
- Zmieniasz to, co strona zapisuje na urządzeniu (localStorage, Cache Storage): popraw politykę prywatności (`src/app/polityka-prywatnosci/page.tsx`, a z nią `LEGAL_DATE` w `src/lib/site.ts`), przycisk „Usuń wszystkie dane” w ustawieniach i sekcję „Aplikacja (PWA)” w README.
- Dodajesz stronę, trasę lub plik: worker bierze wszystko spod swojego zakresu, więc po jednej wizycie działa to także bez sieci. GitHub Pages ma prefiks `/szczekaczka`, więc adresy buduj z `BASE_PATH` (`src/lib/site.ts`), nie na sztywno.
- Sprawdzaj na obu adresach: Cloudflare (korzeń) i kopii na GitHub Pages (`PAGES_BASE_PATH=/szczekaczka`, API pod innym adresem): manifest i ikony, rejestracja workera, start bez sieci, instalacja, nowa wersja po wdrożeniu.

## Inne zasady

- Reguły czytania na głos (`src/lib/say.ts`) mają być ogólne, a nie pod jeden przykład, i mieć test.
- W interfejsie aplikacji nie ma opisów technicznych ani wewnętrznych: to aplikacja produkcyjna.
