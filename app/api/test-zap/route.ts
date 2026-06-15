import { NextResponse } from 'next/server'
import { runtimeEnv } from '@/lib/email-helpers'

/**
 * TEMP diagnostic — confirms the Zapier webhook is reachable and the env var
 * is readable at runtime. Visit /api/test-zap in a browser. Remove once email
 * delivery is confirmed working.
 */
export async function GET() {
  const url = runtimeEnv('ZAPIER_EMAIL_WEBHOOK_URL') ?? ''
  const diag: Record<string, unknown> = {
    hasUrl: !!url,
    urlLength: url.length,
    startsWithHttps: url.startsWith('https'),
    jotformAltonaSet: !!runtimeEnv('JOTFORM_URL_ALTONA_NORTH'),
    jotformCoolarooSet: !!runtimeEnv('JOTFORM_URL_COOLAROO'),
  }

  if (!url) {
    return NextResponse.json({ ...diag, posted: false, note: 'ZAPIER_EMAIL_WEBHOOK_URL is empty at runtime' })
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'test@example.com',
        subject: 'Athleta webhook test',
        html_body: '<p>This is a test draft from /api/test-zap.</p>',
        site: 'coolaroo',
        kind: 'confirmation',
      }),
    })
    return NextResponse.json({ ...diag, posted: true, zapierStatus: res.status, zapierStatusText: res.statusText })
  } catch (err) {
    return NextResponse.json({ ...diag, posted: false, error: err instanceof Error ? err.message : String(err) })
  }
}
