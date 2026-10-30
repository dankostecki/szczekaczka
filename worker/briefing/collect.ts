// Stage 1: the news of the window, from what the site's Poller keeps (each channel's last 24 hours). An item counts by its
// publication time as its feed gave it when it was first read (worker/feeds.ts keeps that one): never the time it was
// fetched, never a later update. An item without a usable date is left out, as one dated outside the window.
// Then: routine notices out (inWindow); near-duplicates (the same headline from Walter Bloomberg and Seeking Alpha, a
// corrected post) put together, the stories ranked, and the best few go to the model that picks the stories (rank).
// Two steps of the pipeline, each well within the free plan's CPU for a full night (about 700 news).
import type { NewsItem } from '../../src/lib/parse'
import type { BriefingConfig } from './config'
import type { EditionTimes } from './time'

// What the Poller hands over: the items of every channel, and how each channel stood (an error overnight is a gap in the edition)
export interface PollerFeed { key: string; error: string | null; failures: number; checkedAt: number }
// The Poller sends only the items that can be in the window (and says how many it left out for having no date, or a date far
// from it), each without the text only the reading window uses (`body`): a full day of every channel would be megabytes.
export interface PollerItems { items: NewsItem[]; feeds: PollerFeed[]; at: number; undated?: number; outside?: number }

// What the feeds' dates mean, source by source (the date of publication, in every case the site has now)
export const DATE_KIND: Record<string, 'published'> = {
  ESPI: 'published', GPW: 'published', STOOQ: 'published', WALTER: 'published', INVESTINGLIVE: 'published', SEEKINGALPHA: 'published', PAP: 'published',
}

export interface Candidate {
  id: string              // "c1", "c2"… (short, for the model)
  itemIds: string[]
  sources: string[]       // "WALTER", "INVESTINGLIVE"…
  links: string[]
  publishedAt: string     // the earliest publication in the group (ISO)
  dateKind: 'published'
  title: string           // of the best item, as published
  lead: string
  translation?: string    // the site's Polish translation of an English item
  more?: string[]         // the story's other headlines (a company's results come as many), oldest first
  importance?: number     // 0 to 10, as the model that rated the stories of the night said (importance.ts), when it did
  score: number
}

export interface CollectStats {
  total: number
  noDate: number
  outside: number
  future: number
  otherSource: number
  routine: number
  inWindow: number
  groups: number
  feedProblems: string[] // channels that were failing at the cutoff
}

const WEIGHT: Record<string, number> = { WALTER: 1, STOOQ: 1, INVESTINGLIVE: 0.9, SEEKINGALPHA: 0.85, ESPI: 0.7, GPW: 0.6, PAP: 0.5 }
const weightOf = (source: string, label: string) => (source === 'PAP' && label !== 'BIZNES' ? 0.3 : WEIGHT[source] ?? 0.4)

// Routine notices: nothing for a morning briefing (by the language of the source: only what can be there is looked for)
const ROUTINE_EN: RegExp[] = [
  /\bdeclares\s+\$?[\d.,]+\s*(?:\/share\s+)?(?:quarterly|monthly|semi-annual|annual|special)?\s*dividend/i,
  /\b(?:earnings call|conference call)\s+(?:transcript|presentation)\b/i,
  /\bQ[1-4]\s+\d{4}\s+(?:Earnings\s+)?(?:Call\s+)?(?:Transcript|Presentation)\b/i,
  /\b(?:files|filed)\s+(?:for\s+)?(?:a\s+)?(?:mixed\s+)?shelf\b/i,
  /\bprices?\s+\$?[\d.,]+[MB]?\s+(?:of\s+)?(?:senior\s+)?notes\b/i,
]
const ROUTINE_PL: RegExp[] = [
  /zawiadomienie\s+(?:w\s+trybie\s+)?art\.?\s*19/i,
  /\b(?:informacja|zawiadomienie)\s+o\s+transakcj/i,
  /\b(?:rejestracja|wprowadzenie)\s+(?:do\s+obrotu\s+)?akcji\b/i,
  /\bzwołanie\s+(?:nadzwyczajnego\s+)?walnego\b|\bogłoszenie\s+o\s+zwołaniu\b/i,
  /\bwykaz\s+akcjonariuszy\b|\bpowyżej\s+5%\s+(?:głosów|ogólnej)/i,
  /\bkorekta\s+raportu\b/i,
  /\braport\s+(?:bieżący|okresowy)\s+nr\b/i,
]
// investingLive's posts by section, in the link ("/technical-analysis/…"): charts and levels, and lessons, are no news for a briefing (what they say is
// not a fact two sources can confirm). The sections of the general feed seen: news, central-banks, stocks, commodities, cryptocurrency, technical-analysis
const ROUTINE_LINK = /^https?:\/\/[^/]+\/(?:technical-analysis|education|forex-orders)\//i
const routineFor = (source: string) => (source === 'WALTER' || source === 'SEEKINGALPHA' || source === 'INVESTINGLIVE' ? ROUTINE_EN : ROUTINE_PL)

// Crypto and commodities: their words, for the score (a mover like the others) and for the places they are kept (FLOOR below). Without them the story of
// an exchange hack or of oil falling 5% had a headline with no word of the macro kind and lost its place to the day's company filings
const CRYPTO_WORDS = ['crypto', 'cryptocurrency', 'cryptocurrencies', 'binance', 'coinbase', 'kraken', 'okx', 'bybit', 'tether', 'usdt', 'usdc', 'stablecoin', 'stablecoins',
  'ethereum', 'ether', 'eth', 'btc', 'bitcoin', 'solana', 'xrp', 'ripple', 'dogecoin', 'hack', 'hacked', 'hacks', 'exploit', 'exploited', 'liquidations', 'etf', 'etfs']
const CRYPTO_STEMS = ['krypto', 'stablecoin', 'bitcoin', 'ethereum']
const COMMODITY_WORDS = ['commodities', 'commodity', 'crude', 'brent', 'wti', 'oil', 'gold', 'silver', 'copper', 'nickel', 'aluminium', 'aluminum', 'lithium', 'uranium',
  'gas', 'lng', 'coal', 'wheat', 'corn', 'soybeans', 'cocoa', 'coffee', 'sugar', 'opec', 'złoto', 'złota', 'ropa', 'ropy', 'gaz', 'gazu', 'miedź', 'srebro']
const COMMODITY_STEMS = ['surowc', 'miedz', 'srebr', 'paliw', 'złot', 'ropie', 'ropą']
const CRYPTO = 1, COMMODITIES = 2

// What moves markets: a story whose headline names these goes higher (the model decides in the end). Words of the
// headline, looked up (much cheaper than expressions over every news): whole words, and stems of Polish inflected ones.
const MOVER_WORDS: [kind: number, words: string[], stems: string[]][] = [
  [1, ['fed', 'fomc', 'warsh', 'powell', 'ecb', 'ebc', 'lagarde', 'boj', 'boe', 'pboc', 'snb', 'nbp', 'rpp', 'glapiński', 'rates', 'rate'], ['procentow']],
  [2, ['cpi', 'pce', 'ppi', 'gdp', 'pkb', 'payrolls', 'payroll', 'nfp', 'unemployment', 'jobless', 'pmi', 'ism', 'inflation'], ['inflac', 'bezroboci', 'detaliczn']],
  [3, ['earnings', 'results', 'revenue', 'rev', 'sales', 'ebitda', 'guidance', 'outlook', 'forecast', 'wyniki', 'eps', 'profit', 'loss'], ['prognoz', 'przychod', 'zysk', 'strat']],
  [4, ['tariff', 'tariffs', 'sanctions', 'sanction', 'cła', 'embargo', 'ceasefire', 'rozejm', 'attack', 'atak', 'war', 'opec', 'missile', 'strike'], ['sankcj', 'wojn', 'ostrzał']],
  [5, ['acquire', 'acquires', 'acquired', 'acquisition', 'merger', 'takeover', 'buyout', 'bankruptcy', 'default', 'ipo'], ['przejęci', 'przejmie', 'fuzj', 'upadłoś', 'debiut']],
  [6, ['s&p', 'nasdaq', 'dow', 'nikkei', 'kospi', 'dax', 'wig', 'wig20', 'futures', 'treasury', 'treasuries', 'yield', 'yields', 'brent', 'wti', 'gold', 'bitcoin', 'dollar', 'oil', 'złoto', 'złota', 'ropa', 'ropy'],
    ['kontrakt', 'rentownoś', 'dolar', 'złot']],
  [7, CRYPTO_WORDS, CRYPTO_STEMS],
  [8, COMMODITY_WORDS, COMMODITY_STEMS],
]
const CRYPTO_SET = new Set(CRYPTO_WORDS), COMMODITY_SET = new Set(COMMODITY_WORDS)
// Which of the two topics the words name (a bit each)
function topicsOf(words: Iterable<string>): number {
  let topics = 0
  for (const w of words) {
    if (CRYPTO_SET.has(w) || (w.length > 4 && CRYPTO_STEMS.some((s) => w.startsWith(s)))) topics |= CRYPTO
    if (COMMODITY_SET.has(w) || (w.length > 4 && COMMODITY_STEMS.some((s) => w.startsWith(s)))) topics |= COMMODITIES
  }
  return topics
}
// Places kept for the stories of each topic, however low their score (when there are that many): the model that picks the stories sees
// what happened in crypto and in commodities even on a night when the macro data and the company results take every place
const FLOOR = 3
const MOVER_WORD = new Map(MOVER_WORDS.flatMap(([k, words]) => words.map((w) => [w, k] as const)))
const MOVER_STEMS = MOVER_WORDS.flatMap(([k, , stems]) => stems.map((s) => [s, k] as const))
function moverKinds(words: Iterable<string>): number {
  const kinds = new Set<number>()
  for (const w of words) {
    const k = MOVER_WORD.get(w) ?? (w.length > 4 ? MOVER_STEMS.find(([s]) => w.startsWith(s))?.[1] : undefined)
    if (k) kinds.add(k)
  }
  return kinds.size
}

const STOP = new Set(('the a an and or of to in on for at by with from as is are was were be its it this that than into over after before amid says said ' +
  'will would could may up down new per vs via not no yes has have had his her their our ' +
  'i w z na do od o po za że się nie jest są to ten ta te dla przez oraz lub a jak już ale co by jego jej ich').split(' '))

export function tokens(text: string): string[] {
  const out: string[] = []
  for (const w of text.toLowerCase().match(/[\p{L}\p{N}$%&]+/gu) ?? []) if (w.length >= 2 && !STOP.has(w)) out.push(w)
  return out
}

const bare = (link: string) => link.replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/$/, '')
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`)

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
const MORE_HEADLINES = 8

// A news of the window, with only what the next steps need
export interface WindowItem { id: string; source: string; label: string; title: string; lead: string; translation?: string; link: string; time: number }

// Step "collect": the news of the window [from, cutoff) by their publication time, without routine notices
export function inWindow(data: PollerItems, t: EditionTimes, cutoff: number, config: Pick<BriefingConfig, 'sources'>): { items: WindowItem[]; stats: CollectStats } {
  const stats: CollectStats = { total: data.items.length + (data.undated ?? 0) + (data.outside ?? 0), noDate: data.undated ?? 0, outside: data.outside ?? 0,
    future: 0, otherSource: 0, routine: 0, inWindow: 0, groups: 0,
    feedProblems: data.feeds.filter((f) => f.error || f.failures >= 3).map((f) => f.key) }
  const items: WindowItem[] = []
  const seenIds = new Set<string>()
  for (const it of data.items) {
    if (seenIds.has(it.id)) continue
    seenIds.add(it.id)
    if (!config.sources.includes(it.source) || !DATE_KIND[it.source]) { stats.otherSource++; continue }
    if (!it.pubDate) { stats.noDate++; continue }
    const time = Date.parse(it.pubDate)
    if (!Number.isFinite(time)) { stats.noDate++; continue }
    if (time > data.at + 5 * 60_000) { stats.future++; continue } // a date in the future: the feed's clock or zone is wrong
    if (time < t.from || time >= cutoff) { stats.outside++; continue }
    const lead = it.description.slice(0, 400)
    const text = `${it.title} ${lead.slice(0, 200)}`
    if (routineFor(it.source).some((r) => r.test(text)) || (it.source === 'INVESTINGLIVE' && ROUTINE_LINK.test(it.link))) { stats.routine++; continue }
    items.push({
      id: it.id, source: it.source, label: it.label, title: it.title.slice(0, 300), lead, link: it.link, time,
      ...(it.pl ? { translation: `${it.pl.title}${it.pl.description ? ` ${it.pl.description}` : ''}`.slice(0, 500) } : {}),
    })
  }
  stats.inWindow = items.length
  return { items, stats }
}

// A story of the night (the near-duplicates put together) with the score the rules give it; `key` is the id of its best item, the same on every run
export interface Group {
  key: string
  g: { it: WindowItem; words: Set<string> }[]
  best: { it: WindowItem; words: Set<string> }
  sources: string[]
  score: number
  topics: number
}
export interface Pool { groups: Group[]; count: number }
// What the model says of them (importance.ts), on its scale of 0 to 10, and how much of it is added to the rules' score; a story it
// did not rate (a call that failed) gets `fill`, the middle of the rest, so that being unrated is neither a gain nor a loss
export interface Importance { scores: ReadonlyMap<string, number>; weight: number; fill: number }
const byScore = (a: { score: number; best: { it: WindowItem } }, b: typeof a) => b.score - a.score || a.best.it.time - b.best.it.time

// Step "rank", the first half: near-duplicates together, the stories scored by the rules, the best first
export function rankPool(items: WindowItem[]): Pool {
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

  const scored = [...groups.values()].map((g) => {
    g.sort((a, b) => weightOf(b.it.source, b.it.label) - weightOf(a.it.source, a.it.label) || a.it.time - b.it.time)
    const best = g[0]
    const sources = [...new Set(g.map((k) => k.it.source))]
    const top = g.slice(0, 3).flatMap((k) => [...k.words])
    const movers = moverKinds(top)
    const score = weightOf(best.it.source, best.it.label) + 0.6 * (sources.length - 1) + 0.25 * Math.log2(g.length) + 0.35 * Math.min(movers, 3)
    return { key: best.it.id, g, best, sources, score, topics: topicsOf(top) } satisfies Group
  })
  scored.sort(byScore)
  return { groups: scored, count: groups.size }
}

// The second half: the best `maxCandidates` with no source over 40% of them, and the places of crypto and of commodities. With the model's
// scores (`importance`) a story's score is the rules' plus `weight` times the model's, so a story the rules put low can come in
export function pickCandidates(pool: Pool, config: Pick<BriefingConfig, 'maxCandidates'>, importance?: Importance): { candidates: Candidate[]; groups: number } {
  const scored = pool.groups.map((s) => (importance ? { ...s, score: s.score + importance.weight * (importance.scores.get(s.key) ?? importance.fill) } : s))
  scored.sort(byScore)
  const cap = Math.max(4, Math.ceil(config.maxCandidates * 0.4))
  const perSource = new Map<string, number>()
  const chosen: typeof scored = []
  for (const s of scored) {
    if (chosen.length >= config.maxCandidates) break
    const n = perSource.get(s.best.it.source) ?? 0
    if (n >= cap) continue
    perSource.set(s.best.it.source, n + 1)
    chosen.push(s)
  }
  // The places of each topic: the best of its stories that did not get in take the place of the lowest of those that are no topic's
  const added = new Set<typeof scored[number]>()
  for (const topic of [CRYPTO, COMMODITIES]) {
    let have = chosen.filter((s) => s.topics & topic).length
    for (const s of scored) {
      if (have >= FLOOR) break
      if (!(s.topics & topic) || chosen.includes(s)) continue
      if (chosen.length >= config.maxCandidates) {
        let drop = -1
        for (let i = chosen.length - 1; i >= 0 && drop < 0; i--) if (!chosen[i].topics && !added.has(chosen[i])) drop = i
        if (drop < 0) break
        chosen.splice(drop, 1)
      }
      chosen.push(s)
      added.add(s)
      have++
    }
  }
  chosen.sort(byScore)
  const candidates = chosen.map((s, i): Candidate => ({
    id: `c${i + 1}`,
    itemIds: s.g.map((k) => k.it.id),
    sources: s.sources,
    links: [...new Set(s.g.map((k) => k.it.link).filter(Boolean))].slice(0, 5),
    publishedAt: new Date(Math.min(...s.g.map((k) => k.it.time))).toISOString(),
    dateKind: 'published',
    title: clip(s.best.it.title, 300),
    lead: clip(s.best.it.lead, 400),
    ...(s.best.it.translation ? { translation: s.best.it.translation } : {}),
    ...moreOf(s.g, s.best),
    ...(importance?.scores.has(s.key) ? { importance: importance.scores.get(s.key) } : {}),
    score: Math.round(s.score * 100) / 100,
  }))
  return { candidates, groups: pool.count }
}

// Both halves, by the rules alone
export const rank = (items: WindowItem[], config: Pick<BriefingConfig, 'maxCandidates'>) => pickCandidates(rankPool(items), config)

// The other headlines of a story, oldest first, without the ones that say what its headline says
function moreOf(g: { it: WindowItem }[], best: { it: WindowItem }): Pick<Candidate, 'more'> {
  const seen = new Set([clip(best.it.title, 200).toLowerCase()])
  const more: string[] = []
  for (const k of [...g].sort((a, b) => a.it.time - b.it.time)) {
    const title = clip(k.it.title, 200)
    if (seen.has(title.toLowerCase())) continue
    seen.add(title.toLowerCase())
    more.push(title)
  }
  return more.length ? { more: more.slice(0, MORE_HEADLINES) } : {}
}

export interface Collected { candidates: Candidate[]; stats: CollectStats }

// Both steps at once (the tests)
export function collect(data: PollerItems, t: EditionTimes, cutoff: number, config: Pick<BriefingConfig, 'sources' | 'maxCandidates'>): Collected {
  const w = inWindow(data, t, cutoff, config)
  const r = rank(w.items, config)
  return { candidates: r.candidates, stats: { ...w.stats, groups: r.groups } }
}
