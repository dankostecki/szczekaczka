'use client'

import type { MouseEvent } from 'react'
import { delayed, endOfDay, instrument } from '@/lib/market'
import { QuotesTable } from './TradingView'
import { DELAY_HINT, useOnline, type Origin } from './Market'
import { Chart } from './Icons'

interface Props {
  symbols: string[] // what the news names (lib/news-instruments.ts)
  charts: boolean   // TradingView switched on
  onOpen: (symbol: string, from: Origin | null) => void // the full chart, in a window over the news
}

// The quotes of what a news names, under its title: TradingView's table with a row each (a tap on a row: the full chart). Before the charts
// are switched on, without a network, and for the exchanges the widgets have only at the end of the day (the Warsaw exchange, Xetra):
// the names alone, as buttons to the chart window (which asks first, or says why there is nothing). Under shares: that their prices are delayed
export default function NewsQuotes({ symbols, charts, onOpen }: Props) {
  const online = useOnline()
  if (!symbols.length) return null
  const rows = charts && online ? symbols.filter((s) => !endOfDay(s)) : []
  const named = symbols.filter((s) => !rows.includes(s))
  const open = (s: string) => (e: MouseEvent) => onOpen(s, { x: e.clientX, y: e.clientY })
  return (
    <div className="news-quotes">
      {rows.length > 0 && <QuotesTable sectors={[{ sectionName: 'Notowania', symbols: rows }]} onOpen={onOpen} compact />}
      {rows.some(delayed) && <p className="chart-hint news-hint">{DELAY_HINT}</p>}
      {named.length > 0 && (
        <div className="news-charts">
          {named.map((s) => (
            <button key={s} className="chip small" onClick={open(s)} aria-label={`Wykres: ${instrument(s).name}`}>
              <Chart size={14} />{instrument(s).name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
