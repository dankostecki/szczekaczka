import type { MetadataRoute } from 'next'
import { BASE_PATH } from '@/lib/site'

// The web app manifest, so the page can be installed on a phone or a computer. It is generated at build time, because the
// GitHub Pages copy lives under /szczekaczka and every address in it needs that prefix.
export const dynamic = 'force-static'

// What Android (and a desktop window) shows while the app starts: the one color of this file, whatever the theme. There
// is no dark variant in the manifest yet, and white before a dark page (or dark before a white one) is a flash, so it
// is the red of the logo, which is half way between the two and the color the launcher icon already has. An iPhone
// takes its launch screen from src/app/layout.tsx instead, and can follow the system.
const SPLASH = '#E54C58'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: `${BASE_PATH}/`,
    name: 'Szczekaczka',
    short_name: 'Szczekaczka',
    description: 'Komunikaty ESPI, GPW, newsy Stooq, komunikaty PAP MediaRoom oraz zapowiedzi danych makro i wydarzeń giełdowych w jednym miejscu, czytane na głos.',
    lang: 'pl',
    start_url: `${BASE_PATH}/`,
    scope: `${BASE_PATH}/`,
    display: 'standalone',
    background_color: SPLASH,
    theme_color: SPLASH,
    categories: ['news', 'finance'],
    icons: [
      { src: `${BASE_PATH}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${BASE_PATH}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${BASE_PATH}/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
