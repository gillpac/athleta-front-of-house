import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const { site } = await req.json()
  const cookieStore = await cookies()
  cookieStore.set('preferred_site', site, { path: '/', maxAge: 60 * 60 * 24 * 365 })
  return NextResponse.json({ ok: true })
}
