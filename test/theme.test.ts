// The page's colours (src/app/globals.css): every source has its own in each theme (a source added without one showed grey, with no dots in
// its reading window), and what is read on a background reads well enough (WCAG AA: 4.5:1 for text, 3:1 for the bars of the importance)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SOURCES } from '../src/lib/sources'

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8') // npm test runs from the repository

// The three sets of colours: light, dark as the system asks, dark as chosen in the settings
const block = (start: string) => { const from = css.indexOf(start); assert.ok(from >= 0, start); return css.slice(from, css.indexOf('}', from)) }
const THEMES = { light: block(':root {'), 'dark (system)': block(':root:not([data-theme="light"]) {'), 'dark (chosen)': block(':root[data-theme="dark"] {') }
const colour = (theme: string, name: string): string => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})\\b`, 'i').exec(theme)
  assert.ok(m, `--${name} is a colour written as #rrggbb`)
  return m[1]
}
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }

test('every source has a colour of its own in each theme', () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    const colours = SOURCES.map((s) => colour(theme, `src-${s.toLowerCase()}`))
    assert.equal(new Set(colours).size, SOURCES.length, `${name}: no two sources share a colour`)
  }
  assert.equal(THEMES['dark (system)'].replace(/\s+/g, ' '), THEMES['dark (chosen)'].replace(/\s+/g, ' ').replace(':root[data-theme="dark"] {', ':root:not([data-theme="light"]) {'),
    'the dark theme is the same whether the system asks for it or the reader chose it')
})

test('text reads on its backgrounds: the three greys, the accent and the names of the sources (4.5:1)', () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    const on = ['bg', 'bg-soft', 'surface'].map((b) => colour(theme, b))
    for (const text of ['text', 'text-2', 'text-3']) for (const bg of on) {
      assert.ok(contrast(colour(theme, text), bg) >= 4.5, `${name}: --${text} on ${bg} is ${contrast(colour(theme, text), bg).toFixed(2)}:1`)
    }
    const page = colour(theme, 'bg')
    assert.ok(contrast(colour(theme, 'accent'), page) >= 4.5, `${name}: the accent as text`)
    assert.ok(contrast('#ffffff', colour(theme, 'accent-fill')) >= 4.5, `${name}: white text on the buttons`)
    for (const s of SOURCES) {
      const c = colour(theme, `src-${s.toLowerCase()}`)
      assert.ok(contrast(c, page) >= 4.5, `${name}: ${s} is ${contrast(c, page).toFixed(2)}:1`)
      // the chosen tab is the source's colour under text of the page's colour
      assert.ok(contrast(page, c) >= 4.5, `${name}: the chosen tab of ${s}`)
    }
  }
})

test('the bars of the importance are seen on the page (3:1), in their four colours', () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    const steps = [1, 2, 3, 4].map((n) => colour(theme, `imp-${n}`))
    assert.equal(new Set(steps).size, 4)
    for (const c of steps) assert.ok(contrast(c, colour(theme, 'bg')) >= 3, `${name}: ${c} is ${contrast(c, colour(theme, 'bg')).toFixed(2)}:1`)
  }
})
