// The "Rynek" tab: quotes and charts from TradingView (its free widgets, components/TradingView.tsx). The quotes table in its sections, and the
// names and symbols the symbol field suggests. A symbol is TradingView's ("GPW:CDR", "FX_IDC:USDPLN"); only symbols TradingView lets widgets
// show work (some say "only available on TradingView" instead). Data in the widgets: currencies and crypto live, shares and
// indices delayed, the Warsaw Stock Exchange (GPW) and Xetra only at the end of the day.

export interface Instrument {
  symbol: string // TradingView's, "EXCHANGE:TICKER"
  name: string   // as the suggestions and the chart window show it
  note?: string  // what the price is in, where it trades
  also?: string  // other names it is looked up by
}

// CFDs of CMC Markets (CMCMARKETS:), which TradingView's widgets show (TradingView's own sample table has one) and which trade nearly all day
// long, like futures. CMC has no crypto on TradingView (bitcoin and ethereum come from Bitstamp). Nothing from the Warsaw exchange: its data
// are in the widgets only at the end of the day
export const MARKET_GROUPS: { name: string; items: Instrument[] }[] = [
  { name: 'Waluty', items: [
    { symbol: 'CMCMARKETS:EURUSD', name: 'EUR/USD' },
    { symbol: 'CMCMARKETS:USDPLN', name: 'USD/PLN', also: 'dolar' },
    { symbol: 'CMCMARKETS:EURPLN', name: 'EUR/PLN', also: 'euro' },
    { symbol: 'CMCMARKETS:CHFPLN', name: 'CHF/PLN', also: 'frank' },
    { symbol: 'CMCMARKETS:GBPPLN', name: 'GBP/PLN', also: 'funt' },
  ] },
  { name: 'Świat', items: [
    { symbol: 'CMCMARKETS:SPX500', name: 'S&P 500', note: 'USA', also: 'SPX US500' },
    { symbol: 'CMCMARKETS:NDAQ100', name: 'Nasdaq 100', note: 'USA', also: 'NDX US100' },
    { symbol: 'CMCMARKETS:GERMAN30', name: 'DAX', note: 'Niemcy', also: 'DE40 GER40 Germany 40' },
    { symbol: 'CMCMARKETS:JAPAN225', name: 'Nikkei 225', note: 'Japonia', also: 'Japan 225 JP225 NKY' },
  ] },
  { name: 'Surowce i krypto', items: [
    { symbol: 'CMCMARKETS:GOLD', name: 'Złoto', note: 'USD za uncję', also: 'gold XAUUSD' },
    { symbol: 'CMCMARKETS:SILVER', name: 'Srebro', note: 'USD za uncję', also: 'silver XAGUSD' },
    { symbol: 'CMCMARKETS:UKCRUDEOIL', name: 'Ropa Brent', note: 'USD za baryłkę', also: 'oil UKOIL' },
    { symbol: 'CMCMARKETS:COPPER', name: 'Miedź', note: 'USD za funt', also: 'copper' },
    { symbol: 'BITSTAMP:BTCUSD', name: 'Bitcoin', note: 'USD', also: 'BTC' },
    { symbol: 'BITSTAMP:ETHUSD', name: 'Ethereum', note: 'USD', also: 'ETH' },
  ] },
]

// The first row of the table: the chart a computer shows beside it until another is chosen
export const FIRST_SYMBOL = MARKET_GROUPS[0].items[0].symbol

// Looked up by name or ticker in the symbol field, besides the table's
const MORE: Instrument[] = [
  ...[
    ['PKN', 'Orlen', 'PKN Orlen'], ['PKO', 'PKO BP', 'PKO Bank Polski'], ['PZU', 'PZU'], ['PEO', 'Pekao', 'Bank Pekao'], ['KGH', 'KGHM', 'KGHM Polska Miedź'],
    ['CDR', 'CD Projekt'], ['LPP', 'LPP'], ['DNP', 'Dino Polska', 'Dino'], ['ALE', 'Allegro'], ['SPL', 'Santander Bank Polska', 'Santander'],
    ['MBK', 'mBank'], ['ALR', 'Alior Bank', 'Alior'], ['BDX', 'Budimex'], ['KTY', 'Grupa Kęty', 'Kęty'], ['KRU', 'Kruk'], ['OPL', 'Orange Polska', 'Orange'],
    ['PGE', 'PGE'], ['JSW', 'JSW'], ['CPS', 'Cyfrowy Polsat', 'Polsat'], ['PCO', 'Pepco'], ['ZAB', 'Żabka'], ['ACP', 'Asseco Poland', 'Asseco'],
    ['TPE', 'Tauron'], ['ENA', 'Enea'], ['TXT', 'Text', 'LiveChat'], ['BFT', 'Benefit Systems'], ['ASB', 'Asbis', 'ASBISc'], ['XTB', 'XTB'],
    ['CCC', 'CCC'], ['MIL', 'Bank Millennium', 'Millennium'], ['BHW', 'Citi Handlowy', 'Handlowy'], ['ING', 'ING Bank Śląski', 'ING'],
    ['WIG', 'WIG', 'cały rynek'], ['WIG20', 'WIG20'], ['MWIG40', 'mWIG40'], ['SWIG80', 'sWIG80'], ['FW201!', 'FW20', 'kontrakt futures WIG20'], ['FW401!', 'FW40', 'kontrakt futures mWIG40'],
  ].map(([t, name, also]) => ({ symbol: `GPW:${t}`, name, note: 'GPW', also })),
  // Shares of the United States (and the American listings of large foreign companies: TSMC, ASML, Novo Nordisk, SAP, Shell, Toyota), where
  // they are listed now (Walmart on Nasdaq since December 2025, PepsiCo since 2017)
  ...[
    ['NASDAQ:AAPL', 'Apple'], ['NASDAQ:MSFT', 'Microsoft'], ['NASDAQ:NVDA', 'Nvidia'], ['NASDAQ:AMZN', 'Amazon'], ['NASDAQ:GOOGL', 'Alphabet', 'Google'],
    ['NASDAQ:META', 'Meta', 'Facebook'], ['NASDAQ:TSLA', 'Tesla'], ['NASDAQ:NFLX', 'Netflix'], ['NASDAQ:AMD', 'AMD'], ['NASDAQ:AVGO', 'Broadcom'],
    ['NASDAQ:PLTR', 'Palantir'], ['NYSE:BRK.B', 'Berkshire Hathaway', 'Berkshire'], ['NYSE:JPM', 'JPMorgan'], ['NYSE:KO', 'Coca-Cola'], ['NYSE:XOM', 'Exxon Mobil', 'Exxon'],
    ['NASDAQ:INTC', 'Intel'], ['NASDAQ:QCOM', 'Qualcomm'], ['NASDAQ:CSCO', 'Cisco'], ['NASDAQ:ADBE', 'Adobe'], ['NASDAQ:PEP', 'PepsiCo', 'Pepsi'],
    ['NASDAQ:COST', 'Costco'], ['NASDAQ:WMT', 'Walmart'], ['NASDAQ:CMCSA', 'Comcast'], ['NASDAQ:TXN', 'Texas Instruments'], ['NASDAQ:AMAT', 'Applied Materials'],
    ['NASDAQ:MU', 'Micron'], ['NASDAQ:LRCX', 'Lam Research'], ['NASDAQ:ASML', 'ASML'], ['NASDAQ:ARM', 'Arm Holdings'], ['NASDAQ:MRVL', 'Marvell'],
    ['NASDAQ:SMCI', 'Super Micro', 'Supermicro'], ['NASDAQ:PYPL', 'PayPal'], ['NASDAQ:COIN', 'Coinbase'], ['NASDAQ:HOOD', 'Robinhood'],
    ['NASDAQ:MSTR', 'Strategy', 'MicroStrategy'], ['NASDAQ:ABNB', 'Airbnb'], ['NASDAQ:BKNG', 'Booking Holdings', 'Booking.com'], ['NASDAQ:SBUX', 'Starbucks'],
    ['NASDAQ:MRNA', 'Moderna'], ['NASDAQ:GILD', 'Gilead'], ['NASDAQ:AMGN', 'Amgen'], ['NASDAQ:ISRG', 'Intuitive Surgical'], ['NASDAQ:PDD', 'PDD Holdings', 'Temu Pinduoduo'],
    ['NASDAQ:JD', 'JD.com'], ['NASDAQ:BIDU', 'Baidu'], ['NASDAQ:RIVN', 'Rivian'], ['NASDAQ:LCID', 'Lucid'], ['NASDAQ:PANW', 'Palo Alto Networks'],
    ['NASDAQ:CRWD', 'CrowdStrike'], ['NASDAQ:INTU', 'Intuit'], ['NASDAQ:MDLZ', 'Mondelez'], ['NASDAQ:TMUS', 'T-Mobile US'], ['NASDAQ:LULU', 'Lululemon'],
    ['NASDAQ:DASH', 'DoorDash'], ['NASDAQ:LIN', 'Linde'],
    ['NYSE:BAC', 'Bank of America', 'BofA'], ['NYSE:WFC', 'Wells Fargo'], ['NYSE:C', 'Citigroup', 'Citi'], ['NYSE:GS', 'Goldman Sachs'], ['NYSE:MS', 'Morgan Stanley'],
    ['NYSE:V', 'Visa'], ['NYSE:MA', 'Mastercard'], ['NYSE:AXP', 'American Express'], ['NYSE:BLK', 'BlackRock'], ['NYSE:BX', 'Blackstone'],
    ['NYSE:PG', 'Procter & Gamble', 'P&G'], ['NYSE:JNJ', 'Johnson & Johnson', 'J&J'], ['NYSE:PFE', 'Pfizer'], ['NYSE:MRK', 'Merck'], ['NYSE:LLY', 'Eli Lilly', 'Lilly'],
    ['NYSE:ABBV', 'AbbVie'], ['NYSE:UNH', 'UnitedHealth'], ['NYSE:NVO', 'Novo Nordisk'], ['NYSE:CVX', 'Chevron'], ['NYSE:COP', 'ConocoPhillips'],
    ['NYSE:OXY', 'Occidental'], ['NYSE:SHEL', 'Shell'], ['NYSE:BP', 'BP'], ['NYSE:BA', 'Boeing'], ['NYSE:LMT', 'Lockheed Martin'], ['NYSE:RTX', 'RTX', 'Raytheon'],
    ['NYSE:NOC', 'Northrop Grumman'], ['NYSE:GD', 'General Dynamics'], ['NYSE:CAT', 'Caterpillar'], ['NYSE:DE', 'Deere', 'John Deere'],
    ['NYSE:GE', 'GE Aerospace', 'General Electric'], ['NYSE:GEV', 'GE Vernova'], ['NYSE:GM', 'General Motors', 'GM'], ['NYSE:F', 'Ford'], ['NYSE:STLA', 'Stellantis'],
    ['NYSE:RACE', 'Ferrari'], ['NYSE:TM', 'Toyota'], ['NYSE:SONY', 'Sony'], ['NYSE:HD', 'Home Depot'], ['NYSE:MCD', "McDonald's"], ['NYSE:NKE', 'Nike'],
    ['NYSE:DIS', 'Disney', 'Walt Disney'], ['NYSE:T', 'AT&T'], ['NYSE:VZ', 'Verizon'], ['NYSE:IBM', 'IBM'], ['NYSE:ORCL', 'Oracle'], ['NYSE:CRM', 'Salesforce'],
    ['NYSE:NOW', 'ServiceNow'], ['NYSE:SNOW', 'Snowflake'], ['NYSE:UBER', 'Uber'], ['NYSE:SPOT', 'Spotify'], ['NYSE:DELL', 'Dell'],
    ['NYSE:TSM', 'TSMC', 'Taiwan Semiconductor'], ['NYSE:BABA', 'Alibaba'], ['NYSE:NIO', 'NIO'], ['NYSE:SAP', 'SAP'], ['NYSE:UL', 'Unilever'],
    ['NYSE:BUD', 'AB InBev', 'Anheuser-Busch'], ['NYSE:RIO', 'Rio Tinto'], ['NYSE:BHP', 'BHP'], ['NYSE:VALE', 'Vale'], ['NYSE:NEM', 'Newmont'],
    ['NYSE:FCX', 'Freeport-McMoRan'], ['NYSE:HSBC', 'HSBC'], ['NYSE:UBS', 'UBS'], ['NYSE:DB', 'Deutsche Bank'], ['NYSE:UPS', 'UPS'], ['NYSE:FDX', 'FedEx'],
    ['NYSE:MMM', '3M'], ['NYSE:PM', 'Philip Morris'], ['NYSE:ABT', 'Abbott'], ['NYSE:ACN', 'Accenture'], ['NYSE:CVS', 'CVS Health'],
  ].map(([symbol, name, also]) => ({ symbol, name, note: symbol.split(':')[0], also })),
  // Germany (Xetra: in the widgets only at the end of the day)
  ...[
    ['RHM', 'Rheinmetall'], ['VOW3', 'Volkswagen'], ['BMW', 'BMW'], ['MBG', 'Mercedes-Benz'], ['SIE', 'Siemens'], ['ALV', 'Allianz'], ['BAYN', 'Bayer'],
    ['BAS', 'BASF'], ['LHA', 'Lufthansa'], ['ADS', 'Adidas'],
  ].map(([t, name]) => ({ symbol: `XETR:${t}`, name, note: 'Xetra' })),
  { symbol: 'FOREXCOM:DJI', name: 'Dow Jones', note: 'USA', also: 'DJIA' },
  // Futures of other exchanges, to look up (TradingView's widgets show Eurex only at the end of the day, CME and COMEX maybe not at all)
  { symbol: 'CME_MINI:ES1!', name: 'S&P 500 (kontrakt)', note: 'CME', also: 'ES futures' },
  { symbol: 'CME_MINI:NQ1!', name: 'Nasdaq 100 (kontrakt)', note: 'CME', also: 'NQ futures' },
  { symbol: 'EUREX:FDAX1!', name: 'DAX (kontrakt)', note: 'Eurex', also: 'FDAX futures' },
  { symbol: 'COMEX:GC1!', name: 'Złoto (kontrakt)', note: 'COMEX', also: 'GC futures' },
  { symbol: 'NYMEX:CL1!', name: 'Ropa WTI (kontrakt)', note: 'NYMEX', also: 'CL futures' },
  { symbol: 'CMCMARKETS:UK100', name: 'FTSE 100', note: 'Wielka Brytania', also: 'FTSE UK100' },
  { symbol: 'CMCMARKETS:POLISH201!', name: 'Poland 20 (CFD)', note: 'CMC, na kontrakt WIG20', also: 'Poland 20 WIG20 FW20' },
  { symbol: 'TVC:DXY', name: 'Indeks dolara', note: 'DXY', also: 'DXY dollar' },
  { symbol: 'TVC:VIX', name: 'VIX', note: 'zmienność S&P 500', also: 'indeks strachu' },
  { symbol: 'TVC:US10Y', name: 'Rentowność 10-letnich obligacji USA', note: '%', also: 'US10Y obligacje' },
  { symbol: 'TVC:PL10Y', name: 'Rentowność 10-letnich obligacji Polski', note: '%', also: 'PL10Y obligacje' },
  ...[
    ['USDJPY', 'USD/JPY', 'jen'], ['GBPUSD', 'GBP/USD'], ['USDCHF', 'USD/CHF'], ['EURCHF', 'EUR/CHF'], ['EURGBP', 'EUR/GBP'], ['JPYPLN', 'JPY/PLN'],
    ['NOKPLN', 'NOK/PLN'], ['SEKPLN', 'SEK/PLN'], ['CZKPLN', 'CZK/PLN', 'korona'], ['HUFPLN', 'HUF/PLN', 'forint'], ['CADPLN', 'CAD/PLN'], ['AUDPLN', 'AUD/PLN'],
  ].map(([t, name, also]) => ({ symbol: `FX_IDC:${t}`, name, also })),
  { symbol: 'TVC:USOIL', name: 'Ropa WTI', note: 'USD za baryłkę', also: 'oil' },
  { symbol: 'TVC:PLATINUM', name: 'Platyna', note: 'USD za uncję' },
  { symbol: 'NYMEX:NG1!', name: 'Gaz ziemny', note: 'USD za MMBtu', also: 'gas' },
  { symbol: 'BITSTAMP:XRPUSD', name: 'XRP', note: 'USD', also: 'Ripple' },
  { symbol: 'BITSTAMP:SOLUSD', name: 'Solana', note: 'USD', also: 'SOL' },
]

export const INSTRUMENTS: Instrument[] = [...MARKET_GROUPS.flatMap((g) => g.items), ...MORE]
const BY_SYMBOL = new Map(INSTRUMENTS.map((i) => [i.symbol, i]))

const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase()
const words = (s: string) => plain(s).split(/[^\p{L}\p{N}&.!]+/u).filter(Boolean)
const tickerOf = (symbol: string) => symbol.slice(symbol.indexOf(':') + 1)

// The instruments that fit what was typed, best first: the ticker itself, a ticker it begins, a name it begins, a word of the name it begins
export function suggest(typed: string, max = 6): Instrument[] {
  const q = plain(typed.trim()).replace(/\s+/g, ' ')
  if (!q) return []
  const qs = q.replace(/[/\s]/g, '')
  const rank = (i: Instrument): number => {
    const ticker = plain(tickerOf(i.symbol)), name = plain(i.name)
    if (ticker === qs || plain(i.symbol) === qs || name.replace(/[/\s]/g, '') === qs) return 0
    if (ticker.startsWith(qs) || plain(i.symbol).startsWith(qs)) return 1
    if (name.startsWith(q) || name.replace('/', '').startsWith(qs)) return 2
    if ([...words(i.name), ...words(i.also ?? '')].some((w) => w.startsWith(q))) return 3
    if (plain(i.also ?? '').startsWith(q)) return 3
    return 9
  }
  return INSTRUMENTS.map((i, n) => ({ i, r: rank(i), n })).filter((x) => x.r < 9).sort((a, b) => a.r - b.r || a.n - b.n).slice(0, max).map((x) => x.i)
}

// What the symbol field offers for what was typed: the instruments that fit, and what was typed as a symbol of its own when none of them is it
export function symbolChoices(typed: string): (Instrument & { typed?: boolean })[] {
  const found = suggest(typed)
  const s = toSymbol(typed)
  if (!s || found.some((i) => i.symbol === s || tickerOf(i.symbol) === s)) return found
  return [...found.slice(0, 5), { symbol: s, name: s, typed: true }]
}

// What was typed as a TradingView symbol: "aapl" → "AAPL", "gpw:cdr" → "GPW:CDR", "eur/pln" → "EURPLN"; null when it cannot be one
export function toSymbol(typed: string): string | null {
  const s = typed.trim().toUpperCase().replace(/\s*:\s*/g, ':').replace(/\//g, '').replace(/\s+/g, '')
  return /^(?:[A-Z0-9_]{1,20}:)?[A-Z0-9][A-Z0-9._!&-]{0,23}$/.test(s) ? s : null
}

// The symbol a link of TradingView's points to: "…/chart/?symbol=GPW%3AFW201!", "…?tvwidgetsymbol=…", "…/symbols/CMCMARKETS-EURUSD/",
// "…/symbols/EURUSD/?exchange=CMCMARKETS"; null for a link without the exchange
export function symbolOfLink(href: string): string | null {
  try {
    const u = new URL(href)
    const q = u.searchParams.get('symbol') ?? u.searchParams.get('tvwidgetsymbol')
    if (q) return toSymbol(q)
    const m = u.pathname.match(/\/symbols\/(?:([A-Za-z0-9_]+)-)?([^/]+)\/?/)
    const exchange = m?.[1] ?? u.searchParams.get('exchange')
    return m && exchange ? toSymbol(`${exchange}:${decodeURIComponent(m[2])}`) : null
  } catch {
    return null
  }
}

// The instrument a symbol stands for (one of ours, or just the symbol)
export const instrument = (symbol: string): Instrument => BY_SYMBOL.get(symbol) ?? { symbol, name: tickerOf(symbol) }

// Shares, indices and futures of these exchanges are in the widgets only at the end of the day
export const endOfDay = (symbol: string) => /^(?:GPW|NEWCONNECT|XETR|FWB|EUREX):/.test(symbol)

// The full chart on TradingView's site (or in its app on a phone)
export const tradingViewUrl = (symbol: string) => `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`

// The symbols looked at last, newest first
export const MAX_RECENT = 8
export const withRecent = (list: string[], symbol: string) => [symbol, ...list.filter((s) => s !== symbol)].slice(0, MAX_RECENT)
