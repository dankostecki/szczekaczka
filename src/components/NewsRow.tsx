'use client'

import { memo } from 'react'
import { type Item, tagOf, clock, ago, fullDate } from '@/lib/news'
import { langOf } from '@/lib/sources'
import { Star, Speaker } from './Icons'

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
  speaking?: boolean  // this headline is being read now
}

function NewsRow({ item, now, read, saved, fresh, watched, onRead, onSave, onSpeak, speaking = false }: Props) {
  const since = ago(item.time, now)
  const lang = langOf(item.source, item.label)

  return (
    <article className={`row${read ? ' read' : ''}${fresh ? ' fresh' : ''}${watched ? ' watched' : ''}${speaking ? ' speaking' : ''}`}
      style={{ ['--c' as string]: `var(--src-${item.source.toLowerCase()})` }}>
      <div className="meta">
        <span className="tag"><i className="dot" /><span title={tagOf(item)}>{tagOf(item)}</span></span>
        <time dateTime={item.pubDate || undefined} title={fullDate(item.time)}>{clock(item.time)}</time>
        {since && <span className="ago">· {since}</span>}
        {fresh && <span className="badge new">NOWE</span>}
        {watched && <span className="badge watch">obserwowana</span>}
        <span className="tools">
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
      {item.link
        ? <a className="title" href={item.link} target="_blank" rel="noopener noreferrer"
            lang={lang === 'pl' ? undefined : lang} onClick={() => onRead(item.id)} onAuxClick={() => onRead(item.id)}>{item.title}</a>
        : <span className="title" lang={lang === 'pl' ? undefined : lang} onClick={() => onRead(item.id)}>{item.title}</span>}
      {item.description && <p className={`desc${item.source === 'MACRONEXT' ? ' whole' : ''}`} lang={lang === 'pl' ? undefined : lang}>{item.description}</p>}
    </article>
  )
}

export default memo(NewsRow)
