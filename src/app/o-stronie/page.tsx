import type { Metadata } from 'next'
import Link from 'next/link'
import LegalPage, { Contact } from '@/components/LegalPage'
import { FEEDS, SOURCES, SOURCE_INFO, CHECK_SECONDS, QUIET_CHECK_SECONDS } from '@/lib/sources'
import { DAY_FROM } from '@/lib/schedule'
import { fetchTimesText } from '@/lib/macronext'
import { AUTHOR } from '@/lib/site'

export const metadata: Metadata = {
  title: 'O stronie i źródła · Szczekaczka',
  description: 'Skąd Szczekaczka bierze newsy: lista źródeł i kanałów RSS z adresami.',
}

export default function About() {
  return (
    <LegalPage title="O stronie i źródła" dated={false}>
      <p>
        Szczekaczka zbiera w jednym miejscu komunikaty spółek giełdowych (ESPI/EBI), komunikaty Giełdy Papierów
        Wartościowych w Warszawie, wiadomości Stooq, krótkie wiadomości z rynków świata z kanału Walter Bloomberg na Telegramie i z serwisów investingLive i Seeking Alpha,
        komunikaty prasowe z PAP MediaRoom, a także zapowiedzi danych makro
        (10 minut przed publikacją) i wydarzeń giełdowych z kalendarium MacroNext. Nowe newsy może czytać na głos i pokazywać jako powiadomienia
        na pulpicie. W zakładce Rynek i przy newsach pokazuje notowania i wykresy z TradingView. Autor: <a href={AUTHOR.url} target="_blank" rel="noopener noreferrer">{AUTHOR.name}</a>.
      </p>

      <h2>Skąd są newsy</h2>
      <p>
        Wszystkie treści pochodzą z publicznych kanałów RSS i stron wymienionych niżej. Przy każdym newsie widać źródło
        i kanał (np. „GPW · KOMUNIKATY”), a ikona linku prowadzi do pełnej treści na stronie wydawcy. Szczekaczka pokazuje
        tytuły i zajawki, czyli to, co kanał podaje obok tytułu; na liście widać ich początek, a kliknięcie newsa otwiera
        okno z całą zajawką, w podziale na akapity i punkty, jeśli źródło go podaje. Nie zmienia ich treści
        i nie dodaje własnych. Wyjątkiem są zapowiedzi MacroNext:
        Szczekaczka składa je z kalendarium danych makro (kraj, nazwa danych, okres, prognoza jako konsensus, poprzedni
        odczyt) i z kalendarium giełdowego (wydarzenia spółek, wyniki spółek z Nowego Jorku); prowadzą do kalendarium
        MacroNext na dziś. Drugim wyjątkiem są wiadomości Waltera Bloomberga, investingLive i Seeking Alpha (tytuł i zajawka z kanału RSS; artykułów Szczekaczka nie pobiera): pisane po angielsku, są domyślnie pokazywane
        w tłumaczeniu maszynowym na polski (z oznaczeniem „tłumaczenie AI”); oryginał można wybrać w ustawieniach. W wiadomościach investingLive, które są dłuższymi tekstami, tłumaczony jest tytuł i początek tekstu, a cały tekst z kanału ma oryginał. Wiadomości Seeking
        Alpha z wieczora po zamknięciu sesji w Nowym Jorku (od 22:00, a w tygodniach, gdy w USA i w Polsce czas zmienia się w różnych
        terminach, od 21:00, do północy) zostają po angielsku.
      </p>
      <p>
        Zakładka Top pokazuje najważniejsze wiadomości z ostatnich 4, 8, 12 lub 24 godzin, ze wszystkich źródeł albo z wybranego. Kolejność ustala
        sztuczna inteligencja: każdą wiadomość, gdy przychodzi, ocenia od 0 do 10 model w usłudze Cloudflare Workers AI, na podstawie tytułu i początku
        wiadomości (angielskiej przed tłumaczeniem). Ta sama wiadomość z kilku źródeł jest jedną pozycją, nieco wyżej za każde dodatkowe źródło. Ocena
        może się mylić; nie jest rekomendacją.
      </p>

      {SOURCES.map((src) => {
        const info = SOURCE_INFO[src]
        return (
          <section key={src} className="source" style={{ ['--c' as string]: `var(--src-${src.toLowerCase()})` }}>
            <h3><i className="dot" /> {info.name === src ? src : `${src}: ${info.name}`}</h3>
            <p>{info.about}</p>
            <p>
              Wydawca: <b>{info.publisher}</b> ·{' '}
              <a href={info.site} target="_blank" rel="noopener noreferrer">{info.site.replace(/^https?:\/\//, '')}</a>
            </p>
            <table className="legal-table">
              <thead>
                <tr><th>Kanał w Szczekaczce</th><th>Adres kanału RSS</th><th>Serwer sprawdza</th></tr>
              </thead>
              <tbody>
                {FEEDS.filter((f) => f.source === src).map((f) => f.format?.startsWith('macronext') ? (
                  <tr key={f.url}>
                    <td>{src} · {f.label}</td>
                    <td><a href={f.url} target="_blank" rel="noopener noreferrer" className="feed-url">{f.url}</a> (strona na dziś, nie RSS)</td>
                    <td>o {fetchTimesText()}</td>
                  </tr>
                ) : (
                  <tr key={f.url}>
                    <td>{src} · {f.label}</td>
                    <td>
                      <a href={f.url} target="_blank" rel="noopener noreferrer" className="feed-url">{f.url}</a>
                      {f.format === 'telegram' && ' (kanał na Telegramie, nie RSS)'}
                    </td>
                    <td>{f.minAge ? `co ${f.minAge / 60} min` : `co ${(f.every ?? CHECK_SECONDS) / 60} min, w nocy i w weekendy co ${QUIET_CHECK_SECONDS / 60} min`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}

      <p>
        Prawa do treści należą do ich wydawców. Raporty ESPI/EBI przygotowują spółki, a wiążąca jest ich wersja
        opublikowana w oficjalnym systemie ESPI/EBI i na stronach spółek. Szczekaczka nie jest rekomendacją
        inwestycyjną (zob. <Link href="/regulamin">Regulamin</Link>). Wydawca, który nie chce, żeby jego kanał
        był tu pokazywany, może się skontaktować: <Contact />.
      </p>

      <h2>Przyciski źródeł</h2>
      <p>
        Nazwa źródła pod nagłówkiem pokazuje tylko jego newsy. Kropka przed nazwą wyłącza źródło w widoku Wszystko (przygasza przycisk)
        i włącza z powrotem, bez wchodzenia w ustawienia. Wyłączone źródło nie jest też czytane na głos ani pokazywane w powiadomieniach,
        ale jego zakładka zostaje i pokazuje wszystkie jego newsy.
      </p>

      <h2>Rynek: notowania i wykresy</h2>
      <p>
        Zakładka Rynek pokazuje notowania wybranych instrumentów (kursy walut, indeksy z USA, Niemiec i Japonii, złoto, srebro, ropa,
        miedź, bitcoin i ethereum) i ich wykresy z bezpłatnych widżetów serwisu{' '}
        <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView</a>. Ładują się dopiero po włączeniu
        wykresów (zob. <Link href="/polityka-prywatnosci">Polityka prywatności</Link>). Waluty, kryptowaluty i kontrakty CFD
        na indeksy i surowce są na bieżąco, akcje z opóźnieniem (zwykle 15 minut), a notowania z GPW z końca dnia. Wykres innego instrumentu pokaże symbol wpisany w pole na górze
        zakładki, np. CDR, AAPL, EURUSD albo pełny symbol TradingView, jak GPW:CDR czy NASDAQ:AAPL.
      </p>
      <p>
        Newsy z Waltera Bloomberga, investingLive, Seeking Alpha, Stooq i PAP MediaRoom mają w oknie newsa, pod tekstem, notowania tego, o czym piszą:
        spółek (po tickerze, np. $TSLA albo „(NASDAQ:TSLA)”, i po nazwie, także odmienionej: „akcje Tesli”), indeksów, par walutowych,
        surowców i kryptowalut, najwyżej trzech. Przy ropie (także zapasach ropy i OPEC) są zawsze dwa wiersze: Brent i WTI. Kliknięcie wiersza otwiera pełny wykres. Pod akcjami jest dopisek, że ich kursy są opóźnione
        (zwykle o 15 minut). Spółki z GPW i z giełdy we Frankfurcie mają tylko przycisk do wykresu, bo ich notowania są w widżetach z końca dnia. Instrumenty są dobierane automatycznie, więc czasem
        któregoś zabraknie albo pojawi się niewłaściwy.
      </p>

      <h2>Poranny przegląd rynków</h2>
      <p>
        <Link href="/poranek">Poranny przegląd</Link> to kilka najważniejszych informacji z rynków od wieczora do rana: do wysłuchania
        (nagranie trwa kilka minut) i do przeczytania, z linkami do źródeł przy każdej informacji. Obejmuje wiadomości opublikowane od wieczora
        dnia poprzedniego do zamknięcia wydania wczesnym rankiem i ukazuje się rano; dokładne godziny (w czasie polskim) są przy każdym wydaniu.
      </p>
      <ul>
        <li>Wiadomości bierze z kanałów listy newsów, według godziny ich publikacji, ale bez Seeking Alpha (jego krótkie wpisy po sesji w USA nie nadają się do sprawdzenia w źródłach) i bez zapowiedzi MacroNext. Ważność wiadomości pomaga wstępnie ocenić model w usłudze Cloudflare Workers AI.</li>
        <li>
          Sztuczna inteligencja (modele OpenAI) wybiera najważniejsze, a każdą informację sprawdza na publicznych stronach: u źródła (instytucji,
          spółki, giełdy) i w co najmniej jednym niezależnym serwisie informacyjnym. Strony czyta tylko tam, gdzie pozwalają na to ich zasady dla
          robotów, i nie omija płatnego dostępu. Cytaty i liczby są porównywane z treścią tych stron; informacja, której nie da się tak potwierdzić,
          albo którą źródła podają różnie, do przeglądu nie trafia. Nie trafiają też stare historie, które wróciły w nowych wiadomościach.
        </li>
        <li>Tekst jest pisany po polsku i jeszcze raz sprawdzany z potwierdzonymi informacjami, a nagranie powstaje w syntezatorze mowy (Google Cloud).</li>
        <li>
          Gdy czegoś nie da się zrobić porządnie (za mało potwierdzonych informacji, błąd którejś z usług), wydanie się nie ukazuje, a strona pokazuje
          poprzednie. Mimo tych kontroli przegląd może zawierać błędy: to automatyczne omówienie, a nie rekomendacja inwestycyjna.
        </li>
      </ul>

      <h2>Jak newsy trafiają na stronę</h2>
      <ul>
        <li>
          Serwer sam sprawdza kanały: w dni robocze od {DAY_FROM}:00 do północy raporty ESPI co minutę, pozostałe kanały co
          {CHECK_SECONDS / 60} minuty, a komunikaty prasowe i aktualności GPW, które zmieniają się rzadziej, co 10 minut (tabele
          wyżej). W nocy (0:00–{DAY_FROM}:00) i w weekendy wszystkie co {QUIET_CHECK_SECONDS / 60} minut, bo wtedy prawie nic
          nie jest publikowane.
        </li>
        <li>
          Gdy w kanale pojawi się coś nowego, serwer od razu wysyła to do wszystkich otwartych stron przez stałe
          połączenie (WebSocket). Strona niczego nie odświeża sama. Przycisk „Odśwież” pobiera całą listę jeszcze raz.
        </li>
        <li>
          Serwisy źródłowe dostają te same kilka zapytań na minutę niezależnie od tego, ile osób korzysta ze
          Szczekaczki.
        </li>
        <li>
          News pojawia się więc z opóźnieniem: tyle, ile wydawca potrzebuje na aktualizację swojego kanału, plus do
          około {CHECK_SECONDS / 60} minut (ESPI do minuty, w nocy i w weekendy do {QUIET_CHECK_SECONDS / 60}), zanim serwer go sprawdzi.
        </li>
        <li>Godziny są w czasie polskim, według dat podanych w kanałach.</li>
      </ul>

      <h2>Dokumenty</h2>
      <p>
        <Link href="/regulamin">Regulamin</Link> · <Link href="/polityka-prywatnosci">Polityka prywatności</Link>
      </p>
    </LegalPage>
  )
}
