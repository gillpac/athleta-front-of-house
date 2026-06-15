'use client'

import { useState, useTransition } from 'react'
import type { Lead, Guardian, Programme } from '@/types'
import {
  logCallOutcome, bookTrial, makeSale, markDidntEnrol, markLost, markNoShow,
  sendConfirmation, verifySale, logNote, logText, logEmail,
  resendForm, markFormReceived, sendJotform, updateLeadProfile, archiveLeadWithReason,
} from '../today/actions'

// ─── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  ink: '#17130E',
  orange: '#E26839', orangeDark: '#B94E22',
  bg: '#F6F3EE', card: '#FFFFFF',
  sand: '#EFE8DE', line: '#D9CFC2', lineSoft: '#E8E1D6',
  muted: '#84776A',
  green: '#27865C', greenDark: '#1E6B49', greenBg: '#DFF0E6',
  yellow: '#9A7409', yellowBg: '#FBF1CF',
  red: '#B23A24', redBg: '#F6DCD4',
  grey: '#6E655B', greyBg: '#ECE7DF',
}
const FONT = "'Nunito', system-ui, sans-serif"

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ageFrom(dob: string | null): string {
  if (!dob) return ''
  const d = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - d.getFullYear()
  if (today < new Date(today.getFullYear(), d.getMonth(), d.getDate())) age--
  return String(age)
}

function formatDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime(isoStr: string | null): string {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

const FIELD_LABEL_OVERRIDES: Record<string, string> = {
  prefDays: 'Preferred days', preferred_day: 'Preferred day', prior: 'Prior experience',
  notes: 'Notes', childName: 'Child name', guardian: 'Guardian', mobile: 'Mobile', interest: 'Interest',
}
function fmtFieldLabel(key: string): string {
  if (FIELD_LABEL_OVERRIDES[key]) return FIELD_LABEL_OVERRIDES[key]
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function tomorrowDateStr(): string {
  const d = new Date(); d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

function followUpDate(daysAhead: number): string {
  const d = new Date(); d.setDate(d.getDate() + daysAhead); d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

const PROFILE_KNOWN_FIELDS = new Set([
  'site', 'phone', 'email', 'parent_first', 'parent_last', 'preferred_contact', 'relationship',
  'source', 'referrer_name', 'utm_source', 'utm_medium', 'utm_campaign',
  'child_first_1', 'child_last_1', 'dob_1', 'gender_1', 'programme_name_1', 'interest_1',
  'child_first_2', 'child_last_2', 'dob_2', 'gender_2', 'programme_name_2', 'interest_2',
  'child_first_3', 'child_last_3', 'dob_3', 'gender_3', 'programme_name_3', 'interest_3',
  'child_first_4', 'child_last_4', 'dob_4', 'gender_4', 'programme_name_4', 'interest_4',
])

const ARCHIVE_REASONS = ['Spam / test enquiry', 'Duplicate record', 'Entered in error', 'Parent requested removal', 'Other']

// ─── Primitive UI ─────────────────────────────────────────────────────────────
type TagTone = 'green' | 'yellow' | 'red' | 'grey'
function Tag({ children, tone = 'grey', solid, onClick, title }: {
  children: React.ReactNode; tone?: TagTone; solid?: boolean; onClick?: () => void; title?: string
}) {
  const map: Record<TagTone, [string, string]> = {
    green: [C.green, C.greenBg], yellow: [C.yellow, C.yellowBg],
    red: [C.red, C.redBg], grey: [C.grey, C.greyBg],
  }
  const [fg, bg] = map[tone]
  return (
    <span onClick={onClick} title={title} style={{
      background: solid ? fg : bg, color: solid ? '#fff' : fg,
      fontSize: 10.5, fontWeight: 800, padding: '3px 8px', borderRadius: 3,
      letterSpacing: 0.4, textTransform: 'uppercase', whiteSpace: 'nowrap',
      cursor: onClick ? 'pointer' : 'default', display: 'inline-block',
    }}>{children}</span>
  )
}

function Next({ children, onClick, color = C.orange, border = C.orangeDark, disabled }: {
  children: React.ReactNode; onClick?: () => void; color?: string; border?: string; disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontFamily: FONT, fontWeight: 800, fontSize: 12, cursor: disabled ? 'default' : 'pointer',
      borderRadius: 4, padding: '6px 13px',
      background: disabled ? C.greyBg : color, color: disabled ? C.muted : '#fff',
      border: `1px solid ${disabled ? C.line : border}`, opacity: disabled ? 0.6 : 1,
    }}>{children}</button>
  )
}

function Sale({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return <Next onClick={onClick} color={C.green} border={C.greenDark} disabled={disabled}>{children}</Next>
}

function Quiet({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontFamily: FONT, fontWeight: 700, fontSize: 11.5, cursor: disabled ? 'default' : 'pointer',
      borderRadius: 4, padding: '6px 10px', background: 'transparent', color: C.muted,
      border: `1px solid ${C.lineSoft}`, opacity: disabled ? 0.5 : 1,
    }}>{children}</button>
  )
}

const inp: React.CSSProperties = {
  fontFamily: FONT, fontSize: 13, fontWeight: 700,
  padding: '8px 10px', borderRadius: 4, border: `1px solid ${C.line}`, background: '#fff',
}
const lbl: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
  fontSize: 11.5, fontWeight: 800, color: '#2B2521', marginBottom: 10,
  textTransform: 'uppercase', letterSpacing: 0.5,
}

// ─── ProfileSection / InfoRow ─────────────────────────────────────────────────
function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  )
}

function InfoRow({ label, value, color, longText }: { label: string; value: string; color?: string; longText?: boolean }) {
  if (longText) return (
    <div style={{ fontSize: 13, padding: '4px 0', borderBottom: `1px solid ${C.lineSoft}` }}>
      <div style={{ color: C.muted }}>{label}</div>
      <div style={{ color: color ?? C.ink, fontWeight: 500, marginTop: 2 }}>{value}</div>
    </div>
  )
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: `1px solid ${C.lineSoft}` }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ color: color ?? C.ink, fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{value}</span>
    </div>
  )
}

// ─── CallMenu ─────────────────────────────────────────────────────────────────
const CALL_OUTCOMES = ['No answer', 'Left voicemail', 'Spoke — call back later', 'Spoke — booking now']
const NEEDS_FOLLOWUP = new Set(['No answer', 'Left voicemail', 'Spoke — call back later'])

function CallMenu({ onPick, onClose }: { onPick: (o: string, followUpAt?: string) => void; onClose: () => void }) {
  const [step, setStep] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [customDate, setCustomDate] = useState(tomorrowDateStr())
  const [showCustom, setShowCustom] = useState(false)

  function tileStyle(active: boolean, accent = C.ink) {
    return {
      fontFamily: FONT, fontWeight: 800, fontSize: 12, cursor: 'pointer',
      padding: '8px 6px', border: `1px solid ${active ? accent : C.line}`,
      background: active ? accent : '#fff', color: active ? '#fff' : C.muted,
    } as React.CSSProperties
  }

  if (step) {
    const confirm = () => { if (selected) onPick(step!, selected) }
    return (
      <div style={{
        position: 'absolute', top: '105%', left: 0,
        background: '#fff', border: `1px solid ${C.line}`,
        borderRadius: 4, boxShadow: '0 10px 30px rgba(0,0,0,.2)', zIndex: 30, minWidth: 280, padding: 12,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 8 }}>When to follow up?</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
          {([['1 hour', 'h1'], ['2 hours', 'h2']] as [string, string][]).map(([label, key]) => {
            const iso = new Date(Date.now() + (key === 'h1' ? 1 : 2) * 3600000).toISOString()
            return (
              <button key={key} onClick={() => { setSelected(iso); setShowCustom(false) }} style={tileStyle(selected === iso, C.orange)}>
                {label}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
          {(['Tomorrow', 'Two days', 'Three days', 'Next week'] as const).map((label, i) => {
            const days = [1, 2, 3, 7][i]
            const iso = followUpDate(days)
            return (
              <button key={label} onClick={() => { setSelected(iso); setShowCustom(false) }} style={tileStyle(selected === iso)}>
                {label}
              </button>
            )
          })}
          <button onClick={() => { setShowCustom(v => !v); if (!showCustom) setSelected(null) }} style={tileStyle(showCustom)}>
            Custom…
          </button>
        </div>
        {showCustom && (
          <div style={{ marginBottom: 8 }}>
            <input type="date" value={customDate} min={tomorrowDateStr()}
              onChange={e => { setCustomDate(e.target.value); if (e.target.value) setSelected(new Date(e.target.value + 'T09:00:00').toISOString()) }}
              style={{ width: '100%', padding: '6px 8px', border: `1px solid ${C.line}`, fontSize: 13, boxSizing: 'border-box' as const }} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '7px', border: `1px solid ${C.line}`, background: 'none', cursor: 'pointer', fontSize: 12, fontFamily: FONT }}>Cancel</button>
          <button onClick={confirm} disabled={!selected}
            style={{ flex: 2, padding: '7px', border: 'none', background: selected ? C.ink : C.greyBg, color: selected ? '#fff' : C.muted, cursor: selected ? 'pointer' : 'default', fontSize: 12, fontWeight: 700, fontFamily: FONT }}>
            Log &amp; set reminder
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'absolute', top: '105%', left: 0,
      background: '#fff', border: `1px solid ${C.line}`,
      borderRadius: 4, boxShadow: '0 10px 30px rgba(0,0,0,.2)', zIndex: 30, minWidth: 220,
    }}>
      <div style={{ fontSize: 10, fontWeight: 900, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, padding: '7px 10px', borderBottom: `1px solid ${C.lineSoft}` }}>
        I called — what happened?
      </div>
      {CALL_OUTCOMES.map(o => (
        <button key={o} onClick={() => NEEDS_FOLLOWUP.has(o) ? setStep(o) : onPick(o)}
          style={{
            display: 'block', width: '100%', textAlign: 'left',
            fontFamily: FONT, fontSize: 12.5, fontWeight: 700,
            padding: '8px 10px', background: 'none', border: 'none',
            borderBottom: `1px solid ${C.lineSoft}`, cursor: 'pointer', color: '#2B2521',
          }}>{o}</button>
      ))}
      <button onClick={() => onPick('__open_profile__')}
        style={{
          display: 'block', width: '100%', textAlign: 'left',
          fontFamily: FONT, fontSize: 12.5, fontWeight: 700,
          padding: '8px 10px', background: 'none', border: 'none',
          cursor: 'pointer', color: C.muted,
        }}>Other — add a note</button>
    </div>
  )
}

// ─── LossPicker ───────────────────────────────────────────────────────────────
function LossPicker({ onNurture, onLost, onCancel }: {
  onNurture: (reason: string, followupDate: string) => void
  onLost: (reason: string) => void
  onCancel: () => void
}) {
  const [mode, setMode] = useState<'nurture' | 'lost'>('nurture')
  const [reason, setReason] = useState('Price')
  const [other, setOther] = useState('')
  const minDate = new Date(); minDate.setDate(minDate.getDate() + 1)
  const defaultFollowup = new Date(); defaultFollowup.setDate(defaultFollowup.getDate() + 7)
  const [followupDate, setFollowupDate] = useState(defaultFollowup.toISOString().split('T')[0])
  const finalReason = reason === 'Other' ? (other.trim() ? `Other — ${other.trim()}` : '') : reason
  const ok = !!finalReason && (mode === 'lost' || !!followupDate)

  function confirm() {
    if (!ok) return
    if (mode === 'nurture') onNurture(finalReason, followupDate)
    else onLost(finalReason)
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 4, padding: '10px 12px', marginTop: 6, maxWidth: 340 }}>
      <div style={{ fontSize: 11, fontWeight: 900, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Didn&apos;t enrol — what now?</div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {(['nurture', 'lost'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)} style={{
            flex: 1, padding: '6px', fontSize: 12, fontWeight: 800, cursor: 'pointer',
            background: mode === m ? C.ink : C.card, color: mode === m ? '#fff' : C.muted,
            border: `1px solid ${mode === m ? C.ink : C.line}`,
          }}>
            {m === 'nurture' ? '🌱 Nurture' : '✗ Lost'}
          </button>
        ))}
      </div>
      {mode === 'nurture' && <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Follow up later — stays in system with a future date</div>}
      {mode === 'lost' && <div style={{ fontSize: 11, color: C.red, marginBottom: 8 }}>Dead lead — requires a reason, no further follow-up</div>}
      <select value={reason} onChange={e => setReason(e.target.value)} style={{ ...inp, padding: '4px 6px', fontSize: 11.5, width: '100%', marginBottom: 6 }}>
        <option>Price</option>
        <option>Timing / not ready</option>
        <option>Day didn&apos;t suit</option>
        <option>Comparing options</option>
        <option>Other</option>
      </select>
      {reason === 'Other' && (
        <input value={other} onChange={e => setOther(e.target.value)} placeholder="what happened?"
          style={{ ...inp, padding: '4px 6px', fontSize: 11.5, width: '100%', marginBottom: 6, boxSizing: 'border-box' }} />
      )}
      {mode === 'nurture' && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, marginBottom: 3 }}>FOLLOW-UP DATE</div>
          <input type="date" value={followupDate} min={minDate.toISOString().split('T')[0]}
            onChange={e => setFollowupDate(e.target.value)}
            style={{ ...inp, padding: '4px 6px', fontSize: 11.5, width: '100%', boxSizing: 'border-box' }} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <Quiet onClick={onCancel}>Cancel</Quiet>
        <Next onClick={confirm} disabled={!ok}>{mode === 'nurture' ? 'Move to nurture' : 'Mark lost'}</Next>
      </div>
    </div>
  )
}

// ─── BookingModal ─────────────────────────────────────────────────────────────
function BookingModal({ lead, programmes, onClose, onConfirm }: {
  lead: Lead & { guardians: Guardian }
  programmes: Programme[]
  onClose: () => void
  onConfirm: (vals: { date: string; time: string; programmeId: string | null; programmeName: string }) => void
}) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const age = ageFrom(lead.dob)
  const suggestedProg = programmes.find(p => {
    const a = parseInt(age)
    if (isNaN(a)) return false
    return (p.min_age == null || a >= p.min_age) && (p.max_age == null || a <= p.max_age)
  }) ?? programmes[0]
  const [progId, setProgId] = useState(lead.programme_id ?? suggestedProg?.id ?? '')
  const ok = date && time
  const selectedProg = programmes.find(p => p.id === progId)

  function handleConfirm() {
    if (!ok) return
    onConfirm({ date, time, programmeId: progId || null, programmeName: selectedProg?.name ?? '' })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,19,14,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 150 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 6, padding: '22px 24px', width: 360, maxWidth: '92vw', borderTop: `3px solid ${C.orange}` }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 900 }}>Book trial — {lead.child_first} {lead.child_last}</h3>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, marginBottom: 14 }}>
          {(lead.relationship ?? '').toLowerCase()} · {lead.guardians.first_name} {lead.guardians.last_name} · {lead.guardians.phone}
        </div>
        <label style={lbl}>Trial date<input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} /></label>
        <label style={lbl}>Time<input type="time" value={time} onChange={e => setTime(e.target.value)} style={inp} /></label>
        <label style={lbl}>Programme
          <select value={progId} onChange={e => setProgId(e.target.value)} style={inp}>
            {programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {age && <span style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, textTransform: 'none' }}>Suggested from age {age}</span>}
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <Quiet onClick={onClose}>Cancel</Quiet>
          <Next onClick={handleConfirm} disabled={!ok}>{ok ? 'Confirm booking' : 'Pick date & time'}</Next>
        </div>
      </div>
    </div>
  )
}

// ─── EnrolModal ───────────────────────────────────────────────────────────────
function EnrolModal({ lead, onClose, onConfirm }: {
  lead: Lead & { guardians: Guardian }
  onClose: () => void
  onConfirm: (vals: { date: string; slot: string; payTaken: boolean }) => void
}) {
  const [date, setDate] = useState('')
  const [slot, setSlot] = useState('')
  const [payTaken, setPayTaken] = useState(false)
  const ok = date && slot && payTaken

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,19,14,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 150 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 6, padding: '22px 24px', width: 380, maxWidth: '92vw', borderTop: `3px solid ${C.green}` }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 900 }}>💰 Make the sale — {lead.child_first} {lead.child_last}</h3>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, marginBottom: 12 }}>lock in their first class to complete the sale</div>
        {!lead.form_received && (
          <div style={{ background: C.yellowBg, border: '1px solid #E5D49A', borderRadius: 4, padding: '8px 11px', marginBottom: 12, fontSize: 12, fontWeight: 800, color: C.yellow }}>
            ⚠ Their Jotform hasn't come back — get it completed before their first class.
          </div>
        )}
        <label style={lbl}>First class date<input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} /></label>
        <label style={lbl}>Class<input placeholder="e.g. Sat 9:30 am Kinder Gym" value={slot} onChange={e => setSlot(e.target.value)} style={inp} /></label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, fontWeight: 800, color: '#2B2521', cursor: 'pointer', margin: '4px 0 8px' }}>
          <input type="checkbox" checked={payTaken} onChange={e => setPayTaken(e.target.checked)} style={{ width: 16, height: 16, accentColor: C.green }} />
          Rego & insurance payment taken
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
          <Quiet onClick={onClose}>Cancel</Quiet>
          <Sale onClick={() => ok && onConfirm({ date, slot, payTaken })} disabled={!ok}>
            {!date || !slot ? 'Add first class' : !payTaken ? 'Take payment first' : 'Confirm sale 🎉'}
          </Sale>
        </div>
      </div>
    </div>
  )
}

// ─── EditProfileModal ─────────────────────────────────────────────────────────
function EditProfileModal({ lead, programmes, onClose, onArchive, onSave }: {
  lead: Lead & { guardians: Guardian }
  programmes: Programme[]
  onClose: () => void
  onArchive: () => void
  onSave: (
    leadFields: { child_first: string; child_last: string; dob: string | null; gender: string | null; programme_id: string | null },
    guardianFields: { first_name: string; last_name: string; phone: string; email: string | null; preferred_contact: string | null; secondary_contact_note: string | null }
  ) => void
}) {
  const g = lead.guardians
  const [childFirst, setChildFirst] = useState(lead.child_first)
  const [childLast, setChildLast] = useState(lead.child_last)
  const [dob, setDob] = useState(lead.dob ?? '')
  const [gender, setGender] = useState(lead.gender ?? '')
  const [progId, setProgId] = useState(lead.programme_id ?? '')
  const [firstName, setFirstName] = useState(g.first_name)
  const [lastName, setLastName] = useState(g.last_name)
  const [phone, setPhone] = useState(g.phone)
  const [email, setEmail] = useState(g.email ?? '')
  const [prefContact, setPrefContact] = useState(g.preferred_contact ?? '')
  const [secondContact, setSecondContact] = useState(g.secondary_contact_note ?? '')

  function handleSave() {
    onSave(
      { child_first: childFirst.trim(), child_last: childLast.trim(), dob: dob || null, gender: gender || null, programme_id: progId || null },
      { first_name: firstName.trim(), last_name: lastName.trim(), phone: phone.trim(), email: email.trim() || null, preferred_contact: prefContact || null, secondary_contact_note: secondContact.trim() || null }
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,19,14,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 160 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 6, padding: '22px 24px', width: 440, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto', borderTop: `3px solid ${C.orange}` }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Edit profile — {lead.child_first} {lead.child_last}</h3>
          <Quiet onClick={onClose}>✕</Quiet>
        </div>
        <div style={{ fontSize: 11, fontWeight: 900, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Child</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <label style={lbl}>First name<input value={childFirst} onChange={e => setChildFirst(e.target.value)} style={inp} /></label>
          <label style={lbl}>Last name<input value={childLast} onChange={e => setChildLast(e.target.value)} style={inp} /></label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <label style={lbl}>Date of birth<input type="date" value={dob} onChange={e => setDob(e.target.value)} style={inp} /></label>
          <label style={lbl}>Gender
            <select value={gender} onChange={e => setGender(e.target.value)} style={inp}>
              <option value="">—</option><option>Male</option><option>Female</option><option>Other</option>
            </select>
          </label>
        </div>
        <label style={{ ...lbl, marginBottom: 14 }}>Programme
          <select value={progId} onChange={e => setProgId(e.target.value)} style={inp}>
            <option value="">— unassigned —</option>
            {programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div style={{ fontSize: 11, fontWeight: 900, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Guardian</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <label style={lbl}>First name<input value={firstName} onChange={e => setFirstName(e.target.value)} style={inp} /></label>
          <label style={lbl}>Last name<input value={lastName} onChange={e => setLastName(e.target.value)} style={inp} /></label>
        </div>
        <label style={lbl}>Phone<input value={phone} onChange={e => setPhone(e.target.value)} style={inp} /></label>
        <label style={lbl}>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inp} /></label>
        <label style={lbl}>Preferred contact
          <select value={prefContact} onChange={e => setPrefContact(e.target.value)} style={inp}>
            <option value="">—</option>
            <option>Phone call</option><option>Text / SMS</option><option>Email</option>
          </select>
        </label>
        <label style={{ ...lbl, marginBottom: 16 }}>Second guardian / contact
          <textarea value={secondContact} onChange={e => setSecondContact(e.target.value)} placeholder="e.g. Dad — John Smith, 0412 345 678" rows={2}
            style={{ ...inp, resize: 'vertical' as const }} />
        </label>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={onArchive} style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '6px 10px', background: 'none', border: `1px solid ${C.line}`, color: C.red }}>Archive lead…</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <Quiet onClick={onClose}>Cancel</Quiet>
            <Next onClick={handleSave}>Save changes</Next>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── ArchiveReasonModal ───────────────────────────────────────────────────────
function ArchiveReasonModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState(ARCHIVE_REASONS[0])
  const [other, setOther] = useState('')
  const finalReason = reason === 'Other' ? (other.trim() ? `Other — ${other.trim()}` : '') : reason

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,19,14,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 170 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 6, padding: '20px 22px', width: 360, maxWidth: '90vw', borderTop: `3px solid ${C.red}` }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 900, color: C.red }}>Archive this lead?</h3>
        <p style={{ margin: '0 0 14px', fontSize: 12.5, color: C.muted }}>This will remove the lead from all active views. You must select a reason.</p>
        <label style={lbl}>Reason
          <select value={reason} onChange={e => setReason(e.target.value)} style={inp}>
            {ARCHIVE_REASONS.map(r => <option key={r}>{r}</option>)}
          </select>
        </label>
        {reason === 'Other' && (
          <label style={{ ...lbl, marginTop: 8 }}>Details
            <input value={other} onChange={e => setOther(e.target.value)} placeholder="Brief reason…" style={inp} />
          </label>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <Quiet onClick={onClose}>Cancel</Quiet>
          <button onClick={() => finalReason && onConfirm(finalReason)} disabled={!finalReason}
            style={{ fontFamily: FONT, fontWeight: 800, fontSize: 12, cursor: finalReason ? 'pointer' : 'default', padding: '7px 14px', background: finalReason ? C.red : C.greyBg, color: finalReason ? '#fff' : C.muted, border: 'none', borderRadius: 4 }}>
            Archive lead
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ProfilePanel (main export) ───────────────────────────────────────────────
export interface ProfilePanelProps {
  lead: Lead & { guardians: Guardian }
  allLeads: (Lead & { guardians: Guardian })[]
  userId: string
  userRole: string
  programmes: Programme[]
  activities: Array<{ lead_id: string; user_id: string | null; kind: string; body: string; created_at: string }>
  userNames: Record<string, string>
  onClose: () => void
  onOpenParent?: () => void
  onSwitchLead?: (id: string) => void
}

export function ProfilePanel({
  lead, allLeads, userId, userRole, programmes, activities, userNames,
  onClose, onOpenParent, onSwitchLead,
}: ProfilePanelProps) {
  const [note, setNote] = useState('')
  const [callOpen, setCallOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [bookingOpen, setBookingOpen] = useState(false)
  const [enrolOpen, setEnrolOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [textMsgOpen, setTextMsgOpen] = useState(false)
  const [textMsg, setTextMsg] = useState('')
  const [lossOpen, setLossOpen] = useState(false)

  const isAdmin = userRole === 'admin' || userRole === 'management'
  const siblings = allLeads.filter(l => l.guardians.id === lead.guardians.id && l.id !== lead.id)
  const bookable = lead.status === 'new' || lead.status === 'noshow' || lead.status === 'nurture'
  const age = ageFrom(lead.dob)
  const guardian = lead.guardians
  const prog = programmes.find(p => p.id === lead.programme_id)
  const leadActivities = activities.filter(a => a.lead_id === lead.id)
  const extraFields = lead.enquiry_raw
    ? Object.entries(lead.enquiry_raw).filter(([k, v]) => !PROFILE_KNOWN_FIELDS.has(k) && v !== null && v !== '' && v !== undefined)
    : []
  const utmCampaign = lead.enquiry_raw?.utm_campaign as string | undefined

  function handleCall(outcome: string, followUpAt?: string) {
    setCallOpen(false)
    if (outcome === '__open_profile__') return
    startTransition(async () => {
      await logCallOutcome(lead.id, outcome, userId, followUpAt)
    })
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 120 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(23,19,14,.4)' }} onClick={onClose} />
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: 440, maxWidth: '94vw',
          background: '#fff', borderLeft: `3px solid ${C.orange}`, display: 'flex', flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.line}`, background: '#FCFAF7', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 18, fontFamily: FONT }}>{lead.child_first} {lead.child_last}</div>
                <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Tag tone={lead.status === 'won' ? 'green' : lead.status === 'new' ? 'red' : lead.status === 'booked' ? 'green' : lead.status === 'noshow' ? 'red' : 'yellow'} solid>
                    {lead.status === 'won' ? 'enrolled' : lead.status}
                  </Tag>
                  {prog && <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>{prog.name}</span>}
                </div>
                <div style={{ marginTop: 5, fontSize: 12, color: C.muted, fontWeight: 400, fontFamily: FONT }}>
                  Enquired {formatDate(lead.received_at)}{lead.source ? ` · ${lead.source}` : ''}{lead.trial_at ? ` · Trial ${fmtDateTime(lead.trial_at)}` : ''}
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 400, color: C.ink, marginTop: 2, fontFamily: FONT }}>
                  {(lead.relationship ?? '').toLowerCase()} ·{' '}
                  {onOpenParent ? (
                    <button onClick={onOpenParent} style={{ fontFamily: FONT, fontWeight: 700, fontSize: 12.5, color: C.ink, background: 'none', border: 'none', padding: 0, cursor: 'pointer', borderBottom: `1px dotted ${C.line}` }}>
                      {guardian.first_name} {guardian.last_name}
                    </button>
                  ) : (
                    <span style={{ fontWeight: 700 }}>{guardian.first_name} {guardian.last_name}</span>
                  )}
                  {' '}· {guardian.phone}
                </div>
                {siblings.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 900, color: C.muted, letterSpacing: '.4px' }}>FAMILY:</span>
                    {siblings.map(s => (
                      <button key={s.id} onClick={() => onSwitchLead?.(s.id)}
                        style={{ fontFamily: FONT, display: 'inline-flex', gap: 5, alignItems: 'center', background: C.sand, border: `1px solid ${C.line}`, padding: '2px 7px', cursor: onSwitchLead ? 'pointer' : 'default', fontSize: 11.5, fontWeight: 800, color: C.ink }}>
                        {s.child_first} {s.child_last}
                        <Tag tone={s.status === 'won' ? 'green' : s.status === 'new' ? 'red' : s.status === 'booked' ? 'green' : s.status === 'noshow' ? 'red' : 'yellow'}>{s.status}</Tag>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <Quiet onClick={() => setEditOpen(true)}>Edit</Quiet>
                <Quiet onClick={onClose}>✕</Quiet>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', position: 'relative' }}>
              <Next onClick={() => setCallOpen(!callOpen)}>📞 Call</Next>
              <Quiet onClick={() => { setTextMsgOpen(v => !v); setTextMsg('') }}>💬 Log text</Quiet>
              <Quiet onClick={() => startTransition(() => logEmail(lead.id, userId))}>✉ Log email</Quiet>
              {bookable && <Next onClick={() => setBookingOpen(true)}>{lead.status === 'noshow' ? 'Re-book trial' : 'Book trial'}</Next>}
              {(lead.status === 'booked' || lead.status === 'nurture') && <Sale onClick={() => setEnrolOpen(true)}>💰 Make the sale</Sale>}
              {lead.status === 'booked' && !lead.confirmation_sent_at && (
                <Quiet onClick={() => startTransition(() => sendConfirmation(lead.id, userId))}>Send confirmation</Quiet>
              )}
              {lead.status === 'booked' && (
                <Quiet onClick={() => setLossOpen(v => !v)}>Didn&apos;t enrol</Quiet>
              )}
              {lead.status === 'booked' && (
                <Quiet onClick={() => { if (window.confirm('Mark as no-show?')) startTransition(() => markNoShow(lead.id, userId)) }}>No-show</Quiet>
              )}
              {lead.status === 'won' && !lead.verified_at && isAdmin && (
                <Sale onClick={() => startTransition(() => verifySale(lead.id, userId))}>Verify sale ✓</Sale>
              )}
              {callOpen && <CallMenu onPick={handleCall} onClose={() => setCallOpen(false)} />}
            </div>

            {/* Didn't enrol — loss picker inline */}
            {lossOpen && (
              <LossPicker
                onNurture={(reason, date) => { setLossOpen(false); startTransition(() => markDidntEnrol(lead.id, reason, userId, date)) }}
                onLost={reason => { setLossOpen(false); startTransition(() => markLost(lead.id, reason, userId)) }}
                onCancel={() => setLossOpen(false)}
              />
            )}

            {/* Log text inline input */}
            {textMsgOpen && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input value={textMsg} onChange={e => setTextMsg(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && textMsg.trim()) { startTransition(() => logText(lead.id, userId, textMsg.trim())); setTextMsg(''); setTextMsgOpen(false) } }}
                  placeholder="What did you send?" autoFocus
                  style={{ flex: 1, padding: '6px 8px', border: `1px solid ${C.line}`, fontSize: 12, fontFamily: FONT }} />
                <button onClick={() => { if (textMsg.trim()) { startTransition(() => logText(lead.id, userId, textMsg.trim())); setTextMsg(''); setTextMsgOpen(false) } }}
                  style={{ fontFamily: FONT, fontWeight: 700, fontSize: 12, padding: '6px 12px', background: C.ink, color: '#fff', border: 'none', cursor: 'pointer' }}>
                  Log
                </button>
              </div>
            )}

            {/* Jotform & verification status */}
            <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {lead.form_received
                ? <Tag tone="green">Jotform ✓</Tag>
                : lead.form_sent_at
                  ? (<><Tag tone="yellow">Jotform pending</Tag><Quiet onClick={() => startTransition(() => resendForm(lead.id, userId))}>Resend Jotform</Quiet><Quiet onClick={() => startTransition(() => markFormReceived(lead.id, userId))}>Got Jotform ✓</Quiet></>)
                  : <Quiet onClick={() => startTransition(() => sendJotform(lead.id, userId))}>Send Jotform</Quiet>
              }
              {lead.status === 'won' && (lead.verified_at ? <Tag tone="green" solid>sale ✓</Tag> : <Tag tone="yellow">sale — pending admin</Tag>)}
            </div>
          </div>

          {/* Scrollable body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px', fontFamily: FONT }}>
            <ProfileSection title="Child">
              <InfoRow label="Date of birth" value={lead.dob ? `${formatDate(lead.dob)} (${age} yrs)` : '—'} />
              {lead.gender && <InfoRow label="Gender" value={lead.gender} />}
              <InfoRow label="Source" value={lead.source ?? '—'} />
              {lead.referrer_name && <InfoRow label="Referred by" value={lead.referrer_name} />}
              {utmCampaign && <InfoRow label="Campaign" value={utmCampaign} />}
              <InfoRow label="Jotform" value={lead.form_received ? '✓ Received' : lead.form_sent_at ? '⧗ Sent — awaiting return' : '— not yet sent'} color={lead.form_received ? C.green : lead.form_sent_at ? C.yellow : C.muted} />
            </ProfileSection>

            <ProfileSection title="Guardian">
              <InfoRow label="Name" value={`${guardian.first_name} ${guardian.last_name}`} />
              <InfoRow label="Phone" value={guardian.phone} />
              {guardian.email && <InfoRow label="Email" value={guardian.email} />}
              {guardian.preferred_contact && <InfoRow label="Preferred contact" value={guardian.preferred_contact} />}
              {guardian.secondary_contact_note && <InfoRow label="Second contact" value={guardian.secondary_contact_note} longText={guardian.secondary_contact_note.length > 50} />}
            </ProfileSection>

            {lead.trial_at && (
              <ProfileSection title="Trial">
                <InfoRow label="Booked for" value={fmtDateTime(lead.trial_at)} />
                {lead.confirmation_sent_at && <InfoRow label="Confirmation sent" value={fmtDateTime(lead.confirmation_sent_at)} color={C.green} />}
              </ProfileSection>
            )}

            {lead.status === 'won' && (
              <ProfileSection title="Enrolment">
                {lead.sold_at && <InfoRow label="Enrolled" value={fmtDateTime(lead.sold_at)} />}
                {lead.first_class && <InfoRow label="First class" value={`${lead.first_class_date ? formatDate(lead.first_class_date) : ''} ${lead.first_class}`} />}
                <InfoRow label="Payment taken" value={lead.payment_taken ? '✓ Yes' : '✗ No'} color={lead.payment_taken ? C.green : C.red} />
                {lead.verified_at && <InfoRow label="Admin verified" value={fmtDateTime(lead.verified_at)} color={C.green} />}
              </ProfileSection>
            )}

            {lead.status === 'nurture' && lead.nurture_followup_at && (
              <ProfileSection title="Nurture">
                <InfoRow label="Follow-up date" value={formatDate(lead.nurture_followup_at)} />
                {lead.lost_reason && <InfoRow label="Reason" value={lead.lost_reason} />}
              </ProfileSection>
            )}

            {extraFields.length > 0 && (
              <ProfileSection title="Additional info">
                {extraFields.map(([k, v]) => (
                  <InfoRow key={k} label={fmtFieldLabel(k)} value={String(v)} longText={String(v).length > 60} />
                ))}
              </ProfileSection>
            )}

            <ProfileSection title="Add note">
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={note} onChange={e => setNote(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && note.trim()) { startTransition(() => logNote(lead.id, note.trim(), userId)); setNote('') } }}
                  placeholder="Add a note…" style={{ ...inp, flex: 1 }} />
                <Next onClick={() => { if (note.trim()) { startTransition(() => logNote(lead.id, note.trim(), userId)); setNote('') } }}>Save</Next>
              </div>
              {pending && <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginTop: 4 }}>Saving…</div>}
            </ProfileSection>

            <ProfileSection title="Timeline">
              {leadActivities.map((a, i) => {
                const who = a.user_id ? (userNames[a.user_id] ?? 'Staff') : 'System'
                return (
                  <div key={i} style={{ borderLeft: `2px solid ${C.line}`, paddingLeft: 10, marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>
                      {new Date(a.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {who}
                    </div>
                    <div style={{ fontSize: 12.5, color: C.ink }}>{a.body}</div>
                  </div>
                )
              })}
              <div style={{ borderLeft: `2px solid ${C.lineSoft}`, paddingLeft: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>
                  {formatDate(lead.received_at)} · {lead.source ?? 'unknown source'}
                </div>
                <div style={{ fontSize: 12.5, color: C.muted }}>Enquiry received</div>
              </div>
            </ProfileSection>
          </div>
        </div>
      </div>

      {bookingOpen && (
        <BookingModal lead={lead} programmes={programmes} onClose={() => setBookingOpen(false)}
          onConfirm={({ date, time, programmeId, programmeName }) => {
            setBookingOpen(false)
            const [h, m] = time.split(':').map(Number)
            const dt = new Date(date); dt.setHours(h, m, 0, 0)
            startTransition(() => bookTrial(lead.id, dt.toISOString(), programmeId, programmeName, userId))
          }} />
      )}
      {enrolOpen && (
        <EnrolModal lead={lead} onClose={() => setEnrolOpen(false)}
          onConfirm={({ date, slot, payTaken }) => {
            setEnrolOpen(false)
            startTransition(() => makeSale(lead.id, date, slot, payTaken, userId))
          }} />
      )}
      {editOpen && (
        <EditProfileModal lead={lead} programmes={programmes}
          onClose={() => setEditOpen(false)}
          onArchive={() => { setEditOpen(false); setArchiveOpen(true) }}
          onSave={(lf, gf) => {
            setEditOpen(false)
            startTransition(() => updateLeadProfile(lead.id, lead.guardian_id, userId, lf, gf))
          }} />
      )}
      {archiveOpen && (
        <ArchiveReasonModal
          onClose={() => setArchiveOpen(false)}
          onConfirm={(reason) => { setArchiveOpen(false); onClose(); startTransition(() => archiveLeadWithReason(lead.id, userId, reason)) }} />
      )}
    </>
  )
}
