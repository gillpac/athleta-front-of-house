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

/**
 * Normalise an Australian mobile to local 04xxxxxxxx format for Jotform prefill.
 * A leading + (e.g. +61452158244) breaks the Jotform phone field, so strip the
 * country code back to a leading 0.
 */
export function formatAuPhone(phone?: string): string {
  if (!phone) return ''
  const digits = phone.replace(/[^\d]/g, '')
  if (digits.startsWith('61')) return '0' + digits.slice(2)
  if (digits.startsWith('0')) return digits
  if (digits.length === 9) return '0' + digits
  return digits
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
  params.set('ParentMobilePhone', formatAuPhone(guardian?.phone))
  return `${base}?${params.toString()}`
}

export function buildAddress(site: string) {
  return site === 'altona_north'
    ? '33c Chambers Road, Altona North VIC 3025'
    : 'Unit 2/2-10 Reservoir Drive, Coolaroo VIC 3048'
}

export type ZapierResult =
  | { ok: true }
  | { ok: false; reason: 'no_url' | 'no_recipient' | 'error'; detail?: string }

/**
 * Post an outbound-email payload to the Zapier webhook that creates the Gmail
 * draft. Returns a result so callers can record in the lead timeline whether the
 * draft was actually created — silent failures here were impossible to diagnose.
 */
export async function postToZapier(payload: Record<string, unknown>): Promise<ZapierResult> {
  const url = runtimeEnv('ZAPIER_EMAIL_WEBHOOK_URL')
  if (!url) return { ok: false, reason: 'no_url' }
  if (!payload.to) return { ok: false, reason: 'no_recipient' }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return { ok: false, reason: 'error', detail: `HTTP ${res.status}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: 'error', detail: e instanceof Error ? e.message : 'fetch failed' }
  }
}
