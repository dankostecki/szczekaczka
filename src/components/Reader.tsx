'use client'

import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { type Item, tagOf, clock, ago, fullDate, originalOf } from '@/lib/news'
import { itemLang } from '@/lib/lang'
import { linkOf } from '@/lib/sources'
import { bodyText, parseBody, splitItem } from '@/lib/body'
import { newsInstruments } from '@/lib/news-instruments'
import { Close, Star, Speaker, External } from './Icons'
import { useSheet } from './useSheet'
import NewsQuotes from './NewsQuotes'
import type { Origin } from './Market'

interface Props {
  item: Item
  origin: { x: number; y: number } | null // where it was opened from (the click on the news): the window grows out of it
  now: number
  saved: boolean
  speaking: boolean
  onClose: () => void
  onSave: (item: Item) => void
  onSpeak?: (item: Item) => void
  charts: boolean // TradingView switched on: the quotes of what the news names
  onChart: (symbol: string, from: Origin | null) => void
}

const line = (i: number) => ({ '--i': i }) as CSSProperties

// The whole lead of a news in a window of its own: the title, the text with its lines (paragraphs, lists, MacroNext's rows), the way to the source.
// Under the title, the quotes of the companies, indices, currencies and commodities it names (NewsQuotes). The text scrolls inside the window
// and the page behind it stays where it was. Closed with the X, Esc, a click outside or a pull down (useSheet).
export default function Reader({ item, origin, now, saved, speaking, onClose, onSave, onSpeak, charts, onChart }: Props) {
  const [original, setOriginal] = useState(false) // a translation: the original beside it
  const panel = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const { close, trap, overlay } = useSheet(panel, scroller, origin, onClose)

  const shown = original && item.translated ? originalOf(item) : item
  const lang = itemLang(shown)
  const link = linkOf(item)
  const since = ago(item.time, now)
  const blocks = parseBody(bodyText(shown))
  const named = useMemo(() => newsInstruments(originalOf(item), !!item.translated && !original), [item, original])

  let n = 0 // the order the lines come in
  return (
    <div className="reader-overlay" {...overlay}>
      <div ref={panel} className="reader" role="dialog" aria-modal="true" aria-labelledby="reader-title" tabIndex={-1}
        style={{ ['--c' as string]: `var(--src-${item.source.toLowerCase()})` }} onKeyDown={trap}>
        <div className="reader-head">
          <i className="reader-grip" />
          <div className="reader-meta">
            <span className="tag"><i className="dot" /><span>{tagOf(item)}</span></span>
            <time dateTime={item.pubDate || undefined} title={fullDate(item.time)}>{clock(item.time)}</time>
            {since && <span className="ago">· {since}</span>}
            {item.translated && <span className="badge tr" title="Tłumaczenie maszynowe (AI) z angielskiego">tłumaczenie AI</span>}
          </div>
          <button className="reader-close" onClick={close} title="Zamknij" aria-label="Zamknij"><Close size={20} /></button>
        </div>

        <div ref={scroller} className="reader-scroll">
          <h2 id="reader-title" className="reader-title" lang={lang === 'pl' ? undefined : lang} style={line(n++)}>{shown.title}</h2>
          {item.translated && (
            <button className="reader-switch" onClick={() => setOriginal((o) => !o)}>{original ? 'Pokaż tłumaczenie' : 'Pokaż oryginał'}</button>
          )}
          {named.length > 0 && <div style={line(n++)} className="reader-quotes"><NewsQuotes symbols={named} charts={charts} onOpen={onChart} /></div>}
          <div className="reader-body" lang={lang === 'pl' ? undefined : lang}>
            {blocks.map((b, i) => b.t === 'h' ? <h3 key={i} style={line(n++)}>{b.text}</h3>
              : b.t === 'p' ? <p key={i} style={line(n++)}>{b.text}</p>
              : (
                <ul key={i} className="reader-list">
                  {b.items.map((raw, j) => {
                    const it = splitItem(raw, shown.source)
                    return (
                      <li key={j} style={line(n++)}>
                        {it.label && <b className="lab">{it.label}: </b>}{it.text}
                        {it.figures && (
                          <span className="reader-figs">
                            {it.figures.map((f) => <span key={f.name} className="reader-fig"><em>{f.name}</em> {f.value}</span>)}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              ))}
          </div>
        </div>

        <div className="reader-foot">
          {link && <a className="reader-open" href={link} target="_blank" rel="noopener noreferrer">Otwórz źródło <External size={16} /></a>}
          <span className="reader-tools">
            {onSpeak && (
              <button className={`speak${speaking ? ' on' : ''}`} onClick={() => onSpeak(item)} aria-pressed={speaking}
                title={speaking ? 'Zatrzymaj czytanie' : 'Przeczytaj na głos'}>
                <Speaker on={speaking} quiet size={18} />
              </button>
            )}
            <button className={`save${saved ? ' on' : ''}`} onClick={() => onSave(item)} title={saved ? 'Usuń z zapisanych' : 'Zapisz na później'}>
              <Star filled={saved} size={18} />
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
