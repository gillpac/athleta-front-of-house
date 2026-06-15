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
