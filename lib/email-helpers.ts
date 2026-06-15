/**
 * Read an env var at runtime via dynamic lookup.
 * Vercel "Sensitive" env vars are not available at build time, so a static
 * `process.env.FOO` reference can get inlined as empty during the build.
 * A dynamic `process.env[key]` lookup is never inlined and always reads the
 * live runtime value.
 */
export function runtimeEnv(key: string): string | undefined {
  return process.env[key]
}

export function buildJotformUrl(site: string, lead: {
  child_first: string
  child_last: string
}, guardian: { first_name?: string; last_name?: string; email?: string; phone?: string } | null) {
  const base = site === 'altona_north'
    ? runtimeEnv('JOTFORM_URL_ALTONA_NORTH')
    : runtimeEnv('JOTFORM_URL_COOLAROO')
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

export function buildAddress(site: string) {
  return site === 'altona_north'
    ? '33c Chambers Road, Altona North VIC 3025'
    : 'Unit 2/2-10 Reservoir Drive, Coolaroo VIC 3048'
}

export async function postToZapier(payload: Record<string, unknown>) {
  const url = runtimeEnv('ZAPIER_EMAIL_WEBHOOK_URL')
  if (!url) return
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => null)
}
