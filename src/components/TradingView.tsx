'use client'

import { useEffect, useRef, useState } from 'react'
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
    let on = true
    setFailed(false)
    void loadTable().then((ok) => { if (on && !ok) setFailed(true) })
    return () => { on = false; table.removeEventListener('tv-link-open', onLink); el.replaceChildren() }
  }, [settings])
  return (
    <>
      <div ref={box} className="market-table" onPointerDown={(e) => { pressed.current = { x: e.clientX, y: e.clientY } }} />
      {failed && <p className="chart-off">Nie udało się wczytać notowań. Spróbuj za chwilę.</p>}
    </>
  )
}
