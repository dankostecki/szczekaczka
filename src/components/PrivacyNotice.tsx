'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { NOTICE_KEY, NOTICE_VERSION } from '@/lib/site'
import Duck from './Duck'

// Shown once on the first visit (and once more after it changes). The site has no cookies and
// nothing optional to agree to (only storage the features need), so this informs rather than asks for consent.
export default function PrivacyNotice() {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let seen = false
    try { seen = localStorage.getItem(NOTICE_KEY) === NOTICE_VERSION } catch {}
    if (!seen) setOpen(true)
  }, [])
  // Focus on the button without scrolling to it: on a short screen the window starts at the top, with the duck
  useEffect(() => { if (open) button.current?.focus({ preventScroll: true }) }, [open])

  function close() {
    try { localStorage.setItem(NOTICE_KEY, NOTICE_VERSION) } catch {}
    setOpen(false)
  }

  if (!open) return null
  return (
    <div className="overlay notice-overlay">
      <div className="notice" role="dialog" aria-modal="true" aria-labelledby="notice-title">
        <Duck size={132} bark label="Logo Szczekaczki: szczekająca kaczka" />
        <p className="notice-beta">
          <span className="beta">BETA</span>
          <span><b>To wersja testowa.</b> Szczekaczka jest jeszcze sprawdzana, więc mogą pojawiać się błędy.</span>
        </p>
        <h2 id="notice-title">Prywatność w Szczekaczce</h2>
        <ul>
          <li><b>Bez cookies i bez śledzenia.</b> Nie ma tu analityki, reklam ani skryptów z innych serwerów.</li>
          <li>
            <b>Ustawienia zostają u Ciebie.</b> Motyw, głos, przeczytane i zapisane newsy zapisujemy tylko w pamięci
            tej przeglądarki (localStorage). Nie trafiają na serwer.
          </li>
          <li>
            <b>Serwer widzi tylko to, co każda strona:</b> adres IP i dane przeglądarki u dostawcy hostingu (Cloudflare,
            a pod adresem github.io także GitHub).
          </li>
          <li>
            <b>Czytanie na głos</b> głosami „Google” lub „naturalnymi” Microsoftu wysyła czytany tekst do producenta
            przeglądarki.
          </li>
        </ul>
        <p className="notice-links">
          Szczegóły: <Link href="/polityka-prywatnosci" onClick={close}>Polityka prywatności</Link> ·{' '}
          <Link href="/regulamin" onClick={close}>Regulamin</Link>
        </p>
        <button ref={button} className="notice-ok" onClick={close}>Rozumiem</button>
      </div>
    </div>
  )
}
