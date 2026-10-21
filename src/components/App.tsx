'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { orderedSources, labelsOf, renamedId, renamedItem, sourceName, feedName, type Source } from '@/lib/sources'
import type { NewsItem } from '@/lib/parse'
import { type Item, type FeedError, freshItems, keyOf, dayKey, dayLabel, clock, withTime, inLanguage, originalOf } from '@/lib/news'
import { connectLive, type LiveStatus } from '@/lib/live'
import { type Prefs, DEFAULT_PREFS, loadPrefs, savePrefs, loadJson, saveJson, watchMatcher, onWatchlist } from '@/lib/prefs'
import { speechSupported, speak, speakItem, announce, stopSpeaking, onSpeechBlocked } from '@/lib/speech'
import { unlockChime } from '@/lib/chime'
import { notifyPermission, requestNotifyPermission, notifyHeadlines, testNotification } from '@/lib/notify'
import { useWakeLock } from '@/lib/wakeLock'
import { useNewVersion } from '@/lib/version'
import { AUTHOR } from '@/lib/site'
import { symbolChoices, withRecent } from '@/lib/market'
import NewsRow from './NewsRow'
import Settings from './Settings'
import Reader from './Reader'
import Market, { useMedia, type Origin } from './Market'
import ChartWindow from './ChartWindow'
import PrivacyNotice from './PrivacyNotice'
import ScrollRow from './ScrollRow'
import { SiteFooter } from './LegalPage'
import { Logo, Speaker, Bell, Refresh, Sun, Moon, Gear, Search, Close, Star, Chart } from './Icons'

const READ_KEY  = 'szczekaczka:read'
const SAVED_KEY = 'szczekaczka:saved'
const MAX_READ  = 5000
const FRESH_MS  = 10 * 60_000 // how long a new headline keeps its NOWE badge
const TITLE = 'Szczekaczka'

// The tabs: everything, the market (quotes and charts, components/Market.tsx), each source, the saved news
type Filter = 'ALL' | 'MARKET' | Source | 'SAVED'
const isSource = (f: Filter): f is Source => f !== 'ALL' && f !== 'MARKET' && f !== 'SAVED'
const filterName = (f: Filter) => (f === 'ALL' ? 'Wszystko' : f === 'MARKET' ? 'Rynek' : f === 'SAVED' ? 'Zapisane' : sourceName(f))
const filterColor = (f: Filter) => (isSource(f) ? `var(--src-${f.toLowerCase()})` : undefined)
// The chart a computer shows beside the table until another is chosen
const FIRST_CHART = 'CMCMARKETS:POLISH201!'

// A source tab (or one of its channels) with nothing on it: why. Its channels are shown,
// or the tab would not be there; errors are named "PAP · BIZNES".
function emptyTab(src: Source, label: string | null, errors: FeedError[], watching: boolean): string {
  const key = label ? `${src} · ${label}` : src // how the server names it in an error
  const name = label ? `${sourceName(src)} · ${label}` : sourceName(src)
  const failing = errors.filter((e) => (label ? e.feed === key : e.feed.startsWith(`${src} · `)))
  if (src === 'MACRONEXT') return failing.length
    ? 'Nie udało się pobrać kalendarium MacroNext (powód w ramce wyżej). Kolejna próba za chwilę.'
    : label === 'GIEŁDA' ? 'Na razie brak zapowiedzi. Zapowiedzi z kalendarium giełdowego MacroNext pojawiają się tu przed sesją na GPW i przed sesją oraz po sesji w Nowym Jorku.'
    : label === 'MAKRO' ? 'Na razie brak zapowiedzi. Zapowiedzi danych makro z kalendarium MacroNext pojawiają się tu 10 minut przed publikacją.'
    : 'Na razie brak zapowiedzi. Zapowiedzi danych makro pojawiają się tu 10 minut przed publikacją, a zapowiedzi z kalendarium giełdowego przed sesją.'
  if (failing.length) return `Nie udało się pobrać newsów z ${name} (powód w ramce wyżej). Kolejna próba za chwilę.`
  return src === 'ESPI' && watching ? 'Na razie brak raportów ESPI obserwowanych spółek. Listę spółek zmienisz w ustawieniach.' : `Na razie brak newsów z ${name}.`
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
  const [blocked,   setBlocked]   = useState(false) // the browser would not speak without a tap
  const [voices,    setVoices]    = useState<SpeechSynthesisVoice[]>([])
  const [canSpeak,  setCanSpeak]  = useState(false) // known only after mount (no window on the server)
  const [perm,      setPerm]      = useState<NotificationPermission | 'unsupported'>('unsupported')
  const [filter,    setFilter]    = useState<Filter>('ALL')
  const [label,     setLabel]     = useState<string | null>(null)
  const [query,     setQuery]     = useState('')
  const [symbolQuery, setSymbolQuery] = useState('') // the search field on the "Rynek" tab: a symbol
  const [choice,    setChoice]    = useState(0)      // the symbol suggestion picked with the arrow keys
  const [searching, setSearching] = useState(false)  // the search field has the focus (suggestions under it)
  const [chart,     setChart]     = useState<{ symbol: string; origin: Origin | null } | null>(null) // a chart in a window
  const [picked,    setPicked]    = useState(FIRST_CHART) // the chart beside the table (a computer)
  const [marketSeen, setMarketSeen] = useState(false)     // the "Rynek" tab was opened: it stays loaded, hidden, while another tab is shown
  const [readIds,   setReadIds]   = useState<Set<string>>(new Set())
  const [saved,     setSaved]     = useState<Item[]>([])
  const [freshAt,   setFreshAt]   = useState<Record<string, number>>({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [reader,   setReader]   = useState<{ item: Item; origin: { x: number; y: number } } | null>(null) // the whole lead in a window
  const [unseen,    setUnseen]    = useState(0) // new headlines while the tab was hidden
  const [systemDark, setSystemDark] = useState(false)
  const [now,       setNow]       = useState(() => Date.now())

  const seen = useRef<Set<string> | null>(null) // null until the first fetch: nothing is announced on page load
  const knownFeeds = useRef(new Set<string>())   // channels that came back before (a channel that recovers from an error is not "all new")
  const liveConn = useRef<ReturnType<typeof connectLive> | null>(null)
  const { newer, reload } = useNewVersion(voiceOn)
  const live = useRef({ prefs, voiceOn, voices })
  useEffect(() => { live.current = { prefs, voiceOn, voices } }, [prefs, voiceOn, voices])
  const searchRef = useRef<HTMLInputElement>(null)
  const awake = useWakeLock(ready && prefs.keepAwake)
  const wide = useMedia('(min-width: 1000px)') // room for the chart beside the market's table

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
      // Hidden channels and the ESPI reports of companies off the watch list: not on the list, so not counted, read aloud or notified either
      // Read aloud and notified in the language the channel is shown in (a translation: in Polish)
      const inList = onWatchlist(p.watchlist)
      const fresh = freshItems(fetched.filter((i) => knownFeeds.current.has(keyOf(i)) && !p.hiddenFeeds.includes(keyOf(i)) && inList(i)), prev)
        .map((i) => inLanguage(i, p.originalFeeds))
      if (fresh.length) {
        const t = Date.now()
        setFreshAt((f) => ({ ...f, ...Object.fromEntries(fresh.map((i) => [i.id, t])) }))
        if (document.visibilityState !== 'visible') setUnseen((u) => u + fresh.length)
        // ESPI: with a watch list only those companies (the rest is not here at all); voice reads every report while the list is empty, notifications none
        const wanted = (channels: string[], onList: (text: string) => boolean) => (i: Item) =>
          channels.includes(keyOf(i)) && (i.source !== 'ESPI' || onList(`${i.title} ${i.description}`))
        if (on) { const s = fresh.filter(wanted(p.speakFeeds, watchMatcher(p.watchlist, true))); if (s.length) announce(s, p, vs) }
        if (p.notify) notifyHeadlines(fresh.filter(wanted(p.notifyFeeds, watchMatcher(p.watchlist))))
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
    setBlocked(false)
    if (voiceOn) { stopSpeaking(); setVoiceOn(false); return }
    setVoiceOn(true)
    unlockChime() // the same for the sound before the voice
    speak('Głos włączony.', prefs, voices) // speaking inside the click unlocks speech in strict browsers
  }
  useEffect(() => { onSpeechBlocked(() => setBlocked(true)); return () => onSpeechBlocked(undefined) }, [])
  function unblock() {
    setBlocked(false)
    unlockChime()
    speak('Głos włączony.', prefs, voices) // inside the tap, as above
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
      // the original, with its translation: the language it is shown in can change later
      const next = prev.some((s) => s.id === it.id) ? prev.filter((s) => s.id !== it.id) : [originalOf(it), ...prev]
      saveJson(SAVED_KEY, next.map(({ time: _t, ...rest }) => rest))
      return next
    })
  }, [])
  const closeSettings = useCallback(() => setSettingsOpen(false), [])
  // A click on a news opens it in a window of its own, growing out of the place clicked, and counts as reading it
  const openReader = useCallback((it: Item, origin: { x: number; y: number }) => {
    markRead(it.id)
    setReader({ item: it, origin })
  }, [markRead])
  const closeReader = useCallback(() => setReader(null), [])
  function clearRead()  { setReadIds(new Set()); saveJson(READ_KEY, []) }
  function clearSaved() { setSaved([]); saveJson(SAVED_KEY, []) }

  // ── Search: "/" to focus, Esc to clear ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (e.key !== '/' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.body.classList.contains('reading')) return
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
  const original = prefs.originalFeeds
  // ESPI with a watch list: only the reports of those companies (the saved ones stay, whatever the list says)
  const listed = useMemo(() => onWatchlist(prefs.watchlist), [prefs.watchlist])
  const shown = useMemo(() => items.filter((i) => !hidden.has(keyOf(i)) && listed(i)).map((i) => inLanguage(i, original)), [items, hidden, listed, original])
  const labelsShown = (src: Source) => labelsOf(src).filter((l) => !hidden.has(`${src}:${l}`))
  // the tabs: everything, the market, the sources in the order the reader set in the settings, the saved
  const filters = (['ALL', 'MARKET', ...orderedSources(prefs.sourceOrder), 'SAVED'] as Filter[]).filter((f) => !isSource(f) || labelsShown(f).length > 0)
  // A tab or channel chip whose channels were just hidden falls back to everything
  const activeFilter: Filter = filters.includes(filter) ? filter : 'ALL'
  const activeLabel = label && isSource(activeFilter) && !hidden.has(`${activeFilter}:${label}`) ? label : null
  const market = activeFilter === 'MARKET'
  useEffect(() => { if (market) setMarketSeen(true) }, [market])

  const visible = useMemo(() => {
    const base =
      activeFilter === 'SAVED' ? saved.map((i) => inLanguage(i, original)).sort((a, b) => b.time - a.time)
      : activeFilter === 'ALL' ? shown
      : activeFilter === 'MARKET' ? []
      : shown.filter((i) => i.source === activeFilter && (!activeLabel || i.label === activeLabel))
    return q ? base.filter((i) => `${i.title} ${i.description} ${i.source} ${i.label}`.toLowerCase().includes(q)) : base
  }, [shown, saved, original, activeFilter, activeLabel, q])

  // News per channel, for the settings (also for hidden channels)
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const i of items) c[keyOf(i)] = (c[keyOf(i)] ?? 0) + 1
    return c
  }, [items])

  // Errors of hidden channels are not shown either ("STOOQ · BIZNES" is the channel STOOQ:BIZNES)
  const shownErrors = errors.filter((e) => !hidden.has(e.feed.replace(' · ', ':')))

  const subLabels = isSource(activeFilter) ? labelsShown(activeFilter) : []

  // ── The market: a chart in a window (a phone) or beside the table (a computer); the symbols looked at last are remembered ──
  const openChart = useCallback((symbol: string, origin: Origin | null) => {
    if (prefs.charts) updatePrefs({ marketRecent: withRecent(prefs.marketRecent, symbol) })
    if (wide && filter === 'MARKET') setPicked(symbol)
    else setChart({ symbol, origin })
  }, [prefs.charts, prefs.marketRecent, updatePrefs, wide, filter])
  const closeChart = useCallback(() => setChart(null), [])
  const chartsOn = useCallback(() => updatePrefs({ charts: true }), [updatePrefs])
  const choices = market ? symbolChoices(symbolQuery) : []
  const pick = (i: number) => {
    const c = choices[i]
    if (!c) return
    const box = searchRef.current?.getBoundingClientRect()
    setSymbolQuery(''); setChoice(0)
    searchRef.current?.blur()
    openChart(c.symbol, box ? { x: box.left + 24, y: box.top + box.height / 2 } : null)
  }
  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { if (market) setSymbolQuery(''); else setQuery(''); e.currentTarget.blur(); return }
    if (!market || !choices.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setChoice((c) => (c + (e.key === 'ArrowDown' ? 1 : choices.length - 1)) % choices.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(Math.min(choice, choices.length - 1))
    }
  }
  const searchValue = market ? symbolQuery : query
  const setSearch = (v: string) => { if (market) { setSymbolQuery(v); setChoice(0) } else setQuery(v) }

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
              <Logo />
            </button>
            <span className="brand-text">
              <button className="brand-name" onClick={() => choose('ALL')}>Szczekaczka</button>
              <a className="by" href={AUTHOR.url} target="_blank" rel="noopener noreferrer">by {AUTHOR.name}</a>
            </span>
            <span className="beta" title="Wersja testowa: mogą pojawiać się błędy">BETA</span>
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
          <ScrollRow className="chips" role="tablist" active={activeFilter}>
            {filters.map((f) => (
              <button key={f} role="tab" aria-selected={activeFilter === f} className={`chip ${activeFilter === f ? 'on' : ''}`}
                style={{ ['--c' as string]: filterColor(f) }} onClick={() => choose(f)}>
                {f === 'SAVED' ? <Star filled={activeFilter === f} size={13} /> : f === 'MARKET' ? <Chart size={14} /> : f !== 'ALL' && <i className="dot" />}
                {filterName(f)}
              </button>
            ))}
          </ScrollRow>
          <label className="search">
            <Search size={16} />
            <input ref={searchRef} value={searchValue} onChange={(e) => setSearch(e.target.value)} onKeyDown={onSearchKey}
              onFocus={() => setSearching(true)} onBlur={() => setSearching(false)}
              placeholder={market ? 'Symbol, np. CDR, AAPL, EURUSD' : 'Szukaj'} aria-label={market ? 'Symbol' : 'Szukaj'}
              spellCheck={false} autoComplete="off" autoCapitalize={market ? 'characters' : undefined} enterKeyHint={market ? 'go' : undefined}
              role={market ? 'combobox' : undefined} aria-expanded={market ? searching && choices.length > 0 : undefined}
              aria-controls={market ? 'symbol-choices' : undefined} aria-activedescendant={market && searching && choices.length ? `symbol-${Math.min(choice, choices.length - 1)}` : undefined} />
            {searchValue && <button onClick={() => setSearch('')} title="Wyczyść"><Close size={14} /></button>}
          </label>
          {market && searching && choices.length > 0 && (
            <ul id="symbol-choices" className="symbol-choices" role="listbox" aria-label="Podpowiedzi">
              {choices.map((c, i) => (
                <li key={c.symbol + (c.typed ? '*' : '')} id={`symbol-${i}`} role="option" aria-selected={i === Math.min(choice, choices.length - 1)}
                  className={i === Math.min(choice, choices.length - 1) ? 'on' : undefined}
                  onPointerDown={(e) => e.preventDefault()} onClick={() => pick(i)} onPointerEnter={() => setChoice(i)}>
                  {c.typed ? <span className="typed">Pokaż wykres „{c.symbol}”</span> : <span>{c.name}</span>}
                  <em>{c.typed ? 'Enter' : c.symbol.replace(':', ' · ')}</em>
                </li>
              ))}
            </ul>
          )}
        </div>

        {subLabels.length > 1 && (
          <ScrollRow className="chips sub" outer="wrap" active={activeLabel}>
            {[null, ...subLabels].map((l) => (
              <button key={l ?? '*'} className={`chip small ${activeLabel === l ? 'on' : ''}`}
                style={{ ['--c' as string]: filterColor(activeFilter) }} onClick={() => setLabel(l)}>
                {l ?? 'Wszystkie'}
              </button>
            ))}
          </ScrollRow>
        )}
      </header>

      <main className="list wrap">
        {!market && shownErrors.length > 0 && (
          <div className="errors" role="status">
            Chwilowo nie działa: {shownErrors.map((e) => `${feedName(e.feed)} (${e.message})`).join(', ')}.
            Widać ostatnio pobrane newsy, kolejna próba za chwilę.
          </div>
        )}

        {voiceOn && blocked && (
          <div className="errors blocked" role="alert">
            Przeglądarka nie pozwoliła przeczytać nowego newsa na głos. Telefony czasem wymagają ponownego dotknięcia strony.
            <button className="btn" onClick={unblock}>Wznów czytanie</button>
          </div>
        )}

        {/* Once opened, the market stays: back on its tab the quotes are there at once, not loaded again */}
        {(market || marketSeen) && (
          <div hidden={!market}>
            <Market charts={prefs.charts} onCharts={chartsOn} dark={dark} recent={prefs.marketRecent} wide={wide} picked={picked} onOpen={openChart} />
          </div>
        )}

        {!market && !loaded && Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton" />)}

        {!market && loaded && visible.length === 0 && (
          <p className="empty">
            {activeFilter === 'SAVED' && !q ? 'Nic jeszcze nie zapisano. Kliknij gwiazdkę przy newsie, żeby go tu odłożyć.'
              : q ? 'Brak wyników dla tego wyszukiwania.'
              : isSource(activeFilter) ? emptyTab(activeFilter, activeLabel, shownErrors, prefs.watchlist.trim() !== '')
              : items.some((i) => !hidden.has(keyOf(i))) ? 'Na razie brak raportów ESPI obserwowanych spółek. Listę spółek zmienisz w ustawieniach.'
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
                onRead={markRead} onSave={toggleSaved} onSpeak={canSpeak ? readAloud : undefined} onOpen={openReader} speaking={speakingId === it.id} />
            </Fragment>
          )
        })}
      </main>

      {loaded && <SiteFooter />}
      <PrivacyNotice />

      {newer && (
        <div className="update" role="status">
          <span>Jest nowa wersja Szczekaczki.</span>
          <button className="btn" onClick={reload}>Odśwież</button>
        </div>
      )}

      {reader && (() => {
        // the news as the list has it now (a fresher text, or the translation switched on), else as it was opened
        const it = visible.find((i) => i.id === reader.item.id) ?? reader.item
        return (
          <Reader key={reader.item.id} item={it} origin={reader.origin} now={now} saved={savedIds.has(it.id)} speaking={speakingId === it.id}
            onClose={closeReader} onSave={toggleSaved} onSpeak={canSpeak ? readAloud : undefined} />
        )
      })()}

      {chart && (
        <ChartWindow key={chart.symbol} symbol={chart.symbol} origin={chart.origin} dark={dark} charts={prefs.charts}
          onCharts={chartsOn} onClose={closeChart} />
      )}

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
