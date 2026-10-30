'use client'

import { useState, type ReactNode } from 'react'
import { sourceName, type Source } from '@/lib/sources'
import { TOP_FIRST, TOP_HOURS, TOP_MORE, type TopHours, type TopStory } from '@/lib/top'
import { ImportanceLegend } from './Importance'

interface Props {
  stories: TopStory[]           // all of the window, best first (lib/top.ts)
  hours: number
  onHours: (h: TopHours) => void
  source: string                // '' all of them
  sources: Source[]             // the sources whose news are rated
  onSource: (s: string) => void
  englishOnly: boolean          // only the channels in English are rated
  loaded: boolean               // the list has come
  row: (story: TopStory) => ReactNode
}

// The "Top" tab: the hours and the source to look at, what the order means, the best stories of the window
export default function Top({ stories, hours, onHours, source, sources, onSource, englishOnly, loaded, row }: Props) {
  const [more, setMore] = useState(false)
  const shown = stories.slice(0, more ? TOP_MORE : TOP_FIRST)
  return (
    <section className="top" aria-label="Najważniejsze wiadomości">
      <div className="top-head">
        <div className="chips" role="group" aria-label="Z ostatnich">
          {TOP_HOURS.map((h) => (
            <button key={h} className={`chip small ${hours === h ? 'on' : ''}`} aria-pressed={hours === h} onClick={() => { onHours(h); setMore(false) }}>
              {h} godz.
            </button>
          ))}
        </div>
        <select className="top-source" value={source} aria-label="Źródło" onChange={(e) => { onSource(e.target.value); setMore(false) }}>
          <option value="">Wszystkie źródła</option>
          {sources.map((s) => <option key={s} value={s}>{sourceName(s)}</option>)}
        </select>
      </div>
      <p className="top-note">
        Kolejność ustala sztuczna inteligencja: ocenia, jak ważna jest każda wiadomość dla inwestora. Może się mylić.
        {englishOnly && ' Oceniane są tylko wiadomości z kanałów po angielsku.'}
      </p>
      <ImportanceLegend />
      {loaded && shown.length === 0 && (
        <p className="empty">W ostatnich {hours} godz. nie ma jeszcze ocenionych wiadomości{source ? ' z tego źródła' : ''}.</p>
      )}
      {shown.map(row)}
      {!more && stories.length > TOP_FIRST && (
        <button className="btn top-more" onClick={() => setMore(true)}>Pokaż więcej</button>
      )}
    </section>
  )
}
