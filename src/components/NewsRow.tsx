'use client'

import { memo, useRef, useState } from 'react'
import { type Item, tagOf, clock, ago, fullDate } from '@/lib/news'
import { Star, Copy, Check, Play } from './Icons'

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
}

function NewsRow({ item, now, read, saved, fresh, watched, onRead, onSave, onSpeak }: Props) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const since = ago(item.time, now)

  function copy() {
    navigator.clipboard?.writeText(item.link ? `${item.title}\n${item.link}` : item.title)
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1500)
  }

  return (
    <article className={`row${read ? ' read' : ''}${fresh ? ' fresh' : ''}${watched ? ' watched' : ''}`}
      style={{ ['--c' as string]: `var(--src-${item.source.toLowerCase()})` }}>
      <div className="meta">
        <span className="tag"><i className="dot" />{tagOf(item)}</span>
        <time dateTime={item.pubDate || undefined} title={fullDate(item.time)}>{clock(item.time)}</time>
        {since && <span className="ago">· {since}</span>}
        {fresh && <span className="badge new">NOWE</span>}
        {watched && <span className="badge watch">obserwowana</span>}
        <span className="tools">
          {onSpeak && <button onClick={() => onSpeak(item)} title="Przeczytaj na głos"><Play size={16} /></button>}
          <button onClick={copy} title={copied ? 'Skopiowano' : 'Kopiuj tytuł i link'}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>
          <button className={`save${saved ? ' on' : ''}`} onClick={() => onSave(item)} title={saved ? 'Usuń z zapisanych' : 'Zapisz na później'}>
            <Star filled={saved} size={16} />
          </button>
        </span>
      </div>
      {item.link
        ? <a className="title" href={item.link} target="_blank" rel="noopener noreferrer"
            onClick={() => onRead(item.id)} onAuxClick={() => onRead(item.id)}>{item.title}</a>
        : <span className="title" onClick={() => onRead(item.id)}>{item.title}</span>}
      {item.description && <p className="desc">{item.description}</p>}
    </article>
  )
}

export default memo(NewsRow)
