// Renders the PNGs of the installed app from the drawing in src/lib/duck.ts (canvas 2D), in a real browser:
//
//   node scripts/render-assets.mjs splash   public/splash/*.png: what an iPhone or iPad shows while the app starts: the
//                                           color of the page, light and dark, one image per screen of
//                                           src/lib/splash-screens.json (no browser needed)
//   node scripts/render-assets.mjs icons    public/icon.png, icon-192.png, icon-512.png, icon-maskable-512.png,
//                                           apple-touch-icon.png, logo.png
//
// The icons need Chromium and playwright-core, which are not dependencies of the site: `npm i --no-save playwright-core`
// (CHROMIUM=/path/to/chrome when Playwright does not know where its browser is). Run it after changing the logo or
// the background colors, and commit the images.
import { build } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const what = process.argv[2]
if (!['splash', 'icons'].includes(what)) {
  console.error('Usage: node scripts/render-assets.mjs splash|icons')
  process.exit(1)
}
// The colors of the page (src/app/globals.css) and of the logo's tile
const PAGE = { light: '#ffffff', dark: '#111113' }
const RED = '#E54C58'

// Screens of the iPhones and iPads that can run a home screen app (width, height in points, pixel ratio), in
// src/lib/splash-screens.json, which src/app/layout.tsx reads too. An image is picked by exactly these three numbers
// (and the orientation and the color scheme), so a screen that is not there shows the system's own white start screen.
const SPLASH_SCREENS = JSON.parse(readFileSync(join(root, 'src/lib/splash-screens.json'), 'utf8'))

const write = (path, bytes) => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), bytes)
  console.log(path)
}

if (what === 'splash') {
  // A PNG of one color: a 1-bit palette image whose every pixel is the first (only) color, a few kB at any size
  const chunk = (type, data) => {
    const head = Buffer.alloc(8), tail = Buffer.alloc(4)
    head.writeUInt32BE(data.length); head.write(type, 4, 'ascii')
    tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])))
    return Buffer.concat([head, data, tail])
  }
  const flatPng = (w, h, hex) => {
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([1, 3, 0, 0, 0], 8) // 1 bit, palette, defaults
    const rows = Buffer.alloc((1 + Math.ceil(w / 8)) * h)                             // filter 0, all pixels 0
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr), chunk('PLTE', Buffer.from(hex.slice(1), 'hex')), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
    ])
  }
  for (const [w, h, ratio] of SPLASH_SCREENS)
    for (const scheme of ['light', 'dark']) write(`public/splash/${scheme}-${w * ratio}x${h * ratio}.png`, flatPng(w * ratio, h * ratio, PAGE[scheme]))
  process.exit(0)
}

let chromium
try {
  ;({ chromium } = await import('playwright-core'))
} catch {
  console.error('playwright-core is missing: npm i --no-save playwright-core')
  process.exit(1)
}
const bundle = await build({ entryPoints: [join(root, 'src/lib/duck.ts')], bundle: true, format: 'iife', globalName: 'DUCK', write: false })
const font = readFileSync(join(root, 'src/app/fonts/bangers-hau.woff2')).toString('base64')
const page = `<!doctype html><meta charset="utf-8">
<style>@font-face { font-family: 'Shout'; src: url(data:font/woff2;base64,${font}) format('woff2'); }</style>
<script>${bundle.outputFiles[0].text}</script>
<script>
// The logo (a rounded tile) with its "HAU!" or without, on a canvas of w x h filled with a color (or transparent),
// the tile "size" wide in the middle
window.render = async ({ w, h, size, fill, text }) => {
  await document.fonts.load('140px Shout', 'HAU!')
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, w, h) }
  ctx.save(); ctx.translate(Math.round((w - size) / 2), Math.round((h - size) / 2))
  DUCK.drawDuck(ctx, size, text ? DUCK.POSE : { ...DUCK.POSE, text: null }, 'Shout')
  ctx.restore()
  return canvas.toDataURL('image/png')
}
</script>`

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})
const tab = await browser.newPage()
await tab.setContent(page)
const png = async (path, options) => write(path, Buffer.from((await tab.evaluate((o) => window.render(o), options)).split(',')[1], 'base64'))

await png('public/logo.png', { w: 128, h: 128, size: 128, text: false })
await png('public/icon.png', { w: 64, h: 64, size: 64, text: false })
await png('public/icon-192.png', { w: 192, h: 192, size: 192, text: true })
await png('public/icon-512.png', { w: 512, h: 512, size: 512, text: true })
await png('public/apple-touch-icon.png', { w: 180, h: 180, size: 180, fill: RED, text: true })
await png('public/icon-maskable-512.png', { w: 512, h: 512, size: 512 - 2 * Math.round(512 * 0.12), fill: RED, text: true })
await browser.close()
