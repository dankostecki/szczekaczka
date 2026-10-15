import { CHECK_SECONDS, QUIET_CHECK_SECONDS, type FeedConfig } from './sources'

// Quiet hours in Poland: at night (0:00–7:00) and at weekends almost nothing is published, so the
// server checks the feeds less often then (worker/poller.ts)
export const DAY_FROM = 7 // Polish time: on weekdays, [7:00, 24:00) is the day

const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', weekday: 'short', hour: '2-digit', hourCycle: 'h23' })

export function quietHours(now = new Date()): boolean {
  const parts = fmt.formatToParts(now)
  const day = parts.find((p) => p.type === 'weekday')?.value
  return day === 'Sat' || day === 'Sun' || Number(parts.find((p) => p.type === 'hour')?.value) < DAY_FROM
}

// How often a feed is checked now, in seconds (without the quicker retries after a failure)
export function checkSeconds(feed: FeedConfig, now = new Date()): number {
  return Math.max(feed.minAge ?? 0, quietHours(now) ? QUIET_CHECK_SECONDS : feed.every ?? CHECK_SECONDS)
}
