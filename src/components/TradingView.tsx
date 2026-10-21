'use client'

import { useEffect, useRef, useState } from 'react'
import { symbolOfLink } from '@/lib/market'
import type { Origin } from './Market'

// TradingView's free widgets (tradingview.com/widget-docs). Loaded only once the reader has switched the charts on (the "Rynek" tab asks):
// from then on the browser connects to TradingView, which sees its IP address and may keep its cookies.

// ── The chart: TradingView's script that reads its settings from its own text and puts a frame from TradingView in its place ──
type Kind = 'advanced-chart'
const SCRIPT = (kind: Kind) => `https://s3.tradingview.com/external-embedding/embed-widget-${kind}.js`

export function TradingViewWidget({ kind, config, className }: { kind: Kind; config: Record<string, unknown>; className?: string }) {
  const settings = JSON.stringify(config)
  // Other settings (another symbol, the dark theme): a new widget in a new box. The old box is left as it is, so that a script still on its way
  // finds its place (only no longer on the page)
  return <Widget key={`${kind}|${settings}`} kind={kind} settings={settings} className={className} />
}

function Widget({ kind, settings, className }: { kind: Kind; settings: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current
    if (!el || el.childElementCount) return
    const widget = document.createElement('div')
    widget.className = 'tradingview-widget-container__widget'
    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.src = SCRIPT(kind)
    script.async = true
    script.textContent = settings
    el.append(widget, script)
  }, [kind, settings])
  return <div ref={box} className={`tradingview-widget-container${className ? ` ${className}` : ''}`} />
}

// Candles, a day a candle to start with (TradingView's own buttons change it), Polish, Warsaw time, the page's colours
export const chartConfig = (symbol: string, dark: boolean, small: boolean) => ({
  symbol, autosize: true, interval: 'D', timezone: 'Europe/Warsaw', theme: dark ? 'dark' : 'light', style: '1', locale: 'pl',
  backgroundColor: dark ? '#19191c' : '#ffffff', gridColor: dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
  allow_symbol_change: false, hide_side_toolbar: small, hide_volume: small, calendar: false, save_image: false,
  support_host: 'https://www.tradingview.com',
})

// ── The quotes table: TradingView's newer kind of widget (Market Data, a Web Component): an element of the page itself, not a frame. It takes
// the page's light or dark colours by itself, and a click on a row is ours to handle (the "tv-link-open" event): it opens our chart, not TradingView ──
const TABLE = 'tv-market-data'
const TABLE_MODULE = (lang: string) => `https://widgets.tradingview-widget.com/w/${lang}/${TABLE}.js`
let loading: Promise<boolean> | null = null

// The module that makes the element work, once a page: in Polish, or in English where TradingView has no Polish one. False when neither loads
function loadTable(): Promise<boolean> {
  loading ??= new Promise<boolean>((resolve) => {
    if (customElements.get(TABLE)) return resolve(true)
    const add = (lang: string, otherwise?: () => void) => {
      const script = document.createElement('script')
      script.type = 'module'
      script.src = TABLE_MODULE(lang)
      script.onload = () => resolve(true)
      script.onerror = () => {
        script.remove()
        if (otherwise) otherwise()
        else { loading = null; resolve(false) } // tried again the next time
      }
      document.head.append(script)
    }
    add('pl', () => add('en'))
  })
  return loading
}

export type Sector = { sectionName: string; symbols: string[] }

// The table as tall as all its rows. Left to itself it fills the box it is given and scrolls inside it, and on a phone a thumb on the table then
// moves the table, not the page. Where TradingView lets the page see inside the widget, the height grows by what its inner part would scroll;
// where not, the box is as tall as the rows are likely to be
const ROW_PX = 52, SECTION_PX = 44, HEAD_PX = 64
function fitTable(table: HTMLElement, sectors: Sector[]): () => void {
  const guess = HEAD_PX + sectors.length * SECTION_PX + sectors.reduce((n, s) => n + s.symbols.length, 0) * ROW_PX
  let timer: number | undefined
  const fit = () => {
    const root = table.shadowRoot, shown = table.getBoundingClientRect().height
    if (!root) { if (customElements.get(TABLE)) table.style.minHeight = `${guess}px`; return } // working, but closed to the page
    if (!shown) return // hidden (another tab): measured when it is shown again
    let more = 0
    for (const el of root.querySelectorAll<HTMLElement>('*')) {
      const over = el.scrollHeight - el.clientHeight
      if (over > 1 && over > more && /auto|scroll/.test(getComputedStyle(el).overflowY)) more = over
    }
    if (more) table.style.height = `${Math.ceil(shown + more)}px`
  }
  // at most a few times a second, also while the prices keep changing the rows
  const soon = () => { if (timer === undefined) timer = window.setTimeout(() => { timer = undefined; fit() }, 300) }
  const resized = new ResizeObserver(soon)
  resized.observe(table)
  const changed = new MutationObserver(soon)
  let watching = false
  const watch = () => { if (!watching && table.shadowRoot) { changed.observe(table.shadowRoot, { childList: true, subtree: true }); watching = true } }
  void customElements.whenDefined(TABLE).then(() => { watch(); soon() })
  return () => { window.clearTimeout(timer); resized.disconnect(); changed.disconnect() }
}

// A thumb on the table has to move the page, as everywhere else, and a tap on a row has to open its chart. The widget keeps the touches for itself
// (the page does not scroll under a thumb on it), so where the page can see inside it, touches go past it to the box under it: the page scrolls
// by itself, and a tap is looked up in the table where the finger was (the row's link gives the symbol; a row without one is clicked for the
// widget to say which it is). Where the page cannot see inside, the widget keeps the taps, and a drag on it moves the page by hand
// What is under a point inside the widget (and inside the widgets in it)
function inside(table: HTMLElement, x: number, y: number): Element | null {
  table.style.pointerEvents = 'auto'
  try {
    let el = table.shadowRoot?.elementFromPoint(x, y) ?? null
    for (let depth = 0; el?.shadowRoot && depth < 5; depth++) {
      const deeper = el.shadowRoot.elementFromPoint(x, y)
      if (!deeper || deeper === el) break
      el = deeper
    }
    return el
  } finally {
    table.style.pointerEvents = ''
  }
}

// The page moved by hand under a vertical drag on the table, gliding on a little after the finger leaves, as a page does. Not when the page
// scrolls by itself after all
function scrollByHand(box: HTMLElement): () => void {
  let x0 = 0, y0 = 0, last = 0, lastT = 0, speed = 0, expected = 0, frame = 0
  let state: 'off' | 'wait' | 'drag' = 'off'
  const start = (e: TouchEvent) => {
    cancelAnimationFrame(frame)
    if (e.touches.length !== 1) { state = 'off'; return }
    x0 = e.touches[0].clientX; y0 = last = e.touches[0].clientY; lastT = e.timeStamp
    speed = 0; expected = window.scrollY; state = 'wait'
  }
  const move = (e: TouchEvent) => {
    if (state === 'off' || e.touches.length !== 1) return
    const t = e.touches[0]
    if (Math.abs(window.scrollY - expected) > 2) { state = 'off'; return }
    if (state === 'wait') {
      if (Math.abs(t.clientY - y0) < 8 || Math.abs(t.clientX - x0) > Math.abs(t.clientY - y0)) return // a tap, or a sideways move
      state = 'drag'
    }
    const dy = last - t.clientY
    window.scrollBy(0, dy)
    expected = window.scrollY
    speed = dy / Math.max(1, e.timeStamp - lastT)
    last = t.clientY; lastT = e.timeStamp
  }
  const end = () => {
    if (state !== 'drag') { state = 'off'; return }
    state = 'off'
    let v = speed * 16 // px a frame
    const glide = () => {
      if (Math.abs(v) < 0.5) return
      window.scrollBy(0, v)
      v *= 0.95
      frame = requestAnimationFrame(glide)
    }
    frame = requestAnimationFrame(glide)
  }
  box.addEventListener('touchstart', start, { passive: true })
  box.addEventListener('touchmove', move, { passive: true })
  box.addEventListener('touchend', end)
  box.addEventListener('touchcancel', end)
  return () => {
    cancelAnimationFrame(frame)
    box.removeEventListener('touchstart', start)
    box.removeEventListener('touchmove', move)
    box.removeEventListener('touchend', end)
    box.removeEventListener('touchcancel', end)
  }
}

export function QuotesTable({ sectors, onOpen }: { sectors: Sector[]; onOpen: (symbol: string, from: Origin | null) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const pressed = useRef<Origin | null>(null) // where the row was pressed: the chart window grows out of it
  const open = useRef(onOpen)
  useEffect(() => { open.current = onOpen }, [onOpen])
  const [failed, setFailed] = useState(false)
  const settings = JSON.stringify(sectors)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const table = document.createElement(TABLE)
    table.setAttribute('symbol-sectors', settings)
    const onLink = (e: Event) => {
      const symbol = (e as CustomEvent<{ context?: { symbol?: string } }>).detail?.context?.symbol
      if (!symbol) return
      e.preventDefault()
      open.current(symbol, pressed.current)
    }
    table.addEventListener('tv-link-open', onLink)
    el.replaceChildren(table)
    el.classList.remove('through')
    const unfit = fitTable(table, JSON.parse(settings) as Sector[])
    let on = true, unhand = () => {}
    setFailed(false)
    void loadTable().then((ok) => { if (on && !ok) setFailed(true) })
    // A widget that opens itself to the page a moment later still gets the touches let past
    let later: number | undefined
    const pass = () => { if (on && table.shadowRoot) { unhand(); unhand = () => {}; el.classList.add('through') } }
    void customElements.whenDefined(TABLE).then(() => {
      if (!on) return
      if (table.shadowRoot) pass()
      else { unhand = scrollByHand(el); later = window.setTimeout(pass, 1500) }
    })
    return () => { on = false; window.clearTimeout(later); unfit(); unhand(); table.removeEventListener('tv-link-open', onLink); el.replaceChildren() }
  }, [settings])
  // A tap that went past the widget: the row under the finger
  const tap = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = box.current, table = el?.firstElementChild as HTMLElement | null
    if (!el?.classList.contains('through') || !table) return
    const at = inside(table, e.clientX, e.clientY)
    if (!at) return
    const link = at.closest('a[href]')
    const symbol = link && symbolOfLink((link as HTMLAnchorElement).href)
    if (symbol) open.current(symbol, { x: e.clientX, y: e.clientY })
    else (at as HTMLElement).click() // the widget says which row it is ("tv-link-open")
  }
  return (
    <>
      <div ref={box} className="market-table" onPointerDown={(e) => { pressed.current = { x: e.clientX, y: e.clientY } }} onClick={tap} />
      {failed && <p className="chart-off">Nie udało się wczytać notowań. Spróbuj za chwilę.</p>}
    </>
  )
}
