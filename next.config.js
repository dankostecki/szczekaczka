/** @type {import('next').NextConfig} */

// GitHub Pages serves the site under /szczekaczka (set by .github/workflows/pages.yml);
// on Cloudflare it is at the root.
const basePath = process.env.PAGES_BASE_PATH || ''

// Names this build of the page. The installed app compares it with /version.json to learn that a newer one is out, so it
// is made from the git trees of what the page consists of: only a change to the page (not the README, not the Worker)
// is a new version. BUILD_ID overrides it (tests); without git it is the time of the build.
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
function buildId() {
  if (process.env.BUILD_ID) return process.env.BUILD_ID
  try {
    const trees = execFileSync('git', ['rev-parse', 'HEAD:src', 'HEAD:public', 'HEAD:package-lock.json', 'HEAD:next.config.js'], { stdio: ['ignore', 'pipe', 'ignore'] })
    return createHash('sha1').update(trees).digest('hex').slice(0, 12)
  } catch {
    return String(Date.now())
  }
}

// Next loads this file again in each of its build workers: the name is worked out once and handed down
const id = buildId()
process.env.BUILD_ID = id

const nextConfig = {
  // Static files only (out/): served by Cloudflare together with the Worker in worker/
  output: 'export',
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath, NEXT_PUBLIC_BUILD_ID: id },
}

module.exports = nextConfig
