// The tests: test/**/*.test.ts, each bundled with esbuild (the code imports without extensions, as the Worker and Next do)
// and run with Node's own test runner. No network, no paid services: the briefing's tests use its mock providers.
//   npm test                 all of them
//   npm test -- briefing     only the files whose path has "briefing"
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const filter = process.argv[2] ?? ''
const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (name.endsWith('.test.ts') && relative(root, path).includes(filter)) files.push(path)
  }
}
walk(join(root, 'test'))
if (!files.length) { console.error(`no tests${filter ? ` matching "${filter}"` : ''}`); process.exit(1) }

const out = mkdtempSync(join(tmpdir(), 'szczekaczka-test-'))
try {
  await build({
    entryPoints: files, outdir: out, outbase: join(root, 'test'), bundle: true, platform: 'node', format: 'esm',
    target: 'node22', sourcemap: 'inline', logLevel: 'warning', outExtension: { '.js': '.mjs' },
    alias: { '@': join(root, 'src') },
  })
  const bundles = files.map((f) => join(out, relative(join(root, 'test'), f)).replace(/\.ts$/, '.mjs'))
  const run = spawnSync(process.execPath, ['--enable-source-maps', '--test', '--test-reporter=spec', ...bundles], { stdio: 'inherit' })
  process.exitCode = run.status ?? 1
} finally {
  rmSync(out, { recursive: true, force: true })
}
