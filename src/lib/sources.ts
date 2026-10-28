// News sources. Fetched on the server (/api/news): browsers cannot read these feeds directly (CORS).

export type Source = 'ESPI' | 'GPW' | 'STOOQ' | 'WALTER' | 'SEEKINGALPHA' | 'PAP' | 'MACRONEXT'

// The default order of the tabs, the sources in settings and the sources on the about page; the reader can move the sources (prefs.sourceOrder)
export const SOURCES: Source[] = ['ESPI', 'STOOQ', 'MACRONEXT', 'WALTER', 'SEEKINGALPHA', 'PAP', 'GPW']

// The sources in the order the reader chose: those of `order` that exist, once each, then the ones it does not have (a source added since) in their default order
export function orderedSources(order: readonly string[] | undefined): Source[] {
  const chosen = [...new Set(order ?? [])].filter((s): s is Source => (SOURCES as string[]).includes(s))
  return [...chosen, ...SOURCES.filter((s) => !chosen.includes(s))]
}

// One place up (-1) or down (1); the same order at the ends
export function moveSource(order: readonly Source[], source: Source, by: -1 | 1): Source[] {
  const from = order.indexOf(source), to = from + by
  if (from < 0 || to < 0 || to >= order.length) return [...order]
  const next = [...order]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

// The name of a source as the page writes it (the tabs, the tags, the settings), where it is not the key
export const sourceName = (source: string): string => (source === 'SEEKINGALPHA' ? 'SEEKING ALPHA' : source)
// "SEEKINGALPHA · MARKET CURRENTS" (how the server names a channel in an error) as the page writes it
export const feedName = (feed: string): string => feed.replace(/^[^ ]+/, sourceName)

// Language of a feed: read aloud with a voice for it
export type Lang = 'pl' | 'en'

export interface FeedConfig {
  source: Source
  label: string
  url: string
  minAge?: number // seconds: a feed that rarely changes is checked at most this often (never more often than usual)
  every?: number  // seconds: on weekdays by day checked this often instead of CHECK_SECONDS (ESPI: every minute)
  lang?: Lang     // 'pl' when not given
  // Not RSS. 'bankier-list': Bankier's web page with the list of company reports (parse.ts);
  // 'telegram': the public web preview of a Telegram channel, t.me/s/<channel> (parse.ts);
  // 'macronext': MacroNext's calendar of macro data, announced before each release (worker/macro.ts)
  format?: 'bankier-list' | 'telegram' | 'macronext' | 'macronext-gielda'
  leads?: string           // an RSS feed with leads for some of the entries (matched by link)
  // Every entry of the channel links here (the author's profile) instead of to its own address, which stays the entry's
  // `link` and id: the same link for all would make them one (parse.ts, finalizeItems). The page swaps it (linkOf).
  linkTo?: string
  // Entries are translated into Polish on the server (worker/translate.ts); the page shows the translation unless the
  // reader chose the original (prefs.originalFeeds)
  translate?: boolean
  // Entries of the evening after the close of the session in New York, until midnight in Poland, stay in English (worker/translate.ts,
  // usEvening): Seeking Alpha's flood of results and dividends would use up the day's translations
  untranslatedUsEvening?: boolean
}

export const FEEDS: FeedConfig[] = [
  // Bankier's ESPI RSS has only some of the reports (10 at a time, many never appear in it), so
  // the reports come from Bankier's list page, which has them all; leads from the RSS
  { source: 'ESPI',  label: 'BANKIER',     url: 'https://www.bankier.pl/gielda/wiadomosci/komunikaty-spolek',
    format: 'bankier-list', leads: 'https://www.bankier.pl/rss/espi.xml', every: 60 },
  { source: 'GPW',   label: 'KOMUNIKATY',  url: 'https://www.gpw.pl/rss_komunikaty' },
  { source: 'GPW',   label: 'PRASA',       url: 'https://www.gpw.pl/rss_komunikaty_prasowe',     minAge: 600 },
  { source: 'GPW',   label: 'AKTUALNOŚCI', url: 'https://www.gpw.pl/rss_aktualnosci',           minAge: 600 },
  { source: 'STOOQ', label: 'BIZNES',      url: 'https://static.stooq.pl/rss/pl/b.rss' },
  { source: 'STOOQ', label: 'KRAJ',        url: 'https://static.stooq.pl/rss/pl/c.rss' },
  { source: 'STOOQ', label: 'ŚWIAT',       url: 'https://static.stooq.pl/rss/pl/w.rss' },
  // Walter Bloomberg (@DeItaone on X): short market headlines in English. The channel has no RSS; its
  // public preview on Telegram shows the latest ~20 posts
  { source: 'WALTER', label: 'TELEGRAM',   url: 'https://t.me/s/WalterBloomberg', format: 'telegram', lang: 'en',
    linkTo: 'https://x.com/DeItaone', translate: true },
  // Seeking Alpha's market news ("Market Currents"): the feed holds only the latest few, so they are kept by the rules of every channel (24 hours
  // from publication, retain in worker/feeds.ts); the title and the lead in English are translated like Walter's posts
  { source: 'SEEKINGALPHA', label: 'MARKET CURRENTS', url: 'https://seekingalpha.com/market_currents.xml', lang: 'en', translate: true, untranslatedUsEvening: true },
  { source: 'PAP',   label: 'BIZNES',      url: 'https://pap-mediaroom.pl/kategoria/biznes-i-finanse/rss.xml' },
  { source: 'PAP',   label: 'NAUKA',       url: 'https://pap-mediaroom.pl/kategoria/nauka-i-technologie/rss.xml' },
  { source: 'PAP',   label: 'POLITYKA',    url: 'https://pap-mediaroom.pl/kategoria/polityka-i-społeczenstwo/rss.xml' },
  // Not news but announcements made by this site from MacroNext's pages for today: 10 minutes
  // before each macro release, and the stock market before the sessions
  { source: 'MACRONEXT', label: 'MAKRO',  url: 'https://macronext.pl/pl/kalendarium-dzis', format: 'macronext' },
  { source: 'MACRONEXT', label: 'GIEŁDA', url: 'https://macronext.pl/pl/dzis-na-gieldzie', format: 'macronext-gielda' },
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
// Whether any news may be in English (the settings then offer an English voice): a channel of its own, or a press release in
// a Polish one (lang.ts, itemLang)
export const HAS_ENGLISH = true
export const langOf = (source: string, label: string): Lang => FEED_LANG.get(feedKey(source, label)) ?? 'pl'

// Where an entry leads when clicked: its own address, or the page set for its channel (linkTo)
const LINK_TO = new Map(FEEDS.flatMap((f) => (f.linkTo ? [[feedKey(f.source, f.label), f.linkTo] as const] : [])))
export const linkOf = (it: { source: string; label: string; link: string }): string => LINK_TO.get(feedKey(it.source, it.label)) ?? it.link

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
  WALTER: {
    name: 'Walter Bloomberg na Telegramie',
    publisher: 'Walter Bloomberg (@DeItaone)',
    site: 'https://t.me/s/WalterBloomberg',
    about: 'Krótkie wiadomości z rynków na świecie z publicznego kanału Walter Bloomberg na Telegramie (ten sam autor co @DeItaone w serwisie X). Autor pisze po angielsku; Szczekaczka pokazuje je domyślnie po polsku, w tłumaczeniu maszynowym (model AI Gemma 4 w Cloudflare Workers AI), które może zawierać błędy. Oryginał po angielsku, czytany angielskim głosem, można wybrać w ustawieniach. Każda wiadomość prowadzi do profilu autora w serwisie X (x.com/DeItaone). To niezależny kanał, niezwiązany z agencją Bloomberg.',
  },
  PAP: {
    name: 'PAP MediaRoom',
    publisher: 'Polska Agencja Prasowa S.A.',
    site: 'https://pap-mediaroom.pl/rss',
    about: 'Komunikaty prasowe firm i instytucji z serwisu PAP MediaRoom Polskiej Agencji Prasowej, z kategorii: biznes i finanse, nauka i technologie, polityka i społeczeństwo.',
  },
  SEEKINGALPHA: {
    name: 'Seeking Alpha: Market Currents',
    publisher: 'Seeking Alpha',
    site: 'https://seekingalpha.com/market-news',
    about: 'Krótkie wiadomości z rynków świata z kanału RSS „Market Currents” serwisu Seeking Alpha (tytuł i zajawka). Seeking Alpha pisze po angielsku; Szczekaczka pokazuje je domyślnie po polsku, w tłumaczeniu maszynowym (model AI Gemma 4 w Cloudflare Workers AI), które może zawierać błędy. Wiadomości z wieczora po zamknięciu sesji w Nowym Jorku (w dni robocze od 22:00, a w tygodniach, gdy w USA i w Polsce czas zmienia się w różnych terminach, od 21:00, do północy), kiedy przychodzi bardzo dużo krótkich wiadomości o wynikach i dywidendach, zostają po angielsku. Oryginał po angielsku, czytany angielskim głosem, można wybrać w ustawieniach. Każda wiadomość prowadzi do artykułu w serwisie Seeking Alpha; Szczekaczka nie pobiera ani nie tłumaczy treści artykułów, tylko to, co podaje kanał. Kanał zachowuje tylko kilka ostatnich wiadomości, dlatego Szczekaczka trzyma każdą przez dobę od publikacji. To niezależny serwis, niezwiązany ze Seeking Alpha.',
  },
  MACRONEXT: {
    name: 'MacroNext – kalendarium danych makro i kalendarium giełdowe',
    publisher: 'MacroNext',
    site: 'https://macronext.pl/pl/kalendarium-dzis',
    about: 'MAKRO: zapowiedzi danych makroekonomicznych i wydarzeń banków centralnych 10 minut przed publikacją, z konsensusem i poprzednim odczytem; wydarzenia bez podanej godziny rano, o 6:40. Są tu dane o wysokiej i średniej wadze oraz wszystkie wydarzenia banków centralnych. GIEŁDA: wydarzenia spółek z GPW i NewConnect (dywidendy, walne zgromadzenia, debiuty) rano, o 7:35, oraz wyniki spółek z giełd w Nowym Jorku przed sesją i, dla tych, które raportują po niej, przed jej końcem. Przed porannym przeglądem rynków (o 7:45) jest też paczka na cały dzień: o 7:30 kalendarium makro na resztę dnia, o 7:35 wydarzenia na GPW i o 7:40 wyniki spółek z Nowego Jorku przed sesją i po niej.',
  },
}

// How often the server checks a feed (seconds) on weekdays from 7:00 to midnight; feeds with `every` or `minAge` use that instead.
// At night (0:00–7:00) and at weekends (schedule.ts) almost nothing is published, so every feed less often (`minAge` still counts).
export const CHECK_SECONDS = 120
export const QUIET_CHECK_SECONDS = 300
// Browsers are connected to one of this many hubs (Durable Objects), so that sending a
// change to everybody stays well under the 10 ms of CPU a free Cloudflare call may use
export const HUBS = 4
// The server sends a heartbeat at least this often; Cloudflare closes connections idle for 100 s
export const HEARTBEAT_SECONDS = 50
