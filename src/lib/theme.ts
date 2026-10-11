import type { Theme } from './prefs'

// The colors of the page (src/app/globals.css) as the browser needs them for its own bars: the status bar of a phone,
// the title bar of an app window. scripts/render-assets.mjs has them too, for the launch screens of an iPhone.
export const PAGE_COLORS = { light: '#ffffff', dark: '#111113' }

// The bars follow the system's light or dark by the media attributes of the theme-color tags (layout.tsx), but the
// person may have chosen a theme in the settings: then both tags say that theme's color, and with "system" each has
// its own again.
export function syncThemeColor(theme: Theme) {
  for (const tag of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = theme === 'system' ? (tag.getAttribute('media')?.includes('dark') ? 'dark' : 'light') : theme
    tag.setAttribute('content', PAGE_COLORS[scheme])
  }
}
