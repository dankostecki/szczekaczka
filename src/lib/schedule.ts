// Market hours in Poland. At night and at weekends almost nothing is published, so the
// server checks the feeds less often then (worker/poller.ts).
export const MARKET_DAYS = 'pon.–pt.'
export const MARKET_FROM = 7, MARKET_TO = 23 // Polish time, [from, to)

const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', weekday: 'short', hour: '2-digit', hourCycle: 'h23' })

export function marketHours(now = new Date()): boolean {
  const parts = fmt.formatToParts(now)
  const day = parts.find((p) => p.type === 'weekday')?.value
  const hour = Number(parts.find((p) => p.type === 'hour')?.value)
  return day !== 'Sat' && day !== 'Sun' && hour >= MARKET_FROM && hour < MARKET_TO
}
