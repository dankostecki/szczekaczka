// News sources. Fetched on the server (/api/news): browsers cannot read these feeds directly (CORS).

export type Source = 'ESPI' | 'GPW' | 'STOOQ' | 'PAP' | 'MACRONEXT'

export const SOURCES: Source[] = ['ESPI', 'GPW', 'STOOQ', 'PAP', 'MACRONEXT']

// Language of a feed: read aloud with a voice for it
export type Lang = 'pl' | 'en'

export interface FeedConfig {
  source: Source
  label: string
  url: string
  minAge?: number // seconds: a feed that rarely changes is checked at most this often (never more often than usual)
  lang?: Lang     // 'pl' when not given
  // Not RSS. 'bankier-list': Bankier's web page with the list of company reports (parse.ts);
  // 'macronext': MacroNext's calendar of macro data, announced before each release (worker/macro.ts)
  format?: 'bankier-list' | 'macronext'
  leads?: string           // an RSS feed with leads for some of the entries (matched by link)
}

export const FEEDS: FeedConfig[] = [
  // Bankier's ESPI RSS has only some of the reports (10 at a time, many never appear in it), so
  // the reports come from Bankier's list page, which has them all; leads from the RSS
  { source: 'ESPI',  label: 'BANKIER',     url: 'https://www.bankier.pl/gielda/wiadomosci/komunikaty-spolek',
    format: 'bankier-list', leads: 'https://www.bankier.pl/rss/espi.xml' },
  { source: 'GPW',   label: 'KOMUNIKATY',  url: 'https://www.gpw.pl/rss_komunikaty',             minAge: 120 },
  { source: 'GPW',   label: 'PRASA',       url: 'https://www.gpw.pl/rss_komunikaty_prasowe',     minAge: 600 },
  { source: 'GPW',   label: 'AKTUALNOŚCI', url: 'https://www.gpw.pl/rss_aktualnosci',           minAge: 600 },
  { source: 'STOOQ', label: 'BIZNES',      url: 'https://static.stooq.pl/rss/pl/b.rss' },
  { source: 'STOOQ', label: 'KRAJ',        url: 'https://static.stooq.pl/rss/pl/c.rss' },
  { source: 'STOOQ', label: 'ŚWIAT',       url: 'https://static.stooq.pl/rss/pl/w.rss' },
  { source: 'PAP',   label: 'BIZNES',      url: 'https://pap-mediaroom.pl/kategoria/biznes-i-finanse/rss.xml',         minAge: 120 },
  { source: 'PAP',   label: 'NAUKA',       url: 'https://pap-mediaroom.pl/kategoria/nauka-i-technologie/rss.xml',      minAge: 120 },
  { source: 'PAP',   label: 'POLITYKA',    url: 'https://pap-mediaroom.pl/kategoria/polityka-i-społeczenstwo/rss.xml', minAge: 120 },
  // Not news but announcements made by this site, 10 minutes before each release in MacroNext's
  // calendar; `url` is the start of the address of a day's page ("…/d/2026-10-9")
  { source: 'MACRONEXT', label: 'MAKRO',  url: 'https://macronext.pl/pl/dane-makro/d/', format: 'macronext' },
]

// "GPW:PRASA" — key for a single channel (settings, filters)
export const feedKey = (source: string, label: string) => `${source}:${label}`
export const FEED_KEYS = FEEDS.map((f) => feedKey(f.source, f.label))

// Channels that got a new name: settings and stored news move to it (old key -> new key)
export const RENAMED_FEEDS: Record<string, string> = { 'ESPI:ESPI/EBI': 'ESPI:BANKIER' }
export const renamedKey = (key: string) => RENAMED_FEEDS[key] ?? key
// An item id starts with its channel key ("ESPI:ESPI/EBI:https://…")
export function renamedId(id: string): string {
  for (const [from, to] of Object.entries(RENAMED_FEEDS)) if (id.startsWith(`${from}:`)) return to + id.slice(from.length)
  return id
}
export function renamedItem<T extends { id: string; source: string; label: string }>(item: T): T {
  const key = renamedKey(feedKey(item.source, item.label))
  return key === feedKey(item.source, item.label) ? item : { ...item, id: renamedId(item.id), label: key.slice(key.indexOf(':') + 1) }
}

const FEED_LANG = new Map(FEEDS.map((f) => [feedKey(f.source, f.label), f.lang ?? 'pl']))
// Whether any channel is in English (the settings then offer an English voice)
export const HAS_ENGLISH = FEEDS.some((f) => f.lang === 'en')
export const langOf = (source: string, label: string): Lang => FEED_LANG.get(feedKey(source, label)) ?? 'pl'

export const labelsOf = (source: Source) => FEEDS.filter((f) => f.source === source).map((f) => f.label)

// Who publishes each source, for the "O stronie i źródła" page
export const SOURCE_INFO: Record<Source, { name: string; publisher: string; site: string; about: string }> = {
  ESPI: {
    name: 'Bankier.pl – komunikaty spółek ESPI/EBI',
    publisher: 'Bankier.pl',
    site: 'https://www.bankier.pl/gielda/wiadomosci/komunikaty-spolek',
    about: 'Raporty bieżące i okresowe spółek giełdowych z systemów ESPI i EBI z listy komunikatów Bankier.pl (godzina i tytuł; zajawka z kanału RSS Bankiera, gdy raport w nim jest). Kanał RSS Bankiera nie ma wszystkich raportów, dlatego czytana jest lista ze strony. Autorami raportów są spółki; oficjalnie publikuje je system ESPI/EBI.',
  },
  GPW: {
    name: 'Giełda Papierów Wartościowych w Warszawie',
    publisher: 'Giełda Papierów Wartościowych w Warszawie S.A.',
    site: 'https://www.gpw.pl/_rss',
    about: 'Komunikaty giełdy, komunikaty prasowe i aktualności z kanałów RSS GPW.',
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
  MACRONEXT: {
    name: 'MacroNext – kalendarium danych makro',
    publisher: 'MacroNext',
    site: 'https://macronext.pl/pl/dane-makro',
    about: 'Zapowiedzi publikacji danych makroekonomicznych i wydarzeń banków centralnych, 10 minut przed nimi: kraj, nazwa danych, okres, konsensus (prognoza z kalendarium) i poprzedni odczyt; wystąpienia z tym, kto i skąd mówi (bez kraju). Wydarzenia bez podanej godziny są zapowiadane rano, o 6:40. Zapowiedzi tworzy ta strona z kalendarium MacroNext, czytanego o 0:01 i 6:30; są w nich dane o wysokiej i średniej wadze oraz wszystkie wydarzenia banków centralnych (bez zwykłych danych z Węgier, Rumunii, Czech i Słowacji).',
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
