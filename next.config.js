/** @type {import('next').NextConfig} */

// GitHub Pages serves the site under /szczekaczka (set by .github/workflows/pages.yml);
// on Cloudflare it is at the root.
const basePath = process.env.PAGES_BASE_PATH || ''

const nextConfig = {
  // Static files only (out/): served by Cloudflare together with the Worker in worker/
  output: 'export',
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
}

module.exports = nextConfig
