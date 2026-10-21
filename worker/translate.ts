// Posts of a channel in English (FeedConfig.translate: Walter Bloomberg, Seeking Alpha) in Polish: each post is translated once on the
// server with Workers AI and kept beside the original (NewsItem.pl). The page shows the translation unless the reader
// chose the original (prefs.originalFeeds), and reads it with the Polish voice and the rules of say.ts.
import type { NewsItem } from '../src/lib/parse'
import { fixOrdinals } from '../src/lib/ordinals'
import { fixRatings } from '../src/lib/ratings'
import type { CheckResult } from './feeds'

export const MODEL = '@cf/google/gemma-4-26b-a4b-it'
// The free plan has 10,000 neurons a day (reset at 0:00 UTC). One post costs about 8 (≈800 tokens in, ≈60 out); the
// channel has 40–150 posts a day. At most this many a day, so that a burst or an edited post never uses up the allocation.
export const PER_DAY = 400
const PER_CHECK = 10 // the rest at the next check (right after a deploy the page has ~20 posts without a translation)
const PARALLEL = 5
const TIMEOUT_MS = 15_000
// After an error of the service (no capacity, the day's allocation used up): no translations for this long
export const PAUSE_MS = 10 * 60_000

const SYSTEM = `Tłumaczysz na język polski krótkie wiadomości z rynków finansowych (kanał Walter Bloomberg na Telegramie, serwis Seeking Alpha). Piszesz jak polski serwis finansowy (PAP Biznes, Bankier.pl): zwięźle i rzeczowo.
Zasady:
- Tłumacz wiernie: nic nie dodawaj, niczego nie pomijaj, nie komentuj i nie wyjaśniaj.
- Pisz zwykłą pisownią, nie wielkimi literami: wielka litera na początku zdania i w nazwach własnych. Skróty zostają wielkimi literami (USA, CPI, PKB, EBC). Oznaczenia spółek z giełdą w nawiasie, np. (NYSE:FMC), zostaw bez zmian.
- Tickery (np. $NVDA) oraz nazwy spółek, funduszy i osób zostaw w oryginalnej pisowni; nazwy spółek możesz odmieniać (akcje Nvidii). Instytucje z przyjętą polską nazwą nazywaj po polsku: Fed, EBC, Bank Japonii, Biały Dom, Departament Skarbu USA, Kongres.
- Liczby po polsku: przecinek dziesiętny (0.3% → 0,3%); B lub BLN → mld, M lub MLN → mln, T lub TLN → bln, K → tys., BPS → pb; M/M → m/m, Y/Y → r/r, Q/Q → k/k. Kwoty w dolarach: $5B → 5 mld USD.
- EST. lub EXP. (prognoza rynku) → „prognoza”, PREV. lub PRIOR → „poprzednio”.
- Liczebniki porządkowe pisz poprawnie po polsku i odmieniaj je przez przypadki: seventh straight session → siódma sesja z rzędu (w siódmej sesji z rzędu), eighth → ósmy, fifth → piąty, 10th → dziesiąty.
- Rekomendacje analityków tłumacz tak jak polskie domy maklerskie, małymi literami w cudzysłowie „…”: Buy → „kupuj”, Strong Buy → „zdecydowanie kupuj”, Accumulate/Add → „akumuluj”, Hold → „trzymaj”, Neutral → „neutralnie”, Reduce → „redukuj”, Sell → „sprzedaj”, Strong Sell → „zdecydowanie sprzedaj”, Overweight → „przeważaj”, Equal-weight/Market Weight → „neutralnie”, Underweight → „niedoważaj”, Outperform → „lepiej niż rynek”, Market Perform/In-Line → „zgodnie z rynkiem”, Underperform → „gorzej niż rynek”, Sector Perform → „zgodnie z sektorem”. Nigdy dosłownie („ponad wagę”, „nadwaga”, „równa waga”). Upgrade → podnosi rekomendację, downgrade → obniża rekomendację, initiates at Buy → rozpoczyna wydawanie rekomendacji od „kupuj”, reiterates/maintains → podtrzymuje, PT/price target → cena docelowa.
- Overweight, underweight i trim jako działanie inwestorów: przeważają, niedoważają, redukują (fundusze przeważają akcje, redukują pozycję w obligacjach).
- Zachowaj układ: pierwsza linia to tytuł, kolejne linie (jeśli są) to dalszy ciąg; odpowiedz w tym samym układzie.
- Znaki „*” i „-” na początku linii (punkty listy) zostaw na swoim miejscu.
- Odpowiedz wyłącznie tłumaczeniem, bez cudzysłowów i bez dopisków.`

const EXAMPLES: [en: string, pl: string][] = [
  ['$NVDA - NVIDIA SHARES RISE 3% IN PREMARKET AFTER CHINA APPROVAL', '$NVDA - Akcje Nvidii rosną o 3% przed sesją po zgodzie Chin'],
  ['US CPI RISES 0.3% M/M; EST. 0.2%\n- CORE CPI 3.1% Y/Y; EST. 3.0%', 'CPI w USA wzrósł o 0,3% m/m; prognoza 0,2%\n- Inflacja bazowa 3,1% r/r; prognoza 3,0%'],
  ["FED'S WALLER: RATE CUTS SHOULD BE GRADUAL", 'Waller z Fed: obniżki stóp powinny być stopniowe'],
  ['FMC downgraded at Jefferies as visibility deteriorates again with guidance cut\nJefferies cut FMC (NYSE:FMC) to Hold from Buy and lowered its price target to $20 from $35.', 'Jefferies obniża rekomendację FMC: widoczność znów się pogarsza po cięciu prognoz\nJefferies obniżył rekomendację dla FMC (NYSE:FMC) do „trzymaj” z „kupuj” i zmniejszył cenę docelową do 20 USD z 35 USD.'],
  ['TRUMP: WE WILL IMPOSE 25% TARIFFS ON $50B OF CHINESE IMPORTS', 'Trump: nałożymy 25% cła na import z Chin o wartości 50 mld USD'],
  ['Coca-Cola shares rise for a seventh straight session as investors favor defensive stocks', 'Akcje Coca-Coli rosną siódmą sesję z rzędu, bo inwestorzy wybierają spółki defensywne'],
  ['$NVDA - MORGAN STANLEY UPGRADES NVIDIA TO OVERWEIGHT FROM EQUAL-WEIGHT; PT $250', '$NVDA - Morgan Stanley podnosi rekomendację dla Nvidii do „przeważaj” z „neutralnie”; cena docelowa 250 USD'],
  ['Barclays cuts Tesla to Underweight, sees Outperform rating at peers unjustified', 'Barclays obniża rekomendację dla Tesli do „niedoważaj”, rekomendacje „lepiej niż rynek” dla konkurentów uważa za nieuzasadnione'],
]

type Text = { title: string; description: string; body?: string }

// What the model is given: the title, and the lead on the next line; a post with lines (a list) in the lines it has them, so that the translation keeps them
export const sourceText = (it: Text) => (it.body ? `${it.title}\n${it.body}` : it.description ? `${it.title}\n${it.description}` : it.title)

// The model's answer as a title and a lead, or null when it is not a translation (empty, or far longer than the post)
export function readTranslation(out: string | null | undefined, src: Text): Text | null {
  const text = fixRatings(fixOrdinals((out ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^\s*(?:tłumaczenie|translation)\s*:\s*/i, '').replace(/\*\*/g, '').trim()))
  const lines = text.split(/\n+/).map((l) => l.trim().replace(/^["„“](.*)["”“]$/, '$1').trim()).filter(Boolean)
  if (lines.length === 0) return null
  // a post without a lead is one title, however the answer is cut
  const [title, ...rest] = src.description ? lines : [lines.join(' ')]
  const description = rest.join(' ')
  if (title.length + description.length > 3 * (src.title.length + src.description.length) + 200) return null
  // The lines of the lead go on being lines where the post had them
  return { title, description, ...(src.body && rest.length > 1 ? { body: rest.join('\n') } : {}) }
}

type Done = { pl?: Text | null; error?: string; tokensIn: number; tokensOut: number }

async function translateOne(ai: Ai, it: Text): Promise<Done> {
  try {
    const res = await ai.run(MODEL, {
      messages: [
        { role: 'system', content: SYSTEM },
        ...EXAMPLES.flatMap(([en, pl]) => [{ role: 'user' as const, content: en }, { role: 'assistant' as const, content: pl }]),
        { role: 'user', content: sourceText(it) },
      ],
      max_tokens: 400,
      temperature: 0.2,
      // Gemma 4 thinks before answering unless told not to: many more tokens, and an empty answer when they run out
      chat_template_kwargs: { enable_thinking: false },
    }, { signal: AbortSignal.timeout(TIMEOUT_MS), tags: ['translate'] })
    const answer = res.choices?.[0]?.message?.content
    const pl = readTranslation(answer, it)
    const used = { tokensIn: res.usage?.prompt_tokens ?? 0, tokensOut: res.usage?.completion_tokens ?? 0 }
    // An answer that is not a translation: the post is left in English for good (null), not asked again at every check
    return pl ? { pl, ...used } : { pl: null, error: `not a translation: ${JSON.stringify((answer ?? '').slice(0, 120))}`, ...used }
  } catch (e) {
    return { error: String((e as Error)?.message ?? e).slice(0, 200), tokensIn: 0, tokensOut: 0 }
  }
}

// `n` at a time; after a failure (`stop`) the rest is not started: the poller waits for this, and other channels with it
async function inTurns<T, R>(list: T[], n: number, f: (x: T) => Promise<R>, stop: (r: R) => boolean): Promise<(R | undefined)[]> {
  const out: (R | undefined)[] = new Array(list.length).fill(undefined)
  let next = 0, stopped = false
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (next < list.length && !stopped) {
      const i = next++
      out[i] = await f(list[i])
      if (stop(out[i]!)) stopped = true
    }
  }))
  return out
}

// Translates the posts on the channel's page that have no translation yet, newest first, and adds them to the check's
// result: the new posts go out already translated, and an older one translated now goes out again, with its translation.
// Returns a line for the logs, or nothing when there was nothing to do.
export async function translateNew(ai: Ai, r: CheckResult, now: number): Promise<string | undefined> {
  const s = r.state
  if ((s.ai?.retryAt ?? 0) > now) return
  const day = new Date(now).toISOString().slice(0, 10)
  const used = s.ai?.day === day ? s.ai.n : 0
  const onPage = new Set(s.current ?? [])
  const todo = s.items.filter((i) => i.pl === undefined && onPage.has(i.id)).slice(0, Math.max(0, Math.min(PER_CHECK, PER_DAY - used)))
  if (todo.length === 0) return used >= PER_DAY ? `translations: the limit of ${PER_DAY} a day is reached` : undefined

  const results = await inTurns(todo, PARALLEL, (it) => translateOne(ai, it), (res) => res.pl === undefined)
  const done = new Map<string, NewsItem>()
  const errors: string[] = []
  let tokensIn = 0, tokensOut = 0, failed = 0, asked = 0
  results.forEach((res, i) => {
    if (!res) return // not asked: the service had failed
    asked++
    tokensIn += res.tokensIn; tokensOut += res.tokensOut
    if (res.error) errors.push(res.error)
    if (res.pl === undefined) failed++
    else done.set(todo[i].id, { ...todo[i], pl: res.pl })
  })

  s.items = s.items.map((i) => done.get(i.id) ?? i)
  const added = new Set(r.add.map((i) => i.id))
  r.add = [...r.add.map((i) => done.get(i.id) ?? i), ...[...done.values()].filter((i) => !added.has(i.id))]
  s.ai = { day, n: used + asked, ...(failed ? { retryAt: now + PAUSE_MS } : {}) }
  if (done.size) r.changed = true
  else r.dirty = true // only the count and the pause changed: saved, nothing sent
  const translated = [...done.values()].filter((i) => i.pl).length
  return `translated ${translated}/${asked} (${tokensIn} tokens in, ${tokensOut} out; ${s.ai.n} today)` +
    (failed ? `, ${failed} failed: paused ${PAUSE_MS / 60_000} min` : '') + (errors.length ? ` | ${errors[0]}` : '')
}
