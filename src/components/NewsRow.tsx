'use client'

import { memo } from 'react'
import { type Item, tagOf, clock, ago, fullDate } from '@/lib/news'
import { itemLang } from '@/lib/lang'
import { linkOf } from '@/lib/sources'
import { Star, Speaker, External } from './Icons'

interface Props {
  item: Item
  now: number
  read: boolean
  saved: boolean
  fresh: boolean      // arrived on a recent refresh: NOWE badge
  watched: boolean    // ESPI report of a company on the watch list
  onRead: (id: string) => void
  onSave: (item: Item) => void
  onSpeak?: (item: Item) => void
  onOpen: (item: Item, origin: { x: number; y: number }) => void // the news in a window of its own (Reader.tsx), growing out of where it was clicked
  speaking?: boolean  // this headline is being read now
}

function NewsRow({ item, now, read, saved, fresh, watched, onRead, onSave, onSpeak, onOpen, speaking = false }: Props) {
  const since = ago(item.time, now)
  const lang = itemLang(item)
  const link = linkOf(item)

  return (
    <article className={`row${read ? ' read' : ''}${fresh ? ' fresh' : ''}${watched ? ' watched' : ''}${speaking ? ' speaking' : ''}`}
      style={{ ['--c' as string]: `var(--src-${item.source.toLowerCase()})` }}>
      <div className="meta">
        <span className="tag"><i className="dot" /><span title={tagOf(item)}>{tagOf(item)}</span></span>
        <time dateTime={item.pubDate || undefined} title={fullDate(item.time)}>{clock(item.time)}</time>
        {since && <span className="ago">· {since}</span>}
        {fresh && <span className="badge new">NOWE</span>}
        {watched && <span className="badge watch">obserwowana</span>}
        {item.translated && <span className="badge tr" title="Tłumaczenie maszynowe (AI) z angielskiego. Oryginał można włączyć w ustawieniach.">tłumaczenie AI</span>}
        <span className="tools">
          {link && (
            <a className="open" href={link} target="_blank" rel="noopener noreferrer" title="Otwórz źródło" aria-label="Otwórz źródło"
              onClick={() => onRead(item.id)} onAuxClick={() => onRead(item.id)}>
              <External size={16} />
            </a>
          )}
          {onSpeak && (
            <button className={`speak${speaking ? ' on' : ''}`} onClick={() => onSpeak(item)} aria-pressed={speaking}
              title={speaking ? 'Zatrzymaj czytanie' : 'Przeczytaj na głos'}>
              <Speaker on={speaking} quiet size={16} />
            </button>
          )}
          <button className={`save${saved ? ' on' : ''}`} onClick={() => onSave(item)} title={saved ? 'Usuń z zapisanych' : 'Zapisz na później'}>
            <Star filled={saved} size={16} />
          </button>
        </span>
      </div>
      {/* the whole tile opens the news in its window; the way to the source is the icon above */}
      <button type="button" className="title" lang={lang === 'pl' ? undefined : lang} onClick={(e) => {
        const box = e.currentTarget.getBoundingClientRect()
        // where it was clicked or tapped; from the keyboard (no pointer) the middle of the title
        onOpen(item, e.detail > 0 ? { x: e.clientX, y: e.clientY } : { x: box.left + box.width / 2, y: box.top + box.height / 2 })
      }}>{item.title}</button>
      {item.description && <p className={`desc${item.source === 'MACRONEXT' ? ' whole' : ''}`} lang={lang === 'pl' ? undefined : lang}>{item.description}</p>}
    </article>
  )
}

export default memo(NewsRow)
