export function buildJotformUrl(site: string, lead: {
  child_first: string
  child_last: string
}, guardian: { first_name?: string; last_name?: string; email?: string; phone?: string } | null) {
  const base = site === 'altona_north'
    ? process.env.JOTFORM_URL_ALTONA_NORTH
    : process.env.JOTFORM_URL_COOLAROO
  if (!base) return null
  const params = new URLSearchParams()
  params.set('ParentfullName[first]', guardian?.first_name ?? '')
  params.set('ParentfullName[last]', guardian?.last_name ?? '')
  params.set('ParentEmail', guardian?.email ?? '')
  params.set('childFull[first]', lead.child_first)
  params.set('childFull[last]', lead.child_last)
  params.set('mediaampamp[0]', 'true')
  params.set('ParentMobilePhone', guardian?.phone ?? '')
  return `${base}?${params.toString()}`
}

export function buildSig(site: string) {
  return site === 'altona_north'
    ? `<p style="color:#555;font-size:13px;margin-top:24px;border-top:1px solid #eee;padding-top:12px;"><strong>Athleta Gymnastics — Altona North</strong><br>📞 (03) 9999 0002<br>🌐 www.athletagymnastics.com.au</p>`
    : `<p style="color:#555;font-size:13px;margin-top:24px;border-top:1px solid #eee;padding-top:12px;"><strong>Athleta Gymnastics — Coolaroo</strong><br>📞 (03) 9999 0001<br>🌐 www.athletagymnastics.com.au</p>`
}

export async function postToZapier(payload: Record<string, unknown>) {
  if (!process.env.ZAPIER_EMAIL_WEBHOOK_URL) return
  await fetch(process.env.ZAPIER_EMAIL_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => null)
}
