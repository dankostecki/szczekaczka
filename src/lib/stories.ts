// One story out of many headlines: the same news from several channels (Walter Bloomberg and investingLive, a corrected post), and the
// headlines of one subject within an hour (a company's results line by line). Shared by the morning briefing (worker/briefing/collect.ts)
// and the page's "Top" tab (lib/top.ts), so that both put the same headlines together.

const STOP = new Set(('the a an and or of to in on for at by with from as is are was were be its it this that than into over after before amid says said ' +
  'will would could may up down new per vs via not no yes has have had his her their our ' +
  'i w z na do od o po za że się nie jest są to ten ta te dla przez oraz lub a jak już ale co by jego jej ich').split(' '))

export function tokens(text: string): string[] {
  const out: string[] = []
  for (const w of text.toLowerCase().match(/[\p{L}\p{N}$%&]+/gu) ?? []) if (w.length >= 2 && !STOP.has(w)) out.push(w)
  return out
}

const bare = (link: string) => link.replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/$/, '')

function jaccard(a: Set<string>, b: Set<string>): number {
  let common = 0
  for (const w of a) if (b.has(w)) common++
  return common / (a.size + b.size - common || 1)
}

// The subject of a headline: its first word ("MICROSOFT 1Q REV…", "WARSH: …", "FED'S WALLER…", "Orlen: …"), unless it is one that
// starts headlines about anything ("U.S. …", "USA: …", "Spółka …"): a country is one (its data and its markets are different news)
const NOT_A_SUBJECT = new Set(['u.s', 'us', 'usa', 'u.k', 'uk', 'eu', 'china', 'japan', 'germany', 'europe', 'euro', 'eurozone',
  'chiny', 'japonia', 'niemcy', 'polska', 'europa', 'strefa', 'the', 'breaking', 'update', 'exclusive', 'watch', 'just', 'alert', 'report', 'reports',
  'what', 'how', 'why', 'here', 'heres', 'new', 'more', 'some', 'another', 'all', 'most', 'today', 'this', 'these', 'those',
  'spółka', 'spółki', 'zarząd', 'raport', 'komunikat', 'informacja', 'zawiadomienie', 'ogłoszenie', 'uchwała', 'korekta'])
export function subjectOf(title: string): string | null {
  const m = /^[\s*"'„“«(]*(\p{L}[\p{L}\p{N}&.-]*)/u.exec(title)
  const w = m?.[1].toLowerCase().replace(/[.-]+$/, '')
  return w && w.length >= 3 && !STOP.has(w) && !NOT_A_SUBJECT.has(w) ? w : null
}
// The headlines of one subject within this long of the first are one story
const BURST_MS = 60 * 60_000

// What a headline needs to be put together with others: its text (and a translation, compared too), its link, its time (ms)
export interface Groupable { title: string; translation?: string; link: string; time: number }

// The stories of `items`: each a list of its headlines with their words, in the order of the items. Fast enough for a full day of every
// channel (well within the free plan's CPU for a night of about 700, collect.test.ts)
export function groupStories<T extends Groupable>(items: T[]): { it: T; words: Set<string> }[][] {
  const kept = items.map((it) => ({ it, words: new Set(tokens(`${it.title} ${it.translation?.slice(0, 160) ?? ''}`)) }))
  const parent = kept.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const join = (a: number, b: number) => { const x = find(a), y = find(b); if (x !== y) parent[Math.max(x, y)] = Math.min(x, y) }
  const byLink = new Map<string, number>()
  const byWord = new Map<string, number[]>()
  kept.forEach((k, i) => {
    const link = k.it.link ? bare(k.it.link) : ''
    if (link) { const j = byLink.get(link); if (j !== undefined) join(i, j); else byLink.set(link, i) }
    for (const w of k.words) { let l = byWord.get(w); if (!l) byWord.set(w, (l = [])); l.push(i) }
  })
  // Two headlines are compared when they share a word that few headlines have (one that many have says nothing about them).
  // Their words in common are counted on the way: the rarer ones exactly, the common ones at most as many as either has, so
  // a pair that cannot reach the threshold (common ≥ 0.55 / 1.55 of both sizes together) is not compared at all. Most pairs
  // share one word: without this, a full night took several times the free plan's CPU.
  const COMMON = 40
  const frequent = kept.map((k) => { let n = 0; for (const w of k.words) if (byWord.get(w)!.length > COMMON) n++; return n })
  const shared = new Int32Array(kept.length)
  const reached: number[] = []
  for (const [i, k] of kept.entries()) {
    if (k.words.size < 3) continue
    for (const w of k.words) {
      const list = byWord.get(w)!
      if (list.length > COMMON) continue
      for (const j of list) if (j > i && shared[j]++ === 0) reached.push(j)
    }
    for (const j of reached) {
      const rare = shared[j]
      shared[j] = 0
      const other = kept[j]
      if (other.words.size < 3 || Math.abs(other.it.time - k.it.time) > 6 * 3600_000) continue
      if (rare + Math.min(frequent[i], frequent[j]) < (0.55 / 1.55) * (k.words.size + other.words.size)) continue
      if (jaccard(k.words, other.words) >= 0.55) join(i, j)
    }
    reached.length = 0
  }
  // Headlines about one subject within an hour are one story: a company's results come as many one-line headlines (revenue,
  // profit, guidance, the shares after hours), a central bank's decision as its statement and then the press conference, line
  // by line. Scored one by one, each is a small news, and they lose their places to whatever came earlier the same evening.
  // Together they are one candidate, with the other headlines kept (`more`), so nothing is lost when two are put together wrongly.
  const bySubject = new Map<string, number[]>()
  kept.forEach((k, i) => {
    const subject = subjectOf(k.it.title)
    if (subject) { let l = bySubject.get(subject); if (!l) bySubject.set(subject, (l = [])); l.push(i) }
  })
  for (const list of bySubject.values()) {
    list.sort((a, b) => kept[a].it.time - kept[b].it.time)
    let first = list[0]
    for (const i of list.slice(1)) {
      if (kept[i].it.time - kept[first].it.time <= BURST_MS) join(first, i)
      else first = i
    }
  }
  const groups = new Map<number, typeof kept>()
  kept.forEach((k, i) => { const r = find(i); let g = groups.get(r); if (!g) groups.set(r, (g = [])); g.push(k) })
  return [...groups.values()]
}
