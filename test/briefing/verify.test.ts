// Stage 4 in code: quotes, numbers, independent and primary sources, contradictions, old stories
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readConfig } from '../../worker/briefing/config'
import type { TriageStory, VerifyAnswer } from '../../worker/briefing/schemas'
import { checkStory, isPrimary, numbersBacked, numberValues, quoteIn, sameText, type CheckedPage } from '../../worker/briefing/verify'

const { config } = readConfig({})
const windowFrom = Date.parse('2026-10-27T18:00:00Z')
const ctx = { originDomains: ['seekingalpha.com'], windowFrom, editionYear: 2026 }

const story = (kind: TriageStory['claims'][number]['kind'] = 'figure', more: Partial<TriageStory> = {}): TriageStory => ({
  id: 's1', candidateIds: ['c1'], headline: 'Nvidia: przychody powyżej oczekiwań', category: 'companies-us', importance: 5,
  claims: [{ id: 's1c1', text: 'Przychody Nvidii w trzecim kwartale wyniosły 57 miliardów dolarów', kind, eventTime: null, entities: ['Nvidia'] }],
  queries: ['Nvidia Q3 revenue'], primaryDomains: ['nvidia.com'], whyItMatters: '', ...more,
})

const page = (id: string, host: string, excerpt: string, more: Partial<CheckedPage> = {}): CheckedPage => ({
  id, url: `https://${host}/a`, finalUrl: `https://${host}/a`, host, domain: host.replace(/^www\./, '').split('.').slice(-2).join('.'), status: 'ok',
  title: 'T', publisher: host, publishedAt: '2026-10-27T21:00:00.000Z', modifiedAt: null, excerpt, fetchedAt: 0, ...more,
})

const NV = 'NVIDIA today reported revenue for the third quarter ended October 26, 2026, of $57.0 billion, up 62% from a year ago.'
const REUTERS = 'Nvidia said on Wednesday its third-quarter revenue rose to $57 billion, beating analysts\' estimates of $54.9 billion, as demand for its AI chips stayed strong.'
const supported = (supports: { sourceId: string; quote: string }[], text = 'Przychody Nvidii w trzecim kwartale wyniosły 57 miliardów dolarów'): VerifyAnswer => ({
  claims: [{ claimId: 's1c1', verdict: 'supported', verifiedText: text, supports, contradictions: [], eventTime: '2026-10-27T21:20:00Z', market: null }],
  oldNews: false, oldNewsReason: null,
})

test('quotes: found despite other quotes, dashes, spaces and case; pieces joined by an ellipsis in order; too short is not enough', () => {
  const text = 'The company said: “Revenue rose  to $57 billion” — a record.\nShares rose 4% after hours.'
  assert.ok(quoteIn('"revenue rose to $57 billion" - a record', text))
  assert.ok(quoteIn('The company said … a record.', text))
  assert.ok(!quoteIn('a record … The company said', text), 'not in that order')
  assert.ok(!quoteIn('rose 4%', text), 'too short')
  assert.ok(!quoteIn('Revenue rose to $58 billion', text))
})

test('numbers in English and Polish writing', () => {
  assert.deepEqual(numberValues('2,5'), [2.5])
  assert.deepEqual(numberValues('1,234'), [1234, 1.234])
  assert.deepEqual(numberValues('1.234.567'), [1234567])
  assert.deepEqual(numberValues('1,234.56'), [1234.56])
  assert.deepEqual(numberValues('1 234'), [1234])
  assert.ok(numbersBacked('wzrost o 2,5 procent do 57 miliardów', ['rose 2.5% to $57 billion']).ok)
  assert.deepEqual(numbersBacked('wzrost o 3,5 procent', ['rose 2.5%']).missing, ['3.5'])
  assert.ok(numbersBacked('S&P 500 zyskał 1,2 procent, WIG20 stracił 0,4', ['The S&P gained 1.2%; Warsaw fell 0.4%']).ok, 'the numbers in index names are names')
  assert.ok(numbersBacked('o 22:00 naszego czasu cena spadła o 3 dolary', ['the price fell $3 at 4 p.m.']).ok, 'clock times are left to the final check')
  assert.ok(numbersBacked('w 2026 roku', [], [2026, 2025]).ok)
  assert.ok(numbersBacked('spadek o 1,5 procent', ['fell -1.5%']).ok, 'the sign is said in words')
})

test('primary sources: institutions, exchanges, wires, the company itself', () => {
  for (const [host, entities] of [['www.federalreserve.gov', []], ['stat.gov.pl', []], ['www.ecb.europa.eu', []], ['www.nbp.pl', []], ['www.gpw.pl', []],
    ['www.businesswire.com', []], ['nvidianews.nvidia.com', ['Nvidia']], ['www.cdprojekt.com', ['CD Projekt']], ['www.orlen.pl', ['PKN Orlen']]] as [string, string[]][]) {
    const domain = host.split('.').slice(-2).join('.') === 'gov.pl' ? host : host.replace(/^www\./, '').split('.').slice(-2).join('.')
    assert.ok(isPrimary({ host, domain: host.endsWith('europa.eu') ? 'europa.eu' : domain }, entities), host)
  }
  assert.ok(!isPrimary({ host: 'www.reuters.com', domain: 'reuters.com' }, ['Nvidia']))
  assert.ok(!isPrimary({ host: 'www.bankier.pl', domain: 'bankier.pl' }, ['Orlen']))
})

test('a claim backed by the company and an independent newsroom, with real quotes: kept with its sources', () => {
  const pages = [page('p1', 'nvidianews.nvidia.com', NV), page('p2', 'www.reuters.com', REUTERS)]
  const r = checkStory(story(), pages, supported([{ sourceId: 'p1', quote: 'revenue for the third quarter ended October 26, 2026, of $57.0 billion' }, { sourceId: 'p2', quote: 'its third-quarter revenue rose to $57 billion' }]), ctx, config)
  assert.equal(r.usable, true)
  assert.equal(r.claims[0].kept, true)
  assert.deepEqual(r.sources.map((s) => [s.domain, s.primary]), [['nvidia.com', true], ['reuters.com', false]])
  assert.equal(r.sources[0].publishedAt, '2026-10-27T21:00:00.000Z')
})

test('one source only, or quotes the pages do not have: not kept', () => {
  const pages = [page('p1', 'nvidianews.nvidia.com', NV), page('p2', 'www.reuters.com', REUTERS)]
  const one = checkStory(story(), pages, supported([{ sourceId: 'p1', quote: 'revenue for the third quarter ended October 26, 2026, of $57.0 billion' }]), ctx, config)
  assert.match(one.claims[0].reason!, /1 independent source/)
  assert.equal(one.usable, false)
  const invented = checkStory(story(), pages, supported([{ sourceId: 'p1', quote: 'revenue for the third quarter of $57.0 billion, a record' }, { sourceId: 'p2', quote: 'revenue jumped to a record $57 billion' }]), ctx, config)
  assert.match(invented.claims[0].reason!, /no quote found/)
  const elsewhere = checkStory(story(), pages, supported([{ sourceId: 'p9', quote: 'its third-quarter revenue rose to $57 billion' }]), ctx, config)
  assert.equal(elsewhere.claims[0].kept, false, 'a source id that was not given')
})

test('the model says supported but a number is not in the quotes: not kept', () => {
  const pages = [page('p1', 'nvidianews.nvidia.com', NV), page('p2', 'www.reuters.com', REUTERS)]
  const r = checkStory(story(), pages, supported([{ sourceId: 'p1', quote: 'revenue for the third quarter ended October 26, 2026, of $57.0 billion' }, { sourceId: 'p2', quote: 'its third-quarter revenue rose to $57 billion' }],
    'Przychody Nvidii wzrosły o 70 procent do 57 miliardów dolarów'), ctx, config)
  assert.match(r.claims[0].reason!, /numbers not in the quotes: 70/)
})

test('contradictory sources: a quoted contradiction drops the claim even when the model calls it supported', () => {
  const other = 'Nvidia reported third-quarter revenue of $55 billion, below the $57 billion some reports had claimed.'
  const pages = [page('p1', 'nvidianews.nvidia.com', NV), page('p2', 'www.reuters.com', REUTERS), page('p3', 'www.ft.com', other)]
  const answer = supported([{ sourceId: 'p1', quote: 'revenue for the third quarter ended October 26, 2026, of $57.0 billion' }, { sourceId: 'p2', quote: 'its third-quarter revenue rose to $57 billion' }])
  answer.claims[0].contradictions = [{ sourceId: 'p3', quote: 'Nvidia reported third-quarter revenue of $55 billion', explanation: 'another figure' }]
  const r = checkStory(story(), pages, answer, ctx, config)
  assert.match(r.claims[0].reason!, /contradicted/)
  assert.equal(r.usable, false)
  // a "contradiction" that is not in the page counts for nothing
  answer.claims[0].contradictions = [{ sourceId: 'p3', quote: 'Nvidia reported revenue of $50 billion only', explanation: '' }]
  assert.equal(checkStory(story(), pages, answer, ctx, config).claims[0].kept, true)
  // verdicts other than supported
  for (const verdict of ['contradicted', 'insufficient'] as const) {
    const a = supported([]); a.claims[0].verdict = verdict
    assert.equal(checkStory(story(), pages, a, ctx, config).claims[0].kept, false)
  }
})

test('independence: copies of one agency text count once; the story\'s own RSS source does not count', () => {
  const wire = 'Nvidia said on Wednesday its third-quarter revenue rose to $57 billion, beating analysts\' estimates of $54.9 billion, as demand for its AI chips stayed strong in the quarter that ended in October.'
  const pages = [page('p1', 'nvidianews.nvidia.com', NV), page('p2', 'www.reuters.com', wire), page('p3', 'finance.yahoo.com', `${wire} Shares rose after hours.`)]
  const quote = 'its third-quarter revenue rose to $57 billion'
  const copies = checkStory({ ...story(), claims: [{ ...story().claims[0], kind: 'event' }] },
    pages.slice(1), supported([{ sourceId: 'p2', quote }, { sourceId: 'p3', quote }]), ctx, config)
  assert.match(copies.claims[0].reason!, /1 independent source/)
  const own = checkStory(story('event'), [page('p1', 'seekingalpha.com', REUTERS), page('p2', 'www.reuters.com', REUTERS.replace('Wednesday', 'Wednesday evening'))],
    supported([{ sourceId: 'p1', quote }, { sourceId: 'p2', quote }]), ctx, config)
  assert.equal(own.claims[0].kept, false)
  assert.ok(sameText(wire, `${wire} Shares rose after hours.`))
  assert.ok(!sameText(NV, REUTERS))
})

test('a figure needs a primary source; a market claim needs its session', () => {
  const FT = 'The chipmaker reported after the bell in New York that third-quarter revenue rose to $57 billion, according to a statement, and gave a strong outlook.'
  const noPrimary = [page('p1', 'www.ft.com', FT), page('p2', 'www.reuters.com', REUTERS)]
  const quote = 'third-quarter revenue rose to $57 billion'
  const r = checkStory(story('figure'), noPrimary, supported([{ sourceId: 'p1', quote }, { sourceId: 'p2', quote }]), ctx, config)
  assert.match(r.claims[0].reason!, /no primary source/)
  const market = story('market', { claims: [{ id: 's1c1', text: 'Akcje Nvidii zyskały 4 procent', kind: 'market', eventTime: null, entities: ['Nvidia'] }] })
  const up = 'Shares of Nvidia rose 4% in extended trading after the results were released on Wednesday.'
  const pages = [page('p1', 'www.ft.com', up), page('p2', 'www.reuters.com', `${up.replace('Shares of Nvidia', 'Nvidia shares')} Analysts were upbeat.`)]
  const answer = supported([{ sourceId: 'p1', quote: 'Shares of Nvidia rose 4% in extended trading' }, { sourceId: 'p2', quote: 'Nvidia shares rose 4% in extended trading' }], 'Akcje Nvidii zyskały 4 procent w handlu po sesji')
  assert.match(checkStory(market, pages, answer, ctx, config).claims[0].reason!, /session/)
  answer.claims[0].market = { instrument: 'Nvidia', value: '+4%', change: '4%', session: 'handel po sesji w Nowym Jorku, 27 października', observedAt: null, basis: 'indicative' }
  const ok = checkStory(market, pages, answer, ctx, config)
  assert.equal(ok.claims[0].kept, true)
  assert.equal(ok.claims[0].market!.basis, 'indicative')
})

test('old stories come back: the event or every source dated before the window; the model saying so', () => {
  const pages = [page('p1', 'nvidianews.nvidia.com', NV, { publishedAt: '2026-08-27T21:00:00.000Z' }), page('p2', 'www.reuters.com', REUTERS, { publishedAt: '2026-08-27T22:00:00.000Z' })]
  const quotes = [{ sourceId: 'p1', quote: 'revenue for the third quarter ended October 26, 2026, of $57.0 billion' }, { sourceId: 'p2', quote: 'its third-quarter revenue rose to $57 billion' }]
  const old = checkStory(story(), pages, supported(quotes), ctx, config)
  assert.equal(old.resurfaced, true)
  assert.equal(old.usable, false)
  // an update date after the window does not make it new: the publication date counts
  const updated = pages.map((p) => ({ ...p, modifiedAt: '2026-10-27T23:00:00.000Z' }))
  assert.equal(checkStory(story(), updated, supported(quotes), ctx, config).resurfaced, true)
  const fresh = pages.map((p) => ({ ...p, publishedAt: '2026-10-27T21:00:00.000Z' }))
  assert.equal(checkStory(story(), fresh, supported(quotes), ctx, config).usable, true)
  const eventOld = supported(quotes); eventOld.claims[0].eventTime = '2026-10-20T10:00:00Z'
  assert.equal(checkStory(story(), fresh, eventOld, ctx, config).resurfaced, true)
  const flagged = supported(quotes); flagged.oldNews = true; flagged.oldNewsReason = 'announced last week'
  assert.match(checkStory(story(), fresh, flagged, ctx, config).reason!, /announced last week/)
})

test('a story without its core claim is not used, even if another claim is backed', () => {
  const two = story('event', { claims: [
    { id: 's1c1', text: 'Nvidia przejmie firmę Acme', kind: 'event', eventTime: null, entities: ['Nvidia'] },
    { id: 's1c2', text: 'Przychody Nvidii wyniosły 57 miliardów dolarów', kind: 'event', eventTime: null, entities: ['Nvidia'] },
  ] })
  const pages = [page('p1', 'nvidianews.nvidia.com', NV), page('p2', 'www.reuters.com', REUTERS)]
  const answer: VerifyAnswer = { oldNews: false, oldNewsReason: null, claims: [
    { claimId: 's1c1', verdict: 'insufficient', verifiedText: null, supports: [], contradictions: [], eventTime: null, market: null },
    { claimId: 's1c2', verdict: 'supported', verifiedText: 'Przychody Nvidii wyniosły 57 miliardów dolarów', supports: [{ sourceId: 'p1', quote: 'revenue for the third quarter ended October 26, 2026, of $57.0 billion' }, { sourceId: 'p2', quote: 'its third-quarter revenue rose to $57 billion' }], contradictions: [], eventTime: null, market: null },
  ] }
  const r = checkStory(two, pages, answer, ctx, config)
  assert.equal(r.claims[1].kept, true)
  assert.equal(r.usable, false)
  assert.match(r.reason!, /core claim/)
})

test('a missing claim (the model skipped it) is not kept', () => {
  const r = checkStory(story(), [page('p1', 'nvidianews.nvidia.com', NV)], { claims: [], oldNews: false, oldNewsReason: null }, ctx, config)
  assert.equal(r.claims[0].reason, 'not checked')
})
