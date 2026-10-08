// RSS sources. Fetched on the server (/api/news): browsers cannot read these feeds directly (CORS).

export type Source = 'ESPI' | 'GPW' | 'STOOQ'

export const SOURCES: Source[] = ['ESPI', 'GPW', 'STOOQ']

export interface FeedConfig {
  source: Source
  label: string
  url: string
}

export const FEEDS: FeedConfig[] = [
  { source: 'ESPI',  label: 'ESPI/EBI',    url: 'https://www.bankier.pl/rss/espi.xml' },
  { source: 'GPW',   label: 'KOMUNIKATY',  url: 'https://www.gpw.pl/rss_komunikaty' },
  { source: 'GPW',   label: 'INDEKSY',     url: 'https://www.gpw.pl/rss_komunikaty_indeksowe' },
  { source: 'GPW',   label: 'KALENDARZ',   url: 'https://www.gpw.pl/rss-kalendarium-zdarzen' },
  { source: 'GPW',   label: 'PRASA',       url: 'https://www.gpw.pl/rss_komunikaty_prasowe' },
  { source: 'GPW',   label: 'AKTUALNOŚCI', url: 'https://www.gpw.pl/rss_aktualnosci' },
  { source: 'STOOQ', label: 'BIZNES',      url: 'https://static.stooq.pl/rss/pl/b.rss' },
  { source: 'STOOQ', label: 'KRAJ',        url: 'https://static.stooq.pl/rss/pl/c.rss' },
  { source: 'STOOQ', label: 'ŚWIAT',       url: 'https://static.stooq.pl/rss/pl/w.rss' },
]

// "GPW:INDEKSY" — key for a single channel (settings, filters)
export const feedKey = (source: string, label: string) => `${source}:${label}`
export const FEED_KEYS = FEEDS.map((f) => feedKey(f.source, f.label))

export const labelsOf = (source: Source) => FEEDS.filter((f) => f.source === source).map((f) => f.label)

// Channels that are not read aloud or notified by default. The calendar lists
// upcoming events, so its dates are not "just published".
export const QUIET_BY_DEFAULT = [feedKey('GPW', 'KALENDARZ')]
