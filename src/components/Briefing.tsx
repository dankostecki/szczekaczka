'use client'

// The morning briefing (/poranek): today's state, the edition with its player, times, text and sources, and the editions
// before it. Everything from the Worker (/api/briefing…, worker/briefing/api.ts); the audio straight from its address.
import { useCallback, useEffect, useState } from 'react'
import type { BriefingIndex, BriefingSource, PublicEdition } from '@/lib/briefing'
import { isEditionId } from '@/lib/briefing'
import { API_ORIGIN } from '@/lib/site'

const warsaw = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', ...o })
const DAY = warsaw({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const SHORT = warsaw({ day: 'numeric', month: 'long' })
const WEEKDAY = warsaw({ weekday: 'long' })
const CLOCK = warsaw({ hour: 'numeric', minute: '2-digit', hourCycle: 'h23' })
const STAMP = warsaw({ day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' })
// "od wtorku", "do środy"
const GENITIVE: Record<string, string> = { poniedziałek: 'poniedziałku', wtorek: 'wtorku', środa: 'środy', czwartek: 'czwartku', piątek: 'piątku', sobota: 'soboty', niedziela: 'niedzieli' }

const noon = (id: string) => new Date(`${id}T11:00:00Z`) // the middle of that Polish day, whatever the season
const dayOf = (id: string) => DAY.format(noon(id))
const clock = (iso: string) => CLOCK.format(new Date(iso))
const weekdayOf = (iso: string) => GENITIVE[WEEKDAY.format(new Date(iso))] ?? WEEKDAY.format(new Date(iso))
function duration(seconds: number): string {
  const s = Math.round(seconds), m = Math.floor(s / 60)
  return m ? `${m} min${s % 60 ? ` ${s % 60} s` : ''}` : `${s} s`
}
const safeUrl = (u: string) => /^https:\/\//.test(u)
const DAYS = ['poniedziałki', 'wtorki', 'środy', 'czwartki', 'piątki', 'soboty', 'niedziele']
function daysText(days: number[]): string {
  const key = days.join(',')
  if (key === '1,2,3,4,5,6,7') return 'codziennie'
  if (key === '1,2,3,4,5,6') return 'od poniedziałku do soboty'
  if (key === '1,2,3,4,5') return 'od poniedziałku do piątku'
  const names = days.map((d) => DAYS[d - 1]).filter(Boolean)
  return names.length > 1 ? `w ${names.slice(0, -1).join(', ')} i ${names.at(-1)}` : `w ${names[0] ?? ''}`
}
const about = (seconds: number) => { const m = Math.round(seconds / 60); return m <= 1 ? 'minutę' : m < 5 ? `${['', '', 'dwie', 'trzy', 'cztery'][m]} minuty` : `${m} minut` }

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; index: BriefingIndex; edition: PublicEdition | null; missing: string | null } // missing: the edition asked for that is not there

async function getJson<T>(path: string): Promise<T | null> {
  const res = await fetch(`${API_ORIGIN}${path}`, { cache: 'no-cache' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(String(res.status))
  return await res.json() as T
}

const wanted = () => { const id = new URLSearchParams(window.location.search).get('wydanie'); return id && isEditionId(id) ? id : null }

export default function Briefing() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [chosen, setChosen] = useState<string | null>(null)

  const load = useCallback(async (id: string | null) => {
    setState((s) => (s.kind === 'ready' ? s : { kind: 'loading' }))
    try {
      const index = await getJson<BriefingIndex>('/api/briefing')
      if (!index) throw new Error('404')
      const pick = id ?? index.editions[0]?.id ?? null
      const edition = pick ? await getJson<PublicEdition>(`/api/briefing/editions/${pick}`) : null
      setState({ kind: 'ready', index, edition, missing: id && !edition ? id : null })
    } catch {
      setState({ kind: 'error' })
    }
  }, [])

  useEffect(() => {
    const id = wanted()
    setChosen(id)
    void load(id)
    const onPop = () => { const next = wanted(); setChosen(next); void load(next) }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [load])

  function open(id: string | null) {
    window.history.pushState(null, '', id ? `?wydanie=${id}` : window.location.pathname)
    setChosen(id)
    window.scrollTo({ top: 0 })
    void load(id)
  }

  if (state.kind === 'loading') {
    return <div aria-busy="true" aria-label="Wczytuję przegląd">{[0, 1, 2].map((i) => <div key={i} className="skeleton" />)}</div>
  }
  if (state.kind === 'error') {
    return (
      <div className="briefing-status" role="alert">
        <span>Nie udało się pobrać przeglądu. Sprawdź połączenie z internetem.</span>
        <button className="btn" onClick={() => void load(chosen)}>Spróbuj ponownie</button>
      </div>
    )
  }

  const { index, edition, missing } = state
  const today = index.today
  const showingToday = edition?.id === today.id
  const status = chosen ? null : todayNote(today.state, today.publishAt, !!edition && !showingToday)
  const others = index.editions.filter((e) => e.id !== edition?.id)

  return (
    <>
      <p className="briefing-lead">
        Najważniejsze informacje z rynków od wieczora do rana, do wysłuchania w około {about(index.schedule.seconds)}. Nowe wydanie o {clock(today.publishAt)}, {daysText(index.schedule.days)}.
      </p>
      {status && <div className="briefing-status" role="status">{status}</div>}
      {missing && <div className="briefing-status" role="status">Nie ma wydania z {SHORT.format(noon(missing))}. <button className="btn" onClick={() => open(null)}>Pokaż najnowsze</button></div>}
      {edition && <Edition edition={edition} />}
      {!edition && !status && !missing && <p className="briefing-status" role="status">Przegląd jeszcze się nie ukazał.</p>}
      {others.length > 0 && (
        <section className="briefing-past" aria-labelledby="briefing-past">
          <h2 id="briefing-past">{edition ? 'Inne wydania' : 'Wydania'}</h2>
          <ul>
            {others.map((e) => (
              <li key={e.id}>
                <a href={`?wydanie=${e.id}`} onClick={(ev) => { ev.preventDefault(); open(e.id) }}>{dayOf(e.id)}</a>
                <span> · {duration(e.seconds)}{e.test ? ' · testowe' : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {chosen && edition && !showingToday && <p><button className="btn" onClick={() => open(null)}>Najnowsze wydanie</button></p>}
    </>
  )
}

function todayNote(state: BriefingIndex['today']['state'], publishAt: string, earlier: boolean): string | null {
  const at = clock(publishAt)
  const below = earlier ? ' Poniżej poprzednie wydanie.' : ''
  switch (state) {
    case 'scheduled': return `Dzisiejszy przegląd ukaże się o ${at}.${below}`
    case 'preparing': return `Dzisiejszy przegląd jest w przygotowaniu i ukaże się o ${at}.${below}`
    case 'delayed': return `Dzisiejszy przegląd się opóźnia.${below}`
    case 'failed': return `Dzisiejszy przegląd się nie ukazał.${earlier ? ' Poniżej ostatnie wydanie.' : ''}`
    default: return null
  }
}

function Edition({ edition: e }: { edition: PublicEdition }) {
  const day = dayOf(e.id)
  return (
    <section className="briefing-edition" aria-labelledby="briefing-day">
      <h2 id="briefing-day">{day.charAt(0).toUpperCase() + day.slice(1)}</h2>
      {e.test && <p className="briefing-status test">Wydanie testowe: jego treść nie jest prawdziwym przeglądem.</p>}
      <audio className="briefing-audio" controls preload="metadata" src={`${API_ORIGIN}${e.audio.url}`} aria-label={`Nagranie przeglądu, ${day}`}>
        <a href={`${API_ORIGIN}${e.audio.url}`}>Pobierz nagranie</a>
      </audio>
      <p className="briefing-meta"><span>{duration(e.audio.seconds)}</span><span>Głos wygenerowany przez sztuczną inteligencję</span></p>
      <dl className="briefing-times">
        <div><dt>Obejmuje</dt><dd>wiadomości od {weekdayOf(e.window.from)}, godz. {clock(e.window.from)}, do {weekdayOf(e.cutoff)}, godz. {clock(e.cutoff)}</dd></div>
        <div><dt>Przygotowano</dt><dd>{clock(e.generatedAt)}</dd></div>
        {e.publishedAt && <div><dt>Opublikowano</dt><dd>{clock(e.publishedAt)}{e.late ? ' (z opóźnieniem)' : ''}</dd></div>}
      </dl>
      <div className="briefing-text">
        <p>{e.intro}</p>
        {e.stories.map((s) => (
          <article key={s.id} className="briefing-story">
            <h3>{s.headline}</h3>
            <p>{s.text}</p>
            {s.sources.length > 0 && (
              <div className="briefing-sources">
                <span>Źródła:</span>
                <ul>{s.sources.filter((src) => safeUrl(src.url)).map((src) => <Source key={src.url} source={src} />)}</ul>
              </div>
            )}
          </article>
        ))}
        <p>{e.outro}</p>
      </div>
      <p className="briefing-disclaimer">
        Przegląd przygotowuje automatycznie sztuczna inteligencja na podstawie informacji potwierdzonych w co najmniej dwóch niezależnych źródłach,
        a głos jest syntetyczny. Mimo kontroli mogą się zdarzyć błędy: sprawdź źródła przed decyzją. To nie jest rekomendacja inwestycyjna.
      </p>
    </section>
  )
}

function Source({ source: s }: { source: BriefingSource }) {
  const when = s.publishedAt ? STAMP.format(new Date(s.publishedAt)) : null
  const updated = s.modifiedAt && s.modifiedAt !== s.publishedAt ? STAMP.format(new Date(s.modifiedAt)) : null
  return (
    <li>
      <a href={s.url} target="_blank" rel="noopener noreferrer nofollow">{s.publisher}: {s.title}</a>
      {(when || updated) && <span className="briefing-when">{when ? ` · ${when}` : ''}{updated ? ` (aktualizacja ${updated})` : ''}</span>}
    </li>
  )
}
