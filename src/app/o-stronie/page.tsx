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
        Wartościowych w Warszawie, wiadomości Stooq, krótkie wiadomości z rynków świata z kanału Walter Bloomberg na Telegramie,
        komunikaty prasowe z PAP MediaRoom, a także zapowiedzi danych makro
        (10 minut przed publikacją) i wydarzeń giełdowych z kalendarium MacroNext. Nowe newsy może czytać na głos i pokazywać jako powiadomienia
        na pulpicie. Autor: <a href={AUTHOR.url} target="_blank" rel="noopener noreferrer">{AUTHOR.name}</a>.
      </p>

      <h2>Skąd są newsy</h2>
      <p>
        Wszystkie treści pochodzą z publicznych kanałów RSS i stron wymienionych niżej. Przy każdym newsie widać źródło
        i kanał (np. „GPW · KOMUNIKATY”), a tytuł prowadzi do pełnej treści na stronie wydawcy. Szczekaczka pokazuje
        tylko tytuły i krótkie zajawki. Nie zmienia ich treści i nie dodaje własnych. Wyjątkiem są zapowiedzi MacroNext:
        Szczekaczka składa je z kalendarium danych makro (kraj, nazwa danych, okres, prognoza jako konsensus, poprzedni
        odczyt) i z kalendarium giełdowego (wydarzenia spółek, wyniki spółek z Nowego Jorku); prowadzą do kalendarium
        MacroNext na dziś. Drugim wyjątkiem są wiadomości Waltera Bloomberga: pisane po angielsku, są domyślnie pokazywane
        w tłumaczeniu maszynowym na polski (z oznaczeniem „tłumaczenie AI”); oryginał można wybrać w ustawieniach.
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
