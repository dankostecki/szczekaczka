// The name of the version of the page that is deployed, as a small file next to it (see next.config.js). The page that
// is open compares it with its own to learn that a newer one is out.
export const dynamic = 'force-static'

export const GET = () => Response.json({ id: process.env.NEXT_PUBLIC_BUILD_ID })
