'use client'

import { useRef } from 'react'
import { instrument, tradingViewUrl } from '@/lib/market'
import { TradingViewWidget, chartConfig } from './TradingView'
import { ChartsConsent, OFFLINE, hintOf, useMedia, useOnline, type Origin } from './Market'
import { Close, External } from './Icons'
import { useSheet } from './useSheet'

interface Props {
  symbol: string
  origin: Origin | null
  dark: boolean
  charts: boolean // TradingView switched on; else the window asks first
  onCharts: () => void
  onClose: () => void
}

// The chart of one instrument in a window like the reading window (on a phone the whole screen, pulled down from its bar to close it):
// TradingView's chart, with its own buttons for the time range; the way to the full chart on TradingView
export default function ChartWindow({ symbol, origin, dark, charts, onCharts, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const { close, trap, overlay } = useSheet(panel, null, origin, onClose)
  const online = useOnline()
  const small = useMedia('(max-width: 700px)')
  const it = instrument(symbol)
  return (
    <div className="reader-overlay" {...overlay}>
      <div ref={panel} className="reader chart-window" role="dialog" aria-modal="true" aria-labelledby="chart-title" tabIndex={-1}
        style={{ ['--c' as string]: 'var(--accent)' }} onKeyDown={trap}>
        <div className="reader-head">
          <i className="reader-grip" />
          <div className="reader-meta">
            <h2 id="chart-title" className="chart-title">{it.name}</h2>
            <span className="ago">{it.note ? `${it.note} · ` : ''}{symbol}</span>
          </div>
          <button className="reader-close" onClick={close} title="Zamknij" aria-label="Zamknij"><Close size={20} /></button>
        </div>
        <div className="chart-body">
          {!charts ? <ChartsConsent onCharts={onCharts} />
            : !online ? <p className="chart-off">{OFFLINE}</p>
            : <TradingViewWidget kind="advanced-chart" config={chartConfig(symbol, dark, small)} className="chart-frame" />}
          {charts && hintOf(symbol) && <p className="chart-hint">{hintOf(symbol)}</p>}
        </div>
        <div className="reader-foot">
          <a className="reader-open" href={tradingViewUrl(symbol)} target="_blank" rel="noopener noreferrer">Otwórz w TradingView <External size={16} /></a>
        </div>
      </div>
    </div>
  )
}
