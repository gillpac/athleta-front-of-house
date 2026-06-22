'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
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
  logIclassCheck,
  toggleChecklist,
  logText,
  resendForm,
  markFormReceived,
  sendJotform,
} from './actions'
import { ProfilePanel } from '../components/ProfilePanel'

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  ink: '#23201d',
  head: '#14110d',
  body: '#4a453f',
  muted: '#5f5851',
  faint: '#877f75',
  orange: '#E26839',
  bg: '#f6f4f1',
  card: '#ffffff',
  soft: '#faf8f6',
  line: '#efeae3',
  lineSoft: '#efeae3',
  line2: '#e6e0d8',
  red: '#bf4a30',
  redBg: '#fde8e3',
  green: '#3f8f5e',
  greenDark: '#2d6b46',
  greenBg: '#eef6f0',
  sand: '#f0ebe4',
  yellow: '#9A7409',
  yellowBg: '#FBF1CF',
  grey: '#5f5851',
  greyBg: '#f3efe9',
  yellowGauge: '#E8A838',
}
const FONT = "'Nunito Sans', -apple-system, system-ui, sans-serif"
const RADIUS = 8
// Shared column template for the booked-trial rows + their header
const BOOKED_COLS = '92px 1.4fr 150px 200px'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const waitLabel = (mins: number) =>
  mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} hrs ago` : `${Math.round(mins / 1440)} days ago`

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
  const d = new Date(today.getTime() + 86400000)
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

// ─── Primitive buttons ────────────────────────────────────────────────────────
function BtnPrimary({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontFamily: FONT, fontSize: 12.5, fontWeight: 600, borderRadius: 7, padding: '7px 13px',
      cursor: disabled ? 'default' : 'pointer', border: '1px solid transparent',
      background: disabled ? C.greyBg : C.orange, color: disabled ? C.muted : '#fff',
      opacity: disabled ? 0.6 : 1,
    }}>{children}</button>
  )
}

function BtnGhost({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontFamily: FONT, fontSize: 12.5, fontWeight: 500, borderRadius: 7, padding: '7px 13px',
      cursor: disabled ? 'default' : 'pointer', border: `1px solid ${C.line2}`,
      background: '#fff', color: C.body, marginLeft: 7, opacity: disabled ? 0.5 : 1,
    }}>{children}</button>
  )
}

function BtnQuiet({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontFamily: FONT, fontSize: 12.5, fontWeight: 500, borderRadius: 7, padding: '7px 13px',
      cursor: disabled ? 'default' : 'pointer', border: `1px solid ${C.line2}`,
      background: '#fff', color: C.body, opacity: disabled ? 0.5 : 1,
    }}>{children}</button>
  )
}

function BtnSale({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontFamily: FONT, fontSize: 12.5, fontWeight: 700, borderRadius: 7, padding: '7px 13px',
      cursor: disabled ? 'default' : 'pointer', border: '1px solid transparent',
      background: disabled ? C.greyBg : C.green, color: disabled ? C.muted : '#fff',
      opacity: disabled ? 0.6 : 1,
    }}>{children}</button>
  )
}

// Legacy aliases for internal use
const Next = BtnPrimary
const Sale = BtnSale
const Quiet = BtnQuiet

// ─── Chip (small inline tag) ──────────────────────────────────────────────────
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
    <span onClick={onClick} title={title} style={{
      background: solid ? fg : bg, color: solid ? '#fff' : fg,
      fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
      letterSpacing: 0.3, whiteSpace: 'nowrap',
      cursor: onClick ? 'pointer' : 'default', display: 'inline-block',
    }}>{children}</span>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, color: C.muted, background: '#f4f0ea',
      borderRadius: 5, padding: '2px 7px', marginLeft: 7, fontWeight: 500,
    }}>{children}</span>
  )
}

// CountPill for card headers
function CountPill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.orange, display: 'inline-block', flexShrink: 0 }} />
      {children}
    </span>
  )
}

const inp: React.CSSProperties = {
  fontFamily: FONT, fontSize: 13, fontWeight: 600,
  padding: '8px 10px', borderRadius: 6,
  border: `1px solid ${C.line2}`, background: '#fff',
}

const lbl: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
  fontSize: 11.5, fontWeight: 700, color: C.muted,
  marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5,
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────
function Card({ children, head, sub, right, style }: {
  children: React.ReactNode; head: string; sub?: React.ReactNode; right?: React.ReactNode; style?: React.CSSProperties
}) {
  return (
    <section style={{
      background: C.card, border: `1px solid ${C.line}`, borderRadius: RADIUS,
      overflow: 'visible', marginBottom: 18, ...style
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px 14px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: C.head, letterSpacing: '-0.2px' }}>{head}</h2>
          {sub && <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 400, marginTop: 2 }}>{sub}</div>}
        </div>
        {right && <div style={{ fontSize: 12.5, color: C.muted }}>{right}</div>}
      </div>
      {children}
    </section>
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
  const [selected, setSelected] = useState<string | null>(null)
  const [customDate, setCustomDate] = useState(tomorrowDateStr())
  const [showCustom, setShowCustom] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [onClose])

  function tileStyle(active: boolean, accent = C.ink) {
    return {
      fontFamily: FONT, fontWeight: 700, fontSize: 12, cursor: 'pointer',
      padding: '8px 6px', border: `1px solid ${active ? accent : C.line2}`,
      background: active ? accent : '#fff', color: active ? '#fff' : C.muted,
      borderRadius: 6,
    } as React.CSSProperties
  }

  if (step) {
    return (
      <div ref={menuRef} style={{
        position: 'absolute', top: '105%', right: 0,
        background: '#fff', border: `1px solid ${C.line2}`,
        borderRadius: RADIUS, boxShadow: '0 10px 30px rgba(0,0,0,.12)', zIndex: 30, minWidth: 280, padding: 12,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 8 }}>When to follow up?</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
          {(['1 hour', '2 hours'] as string[]).map((label, i) => {
            const iso = new Date(Date.now() + (i + 1) * 3600000).toISOString()
            return (
              <button key={label} onClick={() => { setSelected(iso); setShowCustom(false) }} style={tileStyle(selected === iso, C.orange)}>
                {label}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
          {(['Tomorrow', 'Two days', 'Three days', 'Next week'] as string[]).map((label, i) => {
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
            <input
              type="date" value={customDate} min={tomorrowDateStr()}
              onChange={e => {
                setCustomDate(e.target.value)
                if (e.target.value) setSelected(new Date(e.target.value + 'T09:00:00').toISOString())
              }}
              style={{ width: '100%', padding: '6px 8px', border: `1px solid ${C.line2}`, fontSize: 13, boxSizing: 'border-box' as const, borderRadius: 6 }}
            />
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '7px', border: `1px solid ${C.line2}`, background: 'none', cursor: 'pointer', fontSize: 12, fontFamily: FONT, borderRadius: 6 }}>Cancel</button>
          <button
            onClick={() => selected && onPick(step!, selected)}
            disabled={!selected}
            style={{ flex: 2, padding: '7px', border: 'none', borderRadius: 6, background: selected ? C.ink : C.greyBg, color: selected ? '#fff' : C.muted, cursor: selected ? 'pointer' : 'default', fontSize: 12, fontWeight: 700, fontFamily: FONT }}>
            Log &amp; set reminder
          </button>
        </div>
      </div>
    )
  }

  return (
    <div ref={menuRef} style={{
      position: 'absolute', top: '105%', right: 0,
      background: '#fff', border: `1px solid ${C.line2}`,
      borderRadius: RADIUS, boxShadow: '0 10px 30px rgba(0,0,0,.12)', zIndex: 30, minWidth: 220,
    }}>
      <div style={{ padding: '7px 12px', borderBottom: `1px solid ${C.line}`, fontSize: 10.5, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.7 }}>
        I called — what happened?
      </div>
      {CALL_OUTCOMES.map(o => (
        <button key={o} onClick={() => NEEDS_FOLLOWUP.has(o) ? setStep(o) : onPick(o)} style={{
          display: 'block', width: '100%', textAlign: 'left',
          fontFamily: FONT, fontSize: 13, fontWeight: 500,
          padding: '9px 12px', background: 'none', border: 'none',
          borderBottom: `1px solid ${C.line}`, cursor: 'pointer', color: C.body,
        }}>{o}</button>
      ))}
      <button onClick={() => onPick('__open_profile__')} style={{
        display: 'block', width: '100%', textAlign: 'left',
        fontFamily: FONT, fontSize: 13, fontWeight: 500,
        padding: '9px 12px', background: 'none', border: 'none',
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

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line2}`, borderRadius: RADIUS, padding: '10px 12px', marginTop: 6, maxWidth: 340 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Didn&apos;t enrol — what now?</div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {(['nurture', 'lost'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)} style={{
            flex: 1, padding: '6px', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 6,
            background: mode === m ? C.ink : C.card,
            color: mode === m ? '#fff' : C.muted,
            border: `1px solid ${mode === m ? C.ink : C.line2}`,
          }}>
            {m === 'nurture' ? 'Nurture' : 'Lost'}
          </button>
        ))}
      </div>
      {mode === 'nurture' && <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Follow up later — stays in system with a future date</div>}
      {mode === 'lost' && <div style={{ fontSize: 11, color: C.red, marginBottom: 8 }}>Dead lead — requires a reason, no further follow-up</div>}
      <select value={reason} onChange={e => setReason(e.target.value)} style={{ ...inp, padding: '4px 6px', fontSize: 12, width: '100%', marginBottom: 6 }}>
        <option>Price</option>
        <option>Timing / not ready</option>
        <option>Day didn&apos;t suit</option>
        <option>Comparing options</option>
        <option>Other</option>
      </select>
      {reason === 'Other' && (
        <input value={other} onChange={e => setOther(e.target.value)} placeholder="what happened?"
          style={{ ...inp, padding: '4px 6px', fontSize: 12, width: '100%', marginBottom: 6, boxSizing: 'border-box' }} />
      )}
      {mode === 'nurture' && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, marginBottom: 3 }}>FOLLOW-UP DATE</div>
          <input type="date" value={followupDate} min={minDate.toISOString().split('T')[0]}
            onChange={e => setFollowupDate(e.target.value)}
            style={{ ...inp, padding: '4px 6px', fontSize: 12, width: '100%', boxSizing: 'border-box' }} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <BtnQuiet onClick={onCancel}>Cancel</BtnQuiet>
        <BtnPrimary onClick={() => ok && (mode === 'nurture' ? onNurture(finalReason, followupDate) : onLost(finalReason))} disabled={!ok}>
          {mode === 'nurture' ? 'Move to nurture' : 'Mark lost'}
        </BtnPrimary>
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
  const [otherNote, setOtherNote] = useState('')
  const age = ageFrom(lead.dob)
  const suggestedProg = programmes.find(p => {
    const a = parseInt(age)
    if (isNaN(a)) return false
    return (p.min_age == null || a >= p.min_age) && (p.max_age == null || a <= p.max_age)
  }) ?? programmes[0]
  const [progId, setProgId] = useState(lead.programme_id ?? suggestedProg?.id ?? '')
  const selectedProg = programmes.find(p => p.id === progId)
  const isOther = selectedProg?.name === 'Other'
  const ok = date && time && (!isOther || otherNote.trim())

  function handleConfirm() {
    if (!ok) return
    const programmeName = isOther && otherNote.trim() ? `Other — ${otherNote.trim()}` : (selectedProg?.name ?? '')
    onConfirm({ date, time, programmeId: progId || null, programmeName })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,19,14,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: RADIUS, padding: '22px 24px', width: 360, maxWidth: '92vw', borderTop: `3px solid ${C.orange}` }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 800, color: C.head }}>Book trial — {lead.child_first} {lead.child_last}</h3>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 14 }}>
          {(lead.relationship ?? '').toLowerCase()} · {lead.guardians.first_name} {lead.guardians.last_name} · {lead.guardians.phone}
        </div>
        <label style={lbl}>Trial date<input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} /></label>
        <label style={lbl}>Time<input type="time" value={time} onChange={e => setTime(e.target.value)} style={inp} /></label>
        <label style={lbl}>Program
          <select value={progId} onChange={e => setProgId(e.target.value)} style={inp}>
            {programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {isOther && (
          <label style={lbl}>Describe the program
            <input value={otherNote} onChange={e => setOtherNote(e.target.value)} style={inp} placeholder="e.g. previous gym experience…" />
          </label>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <BtnQuiet onClick={onClose}>Cancel</BtnQuiet>
          <BtnPrimary onClick={handleConfirm} disabled={!ok}>{ok ? 'Confirm booking & send email draft' : 'Pick date & time'}</BtnPrimary>
        </div>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 10, textAlign: 'center' }}>
          A confirmation email draft will be created in Gmail ready to send.
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,19,14,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: RADIUS, padding: '22px 24px', width: 380, maxWidth: '92vw', borderTop: `3px solid ${C.green}` }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 800, color: C.head }}>Make the sale — {lead.child_first} {lead.child_last}</h3>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 12 }}>lock in their first class to complete the sale</div>
        {!lead.form_received && (
          <div style={{ background: C.yellowBg, border: '1px solid #E5D49A', borderRadius: 6, padding: '8px 11px', marginBottom: 12, fontSize: 12, fontWeight: 700, color: C.yellow }}>
            Jotform hasn&apos;t come back — get it completed before their first class.
          </div>
        )}
        <label style={lbl}>First class date<input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} /></label>
        <label style={lbl}>Class<input placeholder="e.g. Sat 9:30 am Kinder Gym" value={slot} onChange={e => setSlot(e.target.value)} style={inp} /></label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 700, color: C.body, cursor: 'pointer', margin: '4px 0 8px' }}>
          <input type="checkbox" checked={payTaken} onChange={e => setPayTaken(e.target.checked)} style={{ width: 16, height: 16, accentColor: C.green }} />
          Rego & insurance payment taken
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
          <BtnQuiet onClick={onClose}>Cancel</BtnQuiet>
          <BtnSale onClick={() => ok && onConfirm({ date, slot, payTaken })} disabled={!ok}>
            {!date || !slot ? 'Add first class' : !payTaken ? 'Take payment first' : 'Confirm sale'}
          </BtnSale>
        </div>
      </div>
    </div>
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
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '.6px', textTransform: 'uppercase' }}>Parent / Guardian</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: C.ink, marginTop: 2 }}>{guardian.first_name} {guardian.last_name}</div>
            <div style={{ fontSize: 13, color: C.muted, fontWeight: 400, marginTop: 3 }}>{guardian.phone}{guardian.email ? ` · ${guardian.email}` : ''}</div>
          </div>
          <BtnQuiet onClick={onClose}>✕</BtnQuiet>
        </div>
        <div style={{ marginTop: 16, fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '.6px', textTransform: 'uppercase' }}>Children ({fam.length})</div>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {fam.map(l => {
            const tone: TagTone = l.status === 'won' ? 'green' : l.status === 'new' ? 'red' : l.status === 'booked' ? 'green' : l.status === 'noshow' ? 'red' : 'yellow'
            return (
              <button key={l.id} onClick={() => onOpenChild(l.id)}
                style={{ fontFamily: FONT, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, textAlign: 'left', background: '#f6f4f1', border: `1px solid ${C.line}`, borderRadius: RADIUS, padding: '10px 12px', cursor: 'pointer' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: C.ink }}>{l.child_first} {l.child_last} <span style={{ color: C.muted, fontWeight: 400, fontSize: 12 }}>{ageFrom(l.dob)} yrs</span></div>
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

// ─── BookingModalWrapper ──────────────────────────────────────────────────────
function BookingModalWrapper({ lead, userId, onClose, onDone, programmes: progs }: {
  lead: Lead & { guardians: Guardian }
  userId: string
  onClose: () => void
  onDone: () => void
  programmes?: Programme[]
}) {
  const [, startTransition] = useTransition()
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

// ─── New lead row (table <tr>) ────────────────────────────────────────────────
function NewRow({ lead, userId, onOpen, onOpenParent, onBooked, programmes, showSite, scheduled }: {
  lead: Lead & { guardians: Guardian }
  userId: string
  onOpen: () => void
  onOpenParent: () => void
  onBooked: () => void
  programmes: Programme[]
  showSite?: boolean
  scheduled?: boolean
}) {
  const [callFor, setCallFor] = useState(false)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const age = ageFrom(lead.dob)
  const guardian = lead.guardians
  const mins = waitMins(lead.received_at)
  const isHot = !scheduled

  function handleCallOutcome(outcome: string, followUpAt?: string) {
    setCallFor(false)
    if (outcome === '__open_profile__') { onOpen(); return }
    if (outcome === 'Spoke — booking now') {
      startTransition(async () => { await logCallOutcome(lead.id, outcome, userId) })
      setBookingOpen(true)
      return
    }
    startTransition(() => logCallOutcome(lead.id, outcome, userId, followUpAt))
  }

  const trStyle: React.CSSProperties = {
    background: isHot ? 'transparent' : '#faf9f7',
    opacity: pending ? 0.6 : 1,
  }

  const firstCellStyle: React.CSSProperties = {
    padding: '13px 16px 13px 22px',
    borderBottom: `1px solid ${C.line}`,
    verticalAlign: 'middle',
    ...(isHot ? { boxShadow: `inset 3px 0 0 ${C.orange}` } : {}),
  }

  const td: React.CSSProperties = {
    padding: '13px 22px',
    borderBottom: `1px solid ${C.line}`,
    verticalAlign: 'middle',
  }

  return (
    <>
      <tr style={trStyle}>
        {/* Received / call back */}
        <td style={firstCellStyle}>
          {scheduled && lead.next_action_at ? (
            <div>
              <span style={{ display: 'block', fontSize: 10, letterSpacing: '0.6px', textTransform: 'uppercase', color: C.faint, marginBottom: 1 }}>Call back</span>
              <span style={{ fontSize: 12.5, color: C.faint }}>{formatTime(lead.next_action_at)}</span>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12.5, color: C.body }}>
                {new Date(lead.received_at).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
              </div>
              <span style={{ display: 'block', color: C.red, fontSize: 11.5, marginTop: 1 }}>{waitLabel(mins)}</span>
            </div>
          )}
        </td>
        {/* Child & guardian */}
        <td style={td}>
          <div>
            <button onClick={onOpen} style={{
              fontFamily: FONT, fontWeight: 600, fontSize: 14,
              color: isHot ? C.ink : '#6b645c',
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            }}>
              {lead.child_first} {lead.child_last}
              {age && <span style={{ color: C.muted, fontWeight: 400, fontSize: 12.5, marginLeft: 5 }}>{age} yrs</span>}
              {lead.rebooks > 0 && <Chip>re-booked ×{lead.rebooks}</Chip>}
              {!lead.contacted && <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, background: '#fde8e3', color: '#bf4a30', borderRadius: 4, padding: '1px 6px', marginLeft: 6, verticalAlign: 'middle', letterSpacing: 0.3 }}>New lead</span>}
            </button>
          </div>
          <div style={{ color: isHot ? '#524b43' : '#8a837a', fontSize: 13, marginTop: 2 }}>
            {(lead.relationship ?? 'parent').toLowerCase()} ·{' '}
            <button onClick={onOpenParent} style={{
              fontFamily: FONT, fontSize: 13, color: 'inherit',
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            }}>
              {guardian.first_name} {guardian.last_name}
            </button>
          </div>
          <div style={{ color: isHot ? '#524b43' : '#8a837a', fontSize: 13, marginTop: 1 }}>{guardian.phone}</div>
        </td>
        {/* Status */}
        <td style={td}>
          {!lead.contacted
            ? <span style={{ fontSize: 12.5, color: C.red, fontWeight: 500 }}>Not contacted</span>
            : lead.last_outcome === 'Spoke — call back later'
              ? <span style={{ fontSize: 12.5, color: C.muted }}>Spoke — call back later</span>
              : <span style={{ fontSize: 12.5, color: C.muted }}>{lead.attempts} call{lead.attempts !== 1 ? 's' : ''} · not reached</span>}
        </td>
        {/* Site */}
        {showSite && (
          <td style={td}>
            <span style={{ fontSize: 12.5, color: C.muted }}>{lead.site === 'coolaroo' ? 'Coolaroo' : 'Altona North'}</span>
          </td>
        )}
        {/* Actions */}
        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', position: 'relative' }}>
          {isHot
            ? <BtnPrimary onClick={() => setCallFor(v => !v)}>Call to book</BtnPrimary>
            : <BtnQuiet onClick={() => setCallFor(v => !v)}>Call</BtnQuiet>}
          <BtnGhost onClick={() => setBookingOpen(true)}>Book</BtnGhost>
          {callFor && <CallMenu onPick={handleCallOutcome} onClose={() => setCallFor(false)} />}
        </td>
      </tr>
      {bookingOpen && (
        <BookingModalWrapper
          lead={lead}
          userId={userId}
          programmes={programmes}
          onClose={() => setBookingOpen(false)}
          onDone={() => { setBookingOpen(false); onBooked() }}
        />
      )}
    </>
  )
}

// ─── Today trial row ──────────────────────────────────────────────────────────
function TodayRow({ lead, userId, activities, programmes, onOpen, onOpenParent, showSite }: {
  lead: Lead & { guardians: Guardian }
  userId: string
  activities: Array<{ lead_id: string; kind: string; body: string; created_at: string }>
  programmes: Programme[]
  onOpen: () => void
  onOpenParent: () => void
  showSite?: boolean
}) {
  const leadActs = activities.filter(a => a.lead_id === lead.id)
  const sortedActs = [...leadActs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const lastRelevant = sortedActs.find(a => a.body === 'Marked arrived ✓' || a.body === 'Undid: marked arrived')
  const arrivedDone = lastRelevant?.body === 'Marked arrived ✓'
  const [lossFor, setLossFor] = useState(false)
  const [enrolOpen, setEnrolOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const timeStr = lead.trial_at ? formatTime(lead.trial_at) : '—'
  const progName = programmes.find(p => p.id === lead.programme_id)?.name
  const guardian = lead.guardians

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr 130px 230px', gap: 16, alignItems: 'center', padding: '16px 22px', borderTop: `1px solid ${C.line}`, opacity: pending ? 0.6 : 1 }}>
        <div style={{ fontWeight: 600, color: C.ink, fontSize: 14 }}>{timeStr}</div>
        <div>
          <button onClick={onOpen} style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: C.ink, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            {lead.child_first} {lead.child_last}
            {ageFrom(lead.dob) && <span style={{ color: C.muted, fontWeight: 400, fontSize: 12.5, marginLeft: 5 }}>{ageFrom(lead.dob)} yrs</span>}
            {showSite && <Chip>{lead.site === 'coolaroo' ? 'Coolaroo' : 'Altona North'}</Chip>}
          </button>
          {progName && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{progName}</div>}
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
            {(lead.relationship ?? 'parent').toLowerCase()} ·{' '}
            <button onClick={onOpenParent} style={{ fontFamily: FONT, fontSize: 12.5, color: C.muted, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
              {guardian.first_name} {guardian.last_name}
            </button>{' '}· {guardian.phone}
          </div>
          <div style={{ marginTop: 4, fontSize: 12.5, color: C.muted }}>
            {lead.form_received
              ? <span style={{ color: C.green, fontWeight: 600 }}>Jotform ✓</span>
              : <>Jotform needed <button onClick={() => startTransition(() => resendForm(lead.id, userId))} style={{ fontFamily: FONT, fontSize: 12.5, color: C.orange, fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginLeft: 8 }}>Resend</button></>}
          </div>
        </div>
        {/* Arrived */}
        <div>
          {arrivedDone ? (
            <span onClick={() => startTransition(() => undoArrived(lead.id, userId))} title="Click to undo" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, color: C.green, fontSize: 12.5, fontWeight: 600 }}>
              <span style={{ width: 16, height: 16, borderRadius: '50%', background: C.greenBg, color: C.green, display: 'grid', placeItems: 'center', fontSize: 10 }}>✓</span>
              Arrived
            </span>
          ) : (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <button title="Attended" onClick={() => startTransition(() => markArrived(lead.id, userId))} style={{ width: 30, height: 30, border: `1.5px solid ${C.green}`, borderRadius: 7, background: '#eef6f0', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </button>
              <button title="No-show" onClick={() => startTransition(() => markNoShow(lead.id, userId))} style={{ width: 30, height: 30, border: `1.5px solid ${C.red}`, borderRadius: 7, background: '#fde8e3', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.8" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </span>
          )}
        </div>
        {/* Outcome */}
        <div style={{ textAlign: 'right' }}>
          {!arrivedDone
            ? <span style={{ fontSize: 11, fontWeight: 600, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.5 }}>outcome after arrival</span>
            : lossFor
              ? <LossPicker
                  onNurture={(reason, date) => { setLossFor(false); startTransition(() => markDidntEnrol(lead.id, reason, userId, date)) }}
                  onLost={reason => { setLossFor(false); startTransition(() => markLost(lead.id, reason, userId)) }}
                  onCancel={() => setLossFor(false)}
                />
              : <>
                  <BtnSale onClick={() => setEnrolOpen(true)}>Make the sale</BtnSale>
                  <BtnGhost onClick={() => setLossFor(true)}>Didn&apos;t enrol</BtnGhost>
                </>}
        </div>
      </div>
      {enrolOpen && (
        <EnrolModal lead={lead} onClose={() => setEnrolOpen(false)} onConfirm={({ date, slot, payTaken }) => {
          setEnrolOpen(false)
          startTransition(() => makeSale(lead.id, date, slot, payTaken, userId))
        }} />
      )}
    </>
  )
}

// ─── No-show row ──────────────────────────────────────────────────────────────
function NoShowRow({ lead, userId, programmes, onOpen, onOpenParent, showSite }: {
  lead: Lead & { guardians: Guardian }
  userId: string
  programmes: Programme[]
  onOpen: () => void
  onOpenParent: () => void
  showSite?: boolean
}) {
  const [bookingOpen, setBookingOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const guardian = lead.guardians

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', padding: '13px 22px 13px 19px', borderTop: `1px solid ${C.line}`, borderLeft: `3px solid ${C.orange}`, background: '#fffaf7', opacity: pending ? 0.6 : 1 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, background: C.orange, color: '#fff', borderRadius: 4, padding: '2px 7px', letterSpacing: 0.4 }}>NO-SHOW</span>
            {lead.trial_at && <span style={{ fontSize: 11.5, color: C.muted }}>trialled {new Date(lead.trial_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>}
          </div>
          <button onClick={onOpen} style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: C.ink, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            {lead.child_first} {lead.child_last}
            {ageFrom(lead.dob) && <span style={{ color: C.muted, fontWeight: 400, fontSize: 12.5, marginLeft: 5 }}>{ageFrom(lead.dob)} yrs</span>}
            {showSite && <Chip>{lead.site === 'coolaroo' ? 'Coolaroo' : 'Altona North'}</Chip>}
          </button>
          <div style={{ color: '#524b43', fontSize: 13, marginTop: 2 }}>
            {(lead.relationship ?? 'parent').toLowerCase()} ·{' '}
            <button onClick={onOpenParent} style={{ fontFamily: FONT, fontSize: 13, color: '#524b43', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
              {guardian.first_name} {guardian.last_name}
            </button>{' '}· {guardian.phone}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <BtnQuiet onClick={() => startTransition(() => logText(lead.id, userId))}>Send text</BtnQuiet>
          <BtnPrimary onClick={() => setBookingOpen(true)}>Re-book</BtnPrimary>
        </div>
      </div>
      {bookingOpen && (
        <BookingModalWrapper lead={lead} userId={userId} programmes={programmes}
          onClose={() => setBookingOpen(false)} onDone={() => setBookingOpen(false)} />
      )}
    </>
  )
}

// ─── Tomorrow row ─────────────────────────────────────────────────────────────
function TomorrowRow({ lead, userId, programmes, onOpen, onOpenParent, showSite }: {
  lead: Lead & { guardians: Guardian }
  userId: string
  programmes: Programme[]
  onOpen: () => void
  onOpenParent: () => void
  showSite?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const timeStr = lead.trial_at ? formatTime(lead.trial_at) : '—'
  const progName = programmes.find(p => p.id === lead.programme_id)?.name
  const guardian = lead.guardians

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr auto', gap: 16, alignItems: 'center', padding: '13px 22px', borderTop: `1px solid ${C.line}`, opacity: pending ? 0.6 : 1 }}>
      <div style={{ fontWeight: 600, color: C.ink, fontSize: 14 }}>{timeStr}</div>
      <div>
        <button onClick={onOpen} style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: C.ink, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
          {lead.child_first} {lead.child_last}
          {ageFrom(lead.dob) && <span style={{ color: C.muted, fontWeight: 400, fontSize: 12.5, marginLeft: 5 }}>{ageFrom(lead.dob)} yrs</span>}
          {showSite && <Chip>{lead.site === 'coolaroo' ? 'Coolaroo' : 'Altona North'}</Chip>}
        </button>
        {progName && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{progName}</div>}
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
          {(lead.relationship ?? 'parent').toLowerCase()} · {guardian.first_name} {guardian.last_name} · {guardian.phone}
        </div>
        <div style={{ marginTop: 4, fontSize: 12.5, color: C.muted }}>
          {lead.form_received
            ? <span style={{ color: C.green, fontWeight: 600 }}>Jotform ✓</span>
            : <>Jotform pending <button onClick={() => startTransition(() => resendForm(lead.id, userId))} style={{ fontFamily: FONT, fontSize: 12.5, color: C.orange, fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginLeft: 8 }}>Resend</button></>}
        </div>
      </div>
      <div>
        {lead.confirmation_sent_at
          ? <span style={{ color: C.green, fontWeight: 600, fontSize: 12.5 }}>Trial confirmation sent ✓</span>
          : <BtnPrimary onClick={() => startTransition(() => sendConfirmation(lead.id, userId))}>Trial confirmation sent</BtnPrimary>}
      </div>
    </div>
  )
}

// ─── Booked row (future + past month view) ────────────────────────────────────
function BookedRow({ lead, userId, programmes, activities, onOpen, onOpenParent, showSite }: {
  lead: Lead & { guardians: Guardian }
  userId: string
  programmes: Programme[]
  activities?: Array<{ lead_id: string; kind: string; body: string; created_at: string }>
  onOpen: () => void
  onOpenParent: () => void
  showSite?: boolean
}) {
  const [lossFor, setLossFor] = useState(false)
  const [enrolOpen, setEnrolOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const timeStr = lead.trial_at ? formatTime(lead.trial_at) : '—'
  const dateStr = lead.trial_at
    ? new Date(lead.trial_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
    : '—'
  const progName = programmes.find(p => p.id === lead.programme_id)?.name
  const guardian = lead.guardians
  const isPast = lead.trial_at ? new Date(lead.trial_at) < new Date() : false
  const leadActs = (activities ?? []).filter(a => a.lead_id === lead.id)
  const arrived = leadActs.some(a => a.body === 'Marked arrived ✓')

  // ── Attendance cell ──
  let attendance: React.ReactNode
  if (lead.status === 'won' || arrived) {
    attendance = <Tag tone="green">Attended ✓</Tag>
  } else if (lead.status === 'noshow') {
    attendance = <Tag tone="red">Didn&apos;t attend</Tag>
  } else if (lead.status === 'booked' && isPast) {
    attendance = (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button
          title="Attended"
          onClick={() => startTransition(() => markArrived(lead.id, userId))}
          style={{ width: 32, height: 32, border: `1.5px solid ${C.green}`, borderRadius: 7, background: '#eef6f0', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        </button>
        <button
          title="No-show"
          onClick={() => startTransition(() => markNoShow(lead.id, userId))}
          style={{ width: 32, height: 32, border: `1.5px solid ${C.red}`, borderRadius: 7, background: '#fde8e3', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.8" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
    )
  } else if (lead.status === 'booked') {
    attendance = <span style={{ fontSize: 12.5, color: C.faint }}>Upcoming</span>
  } else {
    attendance = arrived ? <Tag tone="green">Attended ✓</Tag> : <span style={{ fontSize: 12.5, color: C.faint }}>—</span>
  }

  // ── Sale outcome cell ──
  let outcome: React.ReactNode
  if (lead.status === 'won') {
    outcome = <Tag tone="green" solid>Sale ✓</Tag>
  } else if (lead.status === 'nurture' || lead.status === 'lost') {
    outcome = <Tag tone="grey">No sale</Tag>
  } else if (lead.status === 'noshow') {
    outcome = <span style={{ fontSize: 12.5, color: C.faint }}>—</span>
  } else if (isPast) {
    // booked + past: decide the sale once attendance is known
    outcome = lossFor
      ? <LossPicker
          onNurture={(reason, date) => { setLossFor(false); startTransition(() => markDidntEnrol(lead.id, reason, userId, date)) }}
          onLost={reason => { setLossFor(false); startTransition(() => markLost(lead.id, reason, userId)) }}
          onCancel={() => setLossFor(false)}
        />
      : arrived
        ? <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <BtnSale onClick={() => setEnrolOpen(true)}>Sale</BtnSale>
            <BtnGhost onClick={() => setLossFor(true)}>No sale</BtnGhost>
          </div>
        : <span style={{ fontSize: 12, color: C.faint }}>Mark attendance first</span>
  } else {
    // future booked trial — confirmation status
    outcome = lead.confirmation_sent_at
      ? <span style={{ color: C.green, fontWeight: 600, fontSize: 12.5 }}>Trial confirmation sent ✓</span>
      : <BtnPrimary onClick={() => startTransition(() => sendConfirmation(lead.id, userId))}>Trial confirmation sent</BtnPrimary>
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: BOOKED_COLS, gap: 16, alignItems: 'center', padding: '13px 22px', borderTop: `1px solid ${C.line}`, opacity: pending ? 0.6 : 1 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: C.ink }}>{dateStr}</div>
          <div style={{ fontWeight: 400, fontSize: 12, color: C.muted }}>{timeStr}</div>
        </div>
        <div>
          <button onClick={onOpen} style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: C.ink, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            {lead.child_first} {lead.child_last}
            {ageFrom(lead.dob) && <span style={{ color: C.muted, fontWeight: 400, fontSize: 12.5, marginLeft: 5 }}>{ageFrom(lead.dob)} yrs</span>}
            {showSite && <Chip>{lead.site === 'coolaroo' ? 'Coolaroo' : 'Altona North'}</Chip>}
          </button>
          {progName && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{progName}</div>}
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
            {(lead.relationship ?? 'parent').toLowerCase()} · {guardian.first_name} {guardian.last_name} · {guardian.phone}
          </div>
          {lead.form_received
            ? <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>Jotform ✓</span>
            : lead.form_sent_at
              ? <span style={{ fontSize: 12, color: C.muted }}>Jotform pending
                  <button onClick={() => startTransition(() => resendForm(lead.id, userId))} style={{ fontFamily: FONT, fontSize: 12, color: C.orange, fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginLeft: 8 }}>Resend</button>
                  <button onClick={() => startTransition(() => markFormReceived(lead.id, userId))} style={{ fontFamily: FONT, fontSize: 12, color: C.muted, fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginLeft: 8 }}>Got form</button>
                </span>
              : null}
        </div>
        <div>{attendance}</div>
        <div style={{ textAlign: 'right' }}>{outcome}</div>
      </div>
      {enrolOpen && (
        <EnrolModal lead={lead} onClose={() => setEnrolOpen(false)} onConfirm={({ date, slot, payTaken }) => {
          setEnrolOpen(false)
          startTransition(() => makeSale(lead.id, date, slot, payTaken, userId))
        }} />
      )}
    </>
  )
}

// ─── Upcoming row (follow-ups due — new-lead chases + no-show re-books) ────────
function UpcomingRow({ lead, userId, programmes, showSite, onOpen, onOpenParent }: {
  lead: Lead & { guardians: Guardian }
  userId: string
  programmes: Programme[]
  showSite?: boolean
  onOpen: () => void
  onOpenParent: () => void
}) {
  const [callFor, setCallFor] = useState(false)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const age = ageFrom(lead.dob)
  const guardian = lead.guardians
  const isNoShow = lead.status === 'noshow'
  const dueStr = lead.next_action_at
    ? new Date(lead.next_action_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
    : '—'
  const dueTime = lead.next_action_at
    ? new Date(lead.next_action_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
    : null

  function handleCallOutcome(outcome: string, followUpAt?: string) {
    setCallFor(false)
    if (outcome === '__open_profile__') { onOpen(); return }
    if (outcome === 'Spoke — booking now') {
      startTransition(async () => { await logCallOutcome(lead.id, outcome, userId) })
      setBookingOpen(true)
      return
    }
    startTransition(() => logCallOutcome(lead.id, outcome, userId, followUpAt))
  }

  const td: React.CSSProperties = { padding: '13px 22px', borderTop: `1px solid ${C.line}`, verticalAlign: 'middle' }

  return (
    <>
      <tr style={{ opacity: pending ? 0.6 : 1, ...(isNoShow ? { background: '#fffaf7' } : {}) }}>
        <td style={{ ...td, padding: '13px 16px 13px 22px', ...(isNoShow ? { boxShadow: `inset 3px 0 0 ${C.orange}` } : {}) }}>
          <div style={{ fontWeight: 600, fontSize: 12.5, color: C.ink }}>{dueStr}</div>
          {dueTime && <div style={{ fontSize: 11.5, color: C.muted }}>{dueTime}</div>}
        </td>
        <td style={td}>
          <button onClick={onOpen} style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: C.ink, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            {lead.child_first} {lead.child_last}
            {age && <span style={{ color: C.muted, fontWeight: 400, fontSize: 12.5, marginLeft: 5 }}>{age} yrs</span>}
            {showSite && <Chip>{lead.site === 'coolaroo' ? 'Coolaroo' : 'Altona North'}</Chip>}
          </button>
          <div style={{ color: '#524b43', fontSize: 13, marginTop: 2 }}>
            {(lead.relationship ?? 'parent').toLowerCase()} ·{' '}
            <button onClick={onOpenParent} style={{ fontFamily: FONT, fontSize: 13, color: '#524b43', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
              {guardian.first_name} {guardian.last_name}
            </button>{' '}· {guardian.phone}
          </div>
        </td>
        <td style={td}>
          {isNoShow
            ? <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, background: C.orange, color: '#fff', borderRadius: 4, padding: '2px 7px', letterSpacing: 0.4, alignSelf: 'flex-start' }}>TRIAL · NO-SHOW</span>
              </span>
            : lead.last_outcome
              ? <Tag tone="yellow">{lead.last_outcome}</Tag>
              : <Tag tone="red">Not contacted</Tag>}
        </td>
        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', position: 'relative' }}>
          {isNoShow
            ? <BtnPrimary onClick={() => setBookingOpen(true)}>Re-book</BtnPrimary>
            : <>
                <BtnQuiet onClick={() => setCallFor(v => !v)}>Call</BtnQuiet>
                <BtnGhost onClick={() => setBookingOpen(true)}>Book</BtnGhost>
                {callFor && <CallMenu onPick={handleCallOutcome} onClose={() => setCallFor(false)} />}
              </>}
        </td>
      </tr>
      {bookingOpen && (
        <BookingModalWrapper lead={lead} userId={userId} programmes={programmes}
          onClose={() => setBookingOpen(false)} onDone={() => setBookingOpen(false)} />
      )}
    </>
  )
}

// ─── Sale verification row ────────────────────────────────────────────────────
function SaleRow({ lead, userId, userRole, onOpen, onOpenParent, showSite }: {
  lead: Lead & { guardians: Guardian }
  userId: string
  userRole: string
  onOpen: () => void
  onOpenParent: () => void
  showSite?: boolean
}) {
  const [iclassChecks, setIclassChecks] = useState({ classEnrolled: false, regoIns: false, payment: false })
  const [pending, startTransition] = useTransition()
  const allTicked = iclassChecks.classEnrolled && iclassChecks.regoIns && iclassChecks.payment
  const canVerify = userRole === 'admin' || userRole === 'management'
  const guardian = lead.guardians

  return (
    <div style={{ padding: '13px 22px', borderTop: `1px solid ${C.line}`, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', opacity: pending ? 0.6 : 1 }}>
      <div>
        <button onClick={onOpen} style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: C.ink, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
          {lead.child_first} {lead.child_last}
          {showSite && <Chip>{lead.site === 'coolaroo' ? 'Coolaroo' : 'Altona North'}</Chip>}
        </button>
        <div style={{ fontSize: 13, color: '#524b43', marginTop: 2 }}>
          {(lead.relationship ?? 'parent').toLowerCase()} ·{' '}
          <button onClick={onOpenParent} style={{ fontFamily: FONT, fontSize: 13, color: '#524b43', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            {guardian.first_name} {guardian.last_name}
          </button>{' '}· {guardian.phone}
        </div>
        {lead.first_class_date && lead.first_class && (
          <div style={{ fontSize: 12, fontWeight: 700, color: C.green, marginTop: 2 }}>first class {lead.first_class_date} · {lead.first_class}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginLeft: 'auto', alignItems: 'center' }}>
        {([['classEnrolled', 'Class enrolled'], ['regoIns', 'Rego & insurance paid'], ['payment', 'Payment details set up']] as [keyof typeof iclassChecks, string][]).map(([key, label]) => (
          <label key={key} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12.5, fontWeight: 600, color: C.body, cursor: 'pointer' }}>
            <input type="checkbox" checked={iclassChecks[key]} onChange={() => { const next = !iclassChecks[key]; setIclassChecks(c => ({ ...c, [key]: next })); startTransition(() => logIclassCheck(lead.id, userId, label, next)) }} style={{ accentColor: C.green }} />
            {label}
          </label>
        ))}
        {allTicked && canVerify
          ? <BtnSale onClick={() => startTransition(() => verifySale(lead.id, userId))}>Verify sale</BtnSale>
          : allTicked && !canVerify
            ? <Tag tone="yellow">Awaiting admin verification</Tag>
            : <Tag tone="grey">Finish checklist</Tag>}
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
  perSiteTargets?: Record<string, Target>
  verifiedCount: number
  verifiedBySite?: Record<string, number>
  blockoutDays: BlockoutDay[]
  checklistItems: ChecklistItem[]
  completions: ChecklistCompletion[]
  todayActivities: Array<{ lead_id: string; user_id: string | null; kind: string; body: string; created_at: string }>
  userNames: Record<string, string>
  programmes: Programme[]
  todayStr: string
  weekSalesCount: number
  weekVerifiedCount?: number
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
  perSiteTargets = {},
  verifiedCount,
  verifiedBySite = {},
  blockoutDays,
  checklistItems,
  completions,
  todayActivities,
  userNames,
  programmes,
  todayStr,
  weekSalesCount,
  weekVerifiedCount = 0,
}: TodayClientProps) {
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)
  const [openParentGuardianId, setOpenParentGuardianId] = useState<string | null>(null)
  const [trialTab, setTrialTab] = useState<'today' | 'tomorrow' | 'this_week' | 'next_week' | 'this_month' | 'noshows' | 'custom'>('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [siteFilter, setSiteFilter] = useState<'all' | 'coolaroo' | 'altona_north'>('all')
  const [railSite, setRailSite] = useState<'all' | 'coolaroo' | 'altona_north'>('all')
  const [, startTransition] = useTransition()

  const isMultiSite = appUser.role === 'admin' || appUser.role === 'management'
  const matchesSite = (l: Lead) => siteFilter === 'all' || l.site === siteFilter

  const tomorrowStr = (() => { const d = new Date(todayStr + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) })()
  const dayAfterTomStr = (() => { const d = new Date(todayStr + 'T12:00:00'); d.setDate(d.getDate() + 2); return d.toISOString().slice(0, 10) })()
  const dow = new Date(todayStr + 'T12:00:00').getDay()
  const daysToSat = dow === 0 ? 6 : 6 - dow
  const endOfThisWeekStr = (() => { const d = new Date(todayStr + 'T12:00:00'); d.setDate(d.getDate() + daysToSat); return d.toISOString().slice(0, 10) })()
  const nextWeekStartStr = (() => { const d = new Date(todayStr + 'T12:00:00'); d.setDate(d.getDate() + daysToSat + 2); return d.toISOString().slice(0, 10) })()
  const nextWeekEndStr = (() => { const d = new Date(todayStr + 'T12:00:00'); d.setDate(d.getDate() + daysToSat + 7); return d.toISOString().slice(0, 10) })()
  const firstOfMonthStr = todayStr.slice(0, 8) + '01'
  const endOfMonthStr = (() => { const d = new Date(todayStr.slice(0, 7) + '-01T12:00:00'); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10) })()

  const booked = bookedLeads.filter(matchesSite)
  const noShowsFiltered = noShows.filter(matchesSite)
  const trialsByTab = {
    today: booked.filter(l => l.trial_at?.startsWith(todayStr)),
    tomorrow: booked.filter(l => l.trial_at?.startsWith(tomorrowStr)),
    this_week: booked.filter(l => l.trial_at && l.trial_at.slice(0, 10) >= tomorrowStr && l.trial_at.slice(0, 10) <= endOfThisWeekStr),
    next_week: booked.filter(l => l.trial_at && l.trial_at.slice(0, 10) >= nextWeekStartStr && l.trial_at.slice(0, 10) <= nextWeekEndStr),
    this_month: booked.filter(l => l.trial_at && l.trial_at.slice(0, 10) >= firstOfMonthStr && l.trial_at.slice(0, 10) <= endOfMonthStr),
    noshows: noShowsFiltered,
    custom: booked.filter(l => {
      if (!l.trial_at) return false
      const d = l.trial_at.slice(0, 10)
      if (customFrom && d < customFrom) return false
      if (customTo && d > customTo) return false
      return true
    }),
  }

  const newCallNow = newLeads.filter(l => !l.contacted || !l.next_action_at)
  const newScheduled = newLeads.filter(l => l.contacted && l.next_action_at).sort((a, b) => (a.next_action_at ?? '').localeCompare(b.next_action_at ?? ''))
  const newLeadsSorted = [...newCallNow, ...newScheduled]

  // Follow-ups due = scheduled new-lead chases + every no-show needing a re-book.
  // No-shows also stay in the Trials → No-shows tab; here they prompt the next action.
  const followUps = [...upcomingNewLeads, ...noShows]
    .sort((a, b) => (a.next_action_at ?? '').localeCompare(b.next_action_at ?? ''))

  const allLeads = [...newLeads, ...bookedLeads, ...noShows, ...unverifiedSales, ...upcomingNewLeads]
  const allLeadsMap = new Map(allLeads.map(l => [l.id, l]))
  const allLeadsUniq = Array.from(allLeadsMap.values())
  const openLead = openLeadId ? allLeadsMap.get(openLeadId) ?? null : null

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

  const opDays = calcOpDaysLeft(todayStr, blockoutDays)
  const month = monthName(todayStr)
  const doneCount = checklistItems.filter(i => localCompleted.has(i.id)).length
  const thisWeekTrialsCount = bookedLeads.filter(l => l.trial_at && l.trial_at.slice(0, 10) >= todayStr && l.trial_at.slice(0, 10) <= endOfThisWeekStr).length

  // Rail site toggle selects which target/count to display
  const railTarget = railSite === 'all' ? target : (perSiteTargets[railSite] ?? target)
  const railActual = railSite === 'all' ? verifiedCount : (verifiedBySite[railSite] ?? 0)
  const goal = railTarget?.net_growth_goal ?? 0
  const salesGoal = railTarget?.sales_goal ?? 0
  const actual = railActual
  const toGo = Math.max(0, goal - actual)
  const pct = goal > 0 ? Math.min(100, Math.round((actual / goal) * 100)) : 0

  // Half-gauge SVG (semicircle, dasharray-based like reference)
  const ARC_TOTAL = 308 // circumference of r=98 semicircle ≈ π×98
  const gaugeColor = pct >= 100 ? C.green : C.yellowGauge
  const dashFilled = Math.round((pct / 100) * ARC_TOTAL)

  const segtabStyle = (key: string): React.CSSProperties => ({
    fontFamily: FONT, fontSize: 12.5,
    color: trialTab === key ? C.ink : (key === 'noshows' && trialsByTab.noshows.length > 0 ? C.red : C.muted),
    textDecoration: 'none', padding: '5px 11px', borderRadius: 6,
    background: trialTab === key ? '#f3efe9' : (key === 'noshows' && trialsByTab.noshows.length > 0 && trialTab !== 'noshows' ? '#fde8e3' : 'none'),
    fontWeight: trialTab === key ? 600 : (key === 'noshows' && trialsByTab.noshows.length > 0 ? 600 : 400),
    border: 'none', cursor: 'pointer',
  })

  const railToggleStyle = (key: string): React.CSSProperties => ({
    fontFamily: FONT, border: 'none',
    background: railSite === key ? '#fff' : 'none',
    fontSize: 11, color: railSite === key ? C.ink : C.muted,
    padding: '5px 11px', borderRadius: 5, cursor: 'pointer',
    fontWeight: railSite === key ? 600 : 500,
    boxShadow: railSite === key ? '0 1px 2px rgba(0,0,0,.07)' : 'none',
  })

  const siteToggleStyle = (key: string): React.CSSProperties => ({
    fontFamily: FONT, border: 'none',
    background: siteFilter === key ? '#fff' : 'none',
    fontSize: 12, color: siteFilter === key ? C.ink : C.muted,
    padding: '5px 11px', borderRadius: 5, cursor: 'pointer',
    fontWeight: siteFilter === key ? 600 : 500,
    boxShadow: siteFilter === key ? '0 1px 2px rgba(0,0,0,.07)' : 'none',
  })

  return (
    <div style={{ fontFamily: FONT, display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>

      {/* ── MAIN COLUMN ── */}
      <main>

        {/* Leads card */}
        <Card
          head="Actions due today"
          sub="Call and book a trial — longest waiting at the top"
          right={newLeads.length > 0 ? <CountPill>{newLeads.length} to book</CountPill> : undefined}
        >
          {newLeads.length === 0 ? (
            <div style={{ padding: '18px 22px 22px', color: C.muted, fontSize: 13, borderTop: `1px solid ${C.line}` }}>No new leads — great work!</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ width: 88, fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase', color: C.faint, fontWeight: 600, textAlign: 'left', padding: '6px 16px 6px 22px', borderBottom: `1px solid ${C.line}` }}>Received</th>
                  <th style={{ fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase', color: C.faint, fontWeight: 600, textAlign: 'left', padding: '6px 22px', borderBottom: `1px solid ${C.line}` }}>Child &amp; guardian</th>
                  <th style={{ width: 140, fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase', color: C.faint, fontWeight: 600, textAlign: 'left', padding: '6px 22px', borderBottom: `1px solid ${C.line}` }}>Status</th>
                  {isMultiSite && <th style={{ width: 100, fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase', color: C.faint, fontWeight: 600, textAlign: 'left', padding: '6px 22px', borderBottom: `1px solid ${C.line}` }}>Site</th>}
                  <th style={{ borderBottom: `1px solid ${C.line}` }} />
                </tr>
              </thead>
              <tbody>
                {newLeadsSorted.map(l => (
                  <NewRow
                    key={l.id}
                    lead={l}
                    scheduled={!!(l.contacted && l.next_action_at)}
                    userId={appUser.id}
                    programmes={programmes}
                    showSite={isMultiSite}
                    onOpen={() => setOpenLeadId(l.id)}
                    onOpenParent={() => setOpenParentGuardianId(l.guardians.id)}
                    onBooked={() => {}}
                  />
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Trials card */}
        <Card
          head="Trials"
          sub="Mark arrival, then the outcome"
          right={todayTrials.length > 0 ? `${todayTrials.length} today` : undefined}
        >
          {/* Tab row + site toggle on same line */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 22px 12px', gap: 12 }}>
            <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {([
                ['today', `Today${trialsByTab.today.length > 0 ? ` (${trialsByTab.today.length})` : ''}`],
                ['tomorrow', `Tomorrow${trialsByTab.tomorrow.length > 0 ? ` (${trialsByTab.tomorrow.length})` : ''}`],
                ['this_week', `This week${trialsByTab.this_week.length > 0 ? ` (${trialsByTab.this_week.length})` : ''}`],
                ['next_week', `Next week${trialsByTab.next_week.length > 0 ? ` (${trialsByTab.next_week.length})` : ''}`],
                ['this_month', `This month${trialsByTab.this_month.length > 0 ? ` (${trialsByTab.this_month.length})` : ''}`],
                ['noshows', `No-shows${trialsByTab.noshows.length > 0 ? ` (${trialsByTab.noshows.length})` : ''}`],
              ] as [string, string][]).map(([key, label]) => (
                <button key={key} onClick={() => setTrialTab(key as typeof trialTab)} style={{ ...segtabStyle(key), whiteSpace: 'nowrap' }}>{label}</button>
              ))}
              {/* Calendar icon for custom range */}
              <button onClick={() => setTrialTab('custom')} title="Custom date range" style={{
                ...segtabStyle('custom'), padding: '5px 9px', display: 'inline-flex', alignItems: 'center',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={trialTab === 'custom' ? C.ink : C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </button>
            </div>
            {isMultiSite && (
              <div style={{ display: 'inline-flex', background: '#f3efe9', borderRadius: 7, padding: 3, gap: 2, flexShrink: 0 }}>
                {(['all', 'coolaroo', 'altona_north'] as const).map(s => (
                  <button key={s} onClick={() => setSiteFilter(s)} style={siteToggleStyle(s)}>
                    {s === 'all' ? 'All' : s === 'coolaroo' ? 'Coolaroo' : 'Altona North'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Custom date range */}
          {trialTab === 'custom' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 22px', borderTop: `1px solid ${C.line}` }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.muted }}>From</span>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ padding: '4px 8px', border: `1px solid ${C.line2}`, fontSize: 12, borderRadius: 6 }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.muted }}>to</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ padding: '4px 8px', border: `1px solid ${C.line2}`, fontSize: 12, borderRadius: 6 }} />
            </div>
          )}

          {/* Tab content */}
          {trialTab === 'today' && (
            trialsByTab.today.length === 0
              ? <div style={{ padding: '18px 22px 22px', color: C.muted, fontSize: 13, borderTop: `1px solid ${C.line}` }}>No trials today.</div>
              : trialsByTab.today.map(l => (
                  <TodayRow key={l.id} lead={l} userId={appUser.id} activities={todayActivities} programmes={programmes} showSite={isMultiSite}
                    onOpen={() => setOpenLeadId(l.id)} onOpenParent={() => setOpenParentGuardianId(l.guardians.id)} />
                ))
          )}

          {trialTab === 'noshows' && (
            trialsByTab.noshows.length === 0
              ? <div style={{ padding: '18px 22px 22px', color: C.muted, fontSize: 13, borderTop: `1px solid ${C.line}` }}>No no-shows.</div>
              : trialsByTab.noshows.map(l => (
                  <NoShowRow key={l.id} lead={l} userId={appUser.id} programmes={programmes} showSite={isMultiSite}
                    onOpen={() => setOpenLeadId(l.id)} onOpenParent={() => setOpenParentGuardianId(l.guardians.id)} />
                ))
          )}

          {trialTab === 'tomorrow' && (
            trialsByTab.tomorrow.length === 0
              ? <div style={{ padding: '18px 22px 22px', color: C.muted, fontSize: 13, borderTop: `1px solid ${C.line}` }}>No trials tomorrow.</div>
              : trialsByTab.tomorrow.map(l => (
                  <TomorrowRow key={l.id} lead={l} userId={appUser.id} programmes={programmes} showSite={isMultiSite}
                    onOpen={() => setOpenLeadId(l.id)} onOpenParent={() => setOpenParentGuardianId(l.guardians.id)} />
                ))
          )}

          {trialTab !== 'today' && trialTab !== 'tomorrow' && trialTab !== 'noshows' && (
            trialsByTab[trialTab].length === 0
              ? <div style={{ padding: '18px 22px 22px', color: C.muted, fontSize: 13, borderTop: `1px solid ${C.line}` }}>No trials in this period.</div>
              : <>
                  <div style={{ display: 'grid', gridTemplateColumns: BOOKED_COLS, gap: 16, padding: '6px 22px', borderTop: `1px solid ${C.line}` }}>
                    {(['When', 'Child & guardian', 'Attendance', 'Sale outcome'] as const).map((h, i) => (
                      <div key={h} style={{ fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase', color: C.faint, fontWeight: 600, textAlign: i === 3 ? 'right' : 'left' }}>{h}</div>
                    ))}
                  </div>
                  {trialsByTab[trialTab].map(l => (
                    <BookedRow key={l.id} lead={l} userId={appUser.id} programmes={programmes}
                      activities={todayActivities}
                      showSite={isMultiSite}
                      onOpen={() => setOpenLeadId(l.id)} onOpenParent={() => setOpenParentGuardianId(l.guardians.id)} />
                  ))}
                </>
          )}
        </Card>

        {/* Sales to process — always visible */}
        <Card
          head="Sales to process"
          sub="Enter in iClassPro, tick each item, then admin verifies"
          right={unverifiedSales.length > 0 ? <Tag tone="yellow">{unverifiedSales.length} pending admin</Tag> : undefined}
        >
          {unverifiedSales.length === 0
            ? <div style={{ padding: '18px 22px 22px', color: C.muted, fontSize: 13, borderTop: `1px solid ${C.line}` }}>No sales to process — admin is up to date.</div>
            : unverifiedSales.map(l => (
                <SaleRow key={l.id} lead={l} userId={appUser.id} userRole={appUser.role} showSite={isMultiSite}
                  onOpen={() => setOpenLeadId(l.id)} onOpenParent={() => setOpenParentGuardianId(l.guardians.id)} />
              ))
          }
        </Card>

        {/* Follow-ups due */}
        <Card
          head="Follow-ups due"
          sub="Who to chase next, and when"
          right={`${followUps.length} scheduled`}
        >
          {followUps.length === 0
            ? <div style={{ padding: '18px 22px 22px', color: C.muted, fontSize: 13, borderTop: `1px solid ${C.line}` }}>Nothing scheduled. When you log a call outcome or mark a no-show, the next follow-up appears here.</div>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ width: 110, fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase', color: C.faint, fontWeight: 600, textAlign: 'left', padding: '6px 16px 6px 22px', borderBottom: `1px solid ${C.line}` }}>Follow up</th>
                    <th style={{ fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase', color: C.faint, fontWeight: 600, textAlign: 'left', padding: '6px 22px', borderBottom: `1px solid ${C.line}` }}>Child &amp; guardian</th>
                    <th style={{ width: 150, fontSize: 10.5, letterSpacing: '0.7px', textTransform: 'uppercase', color: C.faint, fontWeight: 600, textAlign: 'left', padding: '6px 22px', borderBottom: `1px solid ${C.line}` }}>Last action</th>
                    <th style={{ width: 190, borderBottom: `1px solid ${C.line}` }} />
                  </tr>
                </thead>
                <tbody>
                  {followUps.map(l => (
                    <UpcomingRow key={l.id} lead={l} userId={appUser.id} programmes={programmes} showSite={isMultiSite}
                      onOpen={() => setOpenLeadId(l.id)} onOpenParent={() => setOpenParentGuardianId(l.guardians.id)} />
                  ))}
                </tbody>
              </table>
            )
          }
        </Card>

        {/* Daily checklist */}
        <Card
          head="Daily checklist"
          sub="Front of house"
          right={`${doneCount} of ${checklistItems.length} done`}
        >
          {checklistItems.length === 0 && (
            <div style={{ padding: '18px 22px 22px', color: C.muted, fontSize: 13, borderTop: `1px solid ${C.line}` }}>No checklist items configured.</div>
          )}
          {checklistItems.map(item => {
            const done = localCompleted.has(item.id)
            return (
              <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 22px', borderTop: `1px solid ${C.line}`, fontSize: 13.5, color: C.body, cursor: 'pointer' }}>
                <span style={{
                  width: 17, height: 17, border: done ? 'none' : `1.5px solid ${C.line2}`,
                  borderRadius: 4, flexShrink: 0, display: 'grid', placeItems: 'center',
                  background: done ? C.green : 'none',
                }}>
                  {done && <svg width="10" height="10" viewBox="0 0 10 10"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>}
                </span>
                <input type="checkbox" checked={done} onChange={() => handleToggleChecklist(item.id)} style={{ display: 'none' }} />
                <span style={{ textDecoration: done ? 'line-through' : 'none', color: done ? C.muted : C.body }}>{item.label}</span>
                {done && <span style={{ fontSize: 11, color: C.faint, marginLeft: 'auto' }}>{appUser.name} · today</span>}
              </label>
            )
          })}
        </Card>

      </main>

      {/* ── RIGHT RAIL ── */}
      <aside style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Target widget */}
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: RADIUS, padding: 20 }}>
          <div style={{ fontSize: 10.5, letterSpacing: '0.8px', textTransform: 'uppercase', color: C.faint, fontWeight: 600 }}>{month} {new Date(todayStr + 'T12:00:00').getFullYear()}</div>

          {/* Site toggle */}
          {isMultiSite && (
            <div style={{ display: 'flex', width: '100%', margin: '10px 0 2px', background: '#f3efe9', borderRadius: 7, padding: 3, gap: 2 }}>
              {(['all', 'coolaroo', 'altona_north'] as const).map(s => (
                <button key={s} onClick={() => setRailSite(s)} style={{ ...railToggleStyle(s), flex: 1, fontSize: 11, padding: '5px 4px' }}>
                  {s === 'all' ? 'All' : s === 'coolaroo' ? 'Coolaroo' : 'Altona North'}
                </button>
              ))}
            </div>
          )}

          {/* Half gauge */}
          <svg width="100%" height="132" viewBox="0 0 240 138" style={{ display: 'block', margin: '8px auto 2px' }}>
            <path d="M22,128 A98,98 0 0 1 218,128" fill="none" stroke="#f0ebe4" strokeWidth="14" strokeLinecap="round" />
            {pct > 0 && (
              <path d="M22,128 A98,98 0 0 1 218,128" fill="none" stroke={gaugeColor} strokeWidth="14" strokeLinecap="round"
                strokeDasharray={`${dashFilled} ${ARC_TOTAL}`} />
            )}
            <text x="120" y="112" textAnchor="middle" fontSize="44" fontWeight="800" fill={C.head} fontFamily={FONT}>+{actual}</text>
            <text x="120" y="133" textAnchor="middle" fontSize="12.5" fontWeight="600" fill={C.muted} fontFamily={FONT}>
              of +{goal} target · {toGo} to go
            </text>
          </svg>

          {opDays > 0 && toGo > 0 && (
            <div style={{ fontSize: 12, color: C.muted, textAlign: 'center' }}>
              {opDays} operating days left · about {(toGo / opDays).toFixed(1)} a day
            </div>
          )}
          {pct >= 100 && (
            <div style={{ fontSize: 12, color: C.green, fontWeight: 600, textAlign: 'center' }}>Target reached!</div>
          )}

          {/* Ledger */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '7px 0' }}>
              <span style={{ fontSize: 13, color: C.body }}>Sales</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.green }}>
                {railActual > 0 ? `+${railActual}` : '—'}
                {salesGoal > 0 && <span style={{ fontSize: 11, fontWeight: 500, color: C.faint, marginLeft: 4 }}>/ {salesGoal} goal</span>}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '7px 0' }}>
              <span style={{ fontSize: 13, color: C.body }}>Cancellations</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.red }}>—</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '11px 0 0', marginTop: 5, borderTop: `1px solid ${C.line}` }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Net growth</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: actual > 0 ? C.green : C.ink }}>+{actual}</span>
            </div>
          </div>
        </div>

        {/* Today at a glance */}
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: RADIUS, padding: 20 }}>
          <div style={{ fontSize: 10.5, letterSpacing: '0.8px', textTransform: 'uppercase', color: C.faint, fontWeight: 600, marginBottom: 12 }}>Today at a glance</div>
          {([
            ['New leads to book', newLeads.length, newLeads.length > 0],
            ['Leads received this month', null, false],
            ['Trials this week', thisWeekTrialsCount, false],
            ['Sales this week', weekSalesCount, false],
          ] as [string, number | null, boolean][]).map(([label, val, warn]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${C.line}` }}>
              <span style={{ fontSize: 13, color: C.body }}>{label}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: warn ? C.orange : C.ink }}>
                {val ?? '—'}
                {label === 'Sales this week' && weekSalesCount > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: weekVerifiedCount < weekSalesCount ? C.yellow : C.green, marginLeft: 5 }}>
                    {weekVerifiedCount}/{weekSalesCount} verified
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>

      </aside>

      {/* Profile slide-in */}
      {openLead && (
        <ProfilePanel
          lead={openLead}
          allLeads={allLeadsUniq}
          onClose={() => setOpenLeadId(null)}
          userId={appUser.id}
          userRole={appUser.role}
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

      {/* Parent profile slide-in */}
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
