// When the page asks for news. Every refresh costs a function run on the server,
// so it asks less often when almost nothing is published: at night and at weekends.
import type { Prefs } from './prefs'

export const QUIET_MINUTES = 10           // refresh at least this far apart outside market hours
export const MARKET_DAYS = 'pon.–pt.'
export const MARKET_FROM = 7, MARKET_TO = 23 // Polish time, [from, to)

const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', weekday: 'short', hour: '2-digit', hourCycle: 'h23' })

export function marketHours(now = new Date()): boolean {
  const parts = fmt.formatToParts(now)
  const day = parts.find((p) => p.type === 'weekday')?.value
  const hour = Number(parts.find((p) => p.type === 'hour')?.value)
  return day !== 'Sat' && day !== 'Sun' && hour >= MARKET_FROM && hour < MARKET_TO
}

export function refreshMinutes(p: Prefs, now = new Date()): number {
  return p.slowOffHours && !marketHours(now) ? Math.max(p.refreshMin, QUIET_MINUTES) : p.refreshMin
}
