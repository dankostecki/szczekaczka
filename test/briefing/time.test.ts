// The edition's times in Warsaw: the window over the changes of time, the cutoff, the days, the next wake-up
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readConfig } from '../../worker/briefing/config'
import { actualCutoff, addDays, dayLabel, dueEdition, editionIdAt, editionTimes, isEditionId, nextCutoff, relativeDay, weekday } from '../../worker/briefing/time'

const { config } = readConfig({})
const at = (s: string) => Date.parse(s)
const iso = (ms: number) => new Date(ms).toISOString()

test('an ordinary winter day: 19:00 CET the day before to 07:00 CET, cutoff 06:00, out at 07:45, deadline 10:00', () => {
  const t = editionTimes('2026-11-18', config)
  assert.equal(iso(t.from), '2026-11-17T18:00:00.000Z')
  assert.equal(iso(t.to), '2026-11-18T06:00:00.000Z')
  assert.equal(iso(t.cutoff), '2026-11-18T05:00:00.000Z')
  assert.equal(iso(t.publishAt), '2026-11-18T06:45:00.000Z')
  assert.equal(iso(t.deadline), '2026-11-18T09:00:00.000Z')
})

test('an ordinary summer day: CEST, two hours from UTC', () => {
  const t = editionTimes('2026-07-15', config)
  assert.equal(iso(t.from), '2026-07-14T17:00:00.000Z')
  assert.equal(iso(t.cutoff), '2026-07-15T04:00:00.000Z')
})

test('the night of the change to winter time (25 October 2026): the window is 13 hours long', () => {
  const t = editionTimes('2026-10-25', config)
  assert.equal(iso(t.from), '2026-10-24T17:00:00.000Z') // 19:00 CEST
  assert.equal(iso(t.to), '2026-10-25T06:00:00.000Z')   // 07:00 CET
  assert.equal((t.to - t.from) / 3600_000, 13)
  // the day after: both ends in CET, 12 hours again
  const next = editionTimes('2026-10-26', config)
  assert.equal((next.to - next.from) / 3600_000, 12)
  assert.equal(iso(next.from), '2026-10-25T18:00:00.000Z')
})

test('the night of the change to summer time (29 March 2026): the window is 11 hours long', () => {
  const t = editionTimes('2026-03-29', config)
  assert.equal(iso(t.from), '2026-03-28T18:00:00.000Z') // 19:00 CET
  assert.equal(iso(t.to), '2026-03-29T05:00:00.000Z')   // 07:00 CEST
  assert.equal((t.to - t.from) / 3600_000, 11)
})

test('the edition of a moment is the Polish date, also around midnight UTC', () => {
  assert.equal(editionIdAt(at('2026-10-27T22:30:00Z')), '2026-10-27') // 23:30 CET
  assert.equal(editionIdAt(at('2026-10-27T23:30:00Z')), '2026-10-28') // 00:30 CET
  assert.equal(editionIdAt(at('2026-07-14T22:30:00Z')), '2026-07-15') // 00:30 CEST
})

test('an edition is due from its cutoff to its deadline, on its days only', () => {
  const t = editionTimes('2026-10-28', config) // a Wednesday
  assert.equal(dueEdition(t.cutoff - 1, config), null)
  assert.equal(dueEdition(t.cutoff, config)?.id, '2026-10-28')
  assert.equal(dueEdition(t.deadline - 1, config)?.id, '2026-10-28')
  assert.equal(dueEdition(t.deadline, config), null)
  // Sunday is not a day of the briefing by default (1-6)
  assert.equal(weekday('2026-11-01'), 7)
  assert.equal(dueEdition(editionTimes('2026-11-01', config).cutoff + 1000, config), null)
  const all = readConfig({ BRIEFING_DAYS: '1-7' }).config
  assert.equal(dueEdition(editionTimes('2026-11-01', all).cutoff + 1000, all)?.id, '2026-11-01')
})

test('the next cutoff skips the days without an edition', () => {
  const saturdayAfter = editionTimes('2026-10-31', config).deadline + 1
  assert.equal(iso(nextCutoff(saturdayAfter, config)), iso(editionTimes('2026-11-02', config).cutoff)) // Monday
  const before = editionTimes('2026-10-28', config).cutoff - 60_000
  assert.equal(nextCutoff(before, config), editionTimes('2026-10-28', config).cutoff)
})

test('the actual cutoff is when the news were collected, never past the end of the window', () => {
  const t = editionTimes('2026-10-28', config)
  assert.equal(actualCutoff(t.cutoff + 30_000, t), t.cutoff + 30_000)
  assert.equal(actualCutoff(t.to + 3600_000, t), t.to)
  assert.equal(actualCutoff(t.cutoff - 3600_000, t), t.cutoff - 3600_000) // made by hand, earlier
})

test('dates and days in Polish', () => {
  assert.ok(isEditionId('2026-10-28'))
  assert.ok(!isEditionId('2026-02-30'))
  assert.ok(!isEditionId('2026-1-1'))
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(dayLabel('2026-10-28'), 'środa, 28 października 2026')
  assert.equal(relativeDay(at('2026-10-27T21:00:00Z'), '2026-10-28'), 'wczoraj')
  assert.equal(relativeDay(at('2026-10-28T03:00:00Z'), '2026-10-28'), 'dziś')
  assert.equal(relativeDay(at('2026-10-26T12:00:00Z'), '2026-10-28'), 'przedwczoraj')
  assert.equal(relativeDay(at('2026-10-24T12:00:00Z'), '2026-10-28'), 'w sobotę')
  assert.equal(relativeDay(at('2026-10-27T12:00:00Z'), '2026-10-29'), 'przedwczoraj')
  assert.equal(relativeDay(at('2026-10-27T12:00:00Z'), '2026-10-30'), 'we wtorek')
  assert.equal(relativeDay(at('2026-10-22T12:00:00Z'), '2026-10-28'), 'w czwartek')
  assert.equal(relativeDay(at('2026-10-25T12:00:00Z'), '2026-10-30'), 'w niedzielę')
  assert.equal(relativeDay(at('2026-10-10T12:00:00Z'), '2026-10-28'), '10 października')
})
