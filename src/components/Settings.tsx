'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import { FEEDS, SOURCES, HAS_ENGLISH, feedKey, CHECK_SECONDS, QUIET_CHECK_SECONDS, type Source } from '@/lib/sources'
import type { Prefs, Theme } from '@/lib/prefs'
import { polishVoices, voicesFor, pickVoice, speak, stopSpeaking, voiceLabel } from '@/lib/speech'
import { AUTHOR, STORAGE_PREFIX } from '@/lib/site'
import type { AwakeState } from '@/lib/wakeLock'
import type { LiveStatus } from '@/lib/live'
import { Close, Speaker, Bell, Play, Eye } from './Icons'

interface Props {
  prefs: Prefs
  onChange: (patch: Partial<Prefs>) => void
  onClose: () => void
  canSpeak: boolean
  voices: SpeechSynthesisVoice[]
  voiceOn: boolean
  onVoiceToggle: () => void
  perm: NotificationPermission | 'unsupported'
  onNotifyToggle: () => void
  onNotifyTest: () => void
  awake: AwakeState
  status: LiveStatus
  online: number | null
  counts: Record<string, number>
  readCount: number
  savedCount: number
  onClearRead: () => void
  onClearSaved: () => void
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="setting">
      <span>{label}</span>
      <input type="checkbox" role="switch" className="switch" checked={checked} onChange={onChange} />
    </label>
  )
}

const AWAKE_TEXT: Record<AwakeState, string> = {
  unsupported: 'Ta przeglądarka tego nie obsługuje.',
  off: '',
  waiting: 'Zadziała, gdy karta będzie widoczna.',
  active: 'Ekran nie zgaśnie, dopóki karta jest widoczna.',
  blocked: 'Przeglądarka odmówiła (np. tryb oszczędzania baterii).',
}

const PERM_TEXT: Record<NotificationPermission | 'unsupported', string> = {
  granted: '',
  default: 'Przy włączaniu przeglądarka zapyta o zgodę.',
  denied: 'Zablokowane. Odblokuj powiadomienia w ustawieniach strony (ikona obok adresu), potem włącz je tutaj.',
  unsupported: 'Ta przeglądarka nie obsługuje powiadomień.',
}

const THEMES: [Theme, string][] = [['system', 'Systemowy'], ['light', 'Jasny'], ['dark', 'Ciemny']]

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`chev${open ? ' open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
  )
}

// A checkbox for one channel or for all of a source's: half-ticked when only some are on
function Box({ on, some, disabled, onChange, label }: { on: boolean; some: boolean; disabled?: boolean; onChange: () => void; label: string }) {
  return (
    <input type="checkbox" checked={on} disabled={disabled} onChange={onChange} aria-label={label}
      ref={(el) => { if (el) el.indeterminate = some && !on }} />
  )
}

type List = 'hiddenFeeds' | 'speakFeeds' | 'notifyFeeds' | 'leadFeeds'

// The four checkboxes of a row: shown, read aloud, notified, read with the lead. For a source's row
// they stand for all its channels: a click turns them all on, or all off when all are on.
function ChannelBoxes({ keys, name, prefs, onChange }: { keys: string[]; name: string; prefs: Prefs; onChange: (patch: Partial<Prefs>) => void }) {
  const shown = keys.filter((k) => !prefs.hiddenFeeds.includes(k))
  const set = (list: List, which: string[], on: boolean) =>
    onChange({ [list]: on ? [...new Set([...prefs[list], ...which])] : prefs[list].filter((k) => !which.includes(k)) })
  const box = (list: Exclude<List, 'hiddenFeeds'>, which: string[], title: string) => {
    const n = which.filter((k) => shown.includes(k) && prefs[list].includes(k)).length
    const on = shown.length > 0 && n === which.filter((k) => shown.includes(k)).length && n > 0
    return <td><Box on={on} some={n > 0} disabled={shown.length === 0} label={`${title}: ${name}`}
      onChange={() => set(list, which, !on)} /></td>
  }
  return (
    <>
      <td><Box on={shown.length === keys.length} some={shown.length > 0} label={`Pokazuj na liście: ${name}`}
        onChange={() => set('hiddenFeeds', keys, shown.length === keys.length)} /></td>
      {box('speakFeeds', keys, 'Czytaj na głos')}
      {box('notifyFeeds', keys, 'Powiadomienia')}
      {box('leadFeeds', keys, 'Czytaj też lead')}
    </>
  )
}

export default function Settings(p: Props) {
  const { prefs, onChange } = p
  const pl = polishVoices(p.voices)
  const auto = pickVoice(p.voices, '')
  const chosen = pl.some((v) => v.voiceURI === prefs.voiceURI) ? prefs.voiceURI : ''
  const en = voicesFor(p.voices, 'en')
  const autoEn = pickVoice(p.voices, '', 'en')
  const chosenEn = en.some((v) => v.voiceURI === prefs.voiceURIEn) ? prefs.voiceURIEn : ''

  function preview(uri: string) {
    stopSpeaking()
    speak('Dzień dobry, tu Szczekaczka. Tak brzmi ten głos.', { ...prefs, voiceURI: uri }, p.voices)
  }

  function previewEn(uri: string) {
    stopSpeaking()
    speak('Hello, this is Szczekaczka. This is how this voice sounds.', { ...prefs, voiceURIEn: uri }, p.voices, undefined, 'en')
  }

  const { onClose } = p
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Removes everything the site keeps in this browser, then starts afresh with defaults
  function clearAllData() {
    if (!window.confirm('Usunąć ustawienia, przeczytane i zapisane newsy z tej przeglądarki?')) return
    stopSpeaking()
    try {
      Object.keys(localStorage).filter((k) => k.startsWith(STORAGE_PREFIX)).forEach((k) => localStorage.removeItem(k))
    } catch {}
    window.location.reload()
  }

  // Sources with their channels shown
  const [open, setOpen] = useState<Set<Source>>(() => new Set())
  const toggleOpen = (src: Source) => setOpen((o) => { const n = new Set(o); if (n.has(src)) n.delete(src); else n.add(src); return n })

  return (
    <div className="overlay" onClick={p.onClose}>
      <aside className="panel" role="dialog" aria-modal="true" aria-label="Ustawienia" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>Ustawienia</h2>
          <button className="act icon" onClick={p.onClose} title="Zamknij"><Close /></button>
        </div>

        <section>
          <h3>Kanały</h3>
          <table className="channels">
            <thead>
              <tr>
                <th>Kanał</th>
                <th title="Pokazuj na liście"><Eye size={16} /></th>
                <th title="Czytaj na głos"><Speaker on size={16} /></th>
                <th title="Powiadomienia"><Bell on size={16} /></th>
                <th title="Czytaj też lead (bez zaznaczenia: sam tytuł)" className="lead">Lead</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((src) => {
                const feeds = FEEDS.filter((f) => f.source === src)
                const keys = feeds.map((f) => feedKey(f.source, f.label))
                const many = keys.length > 1
                const expanded = many && open.has(src)
                const count = keys.reduce((n, k) => n + (p.counts[k] ?? 0), 0)
                return (
                  <Fragment key={src}>
                    <tr className={`group${keys.every((k) => prefs.hiddenFeeds.includes(k)) ? ' off' : ''}`}
                      style={{ ['--c' as string]: `var(--src-${src.toLowerCase()})` }}>
                      <td>
                        {many ? (
                          <button className="ch" onClick={() => toggleOpen(src)} aria-expanded={expanded}
                            title={expanded ? 'Zwiń kanały' : 'Rozwiń kanały'}>
                            <Chevron open={expanded} /><i className="dot" />{src}<span className="n">{count}</span>
                          </button>
                        ) : <span className="ch"><span className="chev-space" /><i className="dot" />{src}<span className="n">{count}</span></span>}
                      </td>
                      <ChannelBoxes keys={keys} name={src} prefs={prefs} onChange={onChange} />
                    </tr>
                    {expanded && feeds.map((f) => {
                      const key = feedKey(f.source, f.label)
                      return (
                        <tr key={key} className={`sub${prefs.hiddenFeeds.includes(key) ? ' off' : ''}`}
                          style={{ ['--c' as string]: `var(--src-${src.toLowerCase()})` }}>
                          <td><span className="ch">{f.label}<span className="n">{p.counts[key] ?? 0}</span></span></td>
                          <ChannelBoxes keys={[key]} name={`${src} · ${f.label}`} prefs={prefs} onChange={onChange} />
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          <p className="hint">
            Wiersz źródła ustawia wszystkie jego kanały naraz, a strzałka je rozwija, żeby ustawić każdy osobno.
            Oko: kanał na liście; odznaczony od razu znika z listy i nie jest czytany ani pokazywany w powiadomieniach
            (newsy i tak przychodzą w tle, więc po zaznaczeniu wraca od razu). Lead: po tytule czytana jest zajawka,
            bez zaznaczenia sam tytuł.
          </p>
        </section>

        <section>
          <h3>Głos</h3>
          {p.canSpeak ? (
            <>
              <Switch label="Czytaj nowe newsy na głos" checked={p.voiceOn} onChange={p.onVoiceToggle} />
              <div className="voices" role="radiogroup" aria-label="Głos">
                <label className="voice">
                  <input type="radio" name="voice" checked={!chosen} onChange={() => onChange({ voiceURI: '' })} />
                  <span>Automatyczny<small>{auto ? voiceLabel(auto) : 'domyślny głos przeglądarki'}</small></span>
                </label>
                {pl.map((v) => (
                  <label key={v.voiceURI} className="voice">
                    <input type="radio" name="voice" checked={chosen === v.voiceURI} onChange={() => onChange({ voiceURI: v.voiceURI })} />
                    <span>{voiceLabel(v)}</span>
                    <button className="play" title="Odsłuchaj" aria-label={`Odsłuchaj: ${voiceLabel(v)}`}
                      onClick={(e) => { e.preventDefault(); preview(v.voiceURI) }}><Play size={15} /></button>
                  </label>
                ))}
              </div>
              <p className="hint">
                {pl.length === 0 ? 'Ta przeglądarka nie ma polskich głosów, więc czyta swoim domyślnym. '
                  : `Polskie głosy w tej przeglądarce: ${pl.length}. `}
                Zestaw zależy od przeglądarki i systemu: najwięcej naturalnych głosów (np. Zofia, Marek) ma Microsoft Edge,
                Chrome ma „Google polski”, a Mac i iPhone np. Zosię.
              </p>
              {HAS_ENGLISH && (<>
                <div className="voice-pick">
                  <span>Głos angielski</span>
                  <div>
                    <select value={chosenEn} onChange={(e) => onChange({ voiceURIEn: e.target.value })} aria-label="Głos angielski">
                      <option value="">Automatyczny{autoEn ? ` (${voiceLabel(autoEn)})` : ''}</option>
                      {en.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{voiceLabel(v)}</option>)}
                    </select>
                    <button className="play" title="Odsłuchaj" aria-label="Odsłuchaj głos angielski"
                      onClick={() => previewEn(chosenEn)}><Play size={15} /></button>
                  </div>
                </div>
                <p className="hint">
                  Newsy po angielsku czyta ten głos.{' '}
                  {en.length === 0 ? 'Ta przeglądarka nie ma angielskich głosów, więc czyta swoim domyślnym.'
                    : `Angielskie głosy w tej przeglądarce: ${en.length}.`}
                </p>
              </>)}
              <p className="hint">Raporty spółek są czytane z „Nowe ESPI:” na początku, komunikaty GPW z „GPW:”, pozostałe newsy bez nazwy źródła. Nazwy pisane wielkimi literami są czytane jak słowa (np. „Archicom”, a nie A-R-C-H…), a „S.A.” i „Sp. z o.o.” w pełnym brzmieniu. Lead czytany jest tylko w kanałach zaznaczonych w kolumnie „Lead” wyżej: pełne zdania (lead ucięty przez źródło do miejsca ucięcia), bez daty, „(PAP)” i powtórzonego tytułu. Zapowiedzi MacroNext mają w leadzie dane (konsensus, poprzedni odczyt).</p>
              <label className="setting">
                <span>Tempo <b>{prefs.rate.toFixed(1)}×</b></span>
                <input type="range" min={0.6} max={1.8} step={0.1} value={prefs.rate}
                  onChange={(e) => onChange({ rate: Number(e.target.value) })} />
              </label>
              <label className="setting">
                <span>Najwyżej newsów naraz</span>
                <select value={prefs.maxPerRefresh} onChange={(e) => onChange({ maxPerRefresh: Number(e.target.value) })}>
                  {[1, 2, 3, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <p className="hint">Gdy przyjdzie więcej, czytane są najnowsze, a reszta jest podsumowana.</p>
              <button className="btn" onClick={() => speak('To jest test głosu Szczekaczki.', prefs, p.voices)}>Przetestuj głos</button>
            </>
          ) : <p className="hint">Ta przeglądarka nie potrafi czytać na głos.</p>}
        </section>

        <section>
          <h3>Powiadomienia na pulpicie</h3>
          {p.perm !== 'unsupported' && <Switch label="Pokazuj powiadomienia" checked={prefs.notify} onChange={p.onNotifyToggle} />}
          {PERM_TEXT[p.perm] && <p className="hint">{PERM_TEXT[p.perm]}</p>}
          <p className="hint">Działają, dopóki strona jest otwarta w jakiejś karcie.</p>
          {p.perm === 'granted' && <button className="btn" onClick={p.onNotifyTest}>Wyślij testowe</button>}
        </section>


        <section>
          <h3>Obserwowane spółki (ESPI)</h3>
          <textarea rows={3} value={prefs.watchlist} placeholder="np. PKN ORLEN, CD PROJEKT, KGHM"
            onChange={(e) => onChange({ watchlist: e.target.value })} spellCheck={false} />
          <p className="hint">
            Nazwy lub tickery po przecinku. Raporty ESPI tych spółek są czytane na głos i pokazywane w powiadomieniach.
            Przy pustej liście raporty ESPI są tylko na liście, bo przychodzi ich bardzo dużo.
          </p>
        </section>

        <section>
          <h3>Inne</h3>
          <div className="setting">
            <span>Połączenie</span>
            <span className={`conn ${p.status === 'live' ? 'on' : ''}`}><i />
              {p.status === 'live' ? 'na żywo' : 'łączę…'}{p.status === 'live' && p.online !== null && ` · ${p.online} online`}
            </span>
          </div>
          <p className="hint">
            Nowe newsy przychodzą same przez stałe połączenie z serwerem, bez odświeżania. Serwer sprawdza kanały co około
            {' '}{CHECK_SECONDS} s (GPW rzadziej, w nocy i w weekendy co {QUIET_CHECK_SECONDS / 60} min).
            {p.online !== null && ' Online: tyle stron Szczekaczki jest teraz otwartych (każda karta liczy się osobno), odświeżane co około minutę.'}
          </p>
          <Switch label="Nie wygaszaj ekranu" checked={prefs.keepAwake} onChange={() => onChange({ keepAwake: !prefs.keepAwake })} />
          {prefs.keepAwake && AWAKE_TEXT[p.awake] && <p className="hint">{AWAKE_TEXT[p.awake]}</p>}
          <div className="setting">
            <span>Motyw</span>
            <div className="segmented">
              {THEMES.map(([t, name]) => (
                <button key={t} className={prefs.theme === t ? 'on' : ''} onClick={() => onChange({ theme: t })}>{name}</button>
              ))}
            </div>
          </div>
          <div className="row-buttons">
            <button className="btn" onClick={p.onClearRead} disabled={!p.readCount}>Wyczyść przeczytane ({p.readCount})</button>
            <button className="btn" onClick={p.onClearSaved} disabled={!p.savedCount}>Wyczyść zapisane ({p.savedCount})</button>
          </div>
        </section>

        <section>
          <h3>Prywatność</h3>
          <p className="hint">
            Szczekaczka nie używa cookies ani narzędzi śledzących. Ustawienia, przeczytane i zapisane newsy są tylko
            w pamięci tej przeglądarki.
          </p>
          <div className="row-buttons">
            <button className="btn danger" onClick={clearAllData}>Usuń wszystkie dane z tej przeglądarki</button>
          </div>
          <p className="legal-links">
            <Link href="/o-stronie">O stronie i źródła</Link> · <Link href="/polityka-prywatnosci">Polityka prywatności</Link> · <Link href="/regulamin">Regulamin</Link>
          </p>
        </section>

        <p className="foot">
          Szczekaczka by <a href={AUTHOR.url} target="_blank" rel="noopener noreferrer">{AUTHOR.name}</a>.
          Źródła: <Link href="/o-stronie">Bankier.pl (ESPI/EBI), GPW, Stooq, PAP MediaRoom, MacroNext</Link>.
        </p>
      </aside>
    </div>
  )
}
