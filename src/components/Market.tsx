'use client'

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import Link from 'next/link'
import { MARKET_GROUPS, endOfDay, instrument, tradingViewUrl, type Instrument } from '@/lib/market'
import { TradingViewWidget, chartConfig, miniConfig } from './TradingView'
import { External } from './Icons'

export type Origin = { x: number; y: number }

// A media query as state (false until the page is in the browser)
export function useMedia(query: string): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const update = () => setOn(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [query])
  return on
}

// Whether the browser has a network (charts and quotes need one)
export function useOnline(): boolean {
  const [on, setOn] = useState(true)
  useEffect(() => {
    const update = () => setOn(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  return on
}

// Nothing comes from TradingView before the reader says so: what switching the charts on means, and the button
export function ChartsConsent({ onCharts }: { onCharts: () => void }) {
  return (
    <div className="charts-consent">
      <h3>Wykresy z TradingView</h3>
      <p>
        Notowania i wykresy w tej zakładce pokazuje serwis TradingView. Po włączeniu Twoja przeglądarka połączy się z jego serwerami, które
        zobaczą Twój adres IP i mogą zapisać swoje pliki cookies. Newsy i reszta Szczekaczki działają bez tego.
      </p>
      <div className="charts-consent-row">
        <button className="charts-on" onClick={onCharts}>Włącz wykresy</button>
        <Link href="/polityka-prywatnosci">Polityka prywatności</Link>
      </div>
    </div>
  )
}

export const OFFLINE = 'Notowania i wykresy wymagają internetu.'
export const EOD_HINT = 'Notowania z GPW są tu z końca dnia.'
const origin = (e: MouseEvent) => ({ x: e.clientX, y: e.clientY })

// The quote on a tile, put in only when the tile is close to the screen (each one is a frame of its own)
function Quote({ symbol, dark }: { symbol: string; dark: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    const seen = new IntersectionObserver((list) => { if (list.some((e) => e.isIntersecting)) setNear(true) }, { rootMargin: '300px 0px' })
    seen.observe(el)
    return () => seen.disconnect()
  }, [near])
  return (
    <span ref={ref} className="market-quote">
      {near && <TradingViewWidget kind="mini-symbol-overview" config={miniConfig(symbol, dark)} />}
    </span>
  )
}

function Tile({ it, live, dark, picked, onOpen }: { it: Instrument; live: boolean; dark: boolean; picked: boolean; onOpen: (symbol: string, from: Origin) => void }) {
  return (
    <button className={`market-tile${picked ? ' picked' : ''}${live ? '' : ' off'}`} onClick={(e) => onOpen(it.symbol, origin(e))}
      aria-pressed={picked || undefined} title={`${it.name}: wykres`}>
      <span className="market-name"><b>{it.name}</b>{it.note && <i>{it.note}</i>}</span>
      {live && <Quote symbol={it.symbol} dark={dark} />}
    </button>
  )
}

// The chart beside the tiles (on a computer)
function Panel({ symbol, dark, charts, online, onCharts }: { symbol: string; dark: boolean; charts: boolean; online: boolean; onCharts: () => void }) {
  const it = instrument(symbol)
  // How tall the page's bar is, and what comes after the tiles (the footer): the panel fits between them however far the page is scrolled
  const ref = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const el = ref.current, top = document.querySelector<HTMLElement>('.top')
    if (!el || !top) return
    const fit = () => {
      const below = document.documentElement.scrollHeight - (el.parentElement!.getBoundingClientRect().bottom + window.scrollY)
      el.style.setProperty('--above', `${top.offsetHeight}px`)
      el.style.setProperty('--below', `${Math.max(0, Math.round(below))}px`)
    }
    fit()
    const resized = new ResizeObserver(fit)
    resized.observe(top)
    resized.observe(document.body)
    return () => resized.disconnect()
  }, [])
  return (
    <aside ref={ref} className="market-panel" aria-label={`Wykres: ${it.name}`}>
      <div className="market-panel-head">
        <h2>{it.name}</h2>
        <span>{it.note ? `${it.note} · ` : ''}{symbol}</span>
      </div>
      {!charts ? <ChartsConsent onCharts={onCharts} />
        : !online ? <p className="chart-off">{OFFLINE}</p>
        : <TradingViewWidget kind="advanced-chart" config={chartConfig(symbol, dark, false)} className="chart-frame" />}
      <div className="market-panel-foot">
        {charts && endOfDay(symbol) && <span className="chart-hint">{EOD_HINT}</span>}
        <a className="reader-open" href={tradingViewUrl(symbol)} target="_blank" rel="noopener noreferrer">Otwórz w TradingView <External size={16} /></a>
      </div>
    </aside>
  )
}

interface Props {
  charts: boolean // TradingView switched on (settings, or the button here)
  onCharts: () => void
  dark: boolean
  recent: string[]
  wide: boolean   // a computer: the chart beside the tiles, not in a window
  picked: string  // the symbol in the chart beside the tiles
  onOpen: (symbol: string, from: Origin) => void
}

// The "Rynek" tab: the instruments looked at last, the tiles in groups (a tap: the chart), where the data comes from
export default function Market({ charts, onCharts, dark, recent, wide, picked, onOpen }: Props) {
  const online = useOnline()
  const live = charts && online
  const tiles = (
    <div className="market-tiles">
      {charts && !online && <p className="chart-off">{OFFLINE}</p>}
      {MARKET_GROUPS.map((g) => (
        <section key={g.name} className="market-group">
          <h2 className="day">{g.name}</h2>
          <div className="market-grid">
            {g.items.map((it) => <Tile key={it.symbol} it={it} live={live} dark={dark} picked={wide && it.symbol === picked} onOpen={onOpen} />)}
          </div>
        </section>
      ))}
      {charts && (
        <p className="market-note">
          Waluty i kryptowaluty są na bieżąco, akcje i indeksy z opóźnieniem, a notowania z GPW z końca dnia. Kafelek otwiera wykres.
          {' '}Notowania i wykresy: <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">TradingView</a>.
        </p>
      )}
    </div>
  )
  return (
    <div className="market">
      {!charts && !wide && <ChartsConsent onCharts={onCharts} />}
      {charts && recent.length > 0 && (
        <div className="market-recent" role="group" aria-label="Ostatnio oglądane">
          <span>Ostatnio</span>
          {recent.map((s) => (
            <button key={s} className={`chip small${wide && s === picked ? ' on' : ''}`} onClick={(e) => onOpen(s, origin(e))}>{instrument(s).name}</button>
          ))}
        </div>
      )}
      {wide ? (
        <div className="market-split">
          {tiles}
          <Panel symbol={picked} dark={dark} charts={charts} online={online} onCharts={onCharts} />
        </div>
      ) : tiles}
    </div>
  )
}
