import type { Metadata } from 'next'
import Link from 'next/link'
import LegalPage, { Contact } from '@/components/LegalPage'
import { OPERATOR } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Regulamin · Szczekaczka',
  description: 'Zasady korzystania z serwisu Szczekaczka.',
}

export default function Terms() {
  return (
    <LegalPage title="Regulamin">
      <h2>§ 1. Postanowienia ogólne</h2>
      <ol>
        <li>
          Regulamin określa zasady korzystania z serwisu internetowego Szczekaczka (dalej: <b>Serwis</b>). Jest to
          regulamin, o którym mowa w art. 8 ustawy z dnia 18 lipca 2002 r. o świadczeniu usług drogą elektroniczną.
        </li>
        <li>
          Serwis prowadzi {OPERATOR.name} (dalej: <b>Usługodawca</b>). Kontakt: <Contact />.
        </li>
        <li><b>Użytkownik</b> to każda osoba, która korzysta z Serwisu.</li>
        <li>
          Serwis jest bezpłatny, nie wymaga rejestracji ani podawania danych i nie zawiera reklam.
        </li>
      </ol>

      <h2>§ 2. Rodzaj i zakres usług</h2>
      <ol>
        <li>
          Serwis zbiera w jednej liście nagłówki i zajawki udostępniane publicznie w kanałach RSS przez:
          Bankier.pl (komunikaty spółek ESPI/EBI), Giełdę Papierów Wartościowych w Warszawie (komunikaty, komunikaty
          indeksowe, komunikaty prasowe, aktualności), Stooq (biznes, kraj, świat) oraz PAP MediaRoom Polskiej Agencji
          Prasowej (komunikaty prasowe: biznes i finanse, nauka i technologie, polityka i społeczeństwo). Pełna lista
          kanałów z adresami jest na stronie <Link href="/o-stronie">O stronie i źródła</Link>.
        </li>
        <li>
          Serwis udostępnia funkcje:
          <ul>
            <li>przeglądania, filtrowania i wyszukiwania newsów oraz przechodzenia do ich źródeł,</li>
            <li>dostarczania nowych newsów na bieżąco (bez odświeżania strony) i oznaczania ich jako nowe,</li>
            <li>czytania newsów na głos syntezatorem mowy przeglądarki,</li>
            <li>powiadomień na pulpicie o nowych newsach,</li>
            <li>zapisywania newsów na później, oznaczania przeczytanych i listy obserwowanych spółek.</li>
          </ul>
        </li>
        <li>
          Ustawienia, zapisane i przeczytane newsy są przechowywane wyłącznie w przeglądarce Użytkownika. Szczegóły
          opisuje <Link href="/polityka-prywatnosci">Polityka prywatności</Link>.
        </li>
      </ol>

      <h2>§ 3. Wymagania techniczne</h2>
      <ol>
        <li>
          Do korzystania z Serwisu potrzebne są: urządzenie z dostępem do internetu i aktualna przeglądarka (np. Chrome,
          Edge, Firefox, Safari) z włączonym JavaScriptem, pamięcią przeglądarki (localStorage) i obsługą połączeń
          WebSocket. Gdy stałe połączenie nie działa (np. w niektórych sieciach firmowych), lista odświeża się co kilka minut.
        </li>
        <li>
          Czytanie na głos wymaga przeglądarki obsługującej syntezę mowy (Web Speech API). Dostępne głosy zależą od
          przeglądarki i systemu. Część głosów działa w chmurze producenta przeglądarki (zob. Polityka prywatności).
        </li>
        <li>
          Powiadomienia wymagają zgody udzielonej w przeglądarce i działają, gdy Serwis jest otwarty w karcie.
          Niektóre przeglądarki mobilne ich nie obsługują.
        </li>
        <li>
          Przeglądarki odtwarzają dźwięk dopiero po kliknięciu na stronie, dlatego po każdym otwarciu Serwisu czytanie
          na głos trzeba włączyć ponownie.
        </li>
      </ol>

      <h2>§ 4. Zasady korzystania</h2>
      <ol>
        <li>Użytkownik korzysta z Serwisu zgodnie z prawem, Regulaminem i dobrymi obyczajami.</li>
        <li>
          Zabronione jest działanie, które utrudnia działanie Serwisu, w szczególności automatyczne, masowe odpytywanie
          serwera Serwisu, próby obejścia jego zabezpieczeń lub wykorzystywanie go do ataków na serwisy źródłowe.
        </li>
        <li>Serwis nie umożliwia Użytkownikom publikowania własnych treści.</li>
      </ol>

      <h2>§ 5. Charakter informacji i odpowiedzialność</h2>
      <ol>
        <li>
          Serwis ma charakter wyłącznie informacyjny. Treści w Serwisie nie są rekomendacją inwestycyjną w rozumieniu
          rozporządzenia Parlamentu Europejskiego i Rady (UE) nr 596/2014 (MAR), doradztwem inwestycyjnym, prawnym ani
          podatkowym. Decyzje inwestycyjne Użytkownik podejmuje na własną odpowiedzialność.
        </li>
        <li>
          Treści pochodzą od podmiotów trzecich (Bankier.pl, GPW, Stooq, PAP MediaRoom oraz spółek i instytucji publikujących raporty i komunikaty) i są
          pokazywane w takiej postaci, w jakiej udostępniły je w kanałach RSS. Usługodawca nie odpowiada za ich
          treść, kompletność ani aktualność. Wiążące są wyłącznie raporty i komunikaty opublikowane w oficjalnych
          kanałach (system ESPI/EBI, strony spółek, strona GPW).
        </li>
        <li>
          Newsy mogą pojawiać się z opóźnieniem albo wcale, np. gdy serwis źródłowy jest niedostępny lub zmieni format
          kanału. Serwer sprawdza kanały co około minutę (rzadziej zmieniające się kanały GPW oraz w nocy i w weekendy rzadziej). Godziny są
          wyświetlane w czasie polskim na podstawie danych z kanałów. Czytanie na głos może zawierać błędy wymowy.
        </li>
        <li>
          Usługodawca dokłada starań, aby Serwis działał bez przerw, ale nie gwarantuje jego dostępności. Może
          czasowo wyłączyć Serwis, np. na czas prac technicznych.
        </li>
        <li>
          Ograniczenia odpowiedzialności z tego paragrafu obowiązują w zakresie dopuszczonym przez prawo i nie
          ograniczają praw Użytkownika będącego konsumentem, które wynikają z bezwzględnie obowiązujących przepisów.
        </li>
      </ol>

      <h2>§ 6. Prawa do treści</h2>
      <ol>
        <li>
          Prawa do nagłówków, zajawek i znaków towarowych należą do ich wydawców i właścicieli. Serwis pokazuje je
          z podaniem źródła i linkiem do pełnej treści.
        </li>
        <li>
          Wydawca, który nie chce, aby jego treści były pokazywane w Serwisie, może skontaktować się z Usługodawcą.
          Usługodawca usunie wskazane źródło bez zbędnej zwłoki.
        </li>
      </ol>

      <h2>§ 7. Zawarcie i rozwiązanie umowy</h2>
      <ol>
        <li>
          Umowa o świadczenie usług drogą elektroniczną zostaje zawarta, gdy Użytkownik otworzy Serwis. Jest zawarta
          na czas nieoznaczony.
        </li>
        <li>
          Użytkownik może w każdej chwili zakończyć korzystanie z Serwisu: wystarczy go zamknąć. Dane zapisane
          w przeglądarce może usunąć w ustawieniach Serwisu („Usuń wszystkie dane z tej przeglądarki”) lub
          w ustawieniach przeglądarki.
        </li>
        <li>Usługodawca może zakończyć prowadzenie Serwisu, informując o tym na stronie Serwisu.</li>
      </ol>

      <h2>§ 8. Reklamacje</h2>
      <ol>
        <li>
          Reklamacje dotyczące działania Serwisu można zgłaszać przez kontakt podany w § 1 ust. 2. Warto opisać
          problem oraz podać przeglądarkę i urządzenie.
        </li>
        <li>Usługodawca odpowiada na reklamację w ciągu 14 dni od jej otrzymania.</li>
        <li>
          Użytkownik będący konsumentem może skorzystać z pozasądowych sposobów rozpatrywania sporów, np. pomocy
          miejskiego lub powiatowego rzecznika konsumentów albo organizacji konsumenckich.
        </li>
      </ol>

      <h2>§ 9. Postanowienia końcowe</h2>
      <ol>
        <li>
          Usługodawca może zmienić Regulamin, np. gdy zmienią się funkcje Serwisu lub przepisy. Nowa wersja obowiązuje
          od daty podanej na górze strony. Korzystanie z Serwisu po zmianie oznacza korzystanie na nowych zasadach.
        </li>
        <li>
          W sprawach nieuregulowanych stosuje się prawo polskie, w szczególności ustawę o świadczeniu usług drogą
          elektroniczną, Kodeks cywilny i RODO. Wybór prawa polskiego nie pozbawia konsumenta ochrony, którą zapewniają
          mu bezwzględnie obowiązujące przepisy państwa jego zwykłego pobytu.
        </li>
        <li>
          Zasady przetwarzania danych opisuje <Link href="/polityka-prywatnosci">Polityka prywatności</Link>.
        </li>
      </ol>
    </LegalPage>
  )
}
