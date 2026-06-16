'use client'

import { useState, useTransition } from 'react'
import { submitCancellation } from './actions'

const REASONS = [
  'Cost / affordability',
  'Schedule / timing doesn\'t suit',
  'Relocating',
  'Child lost interest',
  'Injury or health',
  'Level / programme not right',
  'Customer service concerns',
  'Moving to another gym',
  'Other',
]

const C = {
  ink: '#23201d', head: '#14110d', body: '#4a453f', muted: '#5f5851', faint: '#877f75',
  orange: '#E26839', bg: '#f6f4f1', card: '#ffffff', soft: '#faf8f6',
  line: '#efeae3', line2: '#e6e0d8', sand: '#f0ebe4',
  red: '#bf4a30', redBg: '#fde8e3',
  green: '#3f8f5e',
}
const FONT = "'Nunito Sans', -apple-system, system-ui, sans-serif"
const RADIUS = 8

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: `1px solid ${C.line2}`,
  borderRadius: 6, fontSize: 14, boxSizing: 'border-box',
  background: C.card, fontFamily: FONT, color: C.ink,
}

const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, color: C.muted,
  marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase',
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={lbl}>{label}{required && <span style={{ color: C.red }}> *</span>}</label>
      {children}
    </div>
  )
}

export default function CancelPage() {
  const [memberName, setMemberName] = useState('')
  const [guardianName, setGuardianName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [site, setSite] = useState<'coolaroo' | 'altona_north' | ''>('')
  const [level, setLevel] = useState('')
  const [reasons, setReasons] = useState<string[]>([])
  const [feedback, setFeedback] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [signatureName, setSignatureName] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  function toggleReason(r: string) {
    setReasons(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!memberName || !site || reasons.length === 0 || !signatureName) {
      setError('Please fill in all required fields and select at least one reason.')
      return
    }
    setError('')
    startTransition(async () => {
      const result = await submitCancellation({
        memberName, guardianName, phone, email,
        site: site as 'coolaroo' | 'altona_north',
        level, reasons, feedback,
        rating, signatureName,
      })
      if (result.ok) setSubmitted(true)
      else setError(result.error ?? 'Something went wrong. Please try again.')
    })
  }

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: FONT }}>
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: RADIUS, padding: '48px 36px', maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#eef6f0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 10px', color: C.head, letterSpacing: '-0.2px' }}>Cancellation received</h2>
          <p style={{ fontSize: 14, color: C.body, margin: '0 0 8px', lineHeight: 1.5 }}>
            Your notice has been submitted. A staff member will be in touch shortly.
          </p>
          <p style={{ fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.5 }}>
            Standard notice period is <strong>2 weeks</strong>. Your effective date has been recorded.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '32px 16px', fontFamily: FONT }}>
      {/* orange stripe */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, background: C.orange, zIndex: 100 }} />

      <div style={{ maxWidth: 560, margin: '0 auto', paddingTop: 12 }}>
        {/* Header */}
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginBottom: 16 }}>
            <div style={{ width: 20, height: 20, background: C.orange, borderRadius: 5, flexShrink: 0 }} />
            <span style={{ fontSize: 16, fontWeight: 800, color: C.head, letterSpacing: '-0.3px' }}>Athleta</span>
            <span style={{ color: C.line2, fontSize: 14 }}>|</span>
            <span style={{ fontSize: 14, color: C.muted, fontWeight: 400 }}>Front of House</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px', color: C.head, letterSpacing: '-0.3px' }}>Cancellation Notice</h1>
          <p style={{ fontSize: 13.5, color: C.muted, margin: 0, lineHeight: 1.5 }}>
            Please complete this form to begin the cancellation process. The standard notice period is 2 weeks.
          </p>
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: RADIUS, padding: '28px 26px' }}>
          <form onSubmit={submit}>
            {/* Site */}
            <Field label="Gym location" required>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['coolaroo', 'altona_north'] as const).map(s => (
                  <button key={s} type="button" onClick={() => setSite(s)}
                    style={{
                      flex: 1, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                      background: site === s ? C.orange : C.soft,
                      color: site === s ? '#fff' : C.ink,
                      border: `1px solid ${site === s ? C.orange : C.line2}`,
                      borderRadius: 7, fontFamily: FONT,
                    }}>
                    {s === 'coolaroo' ? 'Coolaroo' : 'Altona North'}
                  </button>
                ))}
              </div>
            </Field>

            {/* Member name */}
            <Field label="Member (child) name" required>
              <input style={inp} value={memberName} onChange={e => setMemberName(e.target.value)}
                placeholder="First and last name" />
            </Field>

            {/* Level */}
            <Field label="Level / programme">
              <input style={inp} value={level} onChange={e => setLevel(e.target.value)}
                placeholder="e.g. Kinder Gym, Level 3…" />
            </Field>

            {/* Guardian */}
            <Field label="Parent / guardian name">
              <input style={inp} value={guardianName} onChange={e => setGuardianName(e.target.value)}
                placeholder="If different from member" />
            </Field>

            {/* Contact */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Phone</label>
                <input style={inp} type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="04xx xxx xxx" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Email</label>
                <input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com" />
              </div>
            </div>

            {/* Reasons */}
            <Field label="Reason(s) for cancelling" required>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {REASONS.map(r => (
                  <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, color: C.body }}>
                    <input type="checkbox" checked={reasons.includes(r)} onChange={() => toggleReason(r)}
                      style={{ width: 16, height: 16, accentColor: C.orange, flexShrink: 0 }} />
                    {r}
                  </label>
                ))}
              </div>
            </Field>

            {/* Feedback */}
            <Field label="Additional feedback">
              <textarea style={{ ...inp, fontFamily: FONT, resize: 'vertical' }} rows={3}
                value={feedback} onChange={e => setFeedback(e.target.value)}
                placeholder="Anything else you'd like us to know…" />
            </Field>

            {/* Rating */}
            <Field label="How would you rate your experience overall?">
              <div style={{ display: 'flex', gap: 8 }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" onClick={() => setRating(n)}
                    style={{
                      width: 46, height: 46, fontSize: 16, cursor: 'pointer',
                      background: rating === n ? C.orange : C.soft,
                      color: rating === n ? '#fff' : C.ink,
                      border: `1px solid ${rating === n ? C.orange : C.line2}`,
                      borderRadius: 7, fontWeight: 700, fontFamily: FONT,
                    }}>
                    {n}
                  </button>
                ))}
              </div>
              {rating && <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
                {['', 'Very poor', 'Poor', 'Average', 'Good', 'Excellent'][rating]}
              </div>}
            </Field>

            {/* Signature */}
            <Field label="Your full name (signature)" required>
              <input style={inp} value={signatureName} onChange={e => setSignatureName(e.target.value)}
                placeholder="Type your full name to confirm" />
              <div style={{ fontSize: 12, color: C.faint, marginTop: 5 }}>
                By entering your name you confirm this is a genuine cancellation request.
              </div>
            </Field>

            {error && (
              <div style={{ background: C.redBg, border: `1px solid #f5c6bb`, color: C.red, padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 18 }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={pending}
              style={{
                width: '100%', padding: '14px', background: C.orange, color: '#fff',
                border: 'none', borderRadius: 8, cursor: pending ? 'wait' : 'pointer',
                fontSize: 15, fontWeight: 700, fontFamily: FONT,
                opacity: pending ? 0.7 : 1,
              }}>
              {pending ? 'Submitting…' : 'Submit cancellation notice'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', fontSize: 12, color: C.faint, marginTop: 18 }}>
          Questions? Call us during business hours.
        </div>
      </div>
    </div>
  )
}
