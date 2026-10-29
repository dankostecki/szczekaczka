// The instruments a news names, for their quotes in the reading window (components/NewsQuotes.tsx): what the news gives as a ticker
// ("$TSLA" in Walter Bloomberg, "(NASDAQ:TSLA)" in Seeking Alpha), a currency pair ("EUR/USD"), and the companies, indices, commodities and
// crypto it names, as Polish and English write them ("Tesla", "akcje Tesli", "cena złota", "Nasdaq 100"). No AI and nothing from the network:
// the names are in this file and the symbols in lib/market.ts. A name that is also a word or another thing is taken only where its
// surroundings fit (VISA in capitals is a visa, "Nikkei Asia" a newspaper, "na Nasdaq" the exchange). Oil, of any kind, is both Brent and WTI.
import { INSTRUMENTS, MARKET_GROUPS } from './market'

// The channels whose news get quotes; ESPI and GPW (the Warsaw exchange, in the widgets only at the end of the day) and MacroNext not yet
export const QUOTED_SOURCES: readonly string[] = ['WALTER', 'INVESTINGLIVE', 'SEEKINGALPHA', 'STOOQ', 'PAP']
export const MAX_QUOTED = 3

interface Alias {
  name: string
  exact?: boolean // the letters as written (else only the first letter: "Tesla", "TESLA" but not "tesla")
  fixed?: boolean // only this form (the Polish forms are listed one by one), not declined
  before?: RegExp // not when the text before it ends like this
  after?: RegExp  // not when the text after it begins like this
  need?: RegExp   // only when the text before it ends like this
}
type Named = [symbol: string | string[], ...names: (string | Alias)[]]

// Before an exchange's name: a listing on it, not its index
const ON_EXCHANGE = /(?:\bna|\bw|\bz|\bon|\bat|\bthe|\blisted|giełd\p{L}*|debiut\p{L}*|notowan\p{L}*)\s+$/iu
// Before a commodity's genitive that is also an adjective ("cena złota", not "złota akcja")
const OF_COMMODITY = new RegExp(String.raw`(?:(?:cen|uncj|kurs|notowa|rynk|sztab|zapas|rezerw|wydobyci|produkcj|popyt|podaż|zakup|sprzeda|import|eksport|wartoś|kopal|ton|kilogram|ETF|fundusz|inwestycj|posiadacz)\p{L}*|rynek|kg|(?:złot|srebr|rop|miedz|platyn)\p{L}*\s+(?:i|oraz|lub|czy|a))\s+$`, 'iu')
// Before a name that is also a surname: the company, not a person ("akcje Kruka", "spółka Kruk")
const OF_COMPANY = /(?:spółk|akcj|kurs|notowa|walor|windykac|zysk|wynik|dywidend|emitent|giełdow|kapitalizacj|przychod|zarząd|prezes)\p{L}*\s+$/iu
const OIL = ['CMCMARKETS:UKCRUDEOIL', 'CMCMARKETS:USCRUDEOIL']
const fixed = (names: string[], more: Omit<Alias, 'name' | 'fixed'> = {}): Alias[] => names.map((name) => ({ name, fixed: true, ...more }))

const NAMED: Named[] = [
  // ── United States ──
  ['NASDAQ:AAPL', 'Apple'], ['NASDAQ:MSFT', 'Microsoft'], ['NASDAQ:NVDA', 'Nvidia'], ['NASDAQ:AMZN', 'Amazon'], ['NASDAQ:GOOGL', 'Alphabet', 'Google'],
  ['NASDAQ:META', { name: 'Meta', exact: true }, 'Meta Platforms', 'Facebook'], ['NASDAQ:TSLA', 'Tesla'], ['NASDAQ:NFLX', 'Netflix', 'Netfliks'],
  ['NASDAQ:AMD', 'AMD', 'Advanced Micro Devices'], ['NASDAQ:AVGO', 'Broadcom'], ['NASDAQ:PLTR', 'Palantir'], ['NASDAQ:INTC', { name: 'Intel', exact: true }],
  ['NASDAQ:QCOM', 'Qualcomm'], ['NASDAQ:CSCO', 'Cisco'], ['NASDAQ:ADBE', 'Adobe'], ['NASDAQ:PEP', 'PepsiCo', 'Pepsi'], ['NASDAQ:COST', 'Costco'],
  ['NASDAQ:WMT', 'Walmart'], ['NASDAQ:CMCSA', 'Comcast'], ['NASDAQ:TXN', 'Texas Instruments'], ['NASDAQ:AMAT', 'Applied Materials'], ['NASDAQ:MU', 'Micron'],
  ['NASDAQ:LRCX', 'Lam Research'], ['NASDAQ:ASML', 'ASML'], ['NASDAQ:ARM', 'Arm Holdings'], ['NASDAQ:MRVL', 'Marvell'], ['NASDAQ:SMCI', 'Super Micro', 'Supermicro'],
  ['NASDAQ:PYPL', 'PayPal'], ['NASDAQ:COIN', 'Coinbase'], ['NASDAQ:HOOD', 'Robinhood'], ['NASDAQ:MSTR', 'MicroStrategy'], ['NASDAQ:ABNB', 'Airbnb'],
  ['NASDAQ:BKNG', 'Booking Holdings', 'Booking.com'], ['NASDAQ:SBUX', 'Starbucks'], ['NASDAQ:MRNA', 'Moderna'], ['NASDAQ:GILD', 'Gilead'], ['NASDAQ:AMGN', 'Amgen'],
  ['NASDAQ:ISRG', 'Intuitive Surgical'], ['NASDAQ:PDD', 'PDD Holdings', { name: 'Temu', exact: true }, 'Pinduoduo'], ['NASDAQ:JD', 'JD.com'], ['NASDAQ:BIDU', 'Baidu'],
  ['NASDAQ:RIVN', 'Rivian'], ['NASDAQ:LCID', { name: 'Lucid', exact: true }], ['NASDAQ:PANW', 'Palo Alto Networks'], ['NASDAQ:CRWD', 'CrowdStrike'],
  ['NASDAQ:INTU', 'Intuit'], ['NASDAQ:MDLZ', 'Mondelez'], ['NASDAQ:TMUS', { name: 'T-Mobile', after: /^\s+Polsk/u }], ['NASDAQ:LULU', 'Lululemon'],
  ['NASDAQ:DASH', 'DoorDash'], ['NASDAQ:LIN', 'Linde'],
  ['NYSE:BRK.B', 'Berkshire Hathaway', 'Berkshire'], ['NYSE:JPM', 'JPMorgan', 'JP Morgan', 'J.P. Morgan'], ['NYSE:BAC', 'Bank of America', 'BofA'],
  ['NYSE:WFC', 'Wells Fargo'], ['NYSE:C', 'Citigroup', 'Citi'], ['NYSE:GS', 'Goldman Sachs', 'Goldman'], ['NYSE:MS', 'Morgan Stanley'], ['NYSE:V', { name: 'Visa', exact: true }],
  ['NYSE:MA', 'Mastercard'], ['NYSE:AXP', 'American Express'], ['NYSE:BLK', 'BlackRock'], ['NYSE:BX', 'Blackstone'], ['NYSE:KO', 'Coca-Cola', 'Coca Cola'],
  ['NYSE:PG', 'Procter & Gamble', 'P&G'], ['NYSE:JNJ', 'Johnson & Johnson', 'J&J'], ['NYSE:PFE', 'Pfizer'], ['NYSE:MRK', { name: 'Merck', after: /^\s+KGaA/u }],
  ['NYSE:LLY', 'Eli Lilly'], ['NYSE:ABBV', 'AbbVie'], ['NYSE:UNH', 'UnitedHealth'], ['NYSE:NVO', 'Novo Nordisk'], ['NYSE:XOM', 'Exxon Mobil', 'ExxonMobil', 'Exxon'],
  ['NYSE:CVX', 'Chevron'], ['NYSE:COP', 'ConocoPhillips'], ['NYSE:OXY', 'Occidental'], ['NYSE:SHEL', { name: 'Shell', exact: true }],
  ['NYSE:BP', { name: 'BP', before: /\d\s*$/u }], ['NYSE:BA', 'Boeing'], ['NYSE:LMT', 'Lockheed Martin', 'Lockheed'], ['NYSE:RTX', { name: 'RTX', after: /^\s*\d/u }, 'Raytheon'],
  ['NYSE:NOC', 'Northrop Grumman'], ['NYSE:GD', 'General Dynamics'], ['NYSE:CAT', 'Caterpillar'], ['NYSE:DE', 'Deere'], ['NYSE:GE', 'GE Aerospace', 'General Electric'],
  ['NYSE:GEV', 'GE Vernova'], ['NYSE:GM', 'General Motors', 'GM'], ['NYSE:F', 'Ford'], ['NYSE:STLA', 'Stellantis'], ['NYSE:RACE', 'Ferrari'], ['NYSE:TM', 'Toyota'],
  ['NYSE:SONY', 'Sony'], ['NYSE:HD', 'Home Depot'], ['NYSE:MCD', 'McDonald'], ['NYSE:NKE', 'Nike'], ['NYSE:DIS', 'Disney'], ['NYSE:T', 'AT&T'], ['NYSE:VZ', 'Verizon'],
  ['NYSE:IBM', 'IBM'], ['NYSE:ORCL', 'Oracle'], ['NYSE:CRM', 'Salesforce'], ['NYSE:NOW', 'ServiceNow'], ['NYSE:SNOW', 'Snowflake'], ['NYSE:UBER', 'Uber'],
  ['NYSE:SPOT', 'Spotify'], ['NYSE:DELL', 'Dell'], ['NYSE:TSM', 'TSMC', 'Taiwan Semiconductor'], ['NYSE:BABA', 'Alibaba'], ['NYSE:NIO', 'NIO', { name: 'Nio', exact: true }],
  ['NYSE:SAP', 'SAP'], ['NYSE:UL', 'Unilever'], ['NYSE:BUD', 'AB InBev', 'Anheuser-Busch'], ['NYSE:RIO', 'Rio Tinto'], ['NYSE:BHP', 'BHP Group'],
  ['NYSE:VALE', { name: 'Vale', exact: true }], ['NYSE:NEM', 'Newmont'], ['NYSE:FCX', 'Freeport-McMoRan'], ['NYSE:HSBC', 'HSBC'], ['NYSE:UBS', 'UBS'],
  ['NYSE:DB', 'Deutsche Bank'], ['NYSE:UPS', 'UPS'], ['NYSE:FDX', 'FedEx'], ['NYSE:MMM', '3M'], ['NYSE:PM', 'Philip Morris'], ['NYSE:ABT', 'Abbott Laboratories'],
  ['NYSE:ACN', 'Accenture'], ['NYSE:CVS', 'CVS Health', 'CVS'],
  // ── Germany ──
  ['XETR:RHM', 'Rheinmetall'], ['XETR:VOW3', 'Volkswagen'], ['XETR:BMW', 'BMW'], ['XETR:MBG', 'Mercedes-Benz'],
  ['XETR:SIE', { name: 'Siemens', after: /^\s+(?:Energy|Healthineers)/u }], ['XETR:ALV', 'Allianz'], ['XETR:BAYN', { name: 'Bayer', after: /^\s+(?:Leverkusen|04)/u }], ['XETR:BAS', 'BASF'],
  ['XETR:LHA', 'Lufthansa'], ['XETR:ADS', 'Adidas'],
  // ── Poland ──
  ['GPW:PKN', 'Orlen', 'PKN Orlen'], ['GPW:PKO', 'PKO BP', 'PKO Bank Polski'], ['GPW:PZU', 'PZU'], ['GPW:PEO', 'Pekao', 'Bank Pekao'],
  ['GPW:KGH', 'KGHM', 'KGHM Polska Miedź'], ['GPW:CDR', 'CD Projekt'], ['GPW:LPP', 'LPP'], ['GPW:DNP', 'Dino Polska', { name: 'Dino', exact: true }],
  ['GPW:ALE', { name: 'Allegro', exact: true }], ['GPW:SPL', 'Santander Bank Polska', 'Santander BP'], ['GPW:MBK', 'mBank'], ['GPW:ALR', 'Alior Bank', 'Alior'],
  ['GPW:BDX', 'Budimex', 'Budimeks'], ['GPW:KTY', ...fixed(['Grupa Kęty', 'Grupy Kęty', 'Grupie Kęty', 'Grupę Kęty', 'Grupą Kęty'])], ['GPW:KRU', { name: 'Kruk', exact: true, need: OF_COMPANY }, ...fixed(['Grupa Kruk', 'Grupy Kruk', 'Grupie Kruk', 'Grupę Kruk', 'Grupą Kruk', 'Kruk SA', 'Kruk S.A.'])],
  ['GPW:OPL', 'Orange Polska'], ['GPW:PGE', 'PGE'], ['GPW:JSW', 'JSW'], ['GPW:CPS', 'Cyfrowy Polsat', ...fixed(['Cyfrowego Polsatu', 'Cyfrowym Polsacie'])],
  ['GPW:PCO', 'Pepco'], ['GPW:ZAB', { name: 'Żabka', exact: true }], ['GPW:ACP', 'Asseco Poland', 'Asseco'], ['GPW:TPE', 'Tauron'], ['GPW:ENA', 'Enea'],
  ['GPW:BFT', 'Benefit Systems'], ['GPW:ASB', 'Asbis', 'ASBISc'], ['GPW:XTB', 'XTB'], ['GPW:CCC', { name: 'CCC', before: /(?:rating\p{L}*|ocen\p{L}*|\bdo|\bz)\s+$/iu, after: /^[+-]/u }],
  ['GPW:MIL', 'Bank Millennium', { name: 'Millennium', exact: true }], ['GPW:BHW', 'Citi Handlowy', 'Bank Handlowy'], ['GPW:ING', 'ING Bank Śląski', 'ING BSK'],
  ['GPW:WIG20', 'WIG20', 'WIG 20'], ['GPW:WIG', 'WIG'], ['GPW:MWIG40', 'mWIG40'], ['GPW:SWIG80', 'sWIG80'],
  // ── Indices ──
  ['CMCMARKETS:SPX500', 'S&P 500', 'S&P500', 'SP500'],
  ['CMCMARKETS:NDAQ100', 'Nasdaq 100', 'Nasdaq-100', 'Nasdaq Composite',
    { name: 'Nasdaq', before: ON_EXCHANGE, after: /^\s*(?:Inc|Stock|Nordic|Baltic|Stockholm|Copenhagen|Helsinki|Tallinn|Riga|Vilnius|First North)/iu }],
  ['CMCMARKETS:GERMAN30', 'DAX'],
  ['CMCMARKETS:JAPAN225', 'Nikkei 225',
    { name: 'Nikkei', before: /(?:dziennik\p{L}*|gazet\p{L}*|serwis\p{L}*|według|told|by|in)\s+$/iu, after: /^\s+(?:Asia|podał|poda|informuj|donosi|pisze|napisał|reported|reports|said|says)/iu }],
  ['FOREXCOM:DJI', { name: 'Dow Jones', after: /^\s+(?:Newswires|News|Market Data|&)/u }, 'DJIA'],
  ['CMCMARKETS:UK100', 'FTSE 100', { name: 'FTSE', after: /^\s+(?:Russell|All|250|350|MIB|China|Emerging|Developed)/u }],
  ['TVC:VIX', 'VIX'], ['TVC:DXY', 'DXY', ...fixed(['indeks dolara', 'indeksu dolara', 'indeksem dolara', 'indeksie dolara'])],
  // ── Commodities and crypto ──
  ['CMCMARKETS:GOLD', ...fixed(['złoto', 'złotem', 'złocie']), { name: 'złota', fixed: true, need: OF_COMMODITY }, 'gold', 'XAU/USD', 'XAUUSD'],
  ['CMCMARKETS:SILVER', ...fixed(['srebro', 'srebrem', 'srebrze']), { name: 'srebra', fixed: true, need: OF_COMMODITY }, 'silver', 'XAG/USD', 'XAGUSD'],
  // Oil, its stocks, OPEC, the price of a barrel: Brent and WTI, both from CMC
  [OIL, ...fixed(['ropa', 'ropy', 'ropę', 'ropą', 'ropie', 'baryłka', 'baryłki', 'baryłkę', 'baryłką', 'baryłce', 'baryłek']), 'Brent', 'WTI', 'crude', 'OPEC'],
  ['CMCMARKETS:COPPER', ...fixed(['miedź', 'miedzi', 'miedzią'], { before: /Polsk\p{L}*\s+$/iu }), 'copper'],
  ['TVC:PLATINUM', ...fixed(['platyna', 'platyny', 'platynę', 'platyną', 'platynie']), 'platinum'],
  ['BITSTAMP:BTCUSD', 'bitcoin', 'BTC'], ['BITSTAMP:ETHUSD', 'ethereum', 'ETH'], ['BITSTAMP:XRPUSD', 'XRP'],
  ['BITSTAMP:SOLUSD', { name: 'Solana', before: /Javier\s+$/u }],
  ['CMCMARKETS:CHFPLN', ...fixed(['frank szwajcarski', 'franka szwajcarskiego', 'frankiem szwajcarskim', 'franku szwajcarskim', 'franki szwajcarskie'])],
]

// Tickers in "$TSLA" that are not a share of the American exchanges, and other share classes of one company
const CASHTAGS: Record<string, string> = {
  BTC: 'BITSTAMP:BTCUSD', ETH: 'BITSTAMP:ETHUSD', XRP: 'BITSTAMP:XRPUSD', SOL: 'BITSTAMP:SOLUSD',
  SPX: 'CMCMARKETS:SPX500', NDX: 'CMCMARKETS:NDAQ100', DJI: 'FOREXCOM:DJI', DXY: 'TVC:DXY', VIX: 'TVC:VIX',
  SPY: 'AMEX:SPY', QQQ: 'NASDAQ:QQQ', IWM: 'AMEX:IWM', GLD: 'AMEX:GLD', SLV: 'AMEX:SLV', USO: 'AMEX:USO', TLT: 'NASDAQ:TLT',
}
const SAME: Record<string, string> = { 'NASDAQ:GOOG': 'NASDAQ:GOOGL', 'NYSE:BRK.A': 'NYSE:BRK.B' }

// "(NYSE:FMC)", "(NasdaqGS:AAPL)", "(OTCPK:BYDDF)": the exchange as TradingView names it
const EXCHANGES: Record<string, string> = {
  NYSE: 'NYSE', NASDAQ: 'NASDAQ', NASDAQGS: 'NASDAQ', NASDAQGM: 'NASDAQ', NASDAQCM: 'NASDAQ',
  NYSEARCA: 'AMEX', NYSEAMERICAN: 'AMEX', NYSEMKT: 'AMEX', AMEX: 'AMEX', CBOE: 'CBOE', BATS: 'CBOE',
  OTC: 'OTC', OTCPK: 'OTC', OTCQX: 'OTC', OTCQB: 'OTC', OTCMKTS: 'OTC',
  TSX: 'TSX', TSXV: 'TSXV', LSE: 'LSE', LON: 'LSE', ASX: 'ASX', HKEX: 'HKEX', HKG: 'HKEX', ETR: 'XETR', XETRA: 'XETR',
  EPA: 'EURONEXT', AMS: 'EURONEXT', SWX: 'SIX', SIX: 'SIX', TYO: 'TSE', TSE: 'TSE', KRX: 'KRX',
}
const TAG = new RegExp(`\\((${Object.keys(EXCHANGES).join('|')})\\s*:\\s*([A-Z0-9][A-Z0-9.-]{0,9})\\)`, 'giu')
const CASHTAG = /(?<![\p{L}\p{N}$])\$([A-Z]{1,5}(?:\.[A-Z])?)(?![\p{L}\p{N}])/gu
const CURRENCIES = 'EUR|USD|PLN|CHF|GBP|JPY|CZK|HUF|NOK|SEK|DKK|CAD|AUD|NZD|CNY|CNH|TRY|MXN|ZAR|HKD|SGD|INR|KRW|BRL'
const PAIR = new RegExp(`(?<![\\p{L}\\p{N}])(${CURRENCIES})(?:\\s?\\/\\s?)?(${CURRENCIES})(?![\\p{L}\\p{N}])`, 'gu')

const IN_TABLE = new Set(MARKET_GROUPS.flatMap((g) => g.items.map((i) => i.symbol)))
// The American shares we know by their ticker alone ("$TSLA" → "NASDAQ:TSLA")
const BY_TICKER = new Map(INSTRUMENTS.filter((i) => /^(?:NASDAQ|NYSE|AMEX):/.test(i.symbol)).map((i) => [i.symbol.slice(i.symbol.indexOf(':') + 1), i.symbol]))

const pairSymbol = (a: string, b: string) => (IN_TABLE.has(`CMCMARKETS:${a}${b}`) ? `CMCMARKETS:${a}${b}` : `FX_IDC:${a}${b}`)
export function tickerSymbol(ticker: string): string {
  const t = ticker.toUpperCase()
  return CASHTAGS[t] ?? BY_TICKER.get(t) ?? SAME[`NASDAQ:${t}`] ?? SAME[`NYSE:${t}`] ?? t // else TradingView finds the listing itself
}

// ── The forms of a name as Polish declines it ──
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
const ACRONYM = /^[\p{Lu}\d&.]{2,}$/u
// "Tesla" → Tesli, Teslę, Teslą; "Orlen" → Orlenu, Orlenem; "Google" → Google'a; "Disney" → Disneya; "KGHM" → KGHM-u. Names ending in a figure
// ("S&P 500") and the forms listed one by one are not declined. Some of the forms are not Polish words: harmless, as nothing else is written so
function formsOf(a: Alias): { source: string; stem: string } {
  const name = a.name
  if (a.fixed || /[\d)]$/.test(name)) return { source: esc(name), stem: name }
  const last = name.split(/\s+/).pop()!
  if (ACRONYM.test(last)) return { source: `${esc(name)}(?:-(?:u|a|owi|em|iem|ie|y|ów))?`, stem: name }
  const end = name.slice(-1).toLowerCase()
  if (end === 'a') return { source: `${esc(name.slice(0, -1))}(?:a|y|i|ę|ą|e|ie|o)`, stem: name.slice(0, -1) }
  if (end === 'y') return { source: `${esc(name)}(?:a|u|owi|em)?`, stem: name }
  if ('eiouóé'.includes(end)) return { source: `${esc(name)}(?:['’](?:a|u|owi|em|ie))?`, stem: name }
  return { source: `${esc(name)}(?:u|a|owi|em|iem|ie|y|i|ów|om)?`, stem: name }
}

interface Rule { symbols: string[]; re: RegExp; stem: string; alias: Alias }
let rules: Rule[] | null = null
function allRules(): Rule[] {
  rules ??= NAMED.flatMap(([symbol, ...names]) => names.map((n) => {
    const symbols = typeof symbol === 'string' ? [symbol] : symbol
    const alias = typeof n === 'string' ? { name: n, exact: ACRONYM.test(n) } : { exact: ACRONYM.test(n.name), ...n }
    const { source, stem } = formsOf(alias)
    // not inside a word, a ticker or a compound ("WIG-banki", "BACK-UPS")
    return { symbols, alias, stem, re: new RegExp(`(?<![\\p{L}\\p{N}$]|\\p{L}-)(?:${source})(?![\\p{L}\\p{N}]|-\\p{L})`, 'giu') }
  }))
  return rules
}

// The letters as the name has them: all of them (exact), or the first (a capital stays a capital: "Tesla", "TESLA", not "tesla")
function caseFits(found: string, r: Rule): boolean {
  if (r.alias.exact) return found.startsWith(r.stem)
  const first = r.alias.name[0]
  return first.toLowerCase() === first || found[0] === first
}

interface Hit { start: number; end: number; symbols: string[] }

function hitsIn(text: string): Hit[] {
  const hits: Hit[] = []
  for (const m of text.matchAll(TAG)) {
    const exchange = EXCHANGES[m[1].toUpperCase()]
    const ticker = /^(?:NYSE|NASDAQ|AMEX)$/.test(exchange) ? m[2].toUpperCase().replace(/-/g, '.') : m[2].toUpperCase()
    const symbol = `${exchange}:${ticker}`
    hits.push({ start: m.index, end: m.index + m[0].length, symbols: [SAME[symbol] ?? symbol] })
  }
  for (const m of text.matchAll(CASHTAG)) hits.push({ start: m.index, end: m.index + m[0].length, symbols: [tickerSymbol(m[1])] })
  for (const m of text.matchAll(PAIR)) if (m[1] !== m[2]) hits.push({ start: m.index, end: m.index + m[0].length, symbols: [pairSymbol(m[1], m[2])] })
  for (const r of allRules()) {
    for (const m of text.matchAll(r.re)) {
      const start = m.index, end = start + m[0].length
      if (!caseFits(m[0], r)) continue
      const before = text.slice(Math.max(0, start - 40), start), after = text.slice(end, end + 40)
      if (r.alias.before?.test(before) || r.alias.after?.test(after) || (r.alias.need && !r.alias.need.test(before))) continue
      hits.push({ start, end, symbols: r.symbols })
    }
  }
  // Where names overlap, the longer one ("PKO BP", not "BP"; "(NASDAQ:TSLA)", not "Nasdaq"), in the order they come in
  hits.sort((a, b) => a.start - b.start || b.end - a.end)
  const kept: Hit[] = []
  for (const h of hits) if (!kept.some((k) => h.start < k.end && k.start < h.end)) kept.push(h)
  return kept
}

// The symbols named in these texts (the one shown first: its order wins), each once, at most MAX_QUOTED
export function instrumentsIn(texts: string[]): string[] {
  const out: string[] = []
  for (const t of texts) for (const h of hitsIn(t)) for (const s of h.symbols) if (!out.includes(s)) out.push(s)
  return out.slice(0, MAX_QUOTED)
}

type Text = { title: string; description: string; body?: string }
const textOf = (t: Text) => [t.title, t.body || t.description].filter(Boolean).join('\n')

// The instruments of a news of a channel that has quotes: in the language shown first (the translation, or the original), then the other one
export function newsInstruments(it: Text & { source: string; pl?: Text | null }, translationFirst: boolean): string[] {
  if (!QUOTED_SOURCES.includes(it.source)) return []
  const texts = it.pl ? (translationFirst ? [textOf(it.pl), textOf(it)] : [textOf(it), textOf(it.pl)]) : [textOf(it)]
  return instrumentsIn(texts)
}
