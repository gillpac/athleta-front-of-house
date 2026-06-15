import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { runtimeEnv } from '@/lib/email-helpers'

/**
 * Weekly management summary email — runs Monday 8am AEST (Sunday 22:00 UTC).
 * Vercel invokes with Authorization: Bearer <CRON_SECRET>.
 * Also POSTed to ZAPIER_EMAIL_WEBHOOK_URL for delivery via Gmail.
 */

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }
  }

  const zapierUrl = runtimeEnv('ZAPIER_EMAIL_WEBHOOK_URL')
  if (!zapierUrl) {
    return NextResponse.json({ skipped: true, reason: 'ZAPIER_EMAIL_WEBHOOK_URL not configured' })
  }

  const admin = createAdminClient()

  // Prior week Mon–Sun
  const now = new Date()
  const dayOfWeek = now.getDay()
  const daysToLastMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const lastMonday = new Date(now)
  lastMonday.setDate(now.getDate() - daysToLastMon - 7)
  lastMonday.setHours(0, 0, 0, 0)
  const lastSunday = new Date(lastMonday)
  lastSunday.setDate(lastMonday.getDate() + 6)
  lastSunday.setHours(23, 59, 59, 999)

  const weekStart = lastMonday.toISOString()
  const weekEnd = lastSunday.toISOString()
  const weekLabel = `${lastMonday.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${lastSunday.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`

  const { data: sales } = await admin.from('leads')
    .select('site')
    .eq('status', 'won')
    .not('verified_at', 'is', null)
    .gte('verified_at', weekStart)
    .lte('verified_at', weekEnd)

  const { data: departures } = await admin.from('cancellations')
    .select('site')
    .eq('stage', 'verified')
    .eq('outcome', 'departed')
    .not('verified_at', 'is', null)
    .gte('verified_at', weekStart)
    .lte('verified_at', weekEnd)

  const sites = ['coolaroo', 'altona_north'] as const
  const siteLabel: Record<string, string> = { coolaroo: 'Coolaroo', altona_north: 'Altona North' }

  const rows = sites.map(site => {
    const s = (sales ?? []).filter(x => x.site === site).length
    const d = (departures ?? []).filter(x => x.site === site).length
    return { site, sales: s, departures: d, net: s - d }
  })

  const totalSales = rows.reduce((a, r) => a + r.sales, 0)
  const totalDepartures = rows.reduce((a, r) => a + r.departures, 0)
  const totalNet = totalSales - totalDepartures

  const tableRows = rows.map(r => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600">${siteLabel[r.site]}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;color:#3A7D44;font-weight:700">+${r.sales}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;color:${r.departures > 0 ? '#C0392B' : '#666'}">${r.departures > 0 ? `-${r.departures}` : '0'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:800;color:${r.net >= 0 ? '#3A7D44' : '#C0392B'}">${r.net >= 0 ? `+${r.net}` : r.net}</td>
    </tr>`).join('')

  const htmlBody = `
<p>Hi,</p>
<p>Here is the weekly membership summary for <strong>${weekLabel}</strong>:</p>
<table style="border-collapse:collapse;width:100%;max-width:480px;margin:16px 0">
  <thead>
    <tr style="background:#F6F3EE">
      <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#84776A">Site</th>
      <th style="padding:8px 12px;text-align:center;font-size:11px;text-transform:uppercase;color:#84776A">Sales</th>
      <th style="padding:8px 12px;text-align:center;font-size:11px;text-transform:uppercase;color:#84776A">Departures</th>
      <th style="padding:8px 12px;text-align:center;font-size:11px;text-transform:uppercase;color:#84776A">Net</th>
    </tr>
  </thead>
  <tbody>
    ${tableRows}
    <tr style="background:#F6F3EE">
      <td style="padding:8px 12px;font-weight:700">Total</td>
      <td style="padding:8px 12px;text-align:center;font-weight:700;color:#3A7D44">+${totalSales}</td>
      <td style="padding:8px 12px;text-align:center;font-weight:700;color:${totalDepartures > 0 ? '#C0392B' : '#666'}">${totalDepartures > 0 ? `-${totalDepartures}` : '0'}</td>
      <td style="padding:8px 12px;text-align:center;font-weight:800;color:${totalNet >= 0 ? '#3A7D44' : '#C0392B'}">${totalNet >= 0 ? `+${totalNet}` : totalNet}</td>
    </tr>
  </tbody>
</table>
<p style="color:#84776A;font-size:13px">Verified only — pending sales not included.</p>
<p style="color:#555;font-size:13px;margin-top:24px;"><strong>Athleta Gymnastics</strong><br>🌐 www.athletagymnastics.com.au</p>
`

  const { data: recipients } = await admin.from('app_users')
    .select('email, name')
    .in('role', ['management', 'admin'])
    .eq('active', true)

  const results = await Promise.allSettled(
    (recipients ?? []).map(u =>
      fetch(zapierUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: u.email,
          subject: `Athleta weekly summary — ${weekLabel}`,
          html_body: htmlBody,
          kind: 'weekly_summary',
        }),
      })
    )
  )

  return NextResponse.json({
    ok: true,
    week: weekLabel,
    sales: totalSales,
    departures: totalDepartures,
    net: totalNet,
    sent_to: (recipients ?? []).length,
    results: results.map(r => r.status),
  })
}
