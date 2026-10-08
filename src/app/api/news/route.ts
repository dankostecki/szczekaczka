import { NextResponse } from 'next/server'
import { fetchNews } from '@/lib/fetchNews'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { items, errors } = await fetchNews()
  return NextResponse.json(
    { items, errors, fetchedAt: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
