'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { type Item, tagOf, clock, ago, fullDate, originalOf } from '@/lib/news'
import { itemLang } from '@/lib/lang'
import { linkOf } from '@/lib/sources'
import { bodyText, parseBody, splitItem } from '@/lib/body'
import { Close, Star, Speaker, External } from './Icons'

interface Props {
  item: Item
  origin: { x: number; y: number } | null // the button it opened from: the window grows out of it
  now: number
  saved: boolean
  speaking: boolean
  onClose: () => void
  onSave: (item: Item) => void
  onSpeak?: (item: Item) => void
}

// How long the window takes to leave (globals.css, reader-out); it is unmounted after that
const EXIT_MS = 200
const FOCUSABLE = 'a[href], button:not(:disabled)'
const line = (i: number) => ({ '--i': i }) as CSSProperties

// The whole lead of a news in a window of its own: the title, the text with its lines (paragraphs, lists, MacroNext's rows), the way to the source.
// The text scrolls inside the window and the page behind it stays where it was. Closed with the X, Esc or a click outside.
export default function Reader({ item, origin, now, saved, speaking, onClose, onSave, onSpeak }: Props) {
  const [closing, setClosing] = useState(false)
  const [original, setOriginal] = useState(false) // a translation: the original beside it
  const [opener] = useState(() => document.activeElement)
  const panel = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const pressedOutside = useRef(false) // a click outside counts only if it also began outside (not the end of selecting text)

  const shown = original && item.translated ? originalOf(item) : item
  const lang = itemLang(shown)
  const link = linkOf(item)
  const since = ago(item.time, now)
  const blocks = parseBody(bodyText(shown))

  const close = useCallback(() => {
    if (timer.current !== undefined) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { onClose(); return }
    setClosing(true)
    timer.current = window.setTimeout(onClose, EXIT_MS)
  }, [onClose])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  // Focus does not leave the window (a click outside the text, a Tab from the page behind it)
  useEffect(() => {
    const back = (e: FocusEvent) => { if (panel.current && e.target instanceof Node && !panel.current.contains(e.target)) panel.current.focus({ preventScroll: true }) }
    document.addEventListener('focusin', back)
    return () => document.removeEventListener('focusin', back)
  }, [])

  // The page behind does not scroll (and does not jump where the scrollbar goes); focus goes in, and back to the button when it closes
  useEffect(() => {
    document.body.style.setProperty('--scrollbar', `${window.innerWidth - document.documentElement.clientWidth}px`)
    document.body.classList.add('reading')
    panel.current?.focus({ preventScroll: true })
    return () => {
      document.body.classList.remove('reading')
      document.body.style.removeProperty('--scrollbar')
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [opener])

  // The window grows out of the button: its centre in the window's own coordinates
  useLayoutEffect(() => {
    const el = panel.current
    if (!el || !origin) return
    el.style.setProperty('--ox', `${origin.x - el.offsetLeft}px`)
    el.style.setProperty('--oy', `${origin.y - el.offsetTop}px`)
  }, [origin])

  // Tab stays inside the window
  const trap = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !panel.current) return
    const list = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (!list.length) return
    const active = document.activeElement
    if (e.shiftKey ? active === list[0] || active === panel.current : active === list[list.length - 1]) {
      e.preventDefault()
      list[e.shiftKey ? list.length - 1 : 0].focus()
    }
  }

  let n = 0 // the order the lines come in
  return (
    <div className="reader-overlay" data-closing={closing || undefined}
      onPointerDown={(e) => { pressedOutside.current = e.target === e.currentTarget }}
      onClick={(e) => { if (e.target === e.currentTarget && pressedOutside.current) close() }}>
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

        <div className="reader-scroll">
          <h2 id="reader-title" className="reader-title" lang={lang === 'pl' ? undefined : lang} style={line(n++)}>{shown.title}</h2>
          {item.translated && (
            <button className="reader-switch" onClick={() => setOriginal((o) => !o)}>{original ? 'Pokaż tłumaczenie' : 'Pokaż oryginał'}</button>
          )}
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
