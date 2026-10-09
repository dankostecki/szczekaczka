export const AUTHOR = { name: 'Dan_Kostecki', url: 'https://x.com/Dan_Kostecki' }

// Where the site lives, set at build time. On Cloudflare both are empty: the page, the
// list and the WebSocket are on one address. The GitHub Pages copy is under /szczekaczka
// and gets its news from the Cloudflare Worker.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
export const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? ''

// Who runs the site, for the terms and the privacy policy.
// email: leave '' to point people to the X profile only.
export const OPERATOR = {
  name: 'Dan Kostecki',
  x: AUTHOR.url,
  xHandle: '@Dan_Kostecki',
  email: '',
}

// Date the current terms and privacy policy took effect
export const LEGAL_DATE = '9 października 2026 r.'

// Everything the site keeps in the browser (localStorage); see the privacy policy
export const STORAGE_PREFIX = 'szczekaczka:'
export const NOTICE_KEY = 'szczekaczka:notice'
// Raised when the first-visit window changes, so everybody sees it once more (2: the BETA note)
export const NOTICE_VERSION = '2'
