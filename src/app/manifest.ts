import type { MetadataRoute } from 'next'
import { BASE_PATH } from '@/lib/site'

// The web app manifest, so the page can be installed on a phone or a computer. It is generated at build time, because the
// GitHub Pages copy lives under /szczekaczka and every address in it needs that prefix.
export const dynamic = 'force-static'

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
    background_color: '#ffffff',
    theme_color: '#ffffff',
    categories: ['news', 'finance'],
    icons: [
      { src: `${BASE_PATH}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${BASE_PATH}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${BASE_PATH}/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
