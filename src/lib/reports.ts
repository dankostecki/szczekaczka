// The same ESPI/EBI report from two sources, e.g. Bankier "RAFAMET: Brak sprzeciwu Agencji…" at
// 9:18 and PAP Biznes "Rafamet SA: Brak sprzeciwu Agencji…" at 9:18: same company (names are
// written differently, and one may be longer: "Rafamet SA w restrukturyzacji"), the same start
// of the title, and published within a few minutes (the two sources may differ by a minute).
import type { NewsItem } from './parse'

const NEAR_MS = 10 * 60_000
const TITLE_CHARS = 40

// Letters and digits only, without Polish marks: "Kool2Play S.A." -> "kool2playsa"
// (a table, not normalize('NFD'): this runs for every stored report and has to be cheap)
const PLAIN: Record<string, string> = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' }
const norm = (s: string) => s.toLowerCase().replace(/[ąćęłńóśźż]/g, (c) => PLAIN[c]).replace(/[^a-z0-9]/g, '')
// …and without the legal form at the end: "kool2playsa" -> "kool2play"
const LEGAL = /(spzoo|spolkaakcyjna|ska|sa|se|ltd|inc|plc|nv|ag|asa)$/
function company(name: string): string {
  let c = norm(name)
  for (let prev = ''; c !== prev && c.length > 3;) { prev = c; c = c.replace(LEGAL, '') }
  return c
}

interface Report { company: string; title: string; time: number }
// Stored reports stay the same objects from check to check: each is read once
const seen = new WeakMap<NewsItem, Report>()
function report(i: NewsItem): Report {
  let r = seen.get(i)
  if (!r) { r = read(i); seen.set(i, r) }
  return r
}
function read(i: NewsItem): Report {
  const at = i.title.indexOf(': ')
  return {
    company: at > 0 ? company(i.title.slice(0, at)) : '',
    title: norm((at > 0 ? i.title.slice(at + 2) : i.title).slice(0, TITLE_CHARS * 2)).slice(0, TITLE_CHARS),
    time: i.pubDate ? Date.parse(i.pubDate) : NaN,
  }
}

const sameCompany = (a: string, b: string) => !a || !b || a.startsWith(b) || b.startsWith(a)
function sameTitle(a: string, b: string): boolean {
  const n = Math.min(a.length, b.length)
  return n >= 10 && a.slice(0, n) === b.slice(0, n)
}

// A test "is this already among `known`?". Each known report stands for one new item at most,
// so two reports with the same title (a company sends three MAR notices in a minute) are not
// taken for one.
// The index is built on the first question, so a check with nothing new costs nothing.
export function knownReport(known: NewsItem[]): (i: NewsItem) => boolean {
  let byTitle: Map<string, Report[]> | null = null
  const used = new Set<Report>()
  return (i) => {
    if (!byTitle) {
      byTitle = new Map()
      for (const k of known) {
        const r = report(k), key = r.title.slice(0, 10)
        const list = byTitle.get(key)
        if (list) list.push(r); else byTitle.set(key, [r])
      }
    }
    const r = report(i)
    const candidates = (byTitle.get(r.title.slice(0, 10)) ?? []).filter((k) =>
      !used.has(k) && sameTitle(k.title, r.title) && sameCompany(k.company, r.company)
      && (Number.isNaN(k.time) || Number.isNaN(r.time) || Math.abs(k.time - r.time) <= NEAR_MS))
    if (!candidates.length) return false
    // The closest in time
    const best = candidates.reduce((a, b) => (Math.abs(b.time - r.time) < Math.abs(a.time - r.time) ? b : a))
    used.add(best)
    return true
  }
}
