// RSS sources. Fetched on the server (/api/news): browsers cannot read these feeds directly (CORS).

export type Source = 'ESPI' | 'GPW' | 'STOOQ' | 'PAP'

export const SOURCES: Source[] = ['ESPI', 'GPW', 'STOOQ', 'PAP']

export interface FeedConfig {
  source: Source
  label: string
  url: string
  minAge?: number // seconds: a feed that rarely changes is checked at most this often (never more often than usual)
}

export const FEEDS: FeedConfig[] = [
  { source: 'ESPI',  label: 'ESPI/EBI',    url: 'https://www.bankier.pl/rss/espi.xml' },
  { source: 'GPW',   label: 'KOMUNIKATY',  url: 'https://www.gpw.pl/rss_komunikaty',             minAge: 120 },
  { source: 'GPW',   label: 'INDEKSY',     url: 'https://www.gpw.pl/rss_komunikaty_indeksowe',   minAge: 300 },
  { source: 'GPW',   label: 'PRASA',       url: 'https://www.gpw.pl/rss_komunikaty_prasowe',     minAge: 600 },
  { source: 'GPW',   label: 'AKTUALNOŚCI', url: 'https://www.gpw.pl/rss_aktualnosci',           minAge: 600 },
  { source: 'STOOQ', label: 'BIZNES',      url: 'https://static.stooq.pl/rss/pl/b.rss' },
  { source: 'STOOQ', label: 'KRAJ',        url: 'https://static.stooq.pl/rss/pl/c.rss' },
  { source: 'STOOQ', label: 'ŚWIAT',       url: 'https://static.stooq.pl/rss/pl/w.rss' },
  { source: 'PAP',   label: 'BIZNES',      url: 'https://pap-mediaroom.pl/kategoria/biznes-i-finanse/rss.xml',         minAge: 120 },
  { source: 'PAP',   label: 'NAUKA',       url: 'https://pap-mediaroom.pl/kategoria/nauka-i-technologie/rss.xml',      minAge: 120 },
  { source: 'PAP',   label: 'POLITYKA',    url: 'https://pap-mediaroom.pl/kategoria/polityka-i-społeczenstwo/rss.xml', minAge: 120 },
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
    about: 'Komunikaty giełdy, komunikaty indeksowe, komunikaty prasowe i aktualności z kanałów RSS GPW.',
  },
  STOOQ: {
    name: 'Stooq',
    publisher: 'Stooq.pl',
    site: 'https://stooq.pl',
    about: 'Wiadomości z kraju, ze świata i z biznesu z kanałów RSS serwisu Stooq.',
  },
  PAP: {
    name: 'PAP MediaRoom',
    publisher: 'Polska Agencja Prasowa S.A.',
    site: 'https://pap-mediaroom.pl/rss',
    about: 'Komunikaty prasowe firm i instytucji z serwisu PAP MediaRoom Polskiej Agencji Prasowej, z kategorii: biznes i finanse, nauka i technologie, polityka i społeczeństwo.',
  },
}

// How often the server checks a feed (seconds); feeds with `minAge` use that instead.
// At night and at weekends (schedule.ts) almost nothing is published, so less often.
export const CHECK_SECONDS = 60
export const QUIET_CHECK_SECONDS = 180
// Browsers are connected to one of this many hubs (Durable Objects), so that sending a
// change to everybody stays well under the 10 ms of CPU a free Cloudflare call may use
export const HUBS = 4
// The server sends a heartbeat at least this often; Cloudflare closes connections idle for 100 s
export const HEARTBEAT_SECONDS = 50
