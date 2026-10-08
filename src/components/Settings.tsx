'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { FEEDS, SOURCES, feedKey, labelsOf, CHECK_SECONDS, QUIET_CHECK_SECONDS } from '@/lib/sources'
import type { Prefs, Theme } from '@/lib/prefs'
import { polishVoices, pickVoice, speak, stopSpeaking, voiceLabel } from '@/lib/speech'
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

export default function Settings(p: Props) {
  const { prefs, onChange } = p
  const pl = polishVoices(p.voices)
  const auto = pickVoice(p.voices, '')
  const chosen = pl.some((v) => v.voiceURI === prefs.voiceURI) ? prefs.voiceURI : ''

  function preview(uri: string) {
    stopSpeaking()
    speak('Dzień dobry, tu Szczekaczka. Tak brzmi ten głos.', { ...prefs, voiceURI: uri }, p.voices)
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

  function toggleChannel(list: 'hiddenFeeds' | 'speakFeeds' | 'notifyFeeds', key: string) {
    const cur = prefs[list]
    onChange({ [list]: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key] })
  }

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
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((src) => FEEDS.filter((f) => f.source === src).map((f) => {
                const key = feedKey(f.source, f.label)
                const name = labelsOf(src).length === 1 ? src : `${src} · ${f.label}`
                const hidden = prefs.hiddenFeeds.includes(key)
                return (
                  <tr key={key} className={hidden ? 'off' : ''} style={{ ['--c' as string]: `var(--src-${src.toLowerCase()})` }}>
                    <td><span className="ch"><i className="dot" />{name}<span className="n">{p.counts[key] ?? 0}</span></span></td>
                    <td><input type="checkbox" checked={!hidden} onChange={() => toggleChannel('hiddenFeeds', key)} aria-label={`Pokazuj na liście: ${name}`} /></td>
                    <td><input type="checkbox" checked={!hidden && prefs.speakFeeds.includes(key)} disabled={hidden}
                      onChange={() => toggleChannel('speakFeeds', key)} aria-label={`Czytaj na głos: ${name}`} /></td>
                    <td><input type="checkbox" checked={!hidden && prefs.notifyFeeds.includes(key)} disabled={hidden}
                      onChange={() => toggleChannel('notifyFeeds', key)} aria-label={`Powiadomienia: ${name}`} /></td>
                  </tr>
                )
              }))}
            </tbody>
          </table>
          <p className="hint">
            Oko: kanał na liście. Odznaczony kanał od razu znika z listy i nie jest czytany ani pokazywany
            w powiadomieniach. Newsy wszystkich kanałów i tak przychodzą w tle, więc po zaznaczeniu kanał wraca od razu.
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
              <div className="setting">
                <span>Czytaj</span>
                <div className="segmented">
                  <button className={prefs.readLead ? '' : 'on'} onClick={() => onChange({ readLead: false })}>Sam tytuł</button>
                  <button className={prefs.readLead ? 'on' : ''} onClick={() => onChange({ readLead: true })}>Tytuł i lead</button>
                </div>
              </div>
              <Switch label="Mów „GPW:” przed komunikatami GPW" checked={prefs.sayGpw} onChange={() => onChange({ sayGpw: !prefs.sayGpw })} />
              <p className="hint">Stooq i ESPI są czytane bez nazwy źródła. Z leadu czytane są pełne zdania, bez daty i „(PAP)” na początku.</p>
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
            <span className={`conn ${p.status === 'live' ? 'on' : ''}`}><i />{p.status === 'live' ? 'na żywo' : 'łączę…'}</span>
          </div>
          <p className="hint">
            Nowe newsy przychodzą same przez stałe połączenie z serwerem, bez odświeżania. Serwer sprawdza kanały co około
            {' '}{CHECK_SECONDS} s (GPW rzadziej, w nocy i w weekendy co {QUIET_CHECK_SECONDS / 60} min).
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
          Źródła: <Link href="/o-stronie">Bankier.pl (ESPI/EBI), GPW, Stooq</Link>.
        </p>
      </aside>
    </div>
  )
}
