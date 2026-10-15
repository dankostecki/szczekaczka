// Night in Poland: from midnight to 7:00 almost nothing is published, so the server checks the
// feeds less often then (worker/poller.ts)
export const NIGHT_UNTIL = 7 // Polish time: night is [0:00, 7:00)

const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', hour: '2-digit', hourCycle: 'h23' })

export function night(now = new Date()): boolean {
  return Number(fmt.formatToParts(now).find((p) => p.type === 'hour')?.value) < NIGHT_UNTIL
}
