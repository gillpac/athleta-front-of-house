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
  INK: '#17130E',
  MUTED: '#84776A',
  BORDER: '#D9CFC2',
  ORANGE: '#E26839',
  BG: '#F6F3EE',
  WHITE: '#FFFFFF',
  RED: '#C0392B',
}

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: `1px solid ${C.BORDER}`,
  fontSize: 14, boxSizing: 'border-box', background: C.WHITE, fontFamily: 'inherit',
}

const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, color: C.INK,
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em',
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={lbl}>{label}{required && <span style={{ color: C.RED }}> *</span>}</label>
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
      <div style={{ minHeight: '100vh', background: C.BG, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: C.WHITE, border: `1px solid ${C.BORDER}`, padding: '40px 32px', maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 12px', color: C.INK }}>Cancellation received</h2>
          <p style={{ fontSize: 14, color: C.MUTED, margin: '0 0 8px' }}>
            Your notice has been submitted. A staff member will be in touch shortly.
          </p>
          <p style={{ fontSize: 13, color: C.MUTED, margin: 0 }}>
            Standard notice period is <strong>2 weeks</strong>. Your effective date has been recorded.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.BG, padding: '32px 16px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.INK, letterSpacing: '-0.3px' }}>ATHLETA GYMNASTICS</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '8px 0 4px', color: C.INK }}>Cancellation Notice</h1>
          <p style={{ fontSize: 13, color: C.MUTED, margin: 0 }}>
            Please complete this form to begin the cancellation process. The standard notice period is 2 weeks.
          </p>
        </div>

        <div style={{ background: C.WHITE, border: `1px solid ${C.BORDER}`, padding: '28px 24px' }}>
          <form onSubmit={submit}>
            {/* Site */}
            <Field label="Gym location" required>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['coolaroo', 'altona_north'] as const).map(s => (
                  <button key={s} type="button" onClick={() => setSite(s)}
                    style={{
                      flex: 1, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                      background: site === s ? C.ORANGE : C.WHITE,
                      color: site === s ? C.WHITE : C.INK,
                      border: `1px solid ${site === s ? C.ORANGE : C.BORDER}`,
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
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {REASONS.map(r => (
                  <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
                    <input type="checkbox" checked={reasons.includes(r)} onChange={() => toggleReason(r)}
                      style={{ width: 16, height: 16, accentColor: C.ORANGE }} />
                    {r}
                  </label>
                ))}
              </div>
            </Field>

            {/* Feedback */}
            <Field label="Additional feedback">
              <textarea style={{ ...inp, fontFamily: 'inherit' }} rows={3}
                value={feedback} onChange={e => setFeedback(e.target.value)}
                placeholder="Anything else you'd like us to know…" />
            </Field>

            {/* Rating */}
            <Field label="How would you rate your experience overall?">
              <div style={{ display: 'flex', gap: 8 }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" onClick={() => setRating(n)}
                    style={{
                      width: 44, height: 44, fontSize: 18, cursor: 'pointer',
                      background: rating === n ? C.ORANGE : C.WHITE,
                      color: rating === n ? C.WHITE : C.INK,
                      border: `1px solid ${rating === n ? C.ORANGE : C.BORDER}`,
                      fontWeight: 700,
                    }}>
                    {n}
                  </button>
                ))}
              </div>
              {rating && <div style={{ fontSize: 12, color: C.MUTED, marginTop: 4 }}>
                {['', 'Very poor', 'Poor', 'Average', 'Good', 'Excellent'][rating]}
              </div>}
            </Field>

            {/* Signature */}
            <Field label="Your full name (signature)" required>
              <input style={inp} value={signatureName} onChange={e => setSignatureName(e.target.value)}
                placeholder="Type your full name to confirm" />
              <div style={{ fontSize: 11, color: C.MUTED, marginTop: 4 }}>
                By entering your name you confirm this is a genuine cancellation request.
              </div>
            </Field>

            {error && (
              <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: C.RED, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={pending}
              style={{
                width: '100%', padding: '14px', background: C.ORANGE, color: C.WHITE,
                border: 'none', cursor: pending ? 'wait' : 'pointer', fontSize: 15, fontWeight: 700,
                opacity: pending ? 0.7 : 1,
              }}>
              {pending ? 'Submitting…' : 'Submit cancellation notice'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', fontSize: 12, color: C.MUTED, marginTop: 16 }}>
          Questions? Call us during business hours.
        </div>
      </div>
    </div>
  )
}
