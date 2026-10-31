// The pack for ChatGPT: made at 07:45 on the days of the briefing whatever the mode, the news from 19:00 the evening before to then,
// MacroNext's morning calendars, the task; kept at one address; nothing paid
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { NewsItem } from '../../src/lib/parse'
import { briefingApi } from '../../worker/briefing/api'
import { readConfig, type Env as ConfigEnv } from '../../worker/briefing/config'
import { calendarOf, duePack, nextPackAt, packOf, packStatus, packText, PACK_WORDS, packKey, packTick, packWake, rankingKey, TASK_VERSION, type PackDeps } from '../../worker/briefing/pack'
import { memoryStore } from '../../worker/briefing/store'
import type { Env } from '../../worker/env'
import { fakeAi, item, poller } from './helpers'

const iso = (ms: number) => new Date(ms).toISOString()
const at = (s: string) => Date.parse(s)

// 28 October 2026 is a Wednesday in CET: 07:45 in Warsaw is 06:45 UTC
function night(): NewsItem[] {
  return [
    item('WALTER', 'FED KEEPS RATES AT 3.75%-4.00%', '2026-10-27T19:05:00Z', { pl: { title: 'Fed utrzymuje stopy na poziomie 3,75%–4,00%', description: '' } }),
    item('STOOQ', 'Nikkei zyskuje 1,2 proc. na otwarciu', '2026-10-28T00:10:00Z', { description: 'Indeks Nikkei 225 rośnie o 1,2 proc. po otwarciu sesji w Tokio.' }),
    item('ESPI', 'Orlen: szacunkowe wyniki za III kwartał', '2026-10-28T06:20:00Z', { description: 'Zarząd Orlen SA przekazuje szacunkowe wyniki.' }), // 07:20 in Warsaw: after 07:00, before 07:45
    item('WALTER', 'TOO EARLY: a story of the afternoon', '2026-10-27T17:30:00Z'), // 18:30 in Warsaw the day before
    item('SEEKINGALPHA', 'Some company declares dividend', '2026-10-27T22:00:00Z'),
    item('MACRONEXT', 'Dziś w kalendarium makro', '2026-10-28T06:30:00Z', {
      link: 'https://macronext.pl/pl/kalendarium-dzis#2026-10-28-rano', description: '14:30 USA: PKB',
      body: '- 14:30 USA: PKB (k/k), konsensus 2,8%, poprzednio 3,0%\n- 19:00 USA: decyzja Fed w sprawie stóp procentowych',
    }),
    item('MACRONEXT', 'Dziś na giełdzie GPW', '2026-10-28T06:35:00Z', { link: 'https://macronext.pl/pl/dzis-na-gieldzie#2026-10-28-rano', description: 'Spółka LPP: dzień dywidendy' }),
    item('MACRONEXT', 'Za 10 minut o godzinie 8:00 dane makro z Niemiec', '2026-10-28T06:50:00Z', { link: 'https://macronext.pl/pl/kalendarium-dzis#2026-10-28-08:00' }),
  ]
}

function deps(env: ConfigEnv = {}, start = '2026-10-28T06:44:59Z', items = night()) {
  const clock = { now: at(start) }
  const logs: string[] = []
  const { config } = readConfig(env)
  const d: PackDeps = {
    store: memoryStore(), config, now: () => clock.now, log: (m) => logs.push(m),
    pollerItems: async (from, to) => poller(items.filter((i) => Date.parse(i.pubDate!) >= from && Date.parse(i.pubDate!) < to), clock.now),
  }
  return { d, clock, logs }
}

// The pack's steps as the alarm runs them, the clock jumping to each wake-up, until the clock would pass `until`
async function runUntil(h: ReturnType<typeof deps>, until: string, max = 20): Promise<number[]> {
  const wakes: number[] = []
  for (let i = 0; i < max; i++) {
    const next = await packTick(h.d)
    if (next === null || next > at(until)) break
    wakes.push(next)
    h.clock.now = Math.max(h.clock.now + 1, next)
  }
  return wakes
}

test('defaults: on, at 07:45, on the days of the briefing (not Sunday); a day made once', () => {
  const { config, problems } = readConfig({})
  assert.deepEqual(problems, [])
  assert.equal(config.pack.enabled, true)
  assert.equal(config.pack.at, '07:45')
  assert.equal(duePack(at('2026-10-28T06:44:59Z'), config, null), null)
  assert.equal(duePack(at('2026-10-28T06:45:00Z'), config, null), '2026-10-28')
  assert.equal(duePack(at('2026-10-28T15:00:00Z'), config, null), '2026-10-28', 'a deploy later in the day makes it at once')
  assert.equal(duePack(at('2026-10-28T07:00:00Z'), config, { id: '2026-10-28', rankingKey: packKey(config) } as never), null)
  assert.equal(duePack(at('2026-11-01T08:00:00Z'), config, null), null, 'Sunday')
  assert.equal(iso(nextPackAt(at('2026-10-31T08:00:00Z'), config)), '2026-11-02T06:45:00.000Z', 'Saturday after the pack: Monday')
  assert.equal(iso(nextPackAt(at('2026-07-15T03:00:00Z'), config)), '2026-07-15T05:45:00.000Z', 'summer time: 05:45 UTC')
  assert.equal(readConfig({ BRIEFING_PACK: 'off' }).config.pack.enabled, false)
})

test('the cron brings the alarm to the pack: now when one is due, else its next time; nothing when it is off', async () => {
  const h = deps({}, '2026-10-28T06:00:00Z')
  assert.equal(iso(packWake(h.d.store, h.d.config, h.clock.now)!), '2026-10-28T06:45:00.000Z')
  h.clock.now = at('2026-10-28T06:45:00Z')
  assert.equal(packWake(h.d.store, h.d.config, h.clock.now), h.clock.now)
  await packTick(h.d)
  assert.equal(packWake(h.d.store, h.d.config, h.clock.now), h.clock.now, 'half made')
  await packTick(h.d)
  assert.equal(iso(packWake(h.d.store, h.d.config, h.clock.now)!), '2026-10-29T06:45:00.000Z', 'made: the next morning')
  assert.equal(packWake(h.d.store, readConfig({ BRIEFING_PACK: 'off' }).config, h.clock.now), null)
})

test('the channels that failed overnight are named, only those of the pack', () => {
  const { config } = readConfig({})
  const text = packText({ id: '2026-10-28', from: at('2026-10-27T18:00:00Z'), to: at('2026-10-28T06:45:00Z'), startedAt: 0, calendar: [],
    stats: { total: 0, noDate: 0, outside: 0, future: 0, otherSource: 0, routine: 0, inWindow: 0, groups: 0,
      feedProblems: ['GPW:PRASA', 'SEEKINGALPHA:MARKET CURRENTS', 'MACRONEXT:MAKRO'] } }, [], config, at('2026-10-28T06:45:00Z'))
  assert.match(text, /Kanały z błędami w nocy \(w materiale może czegoś brakować\): GPW · PRASA, MACRONEXT · MAKRO\./)
})

test('its settings\' problems are its own: a wrong one does not stop an edition', () => {
  const { config, problems } = readConfig({ BRIEFING_PACK: 'maybe', BRIEFING_PACK_AT: '13:00' })
  assert.deepEqual(problems, [])
  assert.ok(config.pack.problems.some((p) => p.startsWith('BRIEFING_PACK: expected')))
  assert.ok(config.pack.problems.some((p) => p.startsWith('BRIEFING_PACK_AT')))
  assert.equal(config.pack.enabled, true)
})

test('at 07:45: the news from 19:00 the evening before to 07:45, the day\'s calendars, the task; in two steps, once a day', async () => {
  const h = deps()
  const wakes = await runUntil(h, '2026-10-28T23:00:00Z')
  assert.equal(iso(wakes[0]), '2026-10-28T06:45:00.000Z', 'it waits for its time')
  assert.equal(h.d.store.getPack('work'), null)
  const p = packOf(h.d.store)!
  assert.equal(p.id, '2026-10-28')
  const text = p.text
  assert.match(text, /^# Poranny przegląd rynków: środa, 28 października 2026\n/)
  assert.match(text, /Wiadomości opublikowane od 27 października, 19:00, do 28 października, 07:45 \(czas polski\)/)
  assert.match(text, /Złożone automatycznie 28 października, 07:45\./)
  // the news: the window's, in its sources, an English item with its Polish translation; MacroNext's announcements and Seeking Alpha are not news
  assert.match(text, /Fed utrzymuje stopy na poziomie 3,75%–4,00%/)
  assert.match(text, /Nikkei zyskuje 1,2 proc\./)
  assert.match(text, /Orlen: szacunkowe wyniki/, 'news after 07:00 and before 07:45 are in')
  assert.doesNotMatch(text, /TOO EARLY|declares dividend|Za 10 minut o godzinie 8:00/)
  assert.match(text, /3 najważniejsze historie z 3 wiadomości/)
  // the calendars: the morning ones of the day, every row, in their order
  const macro = text.indexOf('### Dziś w kalendarium makro'), gpw = text.indexOf('### Dziś na giełdzie GPW')
  assert.ok(macro > 0 && gpw > macro)
  assert.match(text, /- 14:30 USA: PKB \(k\/k\), konsensus 2,8%, poprzednio 3,0%\n- 19:00 USA: decyzja Fed/)
  // the task: the pipeline's rules, the greeting with the window said in words, the sources to give
  assert.match(text, /## Zadanie/)
  assert.match(text, /„Dzień dobry\. Jest środa, dwudziesty ósmy października\. Oto poranny przegląd rynków: najważniejsze wiadomości od wczoraj, od godziny dziewiętnastej, do dziś do godziny siódmej czterdzieści pięć\.”/)
  assert.match(text, /co najmniej 2 niezależnych źródłach/)
  assert.match(text, /na około 5–6 minut \(650–800 słów\)/)
  // the voice of a radio newsroom: whole stories with their causes, and what is not confirmed said so, not left out
  assert.match(text, /Jesteś redaktorem serwisu informacyjnego w stacji radiowej/)
  assert.match(text, /Przygotuj poranny przegląd rynków po polsku jako scenariusz dla słuchaczy, a nie listę nagłówków i liczb/)
  assert.match(text, /Poziom pewności decyduje o tym, jak historię podasz, a nie czy ją podasz/)
  assert.match(text, /Potwierdzoną w co najmniej 2 niezależnych źródłach opowiedz jako fakt/)
  assert.match(text, /z przypisaniem \(„według Financial Times”\)/)
  assert.match(text, /„według niepotwierdzonych doniesień”, „na rynku spekuluje się”/)
  assert.match(text, /Pomiń historię tylko wtedy, gdy nie ma dla niej żadnego nazwanego źródła albo jej sedno wydarzyło się ponad 36 godzin temu/)
  assert.match(text, /Plotka albo niepotwierdzone doniesienie, które mogło ruszyć notowaniami .* to też historia, ale podana jako niepotwierdzona/)
  assert.match(text, /Wybierz od 6 do 8 osobnych historii/)
  // the style of a script for listeners, the four questions every story answers, the numbers kept to what explains the scale
  assert.match(text, /scenariusz dla słuchaczy, a nie listę nagłówków i liczb/)
  assert.match(text, /Zakładaj, że słuchacz nie widzi wykresu/)
  assert.match(text, /Skróty i terminy techniczne wyjaśnij przy pierwszym użyciu zwykłymi słowami/)
  assert.match(text, /Bez sensacji, sztucznego dramatyzmu i waty słownej/)
  assert.match(text, /Każda historia \(około 80–120 słów\) prowadzi słuchacza przez cztery pytania, w tej kolejności:\n {7}- Co się stało\? Konkretne wydarzenie, data i, gdy ma to znaczenie, godzina\.\n {7}- Co za tym stało\? Potwierdzony powód/)
  assert.match(text, /- Jak zareagowały rynki\? Skala ruchu i odpowiednie porównanie; odróżnij ruch indeksu od ruchu pojedynczej spółki lub sektora\./)
  assert.match(text, /- Dlaczego to ważne\? Krótko, co to może znaczyć dla inwestorów, firm, konsumentów albo najbliższych sesji\./)
  assert.match(text, /Liczby oszczędnie: podawaj je tylko tam, gdzie pomagają zrozumieć skalę lub znaczenie wydarzenia, z porównaniem i, gdy to ważne, z godziną pomiaru/)
  // facts apart from interpretation; what is behind a move of the market; records; causes
  assert.match(text, /Oddzielaj fakty od interpretacji\. Najpierw ustal, co potwierdza spółka, instytucja albo dokument pierwotny/)
  assert.match(text, /Ruchy rynku: szukaj, co za nimi stało, zamiast poprzestawać na „Nasdaq spadł”\. Ustal, czy spadek albo wzrost był szeroki, czy skupiony/)
  assert.match(text, /sam spadek jej kursu tego samego dnia tego nie dowodzi/)
  assert.match(text, /Rekordy i porównania \(„największy spadek od 1974 roku”\): ustal, czego dokładnie dotyczą: zmiany procentowej czy kwotowej, kursu zamknięcia czy notowań w trakcie sesji/)
  assert.match(text, /nie przypisuj przyczyny tylko dlatego, że coś wydarzyło się w tym samym czasie\. Gdy źródła nie wskazują wyraźnej przyczyny, powiedz to wprost/)
  assert.match(text, /Spekulacji nigdy nie podawaj jako ustalonej przyczyny/)
  assert.match(text, /powiedz słuchaczowi, że to jedno źródło/)
  assert.match(text, /w trybie przypuszczającym: „według analityków”, „jak pisze Financial Times”, „według Axios”, „na rynku spekuluje się, że”/)
  assert.match(text, /Fakt mów jako fakt, hipotezę jako hipotezę i nie mieszaj ich\. Nie wymyślaj liczb, cytatów, nazwisk ani źródeł/)
  assert.match(text, /Nie dawaj rekomendacji inwestycyjnych/)
  assert.match(text, /Długość: docelowo 650–800 słów, około 5–6 minut czytania na głos\. Policz słowa\. Jeśli brakuje zweryfikowanych informacji, skróć tekst zamiast wypełniać go spekulacją: krótszy tekst jest lepszy niż uzupełniony domysłami\./)
  assert.match(text, /Zanim jednak skrócisz, dodaj historie z jednego źródła albo niepotwierdzone, podane z przypisaniem/)
  // the work in four roles (agents), whatever the model can do
  assert.match(text, /Sposób pracy\. Jeśli możesz, uruchom osobnych agentów i daj każdemu jedno zadanie; jeśli nie możesz, wykonaj te cztery etapy kolejno/)
  assert.match(text, /- Agent zbierający informacje: wykonuje punkty 1, 3 i 4/)
  assert.match(text, /- Agent redagujący informacje: z tej listy układa historie i pisze scenariusz według punktów 5 i 6/)
  assert.match(text, /- Agent sprawdzający informacje: bierze tekst i listę z linkami i porównuje każde zdanie z liczbami, nazwiskami, godzinami, przypisaniami i przyczynami ze źródłami/)
  assert.match(text, /- Agent sprawdzający tekst: sprawdza i poprawia język i zasady z punktu 6: długość \(policz słowa\)/)
  assert.match(text, /Gdy słów jest za mało, a są jeszcze zweryfikowane informacje do dopisania, odsyła tekst do redagującego; gdy ich nie ma, zostawia tekst krótszy/)
  assert.match(text, /rekord opisany innym miernikiem niż w źródle, przyczynę ruchu rynku bez oparcia w źródłach/)
  assert.match(text, /W odpowiedzi nie opisuj pracy agentów: pokaż tylko to, o co prosi punkt 7\./)
  assert.ok(text.indexOf('Sposób pracy.') < text.indexOf('1. Wybór.'), 'the roles come before the steps they refer to')
  // what the first version said, and the model took literally (a text of 280 words, three stories left out): gone
  assert.doesNotMatch(text, /Nie dodawaj kontekstu, przyczyn, prognoz ani ocen/)
  assert.doesNotMatch(text, /Każde zdanie musi wynikać ze sprawdzonych źródeł/)
  assert.doesNotMatch(text, /Pomiń historię, której nie potwierdzisz/)
  assert.doesNotMatch(text, /i niepotwierdzone plotki\./)
  assert.doesNotMatch(text, /w żadnym razie nie mniej niż 400/)
  assert.doesNotMatch(text, /Każda historia to krótki materiał radiowy na 50 do 90 słów/)
  assert.doesNotMatch(text, /Wybierz od 3 do 8/)
  assert.match(text, /linki do źródeł/)
  assert.match(text, /5\. Kalendarium\. Po wiadomościach/)
  // what the material does not say, or rates too low: looked for in the news of the night, in every topic
  assert.match(text, /4\. Kompletność\. Zanim napiszesz tekst, sprawdź w sieci, o czym od wczorajszego wieczora najwięcej piszą duże serwisy finansowe/)
  assert.match(text, /nie pomijaj historii dlatego, że stoi nisko albo ma niską ocenę/)
  assert.match(text, /Nie kieruj się przy tym oceną ważności z materiału/)
  assert.match(text, /pomiń najmniej ważne z materiału/)
  assert.match(text, /7\. Odpowiedź\. Najpierw sam scenariusz do przeczytania, akapit po akapicie, bez nagłówków\. Pod nim, osobno: lista źródeł, przy każdej historii linki do źródeł, z zaznaczeniem, które historie podałeś jako niepotwierdzone albo z jednego źródła, a na końcu krótko ważne historie, które naprawdę pominąłeś, i dlaczego/)
  assert.match(text, /3\. Kryptowaluty i surowce\. Niezależnie od materiału sprawdź w sieci/)
  assert.match(text, /hack lub awaria giełdy/)
  assert.match(text, /Kryptowaluty i surowce to osobne tematy, nie dodatek/)
  // a story of several headlines lists the others
  const burst = deps({}, '2026-10-28T06:45:00Z', [...night(), item('WALTER', 'MICROSOFT 1Q REV. $92.3B, EST. $90.1B', '2026-10-27T20:05:00Z'),
    item('WALTER', 'MICROSOFT SHARES RISE 5% POST-MARKET', '2026-10-27T20:06:00Z')])
  await runUntil(burst, '2026-10-28T23:00:00Z')
  assert.match(packOf(burst.d.store)!.text, /Dalsze nagłówki tej historii:\n- MICROSOFT SHARES RISE 5% POST-MARKET\n/)
  // nothing more that day: the next wake-up is the next morning
  assert.equal(iso(await packTick(h.d) as number), '2026-10-29T06:45:00.000Z')
  assert.ok(h.logs.some((l) => /pack 2026-10-28: 3 stories of 3 news, 2 calendars/.test(l)))
})

test('the pack\'s length is its own (5 to 6 minutes, 6 to 8 stories): the paid pipeline\'s target (BRIEFING_TARGET_SECONDS) does not change it', async () => {
  const short = deps({ BRIEFING_TARGET_SECONDS: '120' }, '2026-10-28T06:44:59Z')
  await runUntil(short, '2026-10-28T23:00:00Z')
  const text = packOf(short.d.store)!.text
  assert.match(text, /na około 5–6 minut \(650–800 słów\)/)
  assert.match(text, /docelowo 650–800 słów/)
  // fewer stories allowed than the least: the least is the most
  const few = deps({ BRIEFING_MAX_STORIES: '4', BRIEFING_MAX_RESEARCH: '10' }, '2026-10-28T06:44:59Z')
  await runUntil(few, '2026-10-28T23:00:00Z')
  assert.match(packOf(few.d.store)!.text, /Wybierz od 4 do 4 osobnych historii/)
  assert.deepEqual(PACK_WORDS, [650, 800])
})

test('the morning calendars are the day\'s ones (their links end in "-rano")', () => {
  const parts = calendarOf(night(), '2026-10-28')
  assert.deepEqual(parts.map((p) => p.title), ['Dziś w kalendarium makro', 'Dziś na giełdzie GPW'])
  assert.deepEqual(parts[1].lines, ['Spółka LPP: dzień dywidendy'], 'without its list, the lead')
  assert.deepEqual(calendarOf(night(), '2026-10-29'), [])
})

test('without the calendars the task leaves that part out', async () => {
  const h = deps({}, '2026-10-28T06:45:00Z', night().filter((i) => i.source !== 'MACRONEXT'))
  await runUntil(h, '2026-10-28T23:00:00Z')
  const text = packOf(h.d.store)!.text
  assert.doesNotMatch(text, /## Kalendarium na dziś/)
  assert.match(text, /Kalendarium MacroNext na dziś nie było dostępne: pomiń tę część\./)
})

test('with the model\'s ratings: they go into the order and the text, the record and the status, and the pack says so', async () => {
  const { ai, calls } = fakeAi((t) => (/Orlen/.test(t) ? 9 : /Nikkei/.test(t) ? 1 : 6.5))
  const h = deps()
  h.d.ai = ai
  await runUntil(h, '2026-10-28T23:00:00Z')
  const text = packOf(h.d.store)!.text
  assert.equal(calls.n, 1)
  assert.match(text, /Kolejność historii ustaliły reguły automatyczne .* i ocena ważności od 0 do 10 z modelu pomocniczego, podana przy historiach\. Model ocenia sam nagłówek i bywa w błędzie w obie strony, także przy wydarzeniach bardzo ważnych .*\. Ocena to tylko wskazówka/)
  assert.match(text, /### 1\. Orlen: szacunkowe wyniki za III kwartał\nESPI · [^\n]* · ważność 9\/10\n/, 'rated high, it comes first')
  assert.match(text, / · ważność 1\/10\n/)
  assert.match(text, / · ważność 6,5\/10\n/, 'Clef\'s ratings have a decimal, written with a comma')
  const record = h.d.store.getPack('latest')!
  assert.equal(record.ranking!.mode, 'model')
  assert.equal(record.ranking!.scored, 3)
  assert.equal(packStatus(h.d).latest!.ranking!.mode, 'model')
  assert.ok(h.logs.some((l) => /pack 2026-10-28: 3 stories .* ranking: model/.test(l)))
  // by the rules alone the order is another one, and says nothing of ratings
  const plain = deps()
  await runUntil(plain, '2026-10-28T23:00:00Z')
  assert.doesNotMatch(packOf(plain.d.store)!.text, /ważność|modelu pomocniczego/)
  assert.doesNotMatch(packOf(plain.d.store)!.text, /### 1\. Orlen/)
})

test('switched off with BRIEFING_AI_RANK=off: no call, and the pack is the one the rules alone make; a failing service changes nothing either', async () => {
  const items = night() // the same news, with the same links, in every pack
  const plain = deps({}, '2026-10-28T06:44:59Z', items)
  await runUntil(plain, '2026-10-28T23:00:00Z')
  const rated = fakeAi(() => 9)
  const off = deps({ BRIEFING_AI_RANK: 'off' }, '2026-10-28T06:44:59Z', items)
  off.d.ai = rated.ai
  await runUntil(off, '2026-10-28T23:00:00Z')
  assert.equal(rated.calls.n, 0)
  assert.equal(packOf(off.d.store)!.text, packOf(plain.d.store)!.text)
  assert.equal(off.d.store.getPack('latest')!.ranking!.mode, 'rules')
  assert.match(off.d.store.getPack('latest')!.ranking!.reason!, /BRIEFING_AI_RANK=off/)
  const down = fakeAi(() => null)
  const broken = deps({}, '2026-10-28T06:44:59Z', items)
  broken.d.ai = down.ai
  await runUntil(broken, '2026-10-28T23:00:00Z')
  assert.equal(down.calls.n, 1)
  // the pack says that the ratings failed, so that it does not pass for one with them; apart from that line it is the rules' pack
  const failed = packOf(broken.d.store)!.text
  assert.match(failed, /\nOcena ważności przez model pomocniczy nie powiodła się \(too few ratings \(0 of 3\): the service is down\): kolejność historii ustaliły same reguły automatyczne\.\n/)
  assert.equal(failed.replace(/\nOcena ważności przez model pomocniczy[^\n]*\n/, ''), packOf(plain.d.store)!.text)
  assert.match(broken.d.store.getPack('latest')!.ranking!.reason!, /the service is down/)
})

// the pack without the line of the time it was made at (which is the only thing two packs of the same news differ in)
const sameNews = (text: string) => text.replace(/Złożone automatycznie [^.]*\./, '')

test('switching the ratings on or off makes today\'s pack again from the same news, up to the moment of the first one; off brings back the rules\' pack', async () => {
  const items = night()
  const { ai, calls } = fakeAi((t) => (/Orlen/.test(t) ? 9 : /Nikkei/.test(t) ? 1 : 6.5))
  const off = readConfig({ BRIEFING_AI_RANK: 'off' }).config, on = readConfig({}).config
  const h = deps({ BRIEFING_AI_RANK: 'off' }, '2026-10-28T06:45:00Z', items)
  h.d.ai = ai
  await runUntil(h, '2026-10-28T07:00:00Z') // made at 07:45 by the rules alone
  const first = h.d.store.getPack('latest')!
  assert.equal(calls.n, 0)
  assert.equal(first.rankingKey, `rules#${TASK_VERSION}`)
  assert.equal(first.to, at('2026-10-28T06:45:00Z'))
  // news that came after it was taken must not get into the remake
  items.push(item('WALTER', 'LATE: a story that came after the pack was made', '2026-10-28T07:10:00Z'))
  h.clock.now = at('2026-10-28T08:30:00Z')
  assert.equal(packWake(h.d.store, off, h.clock.now)!, at('2026-10-29T06:45:00.000Z'), 'nothing changed: the next morning')
  assert.equal(duePack(h.clock.now, off, first), null)

  // switched on: made again at once (the cron brings the wake-up), from the same window
  h.d.config = on
  assert.equal(duePack(h.clock.now, on, first), '2026-10-28')
  assert.equal(packWake(h.d.store, on, h.clock.now), h.clock.now)
  await runUntil(h, '2026-10-28T23:00:00Z')
  const rated = h.d.store.getPack('latest')!
  assert.equal(calls.n, 1)
  assert.equal(rated.ranking!.mode, 'model')
  assert.equal(rated.rankingKey, packKey(on))
  assert.equal(rated.from, first.from)
  assert.equal(rated.to, first.to)
  assert.equal(rated.stats.inWindow, first.stats.inWindow)
  assert.match(rated.text!, /ważność 9\/10/)
  assert.doesNotMatch(rated.text!, /LATE/)
  assert.match(rated.text!, /Wiadomości opublikowane od 27 października, 19:00, do 28 października, 07:45 \(czas polski\)/)
  assert.equal(h.d.store.getPack('work'), null)
  assert.equal(h.logs.filter((l) => /briefing pack/.test(l)).length, 2)
  assert.equal(iso(packWake(h.d.store, on, h.clock.now)!), '2026-10-29T06:45:00.000Z', 'once: it does not go on repeating')

  // switched off again: the rules\' pack of the same news
  h.d.config = off
  h.clock.now = at('2026-10-28T09:00:00Z')
  await runUntil(h, '2026-10-28T23:00:00Z')
  assert.equal(calls.n, 1, 'no call')
  const back = h.d.store.getPack('latest')!
  assert.equal(back.rankingKey, `rules#${TASK_VERSION}`)
  assert.equal(sameNews(back.text!), sameNews(first.text!))
  // another model or weight counts as other settings; the day\'s pack is made again
  for (const env of [{ BRIEFING_AI_RANK_MODEL: '@cf/cloudflare/clef-flash' }, { BRIEFING_AI_RANK_WEIGHT: '0.5' }, { BRIEFING_AI_RANK_POOL: '100' }]) {
    assert.equal(duePack(h.clock.now, readConfig(env).config, back), '2026-10-28', JSON.stringify(env))
  }
})

test('a new version of the task makes today\'s pack again too (the same news), once', () => {
  const { config } = readConfig({})
  const made = { id: '2026-10-28', rankingKey: `${rankingKey(config)}#2026-01-01.1` } as never
  assert.equal(duePack(at('2026-10-28T09:00:00Z'), config, made), '2026-10-28', 'made with an older task')
  assert.equal(duePack(at('2026-10-28T09:00:00Z'), config, { id: '2026-10-28', rankingKey: packKey(config) } as never), null)
  assert.equal(packKey(config), `${rankingKey(config)}#${TASK_VERSION}`)
})

test('a pack made before the ratings existed (no settings recorded) is made again once; a failed attempt is not repeated by itself', async () => {
  const items = night()
  const good = fakeAi((t) => (/Orlen/.test(t) ? 9 : 5))
  const h = deps({}, '2026-10-28T06:45:00Z', items)
  await runUntil(h, '2026-10-28T07:00:00Z') // no service: by the rules
  const old = h.d.store.getPack('latest')!
  delete old.rankingKey; delete old.ranking
  h.d.store.putPack('latest', old)
  h.clock.now = at('2026-10-28T08:30:00Z')
  assert.equal(duePack(h.clock.now, h.d.config, old), '2026-10-28')
  // the service is down: made again with the rules, and said so; not again until the settings change
  const down = fakeAi(() => null)
  h.d.ai = down.ai
  await runUntil(h, '2026-10-28T23:00:00Z')
  assert.equal(down.calls.n, 1)
  assert.match(packOf(h.d.store)!.text, /Ocena ważności przez model pomocniczy nie powiodła się/)
  assert.equal(h.d.store.getPack('latest')!.rankingKey, packKey(h.d.config))
  h.d.ai = good.ai
  h.clock.now = at('2026-10-28T10:00:00Z')
  assert.equal(iso(packWake(h.d.store, h.d.config, h.clock.now)!), '2026-10-29T06:45:00.000Z')
  await runUntil(h, '2026-10-28T23:00:00Z')
  assert.equal(good.calls.n, 0, 'it does not try again by itself')
  // another day, not due yet, or not a day of the pack: nothing is made again whatever the settings
  const other = readConfig({ BRIEFING_AI_RANK_WEIGHT: '0.5' }).config
  assert.equal(duePack(at('2026-10-29T05:00:00Z'), other, h.d.store.getPack('latest')), null, 'the next morning, before its time')
  assert.equal(duePack(at('2026-11-01T08:00:00Z'), other, h.d.store.getPack('latest')), null, 'Sunday')
})

test('the news rated as they came in (the list\'s ratings, the "Top" tab): the pack takes their ratings, with no request of its own', async () => {
  const rated = night().map((it) => (it.source === 'MACRONEXT' ? it : { ...it, ai: /Orlen/.test(it.title) ? 9 : /Nikkei/.test(it.title) ? 2 : 5 }))
  const h = deps({}, '2026-10-28T06:44:59Z', rated) // no Workers AI at all
  await runUntil(h, '2026-10-28T23:00:00Z')
  const record = h.d.store.getPack('latest')!
  assert.equal(record.ranking!.mode, 'model')
  assert.equal(record.ranking!.calls, 0)
  assert.equal(record.ranking!.fromList, 3)
  assert.match(record.text!, /### 1\. Orlen: szacunkowe wyniki za III kwartał\nESPI · [^\n]* · ważność 9\/10\n/)
  assert.match(record.text!, /Kolejność historii ustaliły reguły automatyczne/)
})

test('the pack off: nothing is made, no wake-up', async () => {
  const h = deps({ BRIEFING_PACK: 'off' }, '2026-10-28T06:45:00Z')
  assert.equal(await packTick(h.d), null)
  assert.equal(packOf(h.d.store), null)
})

test('/api/briefing/pack.md: the text as Markdown, not cached, not indexed; 404 before the first one', async () => {
  const make = (pack: unknown) => ({ BRIEFING: { idFromName: () => 'id', get: () => ({ pack: async () => pack }) } }) as unknown as Env
  const call = (e: Env, init: RequestInit = {}) => briefingApi(new Request('https://szczekaczka.example/api/briefing/pack.md', init), e,
    new URL('https://szczekaczka.example/api/briefing/pack.md'), { Vary: 'Origin' })
  const r = await call(make({ id: '2026-10-28', builtAt: at('2026-10-28T06:45:01Z'), text: '# Poranny przegląd rynków\n' }))
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('content-type'), 'text/markdown; charset=utf-8')
  assert.equal(r.headers.get('cache-control'), 'no-cache')
  assert.match(r.headers.get('x-robots-tag')!, /noindex/)
  assert.equal(r.headers.get('last-modified'), 'Wed, 28 Oct 2026 06:45:01 GMT')
  assert.equal(await r.text(), '# Poranny przegląd rynków\n')
  assert.equal((await call(make(null))).status, 404)
  assert.equal((await call(make(null), { method: 'POST' })).status, 405)
})
