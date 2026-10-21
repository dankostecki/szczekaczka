'use client'

import { useEffect, useRef } from 'react'

// TradingView's free widgets (tradingview.com/widget-docs), as TradingView gives them to paste into a page: a script from its server that reads
// its settings from its own text and puts the widget (a frame from TradingView) in its place. Loaded only once the reader has switched the charts
// on (the "Rynek" tab asks): from then on the browser connects to TradingView, which sees its IP address and may keep its cookies.
type Kind = 'mini-symbol-overview' | 'advanced-chart'
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

// A tile: the price, the change and the day's line (the whole tile is a button: a tap opens the chart, so the frame does not take taps)
export const miniConfig = (symbol: string, dark: boolean) => ({
  symbol, width: '100%', height: '100%', locale: 'pl', dateRange: '1D', colorTheme: dark ? 'dark' : 'light',
  isTransparent: true, autosize: true, largeChartUrl: '', noTimeScale: true, chartOnly: false,
})

// The chart: candles, a day a candle to start with (TradingView's own buttons change it), Polish, Warsaw time, the page's colours
export const chartConfig = (symbol: string, dark: boolean, small: boolean) => ({
  symbol, autosize: true, interval: 'D', timezone: 'Europe/Warsaw', theme: dark ? 'dark' : 'light', style: '1', locale: 'pl',
  backgroundColor: dark ? '#19191c' : '#ffffff', gridColor: dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
  allow_symbol_change: false, hide_side_toolbar: small, hide_volume: small, calendar: false, save_image: false,
  support_host: 'https://www.tradingview.com',
})
