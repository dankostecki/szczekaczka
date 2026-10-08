/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static files only (out/): served by Cloudflare together with the Worker in worker/
  output: 'export',
}

module.exports = nextConfig
