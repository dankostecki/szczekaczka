import type { Metadata, Viewport } from 'next'
import { PREFS_KEY } from '@/lib/prefs'
import { BASE_PATH } from '@/lib/site'
import './globals.css'

export const metadata: Metadata = {
  title: 'Szczekaczka',
  description: 'Komunikaty ESPI, GPW, newsy Stooq, komunikaty PAP MediaRoom oraz zapowiedzi danych makro i wydarzeń giełdowych w jednym miejscu, czytane na głos.',
  icons: { icon: `${BASE_PATH}/icon.svg` },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#111113' },
  ],
}

// Apply a stored light/dark choice before the first paint (no flash)
const themeScript = `try{var t=JSON.parse(localStorage.getItem('${PREFS_KEY}')||'{}').theme;if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
