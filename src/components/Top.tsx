'use client'

import { useState, type ReactNode } from 'react'
import { sourceName, type Source } from '@/lib/sources'
import { IMPORTANCE, TOP_HOURS, TOP_LEVELS, topList, type ImportanceLevel, type TopHours, type TopStory } from '@/lib/top'
import { Importance } from './Importance'

interface Props {
  stories: TopStory[]           // all of the window, the most important first (lib/top.ts)
  hours: number
  onHours: (h: TopHours) => void
  source: string                // '' all of them
  sources: Source[]             // the sources whose news are rated
  onSource: (s: string) => void
  levels: ImportanceLevel[]     // the steps of the importance ticked: only their stories ([] the most important of every step)
  onLevels: (l: ImportanceLevel[]) => void
  englishOnly: boolean          // only the channels in English are rated
  loaded: boolean               // the list has come
  row: (story: TopStory) => ReactNode
}

// The "Top" tab: the hours, the source and the steps of the importance to look at, what the list is, its stories in the order of their hours
export default function Top({ stories, hours, onHours, source, sources, onSource, levels, onLevels, englishOnly, loaded, row }: Props) {
  const [more, setMore] = useState(false)
  const list = topList(stories, levels, more)
  const toggle = (l: ImportanceLevel) => { onLevels(levels.includes(l) ? levels.filter((x) => x !== l) : [...levels, l]); setMore(false) }
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
        <div className="chips top-levels" role="group" aria-label="Ważność">
          {TOP_LEVELS.map((l) => {
            const step = IMPORTANCE[l - 1]
            return (
              <button key={l} className={`chip small level${levels.includes(l) ? ' on' : ''}`} aria-pressed={levels.includes(l)}
                aria-label={`Tylko ${step.name}`} title={`Tylko ${step.name}`} onClick={() => toggle(l)}>
                <Importance ai={step.from} />
              </button>
            )
          })}
        </div>
      </div>
      <p className="top-note">
        {levels.length
          ? 'Sztuczna inteligencja ocenia, jak ważna jest każda wiadomość dla inwestora, i może się mylić. Widać wszystkie wiadomości o zaznaczonej ważności, od najnowszej.'
          : 'Najważniejsze wiadomości wybiera sztuczna inteligencja: ocenia, jak ważna jest każda z nich dla inwestora. Może się mylić. Są ułożone od najnowszej.'}
        {englishOnly && ' Oceniane są tylko wiadomości z kanałów po angielsku.'}
      </p>
      {loaded && list.shown.length === 0 && (
        <p className="empty">
          W ostatnich {hours} godz. nie ma {levels.length ? 'wiadomości o zaznaczonej ważności' : 'jeszcze ocenionych wiadomości'}{source ? ' z tego źródła' : ''}.
        </p>
      )}
      {list.shown.map(row)}
      {!more && list.more > 0 && (
        <button className="btn top-more" onClick={() => setMore(true)}>Pokaż więcej</button>
      )}
    </section>
  )
}
