'use client'

import { useState, useTransition, useOptimistic } from 'react'
import type { AppUser, Lead, Target, BlockoutDay, ChecklistItem, ChecklistCompletion, Programme, Guardian } from '@/types'
import {
  logCallOutcome,
  bookTrial,
  markArrived,
  undoArrived,
  markNoShow,
  makeSale,
  markDidntEnrol,
  markLost,
  sendConfirmation,
  verifySale,
  toggleChecklist,
  logNote,
  logText,
  logEmail,
  resendForm,
  markFormReceived,
  sendJotform,
} from './actions'

// ─── Design tokens ────────────────────────────────────────────────────────────
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
const waitLabel = (mins: number) =>
  mins < 60 ? `${mins} min` : mins < 1440 ? `${Math.round(mins / 60)} hrs` : `${Math.round(mins / 1440)} days`

const ageFrom = (dob: string | null): string => {
  if (!dob) return ''
  const d = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - d.getFullYear()
  if (today < new Date(today.getFullYear(), d.getMonth(), d.getDate())) age--
  return String(age)
}

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
}

function formatDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime(isoStr: string | null): string {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

const PROFILE_KNOWN_FIELDS = new Set([
  'site', 'phone', 'email', 'parent_first', 'parent_last', 'preferred_contact', 'relationship',
  'source', 'referrer_name', 'utm_source', 'utm_medium', 'utm_campaign',
  'child_first_1', 'child_last_1', 'dob_1', 'gender_1', 'programme_name_1', 'interest_1',
  'child_first_2', 'child_last_2', 'dob_2', 'gender_2', 'programme_name_2', 'interest_2',
  'child_first_3', 'child_last_3', 'dob_3', 'gender_3', 'programme_name_3', 'interest_3',
  'child_first_4', 'child_last_4', 'dob_4', 'gender_4', 'programme_name_4', 'interest_4',
])

const FIELD_LABEL_OVERRIDES: Record<string, string> = {
  prefDays: 'Preferred days',
  preferred_day: 'Preferred day',
  prior: 'Prior experience',
  notes: 'Notes',
  childName: 'Child name',
  guardian: 'Guardian',
  mobile: 'Mobile',
  interest: 'Interest',
}

function fmtFieldLabel(key: string): string {
  if (FIELD_LABEL_OVERRIDES[key]) return FIELD_LABEL_OVERRIDES[key]
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function waitMins(receivedAt: string): number {
  return Math.floor((Date.now() - new Date(receivedAt).getTime()) / 60000)
}

function calcOpDaysLeft(todayStr: string, blockoutDays: BlockoutDay[]): number {
  const today = new Date(todayStr + 'T12:00:00')
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  const blockoutSet = new Set(blockoutDays.map(b => b.day))
  let n = 0
  const d = new Date(today.getTime() + 86400000) // start tomorrow
  while (d <= endOfMonth) {
    const ds = d.toISOString().split('T')[0]
    if (d.getDay() !== 0 && !blockoutSet.has(ds)) n++
    d.setDate(d.getDate() + 1)
  }
  return n
}

function monthName(todayStr: string): string {
  return new Date(todayStr + 'T12:00:00').toLocaleString('en-AU', { month: 'long' })
}

// ─── Primitive UI components ──────────────────────────────────────────────────
type TagTone = 'green' | 'yellow' | 'red' | 'grey'
function Tag({ children, tone = 'grey', solid, onClick, title }: {
  children: React.ReactNode; tone?: TagTone; solid?: boolean; onClick?: () => void; title?: string
}) {
  const map: Record<TagTone, [string, string]> = {
    green: [C.green, C.greenBg],
    yellow: [C.yellow, C.yellowBg],
    red: [C.red, C.redBg],
    grey: [C.grey, C.greyBg],
  }
  const [fg, bg] = map[tone]
  return (
    <span
      onClick={onClick}
      title={title}
      style={{
        background: solid ? fg : bg,
        color: solid ? '#fff' : fg,
        fontSize: 10.5, fontWeight: 800,
        padding: '3px 8px', borderRadius: 3,
        letterSpacing: 0.4, textTransform: 'uppercase', whiteSpace: 'nowrap',
        cursor: onClick ? 'pointer' : 'default',
        display: 'inline-block',
      }}
    >{children}</span>
  )
}

function Next({ children, onClick, color = C.orange, border = C.orangeDark, disabled }: {
  children: React.ReactNode; onClick?: () => void; color?: string; border?: string; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: FONT, fontWeight: 800, fontSize: 12, cursor: disabled ? 'default' : 'pointer',
        borderRadius: 4, padding: '6px 13px',
        background: disabled ? C.greyBg : color,
        color: disabled ? C.muted : '#fff',
        border: `1px solid ${disabled ? C.line : border}`,
        opacity: disabled ? 0.6 : 1,
      }}
    >{children}</button>
  )
}

function Sale({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return <Next onClick={onClick} color={C.green} border={C.greenDark} disabled={disabled}>{children}</Next>
}

function Quiet({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: FONT, fontWeight: 700, fontSize: 11.5, cursor: disabled ? 'default' : 'pointer',
        borderRadius: 4, padding: '6px 10px',
        background: 'transparent', color: C.muted,
        border: `1px solid ${C.lineSoft}`,
        opacity: disabled ? 0.5 : 1,
      }}
    >{children}</button>
  )
}

const inp: React.CSSProperties = {
  fontFamily: FONT, fontSize: 13, fontWeight: 700,
  padding: '8px 10px', borderRadius: 4,
  border: `1px solid ${C.line}`, background: '#fff',
}

const lbl: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
  fontSize: 11.5, fontWeight: 800, color: '#2B2521',
  marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5,
}

const colHead: React.CSSProperties = {
  fontSize: 10, fontWeight: 900, color: C.muted,
  textTransform: 'uppercase', letterSpacing: 1,
}

// ─── Panel wrapper ────────────────────────────────────────────────────────────
function Panel({ children, head, badge, sub, style }: {
  children: React.ReactNode; head: string; badge?: React.ReactNode
  sub?: React.ReactNode; style?: React.CSSProperties
}) {
  return (
    <section style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, marginBottom: 22, ...style }}>
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${C.lineSoft}`,
        display: 'flex', gap: 10, alignItems: 'center', background: '#FCFAF7',
      }}>
        {badge}
        <h3 style={{ margin: 0, fontSize: 12.5, fontWeight: 900, color: C.ink, textTransform: 'uppercase', letterSpacing: 1.2 }}>{head}</h3>
        {sub}
      </div>
      {children}
    </section>
  )
}

// ─── WhoCell ──────────────────────────────────────────────────────────────────
function WhoCell({ lead, onOpen, onOpenParent }: {
  lead: Lead & { guardians: Guardian }; onOpen: () => void; onOpenParent: () => void
}) {
  const age = ageFrom(lead.dob)
  const rel = lead.relationship ?? 'parent'
  const guardian = lead.guardians
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <button
          onClick={onOpen}
          style={{
            fontFamily: FONT, fontWeight: 800, fontSize: 13.5, color: C.ink,
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            borderBottom: `1px dotted ${C.muted}`,
          }}
        >{lead.child_first} {lead.child_last}</button>
        {age && <span style={{ color: C.muted, fontWeight: 700, fontSize: 11.5 }}>{age} yrs</span>}
        {lead.rebooks > 0 && <Tag tone="yellow">re-booked ×{lead.rebooks}</Tag>}
      </div>
      <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700, marginTop: 1 }}>
        {rel.toLowerCase()} ·{' '}
        <button
          onClick={onOpenParent}
          style={{
            fontFamily: FONT, fontWeight: 700, fontSize: 11.5, color: C.muted,
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            borderBottom: `1px dotted ${C.line}`,
          }}
        >{guardian.first_name} {guardian.last_name}</button>
        {' '}· {guardian.phone}
      </div>
    </div>
  )
}

// ─── CallMenu ─────────────────────────────────────────────────────────────────
const CALL_OUTCOMES = ['No answer', 'Left voicemail', 'Spoke — call back later', 'Spoke — booking now']
const NEEDS_FOLLOWUP = new Set(['No answer', 'Left voicemail', 'Spoke — call back later'])

function defaultFollowUp(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return d.toISOString().slice(0, 16)
}

function CallMenu({ onPick, onClose }: { onPick: (o: string, followUpAt?: string) => void; onClose: () => void }) {
  const [step, setStep] = useState<string | null>(null)
  const [followUp, setFollowUp] = useState(defaultFollowUp)

  if (step) {
    return (
      <div style={{
        position: 'absolute', top: '105%', left: 0,
        background: '#fff', border: `1px solid ${C.line}`,
        borderRadius: 4, boxShadow: '0 10px 30px rgba(0,0,0,.2)', zIndex: 30, minWidth: 240, padding: 12,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 8 }}>When to follow up?</div>
        <input
          type="datetime-local"
          value={followUp}
          onChange={e => setFollowUp(e.target.value)}
          style={{ width: '100%', padding: '6px 8px', border: `1px solid ${C.line}`, fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '7px', border: `1px solid ${C.line}`, background: 'none', cursor: 'pointer', fontSize: 12, fontFamily: FONT }}>Cancel</button>
          <button onClick={() => onPick(step, followUp ? new Date(followUp).toISOString() : undefined)}
            style={{ flex: 2, padding: '7px', border: 'none', background: C.ink, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: FONT }}>
            Log &amp; set reminder
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'absolute', top: '105%', left: 0,
        background: '#fff', border: `1px solid ${C.line}`,
        borderRadius: 4, boxShadow: '0 10px 30px rgba(0,0,0,.2)', zIndex: 30, minWidth: 220,
      }}
    >
      <div style={{ ...colHead, padding: '7px 10px', borderBottom: `1px solid ${C.lineSoft}` }}>I called — what happened?</div>
      {CALL_OUTCOMES.map(o => (
        <button
          key={o}
          onClick={() => NEEDS_FOLLOWUP.has(o) ? setStep(o) : onPick(o)}
          style={{
            display: 'block', width: '100%', textAlign: 'left',
            fontFamily: FONT, fontSize: 12.5, fontWeight: 700,
            padding: '8px 10px', background: 'none', border: 'none',
            borderBottom: `1px solid ${C.lineSoft}`, cursor: 'pointer', color: '#2B2521',
          }}
        >{o}</button>
      ))}
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
      {/* Lost vs Nurture toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {(['nurture', 'lost'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)} style={{
            flex: 1, padding: '6px', fontSize: 12, fontWeight: 800, cursor: 'pointer',
            background: mode === m ? C.ink : C.card,
            color: mode === m ? '#fff' : C.muted,
            border: `1px solid ${mode === m ? C.ink : C.line}`,
          }}>
            {m === 'nurture' ? '🌱 Nurture' : '✗ Lost'}
          </button>
        ))}
      </div>
      {mode === 'nurture' && (
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Follow up later — stays in system with a future date</div>
      )}
      {mode === 'lost' && (
        <div style={{ fontSize: 11, color: C.red, marginBottom: 8 }}>Dead lead — requires a reason, no further follow-up</div>
      )}
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
    // Combine date + time into ISO string (local time naive)
    const [h, m] = time.split(':').map(Number)
    const dt = new Date(date)
    dt.setHours(h, m, 0, 0)
    onConfirm({ date, time, programmeId: progId || null, programmeName: selectedProg?.name ?? '' })
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(23,19,14,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 6, padding: '22px 24px', width: 360, maxWidth: '92vw', borderTop: `3px solid ${C.orange}` }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 900 }}>Book trial — {lead.child_first} {lead.child_last}</h3>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, marginBottom: 14 }}>
          {(lead.relationship ?? '').toLowerCase()} · {lead.guardians.first_name} {lead.guardians.last_name} · {lead.guardians.phone}
        </div>
        <label style={lbl}>
          Trial date
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
        </label>
        <label style={lbl}>
          Time
          <input type="time" value={time} onChange={e => setTime(e.target.value)} style={inp} />
        </label>
        <label style={lbl}>
          Programme
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
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(23,19,14,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 6, padding: '22px 24px', width: 380, maxWidth: '92vw', borderTop: `3px solid ${C.green}` }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 900 }}>💰 Make the sale — {lead.child_first} {lead.child_last}</h3>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, marginBottom: 12 }}>lock in their first class to complete the sale</div>
        {!lead.form_received && (
          <div style={{ background: C.yellowBg, border: '1px solid #E5D49A', borderRadius: 4, padding: '8px 11px', marginBottom: 12, fontSize: 12, fontWeight: 800, color: C.yellow }}>
            ⚠ Their Jotform hasn't come back — get it completed before their first class.
          </div>
        )}
        <label style={lbl}>
          First class date
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
        </label>
        <label style={lbl}>
          Class
          <input placeholder="e.g. Sat 9:30 am Kinder Gym" value={slot} onChange={e => setSlot(e.target.value)} style={inp} />
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, fontWeight: 800, color: '#2B2521', cursor: 'pointer', margin: '4px 0 8px' }}>
          <input type="checkbox" checked={payTaken} onChange={e => setPayTaken(e.target.checked)} style={{ width: 16, height: 16, accentColor: C.green }} />
          Rego & insurance payment taken
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
          <Quiet onClick={onClose}>Cancel</Quiet>
          <Sale
            onClick={() => ok && onConfirm({ date, slot, payTaken })}
            disabled={!ok}
          >
            {!date || !slot ? 'Add first class' : !payTaken ? 'Take payment first' : 'Confirm sale 🎉'}
          </Sale>
        </div>
      </div>
    </div>
  )
}

// ─── Profile slide-in ─────────────────────────────────────────────────────────
function Profile({ lead, allLeads, onClose, userId, programmes, onOpenParent, onSwitchLead, activities }: {
  lead: Lead & { guardians: Guardian }
  allLeads: (Lead & { guardians: Guardian })[]
  onClose: () => void
  userId: string
  programmes: Programme[]
  onOpenParent: () => void
  onSwitchLead: (id: string) => void
  activities: Array<{ lead_id: string; kind: string; body: string; created_at: string }>
}) {
  const [note, setNote] = useState('')
  const [callOpen, setCallOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [bookingOpen, setBookingOpen] = useState(false)
  const [enrolOpen, setEnrolOpen] = useState(false)

  const siblings = allLeads.filter(l => l.guardians.id === lead.guardians.id && l.id !== lead.id)
  const bookable = lead.status === 'new' || lead.status === 'noshow' || lead.status === 'nurture'
  const age = ageFrom(lead.dob)
  const guardian = lead.guardians
  const h4s: React.CSSProperties = { margin: '18px 0 8px', fontSize: 10.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1.2, color: C.muted }

  function handleCall(outcome: string, followUpAt?: string) {
    setCallOpen(false)
    startTransition(async () => {
      await logCallOutcome(lead.id, outcome, userId, followUpAt)
    })
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 110 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(23,19,14,.4)' }} onClick={onClose} />
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 440, maxWidth: '94vw', background: '#fff', padding: '20px 22px', overflowY: 'auto', borderLeft: `3px solid ${C.orange}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>
                {lead.child_first} {lead.child_last}{' '}
                <span style={{ color: C.muted, fontWeight: 700, fontSize: 13 }}>
                  {age ? `${age} yrs` : ''}{lead.dob ? ` · DOB ${lead.dob}` : ''}
                </span>
              </h3>
              <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 700, marginTop: 2 }}>
                {(lead.relationship ?? '').toLowerCase()} ·{' '}
                <button onClick={onOpenParent} style={{ fontFamily: FONT, fontWeight: 700, fontSize: 12.5, color: C.muted, background: 'none', border: 'none', padding: 0, cursor: 'pointer', borderBottom: `1px dotted ${C.line}` }}>
                  {guardian.first_name} {guardian.last_name}
                </button>
                {' '}· {guardian.phone}
              </div>
              {siblings.length > 0 && (
                <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: C.muted, letterSpacing: '.4px' }}>FAMILY:</span>
                  {siblings.map(s => (
                    <button
                      key={s.id}
                      onClick={() => onSwitchLead(s.id)}
                      style={{ fontFamily: FONT, display: 'inline-flex', gap: 6, alignItems: 'center', background: C.sand, border: `1px solid ${C.line}`, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11.5, fontWeight: 800, color: C.ink }}
                    >
                      {s.child_first} {s.child_last}
                      <Tag tone={s.status === 'won' ? 'green' : s.status === 'new' ? 'red' : s.status === 'booked' ? 'green' : s.status === 'noshow' ? 'red' : 'yellow'}>
                        {s.status}
                      </Tag>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Quiet onClick={onClose}>Close ✕</Quiet>
          </div>

          {/* action bar */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', position: 'relative' }}>
            <Next onClick={() => setCallOpen(!callOpen)}>📞 Call</Next>
            <Quiet onClick={() => startTransition(() => logText(lead.id, userId))}>💬 Log text</Quiet>
            <Quiet onClick={() => startTransition(() => logEmail(lead.id, userId))}>✉ Log email</Quiet>
            {bookable && (
              <Next onClick={() => setBookingOpen(true)}>
                {lead.status === 'noshow' ? 'Re-book trial' : 'Book trial'}
              </Next>
            )}
            {(lead.status === 'booked' || lead.status === 'nurture') && (
              <Sale onClick={() => setEnrolOpen(true)}>💰 Make the sale</Sale>
            )}
            {callOpen && <CallMenu onPick={handleCall} onClose={() => setCallOpen(false)} />}
          </div>

          {/* Jotform status */}
          <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {lead.form_received
              ? <Tag tone="green">Jotform ✓</Tag>
              : lead.form_sent_at
                ? (
                  <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', background: C.yellowBg, border: '1px solid #E5D49A', borderRadius: 4, padding: '3px 6px' }}>
                    <Tag tone="yellow">Jotform pending</Tag>
                    <Quiet onClick={() => startTransition(() => resendForm(lead.id, userId))}>Resend Jotform</Quiet>
                    <Quiet onClick={() => startTransition(() => markFormReceived(lead.id, userId))}>Got Jotform ✓</Quiet>
                  </span>
                )
                : <Quiet onClick={() => startTransition(() => sendJotform(lead.id, userId))}>Send Jotform</Quiet>
            }
            {lead.status === 'won' && (
              lead.verified_at ? <Tag tone="green" solid>sale ✓</Tag> : <Tag tone="yellow">sale — pending admin</Tag>
            )}
          </div>

          {/* structured child / guardian info */}
          {(() => {
            const utmCampaign = lead.enquiry_raw?.utm_campaign as string | undefined
            const extraFields = lead.enquiry_raw
              ? Object.entries(lead.enquiry_raw).filter(([k, v]) => !PROFILE_KNOWN_FIELDS.has(k) && v !== null && v !== '' && v !== undefined)
              : []
            const InfoRow = ({ label, value, color }: { label: string; value: string; color?: string }) => (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: `1px solid ${C.lineSoft}` }}>
                <span style={{ color: C.muted }}>{label}</span>
                <span style={{ color: color ?? C.ink, fontWeight: 500 }}>{value}</span>
              </div>
            )
            const SectionHead = ({ title }: { title: string }) => (
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 18, marginBottom: 6 }}>{title}</div>
            )
            return (
              <>
                <SectionHead title="Child" />
                <InfoRow label="Date of birth" value={lead.dob ? `${new Date(lead.dob).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} (${ageFrom(lead.dob)} yrs)` : '—'} />
                {lead.gender && <InfoRow label="Gender" value={lead.gender} />}
                <InfoRow label="Source" value={lead.source ?? '—'} />
                {utmCampaign && <InfoRow label="Campaign" value={utmCampaign} />}
                <InfoRow label="Jotform" value={lead.form_received ? '✓ Received' : '✗ Pending'} color={lead.form_received ? C.green : C.red} />

                <SectionHead title="Guardian" />
                <InfoRow label="Name" value={`${guardian.first_name} ${guardian.last_name}`} />
                <InfoRow label="Phone" value={guardian.phone} />
                {guardian.email && <InfoRow label="Email" value={guardian.email} />}
                {guardian.preferred_contact && <InfoRow label="Preferred contact" value={guardian.preferred_contact} />}

                {lead.trial_at && (
                  <>
                    <SectionHead title="Trial" />
                    <InfoRow label="Booked for" value={fmtDateTime(lead.trial_at)} />
                  </>
                )}

                {extraFields.length > 0 && (
                  <>
                    <SectionHead title="Additional info" />
                    {extraFields.map(([k, v]) => (
                      <InfoRow key={k} label={fmtFieldLabel(k)} value={String(v)} />
                    ))}
                  </>
                )}
              </>
            )
          })()}

          {/* note input */}
          <h4 style={h4s}>Add a note</h4>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note…" style={{ ...inp, flex: 1 }} />
            <Next onClick={() => {
              if (note.trim()) {
                startTransition(() => logNote(lead.id, note.trim(), userId))
                setNote('')
              }
            }}>Save</Next>
          </div>
          {pending && <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginTop: 4 }}>Saving…</div>}

          {/* timeline */}
          {(() => {
            const acts = activities.filter(a => a.lead_id === lead.id)
            if (!acts.length) return null
            return (
              <>
                <h4 style={{ margin: '18px 0 8px', fontSize: 10.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1.2, color: C.muted }}>Timeline</h4>
                {acts.map((a, i) => (
                  <div key={i} style={{ borderLeft: `2px solid ${C.line}`, paddingLeft: 10, marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>{new Date(a.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</div>
                    <div style={{ fontSize: 12.5 }}>{a.body}</div>
                  </div>
                ))}
              </>
            )
          })()}
        </div>
      </div>

      {bookingOpen && (
        <BookingModal
          lead={lead}
          programmes={programmes}
          onClose={() => setBookingOpen(false)}
          onConfirm={({ date, time, programmeId, programmeName }) => {
            setBookingOpen(false)
            const [h, m] = time.split(':').map(Number)
            const dt = new Date(date)
            dt.setHours(h, m, 0, 0)
            startTransition(() => bookTrial(lead.id, dt.toISOString(), programmeId, programmeName, userId))
          }}
        />
      )}
      {enrolOpen && (
        <EnrolModal
          lead={lead}
          onClose={() => setEnrolOpen(false)}
          onConfirm={({ date, slot, payTaken }) => {
            setEnrolOpen(false)
            startTransition(() => makeSale(lead.id, date, slot, payTaken, userId))
          }}
        />
      )}
    </>
  )
}

// ─── Parent profile slide-in ──────────────────────────────────────────────────
function ParentProfile({ guardianId, allLeads, onClose, onOpenChild }: {
  guardianId: string
  allLeads: (Lead & { guardians: Guardian })[]
  onClose: () => void
  onOpenChild: (id: string) => void
}) {
  const fam = allLeads.filter(l => l.guardians.id === guardianId)
  if (!fam.length) return null
  const guardian = fam[0].guardians

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 45 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(23,19,14,.4)' }} onClick={onClose} />
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 430, maxWidth: '94vw', background: '#fff', padding: '20px 22px', overflowY: 'auto', borderLeft: `3px solid ${C.orange}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, letterSpacing: '.6px' }}>PARENT / GUARDIAN</div>
            <div style={{ fontSize: 19, fontWeight: 900, color: C.ink, marginTop: 2 }}>{guardian.first_name} {guardian.last_name}</div>
            <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 700, marginTop: 3 }}>{guardian.phone}{guardian.email ? ` · ${guardian.email}` : ''}</div>
          </div>
          <Quiet onClick={onClose}>✕</Quiet>
        </div>
        <div style={{ marginTop: 16, fontSize: 11, fontWeight: 800, color: C.muted, letterSpacing: '.6px' }}>CHILDREN ({fam.length})</div>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {fam.map(l => {
            const tone: TagTone = l.status === 'won' ? 'green' : l.status === 'new' ? 'red' : l.status === 'booked' ? 'green' : l.status === 'noshow' ? 'red' : 'yellow'
            return (
              <button key={l.id} onClick={() => onOpenChild(l.id)}
                style={{ fontFamily: FONT, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, textAlign: 'left', background: C.sand, border: `1px solid ${C.line}`, borderRadius: 6, padding: '10px 12px', cursor: 'pointer' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13.5, color: C.ink }}>{l.child_first} {l.child_last} <span style={{ color: C.muted, fontWeight: 700, fontSize: 11.5 }}>{ageFrom(l.dob)} yrs</span></div>
                </div>
                <Tag tone={tone}>{l.status}</Tag>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── New lead row ─────────────────────────────────────────────────────────────
function NewRow({ lead, userId, onOpen, onOpenParent, onBooked }: {
  lead: Lead & { guardians: Guardian }
  userId: string
  onOpen: () => void
  onOpenParent: () => void
  onBooked: () => void
}) {
  const [callFor, setCallFor] = useState(false)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const mins = waitMins(lead.received_at)
  const programmes: Programme[] = [] // will be injected from parent via context — kept simple here

  function handleCallOutcome(outcome: string, followUpAt?: string) {
    setCallFor(false)
    if (outcome === 'Spoke — booking now') {
      startTransition(async () => {
        await logCallOutcome(lead.id, outcome, userId)
      })
      setBookingOpen(true)
      return
    }
    startTransition(() => logCallOutcome(lead.id, outcome, userId, followUpAt))
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto', gap: 10, alignItems: 'center', padding: '10px 12px', borderBottom: `1px solid ${C.lineSoft}`, opacity: pending ? 0.6 : 1 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#2B2521' }}>
            {new Date(lead.received_at).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
          </div>
          <div style={{ fontSize: 11, fontWeight: 900, color: mins > 240 ? C.red : C.yellow }}>
            {waitLabel(mins)} waiting
          </div>
        </div>
        <div>
          <WhoCell lead={lead} onOpen={onOpen} onOpenParent={onOpenParent} />
          <div style={{ marginTop: 3, display: 'flex', gap: 5 }}>
            {!lead.contacted
              ? <Tag tone="red" solid>not contacted yet</Tag>
              : lead.last_outcome === 'Spoke — call back later'
                ? <Tag tone="yellow">spoke — call back later</Tag>
                : <Tag tone="yellow">{lead.attempts} call{lead.attempts !== 1 ? 's' : ''} · not reached</Tag>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', position: 'relative' }}>
          <Next onClick={() => setCallFor(v => !v)}>📞 Call to book</Next>
          <Quiet onClick={() => setBookingOpen(true)}>book directly</Quiet>
          {callFor && <CallMenu onPick={handleCallOutcome} onClose={() => setCallFor(false)} />}
        </div>
      </div>
      {bookingOpen && (
        <BookingModalWrapper
          lead={lead}
          userId={userId}
          onClose={() => setBookingOpen(false)}
          onDone={() => { setBookingOpen(false); onBooked() }}
        />
      )}
    </>
  )
}

// ─── BookingModalWrapper ──────────────────────────────────────────────────────
// Fetches programmes from parent via props and renders BookingModal
function BookingModalWrapper({ lead, userId, onClose, onDone, programmes: progs }: {
  lead: Lead & { guardians: Guardian }
  userId: string
  onClose: () => void
  onDone: () => void
  programmes?: Programme[]
}) {
  const [pending, startTransition] = useTransition()
  const programmes = progs ?? []
  return (
    <BookingModal
      lead={lead}
      programmes={programmes}
      onClose={onClose}
      onConfirm={({ date, time, programmeId, programmeName }) => {
        const [h, m] = time.split(':').map(Number)
        const dt = new Date(date)
        dt.setHours(h, m, 0, 0)
        startTransition(async () => {
          await bookTrial(lead.id, dt.toISOString(), programmeId, programmeName, userId)
          onDone()
        })
      }}
    />
  )
}

// ─── Today trial row ──────────────────────────────────────────────────────────
function TodayRow({ lead, userId, activities, onOpen, onOpenParent }: {
  lead: Lead & { guardians: Guardian }
  userId: string
  activities: Array<{ lead_id: string; kind: string; body: string; created_at: string }>
  onOpen: () => void
  onOpenParent: () => void
}) {
  const leadActs = activities.filter(a => a.lead_id === lead.id)
  const hasArrived = leadActs.some(a => a.body === 'Marked arrived ✓') &&
    !leadActs.some(a => a.body === 'Undid: marked arrived' && (
      leadActs.find(x => x.body === 'Marked arrived ✓')
        ? new Date(a.created_at) > new Date(leadActs.find(x => x.body === 'Marked arrived ✓')!.created_at)
        : false
    ))

  // Simpler: just check last relevant activity
  const sortedActs = [...leadActs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const lastRelevant = sortedActs.find(a => a.body === 'Marked arrived ✓' || a.body === 'Undid: marked arrived')
  const arrivedDone = lastRelevant?.body === 'Marked arrived ✓'

  const [lossFor, setLossFor] = useState(false)
  const [enrolOpen, setEnrolOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const timeStr = lead.trial_at ? formatTime(lead.trial_at) : '—'

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr 180px 230px', gap: 10, alignItems: 'center', padding: '10px 12px', borderBottom: `1px solid ${C.lineSoft}`, opacity: pending ? 0.6 : 1 }}>
        <div style={{ fontWeight: 900, fontSize: 14 }}>{timeStr}</div>
        <div>
          <WhoCell lead={lead} onOpen={onOpen} onOpenParent={onOpenParent} />
          <div style={{ marginTop: 3, display: 'flex', gap: 5, alignItems: 'center' }}>
            {lead.form_received
              ? <Tag tone="green">Jotform ✓</Tag>
              : lead.form_sent_at
                ? (
                  <>
                    <Tag tone="yellow">Jotform pending</Tag>
                    <Quiet onClick={() => startTransition(() => resendForm(lead.id, userId))}>resend Jotform</Quiet>
                    <Quiet onClick={() => startTransition(() => markFormReceived(lead.id, userId))}>✓ got Jotform</Quiet>
                  </>
                )
                : null}
          </div>
        </div>
        {/* Step 1: arrived */}
        <div>
          {arrivedDone
            ? (
              <span
                onClick={() => startTransition(() => undoArrived(lead.id, userId))}
                title="Click to undo"
                style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 800, color: C.green, textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                <span style={{ width: 16, height: 16, borderRadius: 99, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, background: C.green, color: '#fff', border: `1px solid ${C.greenDark}` }}>✓</span>
                arrived
              </span>
            )
            : (
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <Quiet onClick={() => startTransition(() => markArrived(lead.id, userId))}>① Arrived ✓</Quiet>
                <Quiet onClick={() => startTransition(() => markNoShow(lead.id, userId))}>no-show</Quiet>
              </span>
            )}
        </div>
        {/* Step 2: outcome */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
          {!arrivedDone
            ? <span style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>② outcome — after arrival</span>
            : lossFor
              ? <LossPicker
                  onNurture={(reason, date) => { setLossFor(false); startTransition(() => markDidntEnrol(lead.id, reason, userId, date)) }}
                  onLost={reason => { setLossFor(false); startTransition(() => markLost(lead.id, reason, userId)) }}
                  onCancel={() => setLossFor(false)}
                />
              : (
                <>
                  <Sale onClick={() => setEnrolOpen(true)}>💰 Make the sale</Sale>
                  <Quiet onClick={() => setLossFor(true)}>didn't enrol</Quiet>
                </>
              )}
        </div>
      </div>
      {enrolOpen && (
        <EnrolModal
          lead={lead}
          onClose={() => setEnrolOpen(false)}
          onConfirm={({ date, slot, payTaken }) => {
            setEnrolOpen(false)
            startTransition(() => makeSale(lead.id, date, slot, payTaken, userId))
          }}
        />
      )}
    </>
  )
}

// ─── No-show row ──────────────────────────────────────────────────────────────
function NoShowRow({ lead, userId, programmes, onOpen, onOpenParent }: {
  lead: Lead & { guardians: Guardian }
  userId: string
  programmes: Programme[]
  onOpen: () => void
  onOpenParent: () => void
}) {
  const [bookingOpen, setBookingOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', padding: '10px 12px', borderBottom: `1px solid ${C.lineSoft}`, opacity: pending ? 0.6 : 1 }}>
        <div>
          <WhoCell lead={lead} onOpen={onOpen} onOpenParent={onOpenParent} />
          <div style={{ marginTop: 3 }}><Tag tone="red">no-show — reach out &amp; re-book</Tag></div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Quiet onClick={() => startTransition(() => logText(lead.id, userId))}>send text</Quiet>
          <Next onClick={() => setBookingOpen(true)}>Re-book</Next>
        </div>
      </div>
      {bookingOpen && (
        <BookingModalWrapper
          lead={lead}
          userId={userId}
          programmes={programmes}
          onClose={() => setBookingOpen(false)}
          onDone={() => setBookingOpen(false)}
        />
      )}
    </>
  )
}

// ─── Tomorrow row ─────────────────────────────────────────────────────────────
function TomorrowRow({ lead, userId, onOpen, onOpenParent }: {
  lead: Lead & { guardians: Guardian }
  userId: string
  onOpen: () => void
  onOpenParent: () => void
}) {
  const [pending, startTransition] = useTransition()
  const timeStr = lead.trial_at ? formatTime(lead.trial_at) : '—'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 12px', borderBottom: `1px solid ${C.lineSoft}`, opacity: pending ? 0.6 : 1 }}>
      <div style={{ fontWeight: 900, fontSize: 13 }}>{timeStr}</div>
      <div>
        <WhoCell lead={lead} onOpen={onOpen} onOpenParent={onOpenParent} />
        <div style={{ marginTop: 3, display: 'flex', gap: 5, alignItems: 'center' }}>
          {lead.form_received
            ? <Tag tone="green">Jotform ✓</Tag>
            : lead.form_sent_at
              ? (
                <>
                  <Tag tone="yellow">Jotform pending</Tag>
                  <Quiet onClick={() => startTransition(() => resendForm(lead.id, userId))}>resend Jotform</Quiet>
                  <Quiet onClick={() => startTransition(() => markFormReceived(lead.id, userId))}>✓ got Jotform</Quiet>
                </>
              )
              : null}
        </div>
      </div>
      <div>
        {lead.confirmation_sent_at
          ? <Tag tone="green">confirmed ✓</Tag>
          : <Next onClick={() => startTransition(() => sendConfirmation(lead.id, userId))}>Send confirmation</Next>}
      </div>
    </div>
  )
}

// ─── Sale row ─────────────────────────────────────────────────────────────────
function SaleRow({ lead, userId, userRole, onOpen, onOpenParent }: {
  lead: Lead & { guardians: Guardian }
  userId: string
  userRole: string
  onOpen: () => void
  onOpenParent: () => void
}) {
  const [iclassChecks, setIclassChecks] = useState({ classEnrolled: false, regoIns: false, payment: false })
  const [pending, startTransition] = useTransition()
  const allTicked = iclassChecks.classEnrolled && iclassChecks.regoIns && iclassChecks.payment
  const canVerify = userRole === 'admin' || userRole === 'management'

  return (
    <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.lineSoft}`, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', opacity: pending ? 0.6 : 1 }}>
      <div>
        <WhoCell lead={lead} onOpen={onOpen} onOpenParent={onOpenParent} />
        {lead.first_class_date && lead.first_class && (
          <div style={{ fontSize: 11.5, fontWeight: 800, color: C.green, marginTop: 2 }}>
            first class {lead.first_class_date} · {lead.first_class}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginLeft: 'auto', alignItems: 'center' }}>
        {([
          ['classEnrolled', 'Class enrolled'] as const,
          ['regoIns', 'Rego & insurance paid'] as const,
          ['payment', 'Payment details set up'] as const,
        ]).map(([key, label]) => (
          <label key={key} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11.5, fontWeight: 800, color: '#2B2521', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={iclassChecks[key]}
              onChange={() => setIclassChecks(c => ({ ...c, [key]: !c[key] }))}
              style={{ accentColor: C.green }}
            />
            {label}
          </label>
        ))}
        {allTicked && canVerify
          ? <Sale onClick={() => startTransition(() => verifySale(lead.id, userId))}>Admin: verify sale</Sale>
          : allTicked && !canVerify
            ? <Tag tone="yellow">Awaiting admin verification</Tag>
            : <Tag tone="grey">finish checklist</Tag>}
      </div>
    </div>
  )
}

// ─── Main TodayClient component ───────────────────────────────────────────────
interface TodayClientProps {
  appUser: AppUser
  newLeads: (Lead & { guardians: Guardian })[]
  todayTrials: (Lead & { guardians: Guardian })[]
  noShows: (Lead & { guardians: Guardian })[]
  tomorrowTrials: (Lead & { guardians: Guardian })[]
  thisWeekTrials: (Lead & { guardians: Guardian })[]
  unverifiedSales: (Lead & { guardians: Guardian })[]
  target: Target | null
  verifiedCount: number
  blockoutDays: BlockoutDay[]
  checklistItems: ChecklistItem[]
  completions: ChecklistCompletion[]
  todayActivities: Array<{ lead_id: string; kind: string; body: string; created_at: string }>
  programmes: Programme[]
  todayStr: string
}

export default function TodayClient({
  appUser,
  newLeads,
  todayTrials,
  noShows,
  tomorrowTrials,
  thisWeekTrials,
  unverifiedSales,
  target,
  verifiedCount,
  blockoutDays,
  checklistItems,
  completions,
  todayActivities,
  programmes,
  todayStr,
}: TodayClientProps) {
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)
  const [openParentGuardianId, setOpenParentGuardianId] = useState<string | null>(null)
  const [weekOpen, setWeekOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  // All leads for family lookups
  const allLeads = [...newLeads, ...todayTrials, ...noShows, ...tomorrowTrials, ...thisWeekTrials, ...unverifiedSales]
  // Deduplicate by id
  const allLeadsMap = new Map(allLeads.map(l => [l.id, l]))
  const allLeadsUniq = Array.from(allLeadsMap.values())

  const openLead = openLeadId ? allLeadsMap.get(openLeadId) ?? null : null

  // Checklist state (optimistic)
  const completedIds = new Set(completions.map(c => c.item_id))
  const [localCompleted, setLocalCompleted] = useState<Set<string>>(new Set(completedIds))

  function handleToggleChecklist(itemId: string) {
    const nowCompleted = !localCompleted.has(itemId)
    setLocalCompleted(prev => {
      const next = new Set(prev)
      if (nowCompleted) next.add(itemId)
      else next.delete(itemId)
      return next
    })
    startTransition(() => toggleChecklist(itemId, appUser.id, nowCompleted))
  }

  // Target bar
  const opDays = calcOpDaysLeft(todayStr, blockoutDays)
  const goal = target?.net_growth_goal ?? 0
  const actual = verifiedCount
  const toGo = Math.max(0, goal - actual)
  const pct = goal > 0 ? Math.min(100, Math.round((actual / goal) * 100)) : 0
  const siteName = appUser.site === 'coolaroo' ? 'Coolaroo' : appUser.site === 'altona_north' ? 'Altona North' : 'All Sites'
  const month = monthName(todayStr)

  const doneCount = checklistItems.filter(i => localCompleted.has(i.id)).length

  return (
    <div style={{ fontFamily: FONT }}>
      {/* ── Target bar ── */}
      <div style={{
        background: C.card, border: `1px solid ${C.line}`,
        borderLeft: `4px solid ${C.orange}`, borderRadius: 6,
        padding: '14px 18px', marginBottom: 22,
        display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1.2, color: C.muted }}>
            {siteName} · {month} target
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.1 }}>
            +{actual} <span style={{ fontSize: 14, color: C.muted, fontWeight: 800 }}>of +{goal} net members</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ height: 10, background: C.sand, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: C.orange }} />
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: C.orange }}>{toGo} to go</div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: C.muted }}>
            {opDays} operating days left (Mon–Sat){opDays > 0 ? ` · ≈${(toGo / opDays).toFixed(1)} per day` : ''}
          </div>
        </div>
      </div>

      {/* ── New leads panel ── */}
      <Panel
        head="New leads — call &amp; book"
        badge={<Tag tone="yellow" solid>act now</Tag>}
        sub={
          <span style={{ fontSize: 12, fontWeight: 800, color: newLeads.length ? C.yellow : C.green }}>
            {newLeads.length ? `${newLeads.length} waiting` : 'all booked'}
          </span>
        }
      >
        {newLeads.length === 0 && (
          <div style={{ padding: '14px 16px', fontSize: 13, color: C.muted, fontWeight: 700 }}>No new leads — great work!</div>
        )}
        {newLeads.map(l => (
          <NewRow
            key={l.id}
            lead={l}
            userId={appUser.id}
            onOpen={() => setOpenLeadId(l.id)}
            onOpenParent={() => setOpenParentGuardianId(l.guardians.id)}
            onBooked={() => {/* revalidation happens via server action */ }}
          />
        ))}
      </Panel>

      {/* ── Today's trials panel ── */}
      <Panel
        head="Today's trials — the sale happens here"
        badge={<Tag tone="green" solid>today</Tag>}
        sub={<span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>① arrived → ② outcome: 💰 sale or didn't enrol</span>}
      >
        {todayTrials.length === 0 && noShows.length === 0 && (
          <div style={{ padding: '14px 16px', fontSize: 13, color: C.muted, fontWeight: 700 }}>No trials today.</div>
        )}
        {todayTrials
          .slice()
          .sort((a, b) => (a.trial_at ?? '').localeCompare(b.trial_at ?? ''))
          .map(l => (
            <TodayRow
              key={l.id}
              lead={l}
              userId={appUser.id}
              activities={todayActivities}
              onOpen={() => setOpenLeadId(l.id)}
              onOpenParent={() => setOpenParentGuardianId(l.guardians.id)}
            />
          ))}
        {noShows.map(l => (
          <NoShowRow
            key={l.id}
            lead={l}
            userId={appUser.id}
            programmes={programmes}
            onOpen={() => setOpenLeadId(l.id)}
            onOpenParent={() => setOpenParentGuardianId(l.guardians.id)}
          />
        ))}
      </Panel>

      {/* ── Sales to process panel ── */}
      {unverifiedSales.length > 0 && (
        <Panel
          head="💰 Sales to process — enter in iClassPro"
          badge={<Tag tone="yellow">pending admin</Tag>}
          sub={<span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>tick each, then admin verifies the sale</span>}
        >
          {unverifiedSales.map(l => (
            <SaleRow
              key={l.id}
              lead={l}
              userId={appUser.id}
              userRole={appUser.role}
              onOpen={() => setOpenLeadId(l.id)}
              onOpenParent={() => setOpenParentGuardianId(l.guardians.id)}
            />
          ))}
        </Panel>
      )}

      {/* ── Tomorrow panel ── */}
      <Panel
        head="Tomorrow — confirmations &amp; forms"
        sub={<span style={{ fontSize: 12, fontWeight: 800, color: C.muted }}>{tomorrowTrials.length} booked</span>}
      >
        {tomorrowTrials.length === 0 && (
          <div style={{ padding: '14px 16px', fontSize: 13, color: C.muted, fontWeight: 700 }}>No trials tomorrow.</div>
        )}
        {tomorrowTrials
          .slice()
          .sort((a, b) => (a.trial_at ?? '').localeCompare(b.trial_at ?? ''))
          .map(l => (
            <TomorrowRow
              key={l.id}
              lead={l}
              userId={appUser.id}
              onOpen={() => setOpenLeadId(l.id)}
              onOpenParent={() => setOpenParentGuardianId(l.guardians.id)}
            />
          ))}
      </Panel>

      {/* ── Later this week collapsible ── */}
      <div style={{ marginBottom: 22 }}>
        <button
          onClick={() => setWeekOpen(v => !v)}
          style={{ fontFamily: FONT, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 900, color: C.muted, padding: '0 0 6px', textTransform: 'uppercase', letterSpacing: 0.8 }}
        >
          {weekOpen ? '▾' : '▸'} Later this week · {thisWeekTrials.length} booked
        </button>
        {weekOpen && (
          <Panel head="Later this week">
            {thisWeekTrials.length === 0 && (
              <div style={{ padding: '14px 16px', fontSize: 13, color: C.muted, fontWeight: 700 }}>No trials later this week.</div>
            )}
            {thisWeekTrials
              .slice()
              .sort((a, b) => (a.trial_at ?? '').localeCompare(b.trial_at ?? ''))
              .map(l => (
                <TomorrowRow
                  key={l.id}
                  lead={l}
                  userId={appUser.id}
                  onOpen={() => setOpenLeadId(l.id)}
                  onOpenParent={() => setOpenParentGuardianId(l.guardians.id)}
                />
              ))}
          </Panel>
        )}
      </div>

      {/* ── Daily checklist ── */}
      <Panel
        head="Daily front-of-house checklist"
        sub={
          <span style={{ fontSize: 11.5, fontWeight: 800, color: doneCount === checklistItems.length && checklistItems.length > 0 ? C.green : C.muted }}>
            {doneCount}/{checklistItems.length} signed off
          </span>
        }
      >
        {checklistItems.length === 0 && (
          <div style={{ padding: '14px 16px', fontSize: 13, color: C.muted, fontWeight: 700 }}>No checklist items configured.</div>
        )}
        {checklistItems.map(item => {
          const done = localCompleted.has(item.id)
          return (
            <label key={item.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 14px', borderBottom: `1px solid ${C.lineSoft}`, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={done}
                onChange={() => handleToggleChecklist(item.id)}
                style={{ width: 16, height: 16, accentColor: C.green }}
              />
              <span style={{ fontSize: 13, fontWeight: 700, color: done ? C.muted : '#2B2521', textDecoration: done ? 'line-through' : 'none' }}>
                {item.label}
              </span>
              {done && (
                <span style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, marginLeft: 'auto' }}>
                  {appUser.name} · today
                </span>
              )}
            </label>
          )
        })}
      </Panel>

      {/* ── Profile slide-in ── */}
      {openLead && (
        <Profile
          lead={openLead}
          allLeads={allLeadsUniq}
          onClose={() => setOpenLeadId(null)}
          userId={appUser.id}
          programmes={programmes}
          activities={todayActivities}
          onOpenParent={() => {
            setOpenParentGuardianId(openLead.guardians.id)
            setOpenLeadId(null)
          }}
          onSwitchLead={(id) => setOpenLeadId(id)}
        />
      )}

      {/* ── Parent profile slide-in ── */}
      {openParentGuardianId && (
        <ParentProfile
          guardianId={openParentGuardianId}
          allLeads={allLeadsUniq}
          onClose={() => setOpenParentGuardianId(null)}
          onOpenChild={(id) => {
            setOpenParentGuardianId(null)
            setOpenLeadId(id)
          }}
        />
      )}
    </div>
  )
}
