import type { Metadata, Viewport } from 'next'
import { PREFS_KEY } from '@/lib/prefs'
import { BASE_PATH } from '@/lib/site'
import ServiceWorker from '@/components/ServiceWorker'
import './globals.css'

export const metadata: Metadata = {
  title: 'Szczekaczka',
  description: 'Komunikaty ESPI, GPW, newsy Stooq, wiadomości Waltera Bloomberga, investingLive i Seeking Alpha, komunikaty PAP MediaRoom oraz zapowiedzi danych makro i wydarzeń giełdowych w jednym miejscu, czytane na głos.',
  // Not for search engines or archives: the other copy of the page (GitHub Pages) cannot have a robots.txt of its own
  robots: { index: false, follow: false, noarchive: true },
  applicationName: 'Szczekaczka',
  appleWebApp: { capable: true, title: 'Szczekaczka', statusBarStyle: 'default' },
  other: { 'apple-mobile-web-app-capable': 'yes' }, // Safari on an iPhone, next to the manifest
  icons: {
    icon: [{ url: `${BASE_PATH}/icon.png`, sizes: '64x64', type: 'image/png' }, { url: `${BASE_PATH}/icon-192.png`, sizes: '192x192', type: 'image/png' }],
    apple: `${BASE_PATH}/apple-touch-icon.png`,
  },
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
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  )
}
