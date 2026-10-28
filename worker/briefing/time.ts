// The times of an edition, in Warsaw time. The id of an edition is its Polish date ("2026-10-28"); its window runs from
// 19:00 of the day before to 07:00 of that day (both configurable), worked out with the zone rules of the day, so a
// window over the change to winter time is 13 hours long and over the change to summer time 11.
import { warsawToUtc, warsawDate } from '../../src/lib/parse'
import { minutesOf, type BriefingConfig } from './config'

export interface EditionTimes {
  id: string
  from: number      // the window: from (inclusive)…
  to: number        // …to (exclusive), as requested
  cutoff: number    // the configured editorial cutoff (from ≤ cutoff < to)
  publishAt: number
  deadline: number
}

type Times = Pick<BriefingConfig, 'windowStart' | 'windowEnd' | 'cutoff' | 'publishAt' | 'deadline' | 'days'>

const ID = /^(\d{4})-(\d{2})-(\d{2})$/
export const isEditionId = (id: string) => {
  const m = ID.exec(id)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}

const pad = (n: number) => String(n).padStart(2, '0')
export const editionIdAt = (ms: number) => { const d = warsawDate(ms); return `${d.y}-${pad(d.m)}-${pad(d.d)}` }

function parts(id: string): [number, number, number] {
  const m = ID.exec(id)
  if (!m) throw new Error(`not an edition id: ${id}`)
  return [+m[1], +m[2], +m[3]]
}

// A wall-clock time of a Polish calendar day (a day from it: -1 is the day before)
export function warsawAt(id: string, hhmm: string, dayShift = 0): number {
  const [y, m, d] = parts(id)
  const day = new Date(Date.UTC(y, m - 1, d + dayShift))
  const min = minutesOf(hhmm)
  return warsawToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), Math.floor(min / 60), min % 60)
}

export function editionTimes(id: string, c: Times): EditionTimes {
  return {
    id,
    from: warsawAt(id, c.windowStart, -1),
    to: warsawAt(id, c.windowEnd),
    cutoff: warsawAt(id, c.cutoff),
    publishAt: warsawAt(id, c.publishAt),
    deadline: warsawAt(id, c.deadline),
  }
}

// ISO weekday of the Polish date (1 Monday … 7 Sunday)
export function weekday(id: string): number {
  const [y, m, d] = parts(id)
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1
}

export const addDays = (id: string, n: number) => {
  const [y, m, d] = parts(id)
  const day = new Date(Date.UTC(y, m - 1, d + n))
  return `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`
}

// The edition that should be under way at this moment: a day with an edition, past its cutoff and before its deadline
export function dueEdition(now: number, c: Times): EditionTimes | null {
  const id = editionIdAt(now)
  if (!c.days.includes(weekday(id))) return null
  const t = editionTimes(id, c)
  return now >= t.cutoff && now < t.deadline ? t : null
}

// The next cutoff after this moment (the next time to wake up when nothing is under way)
export function nextCutoff(now: number, c: Times): number {
  for (let i = 0; i <= 8; i++) {
    const id = addDays(editionIdAt(now), i)
    if (!c.days.includes(weekday(id))) continue
    const t = editionTimes(id, c)
    if (t.cutoff > now) return t.cutoff
  }
  return now + 24 * 3600_000 // no day with an edition (not possible with a valid BRIEFING_DAYS)
}

// The actual cutoff: the moment the news were collected (at or a little after the configured cutoff; earlier only when an
// edition is made by hand), never past the end of the window
export const actualCutoff = (collectedAt: number, t: EditionTimes) => Math.min(collectedAt, t.to)

// "06:00": the Warsaw clock of a moment, to the minute (rounded down)
const hhmmFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
export const warsawHHMM = (ms: number) => hhmmFmt.format(new Date(ms))

// "wtorek, 27 października, 22:15" and the like, for the model and the page
const warsawFmt = new Intl.DateTimeFormat('pl-PL', {
  timeZone: 'Europe/Warsaw', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
export const warsawLabel = (ms: number) => warsawFmt.format(new Date(ms))
const dayFmt = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
export const dayLabel = (id: string) => dayFmt.format(new Date(warsawAt(id, '12:00')))

// How a moment is said relative to the edition's morning: "dziś", "wczoraj", "w poniedziałek" (older)
const weekdayFmt = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', weekday: 'long' })
const dayMonthFmt = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', day: 'numeric', month: 'long' })
export function relativeDay(ms: number, editionId: string): string {
  const day = editionIdAt(ms)
  if (day === editionId) return 'dziś'
  if (day === addDays(editionId, -1)) return 'wczoraj'
  if (day === addDays(editionId, -2)) return 'przedwczoraj'
  if (day > editionId) return 'jutro lub później'
  if (day < addDays(editionId, -6)) return dayMonthFmt.format(new Date(ms))
  const name = weekdayFmt.format(new Date(ms))
  return /^(wtorek)$/.test(name) ? `we ${name}` : `w ${name.replace(/a$/, 'ę')}`
}
