'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SOURCES, labelsOf, renamedId, renamedItem, type Source } from '@/lib/sources'
import type { NewsItem } from '@/lib/parse'
import { type Item, type FeedError, freshItems, keyOf, dayKey, dayLabel, clock, withTime } from '@/lib/news'
import { connectLive, type LiveStatus } from '@/lib/live'
import { type Prefs, DEFAULT_PREFS, loadPrefs, savePrefs, loadJson, saveJson, watchMatcher } from '@/lib/prefs'
import { speechSupported, speak, speakItem, announce, stopSpeaking } from '@/lib/speech'
import { notifyPermission, requestNotifyPermission, notifyHeadlines, testNotification } from '@/lib/notify'
import { useWakeLock } from '@/lib/wakeLock'
import { AUTHOR } from '@/lib/site'
import NewsRow from './NewsRow'
import Settings from './Settings'
import PrivacyNotice from './PrivacyNotice'
import { SiteFooter } from './LegalPage'
import { Megaphone, Speaker, Bell, Refresh, Sun, Moon, Gear, Search, Close, Star } from './Icons'

const READ_KEY  = 'szczekaczka:read'
const SAVED_KEY = 'szczekaczka:saved'
const MAX_READ  = 5000
const FRESH_MS  = 10 * 60_000 // how long a new headline keeps its NOWE badge
const TITLE = 'Szczekaczka'

type Filter = 'ALL' | Source | 'SAVED'
const FILTERS: Filter[] = ['ALL', ...SOURCES, 'SAVED']
const filterName = (f: Filter) => (f === 'ALL' ? 'Wszystko' : f === 'SAVED' ? 'Zapisane' : f)
const filterColor = (f: Filter) => (f === 'ALL' || f === 'SAVED' ? undefined : `var(--src-${f.toLowerCase()})`)

// A source tab (or one of its channels) with nothing on it: why. Its channels are shown,
// or the tab would not be there; errors are named "CNBC · WYNIKI".
function emptyTab(src: Source, label: string | null, errors: FeedError[]): string {
  const name = label ? `${src} · ${label}` : src
  const failing = errors.filter((e) => (label ? e.feed === name : e.feed.startsWith(`${src} · `)))
  if (src === 'MACRONEXT') return failing.length
    ? 'Nie udało się pobrać kalendarium MacroNext (powód w ramce wyżej). Kolejna próba za chwilę.'
    : 'Na razie brak zapowiedzi. Zapowiedzi danych makro z kalendarium MacroNext pojawiają się tu 10 minut przed publikacją.'
  return failing.length
    ? `Nie udało się pobrać newsów z ${name} (powód w ramce wyżej). Kolejna próba za chwilę.`
    : `Na razie brak newsów z ${name}.`
}

// Read and saved news of a renamed channel get its new ids, saved back once
function moved<T>(key: string, list: T[], rename: (x: T) => T): T[] {
  const out = list.map(rename)
  if (out.some((x, i) => x !== list[i])) saveJson(key, out)
  return out
}

export default function App() {
  const [items,     setItems]     = useState<Item[]>([])
  const [errors,    setErrors]    = useState<FeedError[]>([])
  const [loading,   setLoading]   = useState(false) // the refresh button is fetching the whole list
  const [loaded,    setLoaded]    = useState(false)
  const [status,    setStatus]    = useState<LiveStatus>('connecting')
  const [online,    setOnline]    = useState<number | null>(null) // pages connected right now, all users
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [prefs,     setPrefs]     = useState<Prefs>(DEFAULT_PREFS)
  const [ready,     setReady]     = useState(false) // prefs restored from this browser
  const [voiceOn,   setVoiceOn]   = useState(false)
  const [voices,    setVoices]    = useState<SpeechSynthesisVoice[]>([])
  const [canSpeak,  setCanSpeak]  = useState(false) // known only after mount (no window on the server)
  const [perm,      setPerm]      = useState<NotificationPermission | 'unsupported'>('unsupported')
  const [filter,    setFilter]    = useState<Filter>('ALL')
  const [label,     setLabel]     = useState<string | null>(null)
  const [query,     setQuery]     = useState('')
  const [readIds,   setReadIds]   = useState<Set<string>>(new Set())
  const [saved,     setSaved]     = useState<Item[]>([])
  const [freshAt,   setFreshAt]   = useState<Record<string, number>>({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [unseen,    setUnseen]    = useState(0) // new headlines while the tab was hidden
  const [systemDark, setSystemDark] = useState(false)
  const [now,       setNow]       = useState(() => Date.now())

  const seen = useRef<Set<string> | null>(null) // null until the first fetch: nothing is announced on page load
  const knownFeeds = useRef(new Set<string>())   // channels that came back before (a channel that recovers from an error is not "all new")
  const liveConn = useRef<ReturnType<typeof connectLive> | null>(null)
  const live = useRef({ prefs, voiceOn, voices })
  useEffect(() => { live.current = { prefs, voiceOn, voices } }, [prefs, voiceOn, voices])
  const searchRef = useRef<HTMLInputElement>(null)
  const awake = useWakeLock(ready && prefs.keepAwake)

  // ── Restore state kept in this browser ──
  useEffect(() => {
    setPrefs(loadPrefs())
    setReady(true)
    setPerm(notifyPermission())
    setReadIds(new Set(moved(READ_KEY, loadJson<string[]>(READ_KEY, []), renamedId)))
    setSaved(moved(SAVED_KEY, loadJson<NewsItem[]>(SAVED_KEY, []), renamedItem).map(withTime))
    if (!speechSupported()) return
    setCanSpeak(true)
    const update = () => setVoices(window.speechSynthesis.getVoices())
    update()
    window.speechSynthesis.addEventListener('voiceschanged', update)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])

  const updatePrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefs((p) => { const n = { ...p, ...patch }; savePrefs(n); return n })
  }, [])

  // ── Theme: system, or a stored light / dark choice ──
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemDark(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!ready) return
    const el = document.documentElement
    if (prefs.theme === 'system') delete el.dataset.theme
    else el.dataset.theme = prefs.theme
  }, [ready, prefs.theme])
  const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && systemDark)

  // ── New list from the server (the first one, every change, a resync): voice and notifications for what is new ──
  const onData = useCallback((fetched: Item[], errs: FeedError[]) => {
    setItems(fetched); setErrors(errs); setUpdatedAt(Date.now()); setLoaded(true)
    const prev = seen.current
    if (prev) {
      const { prefs: p, voiceOn: on, voices: vs } = live.current
      // Hidden channels: not on the list, so not counted, read aloud or notified either
      const fresh = freshItems(fetched.filter((i) => knownFeeds.current.has(keyOf(i)) && !p.hiddenFeeds.includes(keyOf(i))), prev)
      if (fresh.length) {
        const t = Date.now()
        setFreshAt((f) => ({ ...f, ...Object.fromEntries(fresh.map((i) => [i.id, t])) }))
        if (document.visibilityState !== 'visible') setUnseen((u) => u + fresh.length)
        const watched = watchMatcher(p.watchlist)
        // ESPI: only companies on the watch list
        const wanted = (channels: string[]) => (i: Item) =>
          channels.includes(keyOf(i)) && (i.source !== 'ESPI' || watched(`${i.title} ${i.description}`))
        if (on) { const s = fresh.filter(wanted(p.speakFeeds)); if (s.length) announce(s, p, vs) }
        if (p.notify) notifyHeadlines(fresh.filter(wanted(p.notifyFeeds)))
      }
    }
    seen.current = new Set([...(prev ?? []), ...fetched.map((i) => i.id)])
    fetched.forEach((i) => knownFeeds.current.add(keyOf(i)))
  }, [])

  // One live connection for as long as the page is open
  useEffect(() => {
    const conn = connectLive({
      onData,
      onStatus: setStatus,
      onOnline: setOnline,
      onError: (message) => { setErrors([{ feed: 'Serwer', message }]); setLoaded(true) },
    })
    liveConn.current = conn
    return () => { conn.close(); liveConn.current = null }
  }, [onData])

  const refresh = useCallback(async () => {
    setLoading(true)
    try { await liveConn.current?.resync() } finally { setLoading(false) }
  }, [])

  // Back on the tab: reset the counter of headlines that came while it was hidden
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') setUnseen(0) }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])
  useEffect(() => { document.title = unseen ? `(${unseen}) ${TITLE}` : TITLE }, [unseen])

  // Clock for "5 min temu" and for NOWE badges running out
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // ── Voice and notifications ──
  function toggleVoice() {
    if (voiceOn) { stopSpeaking(); setVoiceOn(false); return }
    setVoiceOn(true)
    speak('Głos włączony.', prefs, voices) // speaking inside the click unlocks speech in strict browsers
  }
  // The speaker on a headline: click to read it, click again to stop
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const speakingRef = useRef<string | null>(null)
  const readAloud = useCallback((it: Item) => {
    const again = speakingRef.current === it.id
    speakingRef.current = again ? null : it.id
    setSpeakingId(speakingRef.current)
    stopSpeaking()
    if (again) return
    // Ends (or is cut off by cancel): clear the icon, unless another headline took over
    speakItem(it, live.current.prefs, live.current.voices, () => {
      if (speakingRef.current !== it.id) return
      speakingRef.current = null
      setSpeakingId(null)
    })
  }, [])

  async function toggleNotify() {
    if (prefs.notify) { updatePrefs({ notify: false }); return }
    const p = await requestNotifyPermission()
    setPerm(p)
    if (p !== 'granted') { setSettingsOpen(true); return } // the panel explains how to unblock
    updatePrefs({ notify: true })
    testNotification()
  }

  // ── Read and saved ──
  const markRead = useCallback((id: string) => {
    setReadIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev).add(id)
      saveJson(READ_KEY, [...next].slice(-MAX_READ))
      return next
    })
  }, [])
  const toggleSaved = useCallback((it: Item) => {
    setSaved((prev) => {
      const next = prev.some((s) => s.id === it.id) ? prev.filter((s) => s.id !== it.id) : [it, ...prev]
      saveJson(SAVED_KEY, next.map(({ time: _t, ...rest }) => rest))
      return next
    })
  }, [])
  const closeSettings = useCallback(() => setSettingsOpen(false), [])
  function clearRead()  { setReadIds(new Set()); saveJson(READ_KEY, []) }
  function clearSaved() { setSaved([]); saveJson(SAVED_KEY, []) }

  // ── Search: "/" to focus, Esc to clear ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (e.key !== '/' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── What is on screen ──
  const savedIds = useMemo(() => new Set(saved.map((s) => s.id)), [saved])
  const watched = useMemo(() => watchMatcher(prefs.watchlist), [prefs.watchlist])
  const q = query.trim().toLowerCase()

  // Channels switched off in the settings are left out everywhere except "Zapisane"
  const hidden = useMemo(() => new Set(prefs.hiddenFeeds), [prefs.hiddenFeeds])
  const shown = useMemo(() => items.filter((i) => !hidden.has(keyOf(i))), [items, hidden])
  const labelsShown = (src: Source) => labelsOf(src).filter((l) => !hidden.has(`${src}:${l}`))
  const filters = FILTERS.filter((f) => f === 'ALL' || f === 'SAVED' || labelsShown(f).length > 0)
  // A tab or channel chip whose channels were just hidden falls back to everything
  const activeFilter: Filter = filters.includes(filter) ? filter : 'ALL'
  const activeLabel = label && activeFilter !== 'ALL' && activeFilter !== 'SAVED' && !hidden.has(`${activeFilter}:${label}`) ? label : null

  const visible = useMemo(() => {
    const base =
      activeFilter === 'SAVED' ? [...saved].sort((a, b) => b.time - a.time)
      : activeFilter === 'ALL' ? shown
      : shown.filter((i) => i.source === activeFilter && (!activeLabel || i.label === activeLabel))
    return q ? base.filter((i) => `${i.title} ${i.description} ${i.source} ${i.label}`.toLowerCase().includes(q)) : base
  }, [shown, saved, activeFilter, activeLabel, q])

  // News per channel, for the settings (also for hidden channels)
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const i of items) c[keyOf(i)] = (c[keyOf(i)] ?? 0) + 1
    return c
  }, [items])

  // Errors of hidden channels are not shown either ("STOOQ · BIZNES" is the channel STOOQ:BIZNES)
  const shownErrors = errors.filter((e) => !hidden.has(e.feed.replace(' · ', ':')))

  const subLabels = activeFilter !== 'ALL' && activeFilter !== 'SAVED' ? labelsShown(activeFilter) : []

  function choose(f: Filter) {
    setFilter(f); setLabel(null)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="app">
      <header className="top">
        <div className="bar wrap">
          <div className="brand">
            <button className="logo" onClick={() => choose('ALL')} title="Wszystkie newsy" aria-label="Wszystkie newsy">
              <Megaphone size={18} />
            </button>
            <span className="brand-text">
              <button className="brand-name" onClick={() => choose('ALL')}>Szczekaczka</button>
              <a className="by" href={AUTHOR.url} target="_blank" rel="noopener noreferrer">by {AUTHOR.name}</a>
            </span>
          </div>

          <span className="updated" title={status === 'live'
              ? `Na żywo: nowe newsy przychodzą same.${updatedAt ? ` Ostatnia zmiana ${clock(updatedAt)}.` : ''}`
                + (online !== null ? ` Online: tyle stron Szczekaczki jest teraz otwartych (każda karta liczy się osobno).` : '')
              : 'Łączę z serwerem…'}>
            <i className={`pulse ${status === 'live' ? 'on' : ''}`} />
            {loading ? 'pobieram…' : status === 'live' ? 'na żywo' : 'łączę…'}
            {!loading && status === 'live' && online !== null && <span className="online"> · {online} online</span>}
          </span>

          <nav className="actions">
            {canSpeak && (
              <button className={`act ${voiceOn ? 'on' : ''}`} onClick={toggleVoice} aria-pressed={voiceOn}
                title={voiceOn ? 'Głos włączony: nowe newsy są czytane na głos' : 'Włącz czytanie nowych newsów na głos'}>
                <Speaker on={voiceOn} /><span className="lbl">Głos</span>
              </button>
            )}
            {perm !== 'unsupported' && (
              <button className={`act ${prefs.notify ? 'on' : ''}`} onClick={toggleNotify} aria-pressed={prefs.notify}
                title={prefs.notify ? 'Powiadomienia na pulpicie włączone'
                  : perm === 'denied' ? 'Powiadomienia są zablokowane w ustawieniach strony w przeglądarce'
                  : 'Włącz powiadomienia na pulpicie'}>
                <Bell on={prefs.notify} /><span className="lbl">Powiadomienia</span>
              </button>
            )}
            <button className="act icon" onClick={refresh} disabled={loading} title="Odśwież teraz">
              <Refresh className={loading ? 'spin' : ''} />
            </button>
            <button className="act icon" onClick={() => updatePrefs({ theme: dark ? 'light' : 'dark' })}
              title={dark ? 'Jasny motyw' : 'Ciemny motyw'}>
              {dark ? <Sun /> : <Moon />}
            </button>
            <button className="act icon" onClick={() => setSettingsOpen(true)} title="Ustawienia">
              <Gear />
            </button>
          </nav>
        </div>

        <div className="filters wrap">
          <div className="chips" role="tablist">
            {filters.map((f) => (
              <button key={f} role="tab" aria-selected={activeFilter === f} className={`chip ${activeFilter === f ? 'on' : ''}`}
                style={{ ['--c' as string]: filterColor(f) }} onClick={() => choose(f)}>
                {f === 'SAVED' ? <Star filled={activeFilter === f} size={13} /> : f !== 'ALL' && <i className="dot" />}
                {filterName(f)}
              </button>
            ))}
          </div>
          <label className="search">
            <Search size={16} />
            <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur() } }}
              placeholder="Szukaj" aria-label="Szukaj" spellCheck={false} autoComplete="off" />
            {query && <button onClick={() => setQuery('')} title="Wyczyść"><Close size={14} /></button>}
          </label>
        </div>

        {subLabels.length > 1 && (
          <div className="chips sub wrap">
            {[null, ...subLabels].map((l) => (
              <button key={l ?? '*'} className={`chip small ${activeLabel === l ? 'on' : ''}`}
                style={{ ['--c' as string]: filterColor(activeFilter) }} onClick={() => setLabel(l)}>
                {l ?? 'Wszystkie'}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="list wrap">
        {shownErrors.length > 0 && (
          <div className="errors" role="status">
            Chwilowo nie działa: {shownErrors.map((e) => `${e.feed} (${e.message})`).join(', ')}.
            Widać ostatnio pobrane newsy, kolejna próba za chwilę.
          </div>
        )}

        {!loaded && Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton" />)}

        {loaded && visible.length === 0 && (
          <p className="empty">
            {activeFilter === 'SAVED' && !q ? 'Nic jeszcze nie zapisano. Kliknij gwiazdkę przy newsie, żeby go tu odłożyć.'
              : q ? 'Brak wyników dla tego wyszukiwania.'
              : activeFilter !== 'ALL' && activeFilter !== 'SAVED' ? emptyTab(activeFilter, activeLabel, shownErrors)
              : items.length > 0 ? 'Kanały z newsami są ukryte. Pokaż je w ustawieniach (kolumna z okiem).'
              : 'Brak newsów.'}
          </p>
        )}

        {visible.map((it, i) => {
          const day = dayKey(it.time)
          const newDay = i === 0 || dayKey(visible[i - 1].time) !== day
          const read = readIds.has(it.id)
          const fresh = it.id in freshAt && now - freshAt[it.id] < FRESH_MS && !read
          return (
            <Fragment key={it.id}>
              {newDay && <h2 className="day">{dayLabel(it.time, now)}</h2>}
              <NewsRow item={it} now={now} read={read} saved={savedIds.has(it.id)} fresh={fresh}
                watched={it.source === 'ESPI' && watched(`${it.title} ${it.description}`)}
                onRead={markRead} onSave={toggleSaved} onSpeak={canSpeak ? readAloud : undefined} speaking={speakingId === it.id} />
            </Fragment>
          )
        })}
      </main>

      {loaded && <SiteFooter />}
      <PrivacyNotice />

      {settingsOpen && (
        <Settings
          prefs={prefs} onChange={updatePrefs} onClose={closeSettings}
          canSpeak={canSpeak} voices={voices} voiceOn={voiceOn} onVoiceToggle={toggleVoice}
          perm={perm} onNotifyToggle={toggleNotify} onNotifyTest={testNotification}
          awake={awake} counts={counts} status={status} online={online}
          readCount={readIds.size} savedCount={saved.length} onClearRead={clearRead} onClearSaved={clearSaved}
        />
      )}
    </div>
  )
}
