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
  updateLeadProfile,
  archiveLeadWithReason,
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

const FIELD_LABEL_OVERRIDES: Record<string, string> = {
  prefDays: 'Preferred days', preferred_day: 'Preferred day', prior: 'Prior experience',
  notes: 'Notes', childName: 'Child name', guardian: 'Guardian', mobile: 'Mobile', interest: 'Interest',
}
function fmtFieldLabel(key: string): string {
  if (FIELD_LABEL_OVERRIDES[key]) return FIELD_LABEL_OVERRIDES[key]
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
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
        {age && <span style={{ color: C.muted, fontWeight: 400, fontSize: 11.5 }}>{age} yrs</span>}
        {lead.rebooks > 0 && <Tag tone="yellow">re-booked ×{lead.rebooks}</Tag>}
      </div>
      <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 400, marginTop: 1 }}>
        {rel.toLowerCase()} ·{' '}
        <button
          onClick={onOpenParent}
          style={{
            fontFamily: FONT, fontWeight: 400, fontSize: 11.5, color: C.muted,
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

function followUpDate(daysAhead: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

function tomorrowDateStr(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

function CallMenu({ onPick, onClose }: { onPick: (o: string, followUpAt?: string) => void; onClose: () => void }) {
  const [step, setStep] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null) // ISO string of chosen follow-up
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
    const confirm = () => {
      if (!selected) return
      onPick(step!, selected)
    }
    return (
      <div style={{
        position: 'absolute', top: '105%', left: 0,
        background: '#fff', border: `1px solid ${C.line}`,
        borderRadius: 4, boxShadow: '0 10px 30px rgba(0,0,0,.2)', zIndex: 30, minWidth: 280, padding: 12,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 8 }}>When to follow up?</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
          {([['1 hour', 'h1'], ['2 hours', 'h2']] as [string, string][]).map(([label, key]) => {
            const iso = (() => { const d = new Date(); d.setHours(d.getHours() + (key === 'h1' ? 1 : 2), 0, 0, 0); return d.toISOString() })()
            return (
              <button key={key} onClick={() => { setSelected(iso); setShowCustom(false) }} style={tileStyle(selected === iso, C.orange)}>
                {label}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
          {([
            ['Tomorrow', 1],
            ['Two days', 2],
            ['Three days', 3],
            ['Next week', 7],
          ] as [string, number][]).map(([label, days]) => {
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
            <input
              type="date"
              value={customDate}
              min={tomorrowDateStr()}
              onChange={e => {
                setCustomDate(e.target.value)
                if (e.target.value) setSelected(new Date(e.target.value + 'T09:00:00').toISOString())
              }}
              style={{ width: '100%', padding: '6px 8px', border: `1px solid ${C.line}`, fontSize: 13, boxSizing: 'border-box' as const }}
            />
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '7px', border: `1px solid ${C.line}`, background: 'none', cursor: 'pointer', fontSize: 12, fontFamily: FONT }}>Cancel</button>
          <button
            onClick={confirm}
            disabled={!selected}
            style={{ flex: 2, padding: '7px', border: 'none', background: selected ? C.ink : C.greyBg, color: selected ? '#fff' : C.muted, cursor: selected ? 'pointer' : 'default', fontSize: 12, fontWeight: 700, fontFamily: FONT }}>
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
      <button
        onClick={() => onPick('__open_profile__')}
        style={{
          display: 'block', width: '100%', textAlign: 'left',
          fontFamily: FONT, fontSize: 12.5, fontWeight: 700,
          padding: '8px 10px', background: 'none', border: 'none',
          cursor: 'pointer', color: C.muted,
        }}
      >Other — add a note</button>
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,19,14,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 140 }} onClick={onClose}>
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
              <option value="">—</option>
              <option>Male</option>
              <option>Female</option>
              <option>Other</option>
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
            <option>Phone call</option>
            <option>Text / SMS</option>
            <option>Email</option>
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
const ARCHIVE_REASONS = ['Spam / test enquiry', 'Duplicate record', 'Entered in error', 'Parent requested removal', 'Other']
function ArchiveReasonModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState(ARCHIVE_REASONS[0])
  const [other, setOther] = useState('')
  const finalReason = reason === 'Other' ? (other.trim() ? `Other — ${other.trim()}` : '') : reason
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,19,14,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 150 }} onClick={onClose}>
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

// ─── Profile slide-in ─────────────────────────────────────────────────────────
const PROFILE_KNOWN_FIELDS = new Set([
  'site', 'phone', 'email', 'parent_first', 'parent_last', 'preferred_contact', 'relationship',
  'source', 'referrer_name', 'utm_source', 'utm_medium', 'utm_campaign',
  'child_first_1', 'child_last_1', 'dob_1', 'gender_1', 'programme_name_1', 'interest_1',
  'child_first_2', 'child_last_2', 'dob_2', 'gender_2', 'programme_name_2', 'interest_2',
  'child_first_3', 'child_last_3', 'dob_3', 'gender_3', 'programme_name_3', 'interest_3',
  'child_first_4', 'child_last_4', 'dob_4', 'gender_4', 'programme_name_4', 'interest_4',
])

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

function Profile({ lead, allLeads, onClose, userId, programmes, onOpenParent, onSwitchLead, activities, userNames }: {
  lead: Lead & { guardians: Guardian }
  allLeads: (Lead & { guardians: Guardian })[]
  onClose: () => void
  userId: string
  programmes: Programme[]
  onOpenParent: () => void
  onSwitchLead: (id: string) => void
  activities: Array<{ lead_id: string; user_id: string | null; kind: string; body: string; created_at: string }>
  userNames: Record<string, string>
}) {
  const [note, setNote] = useState('')
  const [callOpen, setCallOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [bookingOpen, setBookingOpen] = useState(false)
  const [enrolOpen, setEnrolOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [textMsgOpen, setTextMsgOpen] = useState(false)
  const [textMsg, setTextMsg] = useState('')

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
    if (outcome === '__open_profile__') return // profile is already open — user can add note
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
                <div style={{ fontWeight: 900, fontSize: 18 }}>{lead.child_first} {lead.child_last}</div>
                <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Tag tone={lead.status === 'won' ? 'green' : lead.status === 'new' ? 'red' : lead.status === 'booked' ? 'green' : lead.status === 'noshow' ? 'red' : 'yellow'} solid>
                    {lead.status === 'won' ? 'enrolled' : lead.status}
                  </Tag>
                  {prog && <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>{prog.name}</span>}
                </div>
                <div style={{ marginTop: 5, fontSize: 12, color: C.muted, fontWeight: 400 }}>
                  Enquired {formatDate(lead.received_at)}{lead.source ? ` · ${lead.source}` : ''}{lead.trial_at ? ` · Trial ${fmtDateTime(lead.trial_at)}` : ''}
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 400, color: C.ink, marginTop: 2 }}>
                  {(lead.relationship ?? '').toLowerCase()} ·{' '}
                  <button onClick={onOpenParent} style={{ fontFamily: FONT, fontWeight: 700, fontSize: 12.5, color: C.ink, background: 'none', border: 'none', padding: 0, cursor: 'pointer', borderBottom: `1px dotted ${C.line}` }}>
                    {guardian.first_name} {guardian.last_name}
                  </button>
                  {' '}· {guardian.phone}
                </div>
                {siblings.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 900, color: C.muted, letterSpacing: '.4px' }}>FAMILY:</span>
                    {siblings.map(s => (
                      <button key={s.id} onClick={() => onSwitchLead(s.id)}
                        style={{ fontFamily: FONT, display: 'inline-flex', gap: 5, alignItems: 'center', background: C.sand, border: `1px solid ${C.line}`, padding: '2px 7px', cursor: 'pointer', fontSize: 11.5, fontWeight: 800, color: C.ink }}>
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
              {callOpen && <CallMenu onPick={handleCall} onClose={() => setCallOpen(false)} />}
            </div>

            {/* Log text inline input */}
            {textMsgOpen && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input
                  value={textMsg}
                  onChange={e => setTextMsg(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && textMsg.trim()) { startTransition(() => logText(lead.id, userId, textMsg.trim())); setTextMsg(''); setTextMsgOpen(false) } }}
                  placeholder="What did you send?"
                  autoFocus
                  style={{ flex: 1, padding: '6px 8px', border: `1px solid ${C.line}`, fontSize: 12, fontFamily: FONT }}
                />
                <button onClick={() => { if (textMsg.trim()) { startTransition(() => logText(lead.id, userId, textMsg.trim())); setTextMsg(''); setTextMsgOpen(false) } }}
                  style={{ fontFamily: FONT, fontWeight: 700, fontSize: 12, padding: '6px 12px', background: C.ink, color: '#fff', border: 'none', cursor: 'pointer' }}>
                  Log
                </button>
              </div>
            )}

            {/* Jotform status */}
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
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
            <ProfileSection title="Child">
              <InfoRow label="Date of birth" value={lead.dob ? `${formatDate(lead.dob)} (${age} yrs)` : '—'} />
              {lead.gender && <InfoRow label="Gender" value={lead.gender} />}
              <InfoRow label="Source" value={lead.source ?? '—'} />
              {lead.referrer_name && <InfoRow label="Referred by" value={lead.referrer_name} />}
              {utmCampaign && <InfoRow label="Campaign" value={utmCampaign} />}
              <InfoRow label="Jotform" value={lead.form_received ? '✓ Received' : '✗ Pending'} color={lead.form_received ? C.green : C.red} />
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
                <input value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && note.trim()) { startTransition(() => logNote(lead.id, note.trim(), userId)); setNote('') } }} placeholder="Add a note…" style={{ ...inp, flex: 1 }} />
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
              {/* Enquiry at bottom — the oldest event */}
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
      {editOpen && (
        <EditProfileModal
          lead={lead}
          programmes={programmes}
          onClose={() => setEditOpen(false)}
          onArchive={() => { setEditOpen(false); setArchiveOpen(true) }}
          onSave={(lf, gf) => {
            setEditOpen(false)
            startTransition(() => updateLeadProfile(lead.id, lead.guardian_id, userId, lf, gf))
          }}
        />
      )}
      {archiveOpen && (
        <ArchiveReasonModal
          onClose={() => setArchiveOpen(false)}
          onConfirm={(reason) => {
            setArchiveOpen(false)
            onClose()
            startTransition(() => archiveLeadWithReason(lead.id, userId, reason))
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
            <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 400, marginTop: 3 }}>{guardian.phone}{guardian.email ? ` · ${guardian.email}` : ''}</div>
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
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: C.ink }}>{l.child_first} {l.child_last} <span style={{ color: C.muted, fontWeight: 400, fontSize: 11.5 }}>{ageFrom(l.dob)} yrs</span></div>
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
    if (outcome === '__open_profile__') { onOpen(); return }
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
          <div style={{ fontSize: 12, fontWeight: 500, color: C.ink }}>
            {new Date(lead.received_at).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: mins > 240 ? C.red : C.yellow }}>
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
function TodayRow({ lead, userId, activities, programmes, onOpen, onOpenParent }: {
  lead: Lead & { guardians: Guardian }
  userId: string
  activities: Array<{ lead_id: string; kind: string; body: string; created_at: string }>
  programmes: Programme[]
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
          {lead.programme_id && programmes.find(p => p.id === lead.programme_id) && (
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 400, marginTop: 1 }}>
              {programmes.find(p => p.id === lead.programme_id)!.name}
            </div>
          )}
          <div style={{ marginTop: 3, display: 'flex', gap: 5, alignItems: 'center' }}>
            {lead.form_received
              ? <Tag tone="green">form ✓</Tag>
              : (
                <>
                  <Tag tone="grey">form pending</Tag>
                  <Quiet onClick={() => startTransition(() => resendForm(lead.id, userId))}>resend</Quiet>
                  <Quiet onClick={() => startTransition(() => markFormReceived(lead.id, userId))}>✓ got form</Quiet>
                </>
              )}
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
function TomorrowRow({ lead, userId, programmes, onOpen, onOpenParent }: {
  lead: Lead & { guardians: Guardian }
  userId: string
  programmes: Programme[]
  onOpen: () => void
  onOpenParent: () => void
}) {
  const [pending, startTransition] = useTransition()
  const timeStr = lead.trial_at ? formatTime(lead.trial_at) : '—'
  const progName = programmes.find(p => p.id === lead.programme_id)?.name

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 12px', borderBottom: `1px solid ${C.lineSoft}`, opacity: pending ? 0.6 : 1 }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{timeStr}</div>
      <div>
        <WhoCell lead={lead} onOpen={onOpen} onOpenParent={onOpenParent} />
        {progName && <div style={{ fontSize: 11, color: C.muted, fontWeight: 400, marginTop: 1 }}>{progName}</div>}
        <div style={{ marginTop: 3, display: 'flex', gap: 5, alignItems: 'center' }}>
          {lead.form_received
            ? <Tag tone="green">form ✓</Tag>
            : (
              <>
                <Tag tone="grey">form pending</Tag>
                <Quiet onClick={() => startTransition(() => resendForm(lead.id, userId))}>resend</Quiet>
              </>
            )}
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

// ─── Booked row (future trials — not today) ───────────────────────────────────
function BookedRow({ lead, userId, programmes, onOpen, onOpenParent }: {
  lead: Lead & { guardians: Guardian }
  userId: string
  programmes: Programme[]
  onOpen: () => void
  onOpenParent: () => void
}) {
  const [pending, startTransition] = useTransition()
  const timeStr = lead.trial_at ? formatTime(lead.trial_at) : '—'
  const dateStr = lead.trial_at
    ? new Date(lead.trial_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
    : '—'
  const progName = programmes.find(p => p.id === lead.programme_id)?.name

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 12px', borderBottom: `1px solid ${C.lineSoft}`, opacity: pending ? 0.6 : 1 }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{dateStr}</div>
        <div style={{ fontWeight: 400, fontSize: 11.5, color: C.muted }}>{timeStr}</div>
      </div>
      <div>
        <WhoCell lead={lead} onOpen={onOpen} onOpenParent={onOpenParent} />
        {progName && <div style={{ fontSize: 11, color: C.muted, fontWeight: 400, marginTop: 1 }}>{progName}</div>}
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        {lead.status === 'booked'
          ? lead.confirmation_sent_at
            ? <Tag tone="green">confirmed ✓</Tag>
            : <Next onClick={() => startTransition(() => sendConfirmation(lead.id, userId))}>Send confirmation</Next>
          : lead.status === 'won'
            ? <Tag tone="green" solid>enrolled</Tag>
            : lead.status === 'noshow'
              ? <Tag tone="red" solid>no-show</Tag>
              : lead.status === 'nurture'
                ? <Tag tone="yellow">nurture</Tag>
                : lead.status === 'lost'
                  ? <Tag tone="grey">lost</Tag>
                  : null
        }
      </div>
    </div>
  )
}

// ─── Upcoming row (future new leads) ─────────────────────────────────────────
function UpcomingRow({ lead, onOpen }: {
  lead: Lead & { guardians: Guardian }
  onOpen: () => void
}) {
  const age = ageFrom(lead.dob)
  const guardian = lead.guardians
  const dueStr = lead.next_action_at
    ? new Date(lead.next_action_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
    : '—'

  return (
    <div
      onClick={onOpen}
      style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto', gap: 10, alignItems: 'center', padding: '9px 12px', borderBottom: `1px solid ${C.lineSoft}`, cursor: 'pointer' }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: 12.5, color: C.ink }}>{dueStr}</div>
      </div>
      <div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 13.5, color: C.ink }}>{lead.child_first} {lead.child_last}</span>
          {age && <span style={{ color: C.muted, fontWeight: 400, fontSize: 11.5 }}>{age} yrs</span>}
        </div>
        <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 400, marginTop: 1 }}>
          {(lead.relationship ?? '').toLowerCase()} · {guardian.first_name} {guardian.last_name} · {guardian.phone}
        </div>
      </div>
      <div>
        {lead.last_outcome
          ? <Tag tone="yellow">{lead.last_outcome}</Tag>
          : <Tag tone="red">not contacted</Tag>}
      </div>
    </div>
  )
}

// ─── Main TodayClient component ───────────────────────────────────────────────
interface TodayClientProps {
  appUser: AppUser
  newLeads: (Lead & { guardians: Guardian })[]
  upcomingNewLeads: (Lead & { guardians: Guardian })[]
  todayTrials: (Lead & { guardians: Guardian })[]
  bookedLeads: (Lead & { guardians: Guardian })[]
  noShows: (Lead & { guardians: Guardian })[]
  unverifiedSales: (Lead & { guardians: Guardian })[]
  target: Target | null
  verifiedCount: number
  blockoutDays: BlockoutDay[]
  checklistItems: ChecklistItem[]
  completions: ChecklistCompletion[]
  todayActivities: Array<{ lead_id: string; user_id: string | null; kind: string; body: string; created_at: string }>
  userNames: Record<string, string>
  programmes: Programme[]
  todayStr: string
}

export default function TodayClient({
  appUser,
  newLeads,
  upcomingNewLeads,
  todayTrials,
  bookedLeads,
  noShows,
  unverifiedSales,
  target,
  verifiedCount,
  blockoutDays,
  checklistItems,
  completions,
  todayActivities,
  userNames,
  programmes,
  todayStr,
}: TodayClientProps) {
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)
  const [openParentGuardianId, setOpenParentGuardianId] = useState<string | null>(null)
  const [trialTab, setTrialTab] = useState<'today' | 'tomorrow' | 'this_week' | 'next_week' | 'this_month' | 'custom'>('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [pending, startTransition] = useTransition()

  // Compute tab date boundaries from todayStr
  const tomorrowStr = (() => { const d = new Date(todayStr + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) })()
  const dayAfterTomStr = (() => { const d = new Date(todayStr + 'T12:00:00'); d.setDate(d.getDate() + 2); return d.toISOString().slice(0, 10) })()
  const dow = new Date(todayStr + 'T12:00:00').getDay()
  const daysToSat = dow === 0 ? 6 : 6 - dow
  const endOfThisWeekStr = (() => { const d = new Date(todayStr + 'T12:00:00'); d.setDate(d.getDate() + daysToSat); return d.toISOString().slice(0, 10) })()
  const nextWeekStartStr = (() => { const d = new Date(todayStr + 'T12:00:00'); d.setDate(d.getDate() + daysToSat + 2); return d.toISOString().slice(0, 10) })()
  const nextWeekEndStr = (() => { const d = new Date(todayStr + 'T12:00:00'); d.setDate(d.getDate() + daysToSat + 7); return d.toISOString().slice(0, 10) })()
  const firstOfMonthStr = todayStr.slice(0, 8) + '01'
  const endOfMonthStr = (() => { const d = new Date(todayStr.slice(0, 7) + '-01T12:00:00'); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10) })()

  const trialsByTab = {
    today: bookedLeads.filter(l => l.trial_at?.startsWith(todayStr)),
    tomorrow: bookedLeads.filter(l => l.trial_at?.startsWith(tomorrowStr)),
    this_week: bookedLeads.filter(l => l.trial_at && l.trial_at.slice(0, 10) >= dayAfterTomStr && l.trial_at.slice(0, 10) <= endOfThisWeekStr),
    next_week: bookedLeads.filter(l => l.trial_at && l.trial_at.slice(0, 10) >= nextWeekStartStr && l.trial_at.slice(0, 10) <= nextWeekEndStr),
    this_month: bookedLeads.filter(l => l.trial_at && l.trial_at.slice(0, 10) >= firstOfMonthStr && l.trial_at.slice(0, 10) <= endOfMonthStr),
    custom: bookedLeads.filter(l => {
      if (!l.trial_at) return false
      const d = l.trial_at.slice(0, 10)
      if (customFrom && d < customFrom) return false
      if (customTo && d > customTo) return false
      return true
    }),
  }

  // All leads for family lookups
  const allLeads = [...newLeads, ...bookedLeads, ...noShows, ...unverifiedSales, ...upcomingNewLeads]
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
          <div style={{ fontSize: 11.5, fontWeight: 400, color: C.muted }}>
            {opDays} operating days left (Mon–Sat){opDays > 0 ? ` · ≈${(toGo / opDays).toFixed(1)} per day` : ''}
          </div>
        </div>
      </div>

      {/* ── New leads panel ── */}
      <Panel
        head="New leads — call &amp; book"
        badge={<Tag tone="yellow" solid>act now</Tag>}
        sub={
          <span style={{ fontSize: 12, fontWeight: 400, color: newLeads.length ? C.yellow : C.green }}>
            {newLeads.length ? `${newLeads.length} waiting` : 'all booked'}
          </span>
        }
      >
        {newLeads.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto', gap: 10, padding: '5px 12px', background: '#FCFAF7', borderBottom: `1px solid ${C.lineSoft}` }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Received</span>
            <span style={{ fontSize: 10, fontWeight: 900, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Child / guardian</span>
            <span style={{ fontSize: 10, fontWeight: 900, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Action</span>
          </div>
        )}
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

      {/* ── Trials panel (tabbed) ── */}
      <Panel
        head="Trials"
        badge={todayTrials.length > 0 ? <Tag tone="green" solid>{todayTrials.length} today</Tag> : undefined}
      >
        {/* Tab bar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0, borderBottom: `1px solid ${C.lineSoft}`, background: '#FCFAF7' }}>
          {([
            ['today', 'Today', trialsByTab.today.length],
            ['tomorrow', 'Tomorrow', trialsByTab.tomorrow.length],
            ['this_week', 'This week', trialsByTab.this_week.length],
            ['next_week', 'Next week', trialsByTab.next_week.length],
            ['this_month', 'This month', trialsByTab.this_month.length],
            ['custom', 'Custom…', trialsByTab.custom.length],
          ] as [string, string, number][]).map(([key, label, count]) => (
            <button key={key} onClick={() => setTrialTab(key as typeof trialTab)}
              style={{
                fontFamily: FONT, fontWeight: 800, fontSize: 11.5, cursor: 'pointer',
                padding: '8px 12px', border: 'none', borderBottom: `2px solid ${trialTab === key ? C.orange : 'transparent'}`,
                background: 'transparent', color: trialTab === key ? C.orange : C.muted,
                whiteSpace: 'nowrap',
              }}>
              {key === 'custom' ? label : (count > 0 ? `${label} (${count})` : label)}
            </button>
          ))}
        </div>

        {/* Custom date pickers */}
        {trialTab === 'custom' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', background: '#FCFAF7', borderBottom: `1px solid ${C.lineSoft}` }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>From</span>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ padding: '4px 8px', border: `1px solid ${C.line}`, fontSize: 12 }} />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ padding: '4px 8px', border: `1px solid ${C.line}`, fontSize: 12 }} />
          </div>
        )}

        {/* Today tab: arrived/outcome flow */}
        {trialTab === 'today' && (
          <>
            {trialsByTab.today.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr 180px 230px', gap: 10, padding: '5px 12px', background: '#FCFAF7', borderBottom: `1px solid ${C.lineSoft}` }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Time</span>
                <span style={{ fontSize: 10, fontWeight: 900, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Child / guardian</span>
                <span style={{ fontSize: 10, fontWeight: 900, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>① Arrived?</span>
                <span style={{ fontSize: 10, fontWeight: 900, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>② Outcome</span>
              </div>
            )}
            {trialsByTab.today.length === 0 && noShows.length === 0 && (
              <div style={{ padding: '14px 16px', fontSize: 13, color: C.muted, fontWeight: 700 }}>No trials today.</div>
            )}
            {trialsByTab.today.map(l => (
              <TodayRow key={l.id} lead={l} userId={appUser.id} activities={todayActivities} programmes={programmes}
                onOpen={() => setOpenLeadId(l.id)} onOpenParent={() => setOpenParentGuardianId(l.guardians.id)} />
            ))}
            {noShows.length > 0 && (
              <>
                <div style={{ padding: '5px 12px', background: '#FCFAF7', borderTop: `1px solid ${C.lineSoft}` }}>
                  <span style={{ fontSize: 10, fontWeight: 900, color: C.red, textTransform: 'uppercase', letterSpacing: 0.8 }}>No-shows — contact &amp; re-book</span>
                </div>
                {noShows.map(l => (
                  <NoShowRow key={l.id} lead={l} userId={appUser.id} programmes={programmes}
                    onOpen={() => setOpenLeadId(l.id)} onOpenParent={() => setOpenParentGuardianId(l.guardians.id)} />
                ))}
              </>
            )}
          </>
        )}

        {/* Tomorrow tab */}
        {trialTab === 'tomorrow' && (
          <>
            {trialsByTab.tomorrow.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr auto', gap: 10, padding: '5px 12px', background: '#FCFAF7', borderBottom: `1px solid ${C.lineSoft}` }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Time</span>
                <span style={{ fontSize: 10, fontWeight: 900, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Child / guardian</span>
                <span style={{ fontSize: 10, fontWeight: 900, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Action</span>
              </div>
            )}
            {trialsByTab.tomorrow.length === 0 && (
              <div style={{ padding: '14px 16px', fontSize: 13, color: C.muted, fontWeight: 700 }}>No trials tomorrow.</div>
            )}
            {trialsByTab.tomorrow.map(l => (
              <TomorrowRow key={l.id} lead={l} userId={appUser.id} programmes={programmes}
                onOpen={() => setOpenLeadId(l.id)} onOpenParent={() => setOpenParentGuardianId(l.guardians.id)} />
            ))}
          </>
        )}

        {/* Other tabs: booked row with date + status */}
        {trialTab !== 'today' && trialTab !== 'tomorrow' && (
          <>
            {trialsByTab[trialTab].length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr auto', gap: 10, padding: '5px 12px', background: '#FCFAF7', borderBottom: `1px solid ${C.lineSoft}` }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Date / time</span>
                <span style={{ fontSize: 10, fontWeight: 900, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Child / guardian</span>
                <span style={{ fontSize: 10, fontWeight: 900, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Status / action</span>
              </div>
            )}
            {trialsByTab[trialTab].length === 0 && (
              <div style={{ padding: '14px 16px', fontSize: 13, color: C.muted, fontWeight: 700 }}>No trials in this period.</div>
            )}
            {trialsByTab[trialTab].map(l => (
              <BookedRow key={l.id} lead={l} userId={appUser.id} programmes={programmes}
                onOpen={() => setOpenLeadId(l.id)} onOpenParent={() => setOpenParentGuardianId(l.guardians.id)} />
            ))}
          </>
        )}
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

      {/* ── Upcoming actions panel ── */}
      <Panel
        head="Upcoming actions — chase list"
        sub={<span style={{ fontSize: 11.5, fontWeight: 400, color: C.muted }}>{upcomingNewLeads.length} scheduled</span>}
      >
        {upcomingNewLeads.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr auto', gap: 10, padding: '5px 12px', background: '#FCFAF7', borderBottom: `1px solid ${C.lineSoft}` }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Follow-up due</span>
            <span style={{ fontSize: 10, fontWeight: 900, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Child / guardian</span>
            <span style={{ fontSize: 10, fontWeight: 900, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Last outcome</span>
          </div>
        )}
        {upcomingNewLeads.length === 0
          ? <div style={{ padding: '14px 16px', fontSize: 13, color: C.muted, fontWeight: 700 }}>No upcoming actions. Log a follow-up after calling to schedule reminders here.</div>
          : upcomingNewLeads.map(l => (
            <UpcomingRow
              key={l.id}
              lead={l}
              onOpen={() => setOpenLeadId(l.id)}
            />
          ))
        }
      </Panel>

      {/* ── Daily checklist ── */}
      <Panel
        head="Daily front-of-house checklist"
        sub={
          <span style={{ fontSize: 11.5, fontWeight: 400, color: doneCount === checklistItems.length && checklistItems.length > 0 ? C.green : C.muted }}>
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
              <span style={{ fontSize: 13, fontWeight: 400, color: done ? C.muted : '#2B2521', textDecoration: done ? 'line-through' : 'none' }}>
                {item.label}
              </span>
              {done && (
                <span style={{ fontSize: 10.5, fontWeight: 400, color: C.muted, marginLeft: 'auto' }}>
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
          onOpenParent={() => {
            setOpenParentGuardianId(openLead.guardians.id)
            setOpenLeadId(null)
          }}
          onSwitchLead={(id) => setOpenLeadId(id)}
          activities={todayActivities}
          userNames={userNames}
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
