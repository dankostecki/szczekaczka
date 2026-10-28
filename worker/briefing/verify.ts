// Stage 4 in code: the fact-checking model's answer is only a proposal. A claim is kept when, checked here:
// - the model says "supported" and no source contradicts it;
// - every quote it gives is really in the page it names (the text this server read, not the model's memory);
// - every number of the claim's verified wording is in those quotes;
// - at least `minSources` independent sources back it: different publishers (registrable domains), not copies of one text,
//   and not the site's own RSS source of the story (the thing being checked) unless that is the official source itself;
// - for the kinds that need one (figures, official decisions, quotes, events), one of them is primary: the institution's,
//   the company's or the exchange's own page, or a press-release wire;
// - a market claim says which session it is and whether it is a close, a live quote or an indicative one.
// A story is used when its first (core) claim is kept and it is not an old story come back (resurfaced).
import type { BriefingConfig, ClaimKind } from './config'
import { tokens } from './collect'
import type { MarketData, TriageStory, VerifyAnswer } from './schemas'
import { registrableDomain, type Page } from './web'

export interface SourceRef {
  pageId: string
  url: string
  title: string
  publisher: string
  domain: string
  publishedAt: string | null
  modifiedAt: string | null
  primary: boolean
  quote: string
}

export interface CheckedClaim {
  id: string
  kind: ClaimKind
  original: string
  text: string | null      // the verified wording, when kept
  kept: boolean
  reason?: string
  sources: SourceRef[]
  eventTime: string | null
  market: MarketData | null
}

export interface CheckedStory {
  id: string
  headline: string
  category: string
  importance: number
  candidateIds: string[]
  claims: CheckedClaim[]
  usable: boolean
  reason?: string
  resurfaced: boolean
  sources: SourceRef[]     // every source that backs a kept claim, once
}

export type CheckedPage = Page & { id: string }

// ── Text and numbers, as written in any of the languages of the sources ──
export function normalize(s: string): string {
  return s.normalize('NFKC').toLowerCase()
    .replace(/[­​-‏⁠﻿]/g, '')
    .replace(/[‘’‚‛′`´]/g, "'").replace(/[“”„‟″«»]/g, '"').replace(/[‐‑‒–—―−]/g, '-')
    .replace(/[\s  ]+/g, ' ').trim()
}

// Is the quote in the text? An ellipsis may join pieces of it, which must then come in order; at least 15 characters must match
export function quoteIn(quote: string, text: string): boolean {
  const t = normalize(text)
  const pieces = normalize(quote).replace(/^["']|["']$/g, '').split(/\s*(?:\.\.\.|…|\[\.\.\.\])\s*/).map((p) => p.trim()).filter((p) => p.length >= 3)
  if (pieces.reduce((n, p) => n + p.length, 0) < 15) return false
  let at = 0
  for (const p of pieces) {
    const i = t.indexOf(p, at)
    if (i < 0) return false
    at = i + p.length
  }
  return true
}

// Names of indices with numbers in them are names, not numbers
const NAMED_NUMBERS = /\b(?:S&P\s?500|S&P\s?100|Nasdaq(?:\s?Composite)?\s?100|Russell\s?(?:1000|2000|3000)|Nikkei\s?225|ASX\s?200|FTSE\s?(?:100|250|MIB)|DAX\s?40|CAC\s?40|IBEX\s?35|Euro\s?Stoxx\s?50|Stoxx\s?(?:50|600)|(?:m|s)?WIG\s?(?:20|30|40|80)|WIG-?(?:20|30)|DJIA\s?30|Dow\s?Jones\s?30|Hang\s?Seng\s?Tech|CSI\s?300|KOSPI\s?200|Sensex\s?30|Nifty\s?50|G[- ]?(?:7|20)|COVID-19|5G|4G|Q[1-4]|H[12]|[A-Z]{1,5}\d{1,4}[A-Z]?\b)/gi

// The values a number can mean: "1,234" is 1234 in English and 1.234 in Polish; "2,5" is 2.5; "1 234" and "1.234.567" are thousands
export function numberValues(token: string): number[] {
  const t = token.replace(/[\s  ]/g, '')
  const commas = (t.match(/,/g) ?? []).length, dots = (t.match(/\./g) ?? []).length
  const v = (s: string) => Number(s)
  if (commas && dots) {
    const last = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'))
    return [v(t.slice(0, last).replace(/[.,]/g, '') + '.' + t.slice(last + 1))]
  }
  const sep = commas ? ',' : dots ? '.' : ''
  const n = commas || dots
  if (!sep) return [v(t)]
  if (n > 1) return [v(t.split(sep).join(''))]
  const [a, b] = t.split(sep)
  return b.length === 3 ? [v(a + b), v(`${a}.${b}`)] : [v(`${a}.${b}`)]
}

// Clock times ("22:00", "16:30 ET") are left to the final check: a source's time zone is not the briefing's
const CLOCK = /\b\d{1,2}:\d{2}\b/g

export function numbersIn(text: string): number[][] {
  const out: number[][] = []
  for (const m of text.replace(NAMED_NUMBERS, ' ').replace(CLOCK, ' ').matchAll(/\d(?:[\d.,]|[\s  ](?=\d{3}(?!\d)))*\d|\d/g)) {
    const vals = numberValues(m[0].replace(/[.,]$/, '')).filter(Number.isFinite)
    if (vals.length) out.push(vals)
  }
  return out
}

// Every number of `text` among the numbers of `sources` (any meaning of each; the sign does not count: "-2.5%" is "spadek o 2,5 procent")
export function numbersBacked(text: string, sources: string[], extra: number[] = []): { ok: boolean; missing: string[] } {
  const have = new Set<number>(extra.map((x) => Math.abs(x)))
  for (const s of sources) for (const vals of numbersIn(s)) for (const x of vals) have.add(Math.abs(x))
  const missing: string[] = []
  for (const vals of numbersIn(text)) if (!vals.some((x) => have.has(Math.abs(x)))) missing.push(String(vals[0]))
  return { ok: missing.length === 0, missing }
}

// Near-identical texts (the same agency story on two sites): shared 6-word runs
export function sameText(a: string, b: string): boolean {
  const shingles = (s: string) => {
    const w = tokens(s)
    const out = new Set<string>()
    for (let i = 0; i + 6 <= w.length; i++) out.add(w.slice(i, i + 6).join(' '))
    return out
  }
  const x = shingles(a), y = shingles(b)
  if (x.size < 5 || y.size < 5) return false
  let common = 0
  for (const s of x) if (y.has(s)) common++
  return common / Math.min(x.size, y.size) >= 0.5
}

// ── Primary sources ──
const OFFICIAL = ['europa.eu', 'nbp.pl', 'gpw.pl', 'bankofengland.co.uk', 'boj.or.jp', 'snb.ch', 'bundesbank.de', 'banque-france.fr', 'bankofcanada.ca',
  'rba.gov.au', 'imf.org', 'bis.org', 'worldbank.org', 'oecd.org', 'opec.org', 'iea.org', 'destatis.de', 'insee.fr', 'istat.it', 'nyse.com',
  'cmegroup.com', 'theice.com', 'lseg.com', 'deutsche-boerse.com', 'euronext.com', 'jpx.co.jp', 'hkex.com.hk', 'federalreserve.gov', 'whitehouse.gov']
const WIRES = ['businesswire.com', 'prnewswire.com', 'prnewswire.co.uk', 'globenewswire.com', 'newsfilecorp.com', 'accesswire.com', 'pap-mediaroom.pl', 'einpresswire.com']

const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase()

export function isPrimary(page: Pick<Page, 'domain' | 'host'>, entities: string[]): boolean {
  const d = page.domain
  if (/\.(gov|mil|int)$/.test(d) || /(^|\.)gov\.[a-z]{2}$/.test(d) || /\.gov\.[a-z]{2}$/.test(page.host) || d.endsWith('.gouv.fr')) return true
  if (OFFICIAL.includes(d) || WIRES.includes(d)) return true
  // The entity's own site: "tesla.com" for Tesla, "cdprojekt.com" for CD Projekt, "orlen.pl" for Orlen
  const label = fold(d.split('.')[0]).replace(/[^a-z0-9]/g, '')
  if (label.length < 4) return false
  return entities.some((e) => {
    const f = fold(e)
    const joined = f.replace(/[^a-z0-9]/g, '')
    const words = f.split(/[^a-z0-9]+/).filter((w) => w.length >= 4)
    return joined === label || (joined.length >= 4 && label.startsWith(joined)) || words.includes(label)
  })
}

// ── The check ──
export function checkStory(
  story: TriageStory,
  pages: CheckedPage[],
  answer: VerifyAnswer,
  ctx: { originDomains: string[]; windowFrom: number; editionYear: number },
  c: Pick<BriefingConfig, 'verify'>,
): CheckedStory {
  const entities = [...new Set(story.claims.flatMap((x) => x.entities))]
  const ok = new Map(pages.filter((p) => p.status === 'ok' && p.excerpt).map((p) => [p.id, p]))
  const origin = new Set(ctx.originDomains)
  const stale = ctx.windowFrom - c.verify.staleHours * 3600_000
  const years = [ctx.editionYear, ctx.editionYear - 1]

  const claims = story.claims.map((claim): CheckedClaim => {
    const base = { id: claim.id, kind: claim.kind, original: claim.text, eventTime: null, market: null }
    const a = answer.claims.find((x) => x.claimId === claim.id)
    if (!a) return { ...base, text: null, kept: false, reason: 'not checked', sources: [] }
    const reject = (reason: string): CheckedClaim => ({ ...base, text: null, kept: false, reason, sources: [], eventTime: a.eventTime, market: a.market })
    const contradicting = a.contradictions.filter((x) => ok.has(x.sourceId) && quoteIn(x.quote, ok.get(x.sourceId)!.excerpt!))
    if (a.verdict === 'contradicted' || contradicting.length) return reject('contradicted by a source')
    if (a.verdict !== 'supported') return reject('not confirmed by the sources')
    if (!a.verifiedText) return reject('no verified wording')
    const refs: SourceRef[] = []
    for (const s of a.supports) {
      const page = ok.get(s.sourceId)
      if (!page || !quoteIn(s.quote, page.excerpt!)) continue
      if (refs.some((r) => r.pageId === page.id)) continue
      refs.push({
        pageId: page.id, url: page.finalUrl, title: page.title ?? page.host, publisher: page.publisher ?? page.domain, domain: page.domain,
        publishedAt: page.publishedAt ?? null, modifiedAt: page.modifiedAt ?? null, primary: isPrimary(page, entities), quote: s.quote.slice(0, 300),
      })
    }
    if (!refs.length) return reject('no quote found in the pages')
    const numbers = numbersBacked(a.verifiedText, refs.map((r) => r.quote), years)
    if (!numbers.ok) return reject(`numbers not in the quotes: ${numbers.missing.join(', ')}`)
    // Independent: a publisher counts once, copies of one text count once, the story's own RSS source does not count (unless official)
    const groups: SourceRef[][] = []
    for (const r of refs) {
      if (origin.has(r.domain) && !r.primary) continue
      const g = groups.find((g) => g.some((x) => x.domain === r.domain || sameText(ok.get(x.pageId)!.excerpt!, ok.get(r.pageId)!.excerpt!)))
      if (g) g.push(r); else groups.push([r])
    }
    if (groups.length < c.verify.minSources) return reject(`${groups.length} independent source(s), ${c.verify.minSources} needed`)
    if (c.verify.primaryFor.includes(claim.kind) && !refs.some((r) => r.primary)) return reject('no primary source')
    if (claim.kind === 'market' && (!a.market || !a.market.session.trim())) return reject('a market claim without its session')
    return { ...base, text: a.verifiedText, kept: true, sources: refs, eventTime: a.eventTime, market: a.market }
  })

  const core = claims[0]
  const kept = claims.filter((x) => x.kept)
  const sources = [...new Map(kept.flatMap((x) => x.sources).map((s) => [s.url, s])).values()]
  const eventTime = core?.eventTime ? Date.parse(core.eventTime) : NaN
  const dated = sources.map((s) => (s.publishedAt ? Date.parse(s.publishedAt) : NaN)).filter(Number.isFinite)
  const resurfaced = answer.oldNews
    || (Number.isFinite(eventTime) && eventTime < stale)
    || (dated.length > 0 && dated.every((t) => t < stale))
  const reason = !core?.kept ? `core claim: ${core?.reason ?? 'missing'}` : resurfaced ? `an old story (${answer.oldNewsReason ?? 'dated before the window'})` : undefined
  return {
    id: story.id, headline: story.headline, category: story.category, importance: story.importance, candidateIds: story.candidateIds,
    claims, usable: !!core?.kept && !resurfaced, ...(reason ? { reason } : {}), resurfaced, sources,
  }
}

export const originDomains = (links: string[]) => [...new Set(links.map((l) => { try { return registrableDomain(new URL(l).hostname) } catch { return '' } }).filter(Boolean))]
