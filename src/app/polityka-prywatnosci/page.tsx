import type { Metadata } from 'next'
import Link from 'next/link'
import LegalPage, { Contact } from '@/components/LegalPage'
import { OPERATOR } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Polityka prywatności · Szczekaczka',
  description: 'Jakie dane przetwarza Szczekaczka, co zapisuje w przeglądarce i jakie masz prawa.',
}

export default function PrivacyPolicy() {
  return (
    <LegalPage title="Polityka prywatności">
      <div className="legal-summary">
        <h2>W skrócie</h2>
        <ul>
          <li>Nie zakładasz konta i nie podajesz nam żadnych danych.</li>
          <li>Nie używamy plików cookies, analityki, reklam ani żadnych narzędzi śledzących.</li>
          <li>Twoje ustawienia, przeczytane i zapisane newsy są tylko w pamięci Twojej przeglądarki. Nie wysyłamy ich na serwer.</li>
          <li>
            Serwery, które dostarczają stronę (Cloudflare, a pod adresem dankostecki.github.io także GitHub), technicznie
            widzą Twój adres IP przy każdym połączeniu, jak każda strona internetowa.
          </li>
        </ul>
      </div>

      <h2>1. Administrator danych</h2>
      <p>
        Administratorem danych osobowych przetwarzanych w związku z działaniem serwisu Szczekaczka
        (dalej: <b>Serwis</b>) jest {OPERATOR.name} (dalej: <b>Administrator</b>).
      </p>
      <p>Kontakt w sprawach danych osobowych: <Contact />.</p>
      <p>Administrator nie wyznaczył inspektora ochrony danych, bo nie ma takiego obowiązku.</p>

      <h2>2. Jakie dane przetwarzamy, w jakim celu i na jakiej podstawie</h2>
      <h3>a) Dane techniczne w logach serwera</h3>
      <p>
        Otwarcie strony to kilka zapytań do serwera: pobranie plików strony i listy newsów oraz nawiązanie stałego
        połączenia (WebSocket), przez które serwer przysyła nowe newsy, dopóki strona jest otwarta. Serwis jest
        dostępny pod dwoma adresami. W wersji na Cloudflare wszystko dostarcza Cloudflare. W wersji pod adresem
        dankostecki.github.io/szczekaczka pliki strony dostarcza GitHub (GitHub Pages), a listę newsów i stałe
        połączenie Cloudflare. Dostawcy hostingu przetwarzają przy tym dane techniczne: adres IP, datę i godzinę,
        adres podstrony, informacje o przeglądarce i systemie (nagłówek User-Agent) oraz kod odpowiedzi serwera.
        Mogą one trafić do ich logów.
      </p>
      <p>
        <b>Cel:</b> dostarczenie strony, zapewnienie bezpieczeństwa i stabilności Serwisu, wykrywanie błędów i nadużyć.
        <br /><b>Podstawa prawna:</b> art. 6 ust. 1 lit. f RODO, czyli prawnie uzasadniony interes Administratora
        polegający na zapewnieniu działania i bezpieczeństwa Serwisu.
      </p>
      <p>
        Administrator nie używa tych danych do identyfikowania osób, nie łączy ich z innymi danymi i nie tworzy na ich
        podstawie profili.
      </p>

      <h3>b) Kontakt z Administratorem</h3>
      <p>
        Jeśli napiszesz do Administratora (wiadomość prywatna w serwisie X), przetwarzamy dane z tej rozmowy: nazwę
        Twojego profilu i treść wiadomości, aby odpowiedzieć i załatwić sprawę. Wiadomości w serwisie X przetwarza
        także X Corp. na zasadach opisanych w swojej polityce prywatności.
        <br /><b>Podstawa prawna:</b> art. 6 ust. 1 lit. f RODO, czyli prawnie uzasadniony interes w prowadzeniu korespondencji.
      </p>

      <h3>c) Czego nie przetwarzamy</h3>
      <p>
        Serwis nie ma kont użytkowników, formularzy, newslettera ani płatności. Nie korzysta z narzędzi analitycznych
        (np. Google Analytics, Cloudflare Web Analytics), pikseli reklamowych, wtyczek serwisów społecznościowych, zewnętrznych
        czcionek ani innych skryptów ładowanych z cudzych serwerów. Przeglądarka łączy się wyłącznie z serwerami Serwisu
        (Cloudflare, a w wersji pod adresem dankostecki.github.io także GitHub Pages).
      </p>

      <h2>3. Cookies i pamięć przeglądarki</h2>
      <p>
        <b>Serwis nie zapisuje plików cookies.</b> Do zapamiętania Twoich ustawień używa pamięci przeglądarki
        (localStorage). Te informacje zostają na Twoim urządzeniu, nie są wysyłane na serwer i Administrator nie ma do
        nich dostępu.
      </p>
      <table className="legal-table">
        <thead>
          <tr><th>Klucz</th><th>Co zawiera</th><th>Jak długo</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>szczekaczka:prefs</code></td>
            <td>Ustawienia: motyw, głos, tempo, co czytać, wybrane kanały, powiadomienia, lista obserwowanych spółek.</td>
            <td>Do czasu usunięcia</td>
          </tr>
          <tr>
            <td><code>szczekaczka:read</code></td>
            <td>Identyfikatory newsów oznaczonych jako przeczytane (najwyżej 5000 ostatnich).</td>
            <td>Do czasu usunięcia</td>
          </tr>
          <tr>
            <td><code>szczekaczka:saved</code></td>
            <td>Newsy zapisane na później: tytuł, zajawka, link, źródło i data.</td>
            <td>Do czasu usunięcia</td>
          </tr>
          <tr>
            <td><code>szczekaczka:notice</code></td>
            <td>Informacja, że zamknięto okno o prywatności, żeby nie pokazywać go ponownie.</td>
            <td>Do czasu usunięcia</td>
          </tr>
        </tbody>
      </table>
      <p>
        Zapisujemy tylko to, co jest niezbędne do działania funkcji, z których korzystasz. Zgodnie z art. 5 ust. 3
        dyrektywy 2002/58/WE (tzw. dyrektywy ePrivacy), wdrożonym w polskim Prawie komunikacji elektronicznej, takie
        przechowywanie nie wymaga zgody. Dlatego Serwis pokazuje okno informacyjne, a nie prośbę o zgodę.
      </p>
      <p>
        <b>Jak usunąć te dane:</b> w ustawieniach Serwisu (ikona koła zębatego) kliknij „Usuń wszystkie dane z tej
        przeglądarki”. Możesz też wyczyścić dane witryny w ustawieniach przeglądarki. Wtedy Serwis wróci do ustawień
        domyślnych.
      </p>

      <h2>4. Komu przekazujemy dane</h2>
      <h3>Hosting: Cloudflare, Inc. (USA)</h3>
      <p>
        Serwis działa na serwerach Cloudflare, Inc. (Cloudflare Workers), który przetwarza dane techniczne
        (pkt 2a) w imieniu Administratora jako podmiot przetwarzający. Dane mogą być przekazywane do USA. Podstawą
        przekazania są mechanizmy z rozdziału V RODO: decyzja Komisji Europejskiej w sprawie ram ochrony danych UE–USA
        (EU-US Data Privacy Framework) albo standardowe klauzule umowne, które Cloudflare stosuje w umowie
        powierzenia danych.
      </p>
      <p>
        Lista newsów, którą serwer przechowuje, zawiera wyłącznie treści z publicznych kanałów RSS. Serwer nie zapisuje,
        kto jest połączony, i nie przechowuje żadnych danych o użytkownikach. Liczy jedynie, ile stron Serwisu jest w danej chwili
        połączonych, i pokazuje tę liczbę na stronie („online”). Ta liczba nie jest powiązana z żadnymi danymi o osobach
        i nie jest zapisywana.
      </p>

      <h3>Pliki strony pod adresem dankostecki.github.io: GitHub, Inc. (USA)</h3>
      <p>
        Gdy otwierasz Serwis pod adresem dankostecki.github.io/szczekaczka, pliki strony dostarcza usługa GitHub Pages
        firmy GitHub, Inc. GitHub przetwarza przy tym dane techniczne (pkt 2a), w tym zapisuje adres IP odwiedzających
        ze względów bezpieczeństwa, na zasadach opisanych w swoim oświadczeniu o prywatności (GitHub General Privacy
        Statement). Dane mogą być przekazywane do USA na podstawie decyzji Komisji Europejskiej w sprawie ram ochrony
        danych UE–USA (EU-US Data Privacy Framework) albo standardowych klauzul umownych. Listę newsów i nowe newsy
        także w tej wersji dostarcza serwer na Cloudflare.
      </p>

      <h3>Źródła newsów: Bankier.pl, GPW, Stooq, PAP MediaRoom, CNBC</h3>
      <p>
        Kanały RSS i listę komunikatów Bankier.pl pobiera serwer Serwisu, a nie Twoja przeglądarka, więc serwisy źródłowe nie dostają Twojego adresu IP.
        Gdy klikniesz w news, przechodzisz na stronę źródła i od tej chwili obowiązuje polityka prywatności tamtego
        serwisu. Tak samo jest z linkiem do profilu autora w serwisie X.
      </p>

      <h3>Czytanie na głos (funkcja przeglądarki)</h3>
      <p>
        Czytanie na głos korzysta z syntezatora mowy wbudowanego w przeglądarkę lub system. Część głosów działa
        w chmurze producenta przeglądarki, np. „Google polski” w Chrome (Google) albo głosy „naturalne” w Edge
        (Microsoft). Gdy wybierzesz taki głos, przeglądarka wysyła czytany tekst, czyli nagłówki i zajawki newsów, do
        serwerów Google lub Microsoft. Te dane przetwarza producent przeglądarki na własnych zasadach, opisanych
        w jego polityce prywatności. Administrator ich nie otrzymuje. Głosy lokalne (np. Paulina w Windows, Zosia na
        Macu) działają na Twoim urządzeniu. Newsy po angielsku czyta wybrany głos angielski (np. „Google US English”
        w Chrome, Aria w Edge), na tych samych zasadach.
      </p>

      <h3>Powiadomienia na pulpicie</h3>
      <p>
        Powiadomienia wyświetla przeglądarka na Twoim urządzeniu, gdy strona jest otwarta. Serwis nie korzysta z
        serwerów powiadomień push. Zgodą na powiadomienia zarządzasz w ustawieniach przeglądarki.
      </p>

      <h2>5. Jak długo przechowujemy dane</h2>
      <ul>
        <li>
          <b>Logi serwera:</b> przez ograniczony czas określony przez dostawców hostingu (Cloudflare, GitHub).
          Administrator nie kopiuje ani nie archiwizuje logów.
        </li>
        <li>
          <b>Korespondencja:</b> do czasu załatwienia sprawy, a potem przez okres, w którym mogą się pojawić związane
          z nią roszczenia.
        </li>
        <li><b>Pamięć przeglądarki:</b> do czasu, aż ją usuniesz (pkt 3).</li>
      </ul>

      <h2>6. Twoje prawa</h2>
      <p>Na zasadach określonych w RODO masz prawo do:</p>
      <ul>
        <li>dostępu do swoich danych i otrzymania ich kopii (art. 15 RODO),</li>
        <li>sprostowania danych (art. 16 RODO),</li>
        <li>usunięcia danych (art. 17 RODO),</li>
        <li>ograniczenia przetwarzania (art. 18 RODO),</li>
        <li>
          wniesienia sprzeciwu wobec przetwarzania opartego na prawnie uzasadnionym interesie, z przyczyn
          związanych z Twoją szczególną sytuacją (art. 21 RODO),
        </li>
        <li>
          wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych (ul. Stawki 2, 00-193 Warszawa,{' '}
          <a href="https://uodo.gov.pl" target="_blank" rel="noopener noreferrer">uodo.gov.pl</a>).
        </li>
      </ul>
      <p>
        Aby skorzystać z praw, skontaktuj się z Administratorem (pkt 1). Serwis nie ma kont, więc Administrator zwykle
        nie jest w stanie powiązać danych z logów z konkretną osobą (art. 11 RODO). Jeśli podasz dodatkowe informacje,
        np. adres IP oraz datę i godzinę wizyty, Administrator spróbuje odnaleźć dotyczące Cię dane.
      </p>

      <h2>7. Dobrowolność, profilowanie</h2>
      <p>
        Korzystanie z Serwisu jest dobrowolne. Bez danych technicznych z pkt 2a nie da się jednak wyświetlić strony.
        Nie podejmujemy decyzji w sposób zautomatyzowany i nie profilujemy użytkowników.
      </p>

      <h2>8. Bezpieczeństwo</h2>
      <p>
        Połączenie z Serwisem jest szyfrowane (HTTPS). Serwis nie przechowuje danych użytkowników na serwerze,
        więc nie ma czego z niego wykraść.
      </p>

      <h2>9. Zmiany polityki prywatności</h2>
      <p>
        Gdy Serwis zacznie działać inaczej, np. dojdzie nowa funkcja wpływająca na dane, zaktualizujemy tę politykę
        i datę na górze strony. Zasady korzystania z Serwisu opisuje <Link href="/regulamin">Regulamin</Link>.
      </p>
    </LegalPage>
  )
}
