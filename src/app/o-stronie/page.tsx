import type { Metadata } from 'next'
import Link from 'next/link'
import LegalPage, { Contact } from '@/components/LegalPage'
import { FEEDS, SOURCES, SOURCE_INFO, CACHE_SECONDS, REFRESH_OPTIONS } from '@/lib/sources'
import { MARKET_DAYS, MARKET_FROM, MARKET_TO, QUIET_MINUTES } from '@/lib/schedule'
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
        Wartościowych w Warszawie i wiadomości Stooq. Nowe newsy może czytać na głos i pokazywać jako powiadomienia
        na pulpicie. Autor: <a href={AUTHOR.url} target="_blank" rel="noopener noreferrer">{AUTHOR.name}</a>.
      </p>

      <h2>Skąd są newsy</h2>
      <p>
        Wszystkie treści pochodzą z publicznych kanałów RSS wymienionych niżej. Przy każdym newsie widać źródło
        i kanał (np. „GPW · INDEKSY”), a tytuł prowadzi do pełnej treści na stronie wydawcy. Szczekaczka pokazuje
        tylko tytuły i krótkie zajawki z kanałów RSS. Nie zmienia ich treści i nie dodaje własnych.
      </p>

      {SOURCES.map((src) => {
        const info = SOURCE_INFO[src]
        return (
          <section key={src} className="source" style={{ ['--c' as string]: `var(--src-${src.toLowerCase()})` }}>
            <h3><i className="dot" /> {src}: {info.name}</h3>
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
                {FEEDS.filter((f) => f.source === src).map((f) => (
                  <tr key={f.url}>
                    <td>{src} · {f.label}</td>
                    <td><a href={f.url} target="_blank" rel="noopener noreferrer" className="feed-url">{f.url}</a></td>
                    <td>{f.minAge ? `co ${f.minAge / 60} min` : `co ${CACHE_SECONDS} s`}</td>
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

      <h2>Jak często newsy się odświeżają</h2>
      <ul>
        <li>
          Strona pyta serwer o nowe newsy co {REFRESH_OPTIONS.map((m) => `${m}`).join(', ').replace(/, (\d+)$/, ' lub $1')} minut
          (do wyboru w ustawieniach) albo po kliknięciu „Odśwież”.
        </li>
        <li>
          Domyślnie w nocy i w weekendy (poza {MARKET_DAYS} {MARKET_FROM}:00–{MARKET_TO}:00) strona pyta najwyżej co
          {' '}{QUIET_MINUTES} minut, bo wtedy prawie nic nie jest publikowane. Można to wyłączyć w ustawieniach.
        </li>
        <li>
          Serwer pobiera kanały RSS najwyżej co {CACHE_SECONDS} sekund i trzyma jedną wspólną kopię listy dla
          wszystkich użytkowników. Kanały GPW, które zmieniają się rzadko, sprawdza rzadziej (tabele wyżej). Dzięki
          temu serwisy źródłowe dostają kilka zapytań na minutę, niezależnie od tego, ile osób korzysta ze Szczekaczki.
        </li>
        <li>
          News pojawia się więc z opóźnieniem: tyle, ile wydawca potrzebuje na aktualizację swojego kanału, plus do
          około minuty na serwerze, plus wybrany czas odświeżania.
        </li>
        <li>
          Gdy karta jest ukryta, a czytanie na głos i powiadomienia są wyłączone, strona nie odświeża listy. Robi
          to od razu po powrocie do karty.
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
