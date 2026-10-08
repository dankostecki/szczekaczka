'use client'

import { useEffect } from 'react'
import { FEEDS, SOURCES, feedKey, labelsOf } from '@/lib/sources'
import type { Prefs, Theme } from '@/lib/prefs'
import { polishVoices, pickVoice, speak } from '@/lib/speech'
import type { AwakeState } from '@/lib/wakeLock'
import { Close, Speaker, Bell } from './Icons'

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

  const { onClose } = p
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function toggleChannel(list: 'speakFeeds' | 'notifyFeeds', key: string) {
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
          <h3>Głos</h3>
          {p.canSpeak ? (
            <>
              <Switch label="Czytaj nowe newsy na głos" checked={p.voiceOn} onChange={p.onVoiceToggle} />
              <label className="setting">
                <span>Głos</span>
                <select value={prefs.voiceURI} onChange={(e) => onChange({ voiceURI: e.target.value })}>
                  <option value="">Automatyczny{auto ? ` (${auto.name})` : ''}</option>
                  {pl.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
                </select>
              </label>
              {pl.length === 0 && <p className="hint">Brak polskiego głosu w systemie. Przeglądarka użyje domyślnego.</p>}
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
          <h3>Co czytać i pokazywać</h3>
          <table className="channels">
            <thead>
              <tr><th>Kanał</th><th title="Czytaj na głos"><Speaker on size={16} /></th><th title="Powiadomienia"><Bell on size={16} /></th></tr>
            </thead>
            <tbody>
              {SOURCES.map((src) => FEEDS.filter((f) => f.source === src).map((f) => {
                const key = feedKey(f.source, f.label)
                return (
                  <tr key={key} style={{ ['--c' as string]: `var(--src-${src.toLowerCase()})` }}>
                    <td><span className="ch"><i className="dot" />{labelsOf(src).length === 1 ? src : `${src} · ${f.label}`}<span className="n">{p.counts[key] ?? 0}</span></span></td>
                    <td><input type="checkbox" checked={prefs.speakFeeds.includes(key)} onChange={() => toggleChannel('speakFeeds', key)} aria-label={`Czytaj ${key}`} /></td>
                    <td><input type="checkbox" checked={prefs.notifyFeeds.includes(key)} onChange={() => toggleChannel('notifyFeeds', key)} aria-label={`Powiadomienia ${key}`} /></td>
                  </tr>
                )
              }))}
            </tbody>
          </table>
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
          <Switch label="Odświeżaj co minutę" checked={prefs.auto} onChange={() => onChange({ auto: !prefs.auto })} />
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

        <p className="foot">Źródła: Bankier.pl (ESPI/EBI), GPW, Stooq. Ustawienia są zapisane tylko w tej przeglądarce.</p>
      </aside>
    </div>
  )
}
