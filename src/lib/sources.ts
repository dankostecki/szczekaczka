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

// Who publishes each source, for the "O stronie i źródła" page
export const SOURCE_INFO: Record<Source, { name: string; publisher: string; site: string; about: string }> = {
  ESPI: {
    name: 'Bankier.pl – komunikaty spółek ESPI/EBI',
    publisher: 'Bankier.pl',
    site: 'https://www.bankier.pl/gielda/wiadomosci/komunikaty-spolek',
    about: 'Raporty bieżące i okresowe spółek giełdowych z systemów ESPI i EBI, publikowane przez Bankier.pl. Autorami raportów są spółki; oficjalnie publikuje je system ESPI/EBI.',
  },
  GPW: {
    name: 'Giełda Papierów Wartościowych w Warszawie',
    publisher: 'Giełda Papierów Wartościowych w Warszawie S.A.',
    site: 'https://www.gpw.pl/_rss',
    about: 'Komunikaty giełdy, komunikaty indeksowe, kalendarium zdarzeń rynkowych, komunikaty prasowe i aktualności z kanałów RSS GPW.',
  },
  STOOQ: {
    name: 'Stooq',
    publisher: 'Stooq.pl',
    site: 'https://stooq.pl',
    about: 'Wiadomości z kraju, ze świata i z biznesu z kanałów RSS serwisu Stooq.',
  },
}

// The server keeps one shared copy of the list for this long (and fetches the RSS
// feeds at most this often), whatever the number of users
export const CACHE_SECONDS = 30
// How often the page asks for the list, in minutes
export const REFRESH_OPTIONS = [1, 5, 10, 15]

// Channels that are not read aloud or notified by default. The calendar lists
// upcoming events, so its dates are not "just published".
export const QUIET_BY_DEFAULT = [feedKey('GPW', 'KALENDARZ')]
