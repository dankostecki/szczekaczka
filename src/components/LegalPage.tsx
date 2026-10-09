import Link from 'next/link'
import { AUTHOR, LEGAL_DATE, OPERATOR } from '@/lib/site'
import { Megaphone } from './Icons'

// Shared frame for the terms, the privacy policy and the about page
export default function LegalPage({ title, dated = true, children }: { title: string; dated?: boolean; children: React.ReactNode }) {
  return (
    <div className="app">
      <header className="top">
        <div className="bar wrap">
          <Link href="/" className="brand back" title="Wróć do newsów">
            <span className="logo"><Megaphone size={18} /></span>
            <span className="brand-name">Szczekaczka</span>
            <span className="beta" title="Wersja testowa: mogą pojawiać się błędy">BETA</span>
          </Link>
          <Link href="/" className="act back-link">← Wróć do newsów</Link>
        </div>
      </header>
      <main className="wrap">
        <article className="legal">
          <h1>{title}</h1>
          {dated && <p className="legal-date">Obowiązuje od {LEGAL_DATE}</p>}
          {children}
        </article>
      </main>
      <SiteFooter />
    </div>
  )
}

// Contact line used in both documents
export function Contact() {
  return (
    <>
      wiadomość prywatna do <a href={OPERATOR.x} target="_blank" rel="noopener noreferrer">{OPERATOR.xHandle}</a> w serwisie X
      {OPERATOR.email && <> lub e-mail: <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a></>}
    </>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-foot wrap">
      <span>Szczekaczka by <a href={AUTHOR.url} target="_blank" rel="noopener noreferrer">{AUTHOR.name}</a></span>
      <Link href="/o-stronie">O stronie i źródła</Link>
      <Link href="/regulamin">Regulamin</Link>
      <Link href="/polityka-prywatnosci">Polityka prywatności</Link>
    </footer>
  )
}
