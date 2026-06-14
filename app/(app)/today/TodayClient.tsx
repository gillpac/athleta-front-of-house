'use client'

import { useState, useTransition } from 'react'
import type {
  AppUser,
  Programme,
  Target,
  BlockoutDay,
  ChecklistItem,
} from '@/types'
import type { LeadWithGuardian } from './page'
import {
  logCallOutcome,
  bookTrial,
  markArrived,
  markNoShow,
  makeSale,
  markDidntEnrol,
  sendConfirmation,
  toggleChecklist,
  verifyLead,
} from './actions'

/* ---------- design tokens ---------- */
const C = {
  ink: '#17130E',
  inkSoft: '#2B2521',
  orange: '#E26839',
  orangeDark: '#B94E22',
  bg: '#F6F3EE',
  card: '#FFFFFF',
  sand: '#EFE8DE',
  line: '#D9CFC2',
  lineSoft: '#E8E1D6',
  muted: '#84776A',
  green: '#27865C',
  greenDark: '#1E6B49',
  greenBg: '#DFF0E6',
  yellow: '#9A7409',
  yellowBg: '#FBF1CF',
  red: '#B23A24',
  redBg: '#F6DCD4',
  grey: '#6E655B',
  greyBg: '#ECE7DF',
}
const FONT = "'Nunito', system-ui, sans-serif"

/* ---------- helpers ---------- */
const ageFrom = (dob: string) => {
  const d = new Date(dob),
    today = new Date()
  let age = today.getFullYear() - d.getFullYear()
  if (today < new Date(today.getFullYear(), d.getMonth(), d.getDate())) age--
  return age
}

const waitLabel = (mins: number) =>
  mins < 60
    ? `${mins} min`
    : mins < 1440
      ? `${Math.round(mins / 60)} hrs`
      : `${Math.round(mins / 1440)} days`

const fmtTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-AU', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—'

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-AU', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : '—'

const SITE_LABEL: Record<string, string> = {
  coolaroo: 'Coolaroo',
  altona_north: 'Altona North',
}

const CALL_OUTCOMES = [
  'No answer',
  'Left voicemail',
  'Spoke — call back later',
  'Spoke — booking now',
]
const LOSS_REASONS = [
  'Price',
  'Timing / not ready',
  "Day didn't suit",
  'Comparing options',
  'Other',
]

/* ---------- small primitives ---------- */
type Tone = 'green' | 'yellow' | 'red' | 'grey'
function Tag({
  children,
  tone = 'grey',
  solid,
  onClick,
  title,
}: {
  children: React.ReactNode
  tone?: Tone
  solid?: boolean
  onClick?: () => void
  title?: string
}) {
  const map: Record<Tone, [string, string]> = {
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
        fontSize: 10.5,
        fontWeight: 800,
        padding: '3px 8px',
        borderRadius: 3,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {children}
    </span>
  )
}

function Next({
  children,
  onClick,
  color = C.orange,
  border = C.orangeDark,
  disabled,
}: {
  children: React.ReactNode
  onClick?: () => void
  color?: string
  border?: string
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: FONT,
        fontWeight: 800,
        fontSize: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        borderRadius: 4,
        padding: '6px 13px',
        background: disabled ? C.greyBg : color,
        color: disabled ? C.muted : '#fff',
        border: `1px solid ${disabled ? C.line : border}`,
        opacity: disabled ? 0.8 : 1,
      }}
    >
      {children}
    </button>
  )
}
const Sale = (p: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
  <Next {...p} color={C.green} border={C.greenDark} />
)
function Quiet({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: FONT,
        fontWeight: 700,
        fontSize: 11.5,
        cursor: 'pointer',
        borderRadius: 4,
        padding: '6px 10px',
        background: 'transparent',
        color: C.muted,
        border: `1px solid ${C.lineSoft}`,
      }}
    >
      {children}
    </button>
  )
}

const colHead: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 900,
  color: C.muted,
  textTransform: 'uppercase',
  letterSpacing: 1,
}
const inp: React.CSSProperties = {
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 700,
  padding: '8px 10px',
  borderRadius: 4,
  border: `1px solid ${C.line}`,
  background: '#fff',
}
const lbl: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 11.5,
  fontWeight: 800,
  color: C.inkSoft,
  marginBottom: 10,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
}

/* ---------- shared bits ---------- */
function childName(l: LeadWithGuardian) {
  return `${l.child_first} ${l.child_last}`.trim()
}
function guardianName(l: LeadWithGuardian) {
  const g = l.guardian
  return g ? `${g.first_name} ${g.last_name}`.trim() : 'Guardian'
}

function WhoCell({
  l,
  onOpen,
}: {
  l: LeadWithGuardian
  onOpen: () => void
}) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <button
          onClick={onOpen}
          style={{
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 13.5,
            color: C.ink,
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            borderBottom: `1px dotted ${C.muted}`,
          }}
        >
          {childName(l)}
        </button>
        {l.dob && (
          <span style={{ color: C.muted, fontWeight: 700, fontSize: 11.5 }}>
            {ageFrom(l.dob)} yrs
          </span>
        )}
        {l.rebooks > 0 && <Tag tone="yellow">re-booked ×{l.rebooks}</Tag>}
      </div>
      <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700, marginTop: 1 }}>
        {(l.relationship || 'parent').toLowerCase()} · {guardianName(l)} ·{' '}
        {l.guardian?.phone ?? '—'}
      </div>
    </div>
  )
}

const Panel = ({
  children,
  head,
  badge,
  sub,
  style,
}: {
  children: React.ReactNode
  head: React.ReactNode
  badge?: React.ReactNode
  sub?: React.ReactNode
  style?: React.CSSProperties
}) => (
  <section
    style={{
      background: C.card,
      border: `1px solid ${C.line}`,
      borderRadius: 6,
      marginBottom: 22,
      ...style,
    }}
  >
    <div
      style={{
        padding: '10px 14px',
        borderBottom: `1px solid ${C.lineSoft}`,
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        background: '#FCFAF7',
      }}
    >
      {badge}
      <h3
        style={{
          margin: 0,
          fontSize: 12.5,
          fontWeight: 900,
          color: C.ink,
          textTransform: 'uppercase',
          letterSpacing: 1.2,
        }}
      >
        {head}
      </h3>
      {sub}
    </div>
    {children}
  </section>
)

/* ---------- modals ---------- */
function BookingModal({
  lead,
  programmes,
  onClose,
  onConfirm,
}: {
  lead: LeadWithGuardian
  programmes: Programme[]
  onClose: () => void
  onConfirm: (trialAt: string, programmeId: string | null) => void
}) {
  const age = lead.dob ? ageFrom(lead.dob) : null
  const suggested =
    age != null
      ? programmes.find(
          (p) =>
            (p.min_age == null || age >= p.min_age) &&
            (p.max_age == null || age <= p.max_age)
        )
      : undefined
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [prog, setProg] = useState<string>(
    lead.programme_id ?? suggested?.id ?? ''
  )
  const ok = !!date && !!time
  return (
    <Overlay onClose={onClose} accent={C.orange}>
      <h3 style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 900 }}>
        Book trial — {childName(lead)}
      </h3>
      <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, marginBottom: 14 }}>
        {(lead.relationship || '').toLowerCase()} · {guardianName(lead)} ·{' '}
        {lead.guardian?.phone}
      </div>
      <label style={lbl}>
        Trial date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} />
      </label>
      <label style={lbl}>
        Time
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inp} />
      </label>
      <label style={lbl}>
        Programme
        <select value={prog} onChange={(e) => setProg(e.target.value)} style={inp}>
          <option value="">— select —</option>
          {programmes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {suggested && (
          <span style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, textTransform: 'none' }}>
            Suggested from age {age}: {suggested.name}
          </span>
        )}
      </label>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <Quiet onClick={onClose}>Cancel</Quiet>
        <Next
          disabled={!ok}
          onClick={() => {
            if (!ok) return
            const trialAt = new Date(`${date}T${time}`).toISOString()
            onConfirm(trialAt, prog || null)
          }}
        >
          {ok ? 'Confirm booking' : 'Pick date & time'}
        </Next>
      </div>
    </Overlay>
  )
}

function EnrolModal({
  lead,
  onClose,
  onConfirm,
}: {
  lead: LeadWithGuardian
  onClose: () => void
  onConfirm: (firstClassDate: string, firstClass: string, paymentTaken: boolean) => void
}) {
  const [date, setDate] = useState('')
  const [slot, setSlot] = useState('')
  const [payTaken, setPayTaken] = useState(false)
  const ok = !!date && !!slot && payTaken
  return (
    <Overlay onClose={onClose} accent={C.green}>
      <h3 style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 900 }}>
        💰 Make the sale — {childName(lead)}
      </h3>
      <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, marginBottom: 12 }}>
        lock in their first class to complete the sale
      </div>
      {!lead.form_received && (
        <div
          style={{
            background: C.yellowBg,
            border: '1px solid #E5D49A',
            borderRadius: 4,
            padding: '8px 11px',
            marginBottom: 12,
            fontSize: 12,
            fontWeight: 800,
            color: C.yellow,
          }}
        >
          ⚠ Their form hasn&apos;t come back — get it completed before their first
          class.
        </div>
      )}
      <label style={lbl}>
        First class date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} />
      </label>
      <label style={lbl}>
        Class
        <input
          placeholder="e.g. Sat 9:30 am Kinder Gym"
          value={slot}
          onChange={(e) => setSlot(e.target.value)}
          style={inp}
        />
      </label>
      <label
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          fontSize: 12.5,
          fontWeight: 800,
          color: C.inkSoft,
          cursor: 'pointer',
          margin: '4px 0 8px',
        }}
      >
        <input
          type="checkbox"
          checked={payTaken}
          onChange={(e) => setPayTaken(e.target.checked)}
          style={{ width: 16, height: 16, accentColor: C.green }}
        />
        Rego &amp; insurance payment taken
      </label>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
        <Quiet onClick={onClose}>Cancel</Quiet>
        <Sale disabled={!ok} onClick={() => ok && onConfirm(date, slot, payTaken)}>
          {!date || !slot ? 'Add first class' : !payTaken ? 'Take payment first' : 'Confirm sale 🎉'}
        </Sale>
      </div>
    </Overlay>
  )
}

function Overlay({
  children,
  onClose,
  accent,
}: {
  children: React.ReactNode
  onClose: () => void
  accent: string
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(23,19,14,.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 6,
          padding: '22px 24px',
          width: 380,
          maxWidth: '92vw',
          borderTop: `3px solid ${accent}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

/* ---------- profile slide-in ---------- */
function Profile({
  lead,
  family,
  programmes,
  onClose,
  onBook,
  onSale,
  onLogCall,
  onOpenChild,
}: {
  lead: LeadWithGuardian
  family: LeadWithGuardian[]
  programmes: Programme[]
  onClose: () => void
  onBook: (l: LeadWithGuardian) => void
  onSale: (l: LeadWithGuardian) => void
  onLogCall: (l: LeadWithGuardian, outcome: string) => void
  onOpenChild: (l: LeadWithGuardian) => void
}) {
  const [callOpen, setCallOpen] = useState(false)
  const siblings = family.filter((s) => s.id !== lead.id)
  const bookable =
    lead.status === 'new' || lead.status === 'noshow' || lead.status === 'nurture'
  const progName = programmes.find((p) => p.id === lead.programme_id)?.name ?? '—'
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40 }}>
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(23,19,14,.4)' }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 430,
          maxWidth: '94vw',
          background: '#fff',
          padding: '20px 22px',
          overflowY: 'auto',
          borderLeft: `3px solid ${C.orange}`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>
              {childName(lead)}{' '}
              <span style={{ color: C.muted, fontWeight: 700, fontSize: 13 }}>
                {lead.dob ? `${ageFrom(lead.dob)} yrs · DOB ${fmtDate(lead.dob)}` : ''}
              </span>
            </h3>
            <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 700, marginTop: 2 }}>
              {(lead.relationship || '').toLowerCase()} · {guardianName(lead)} ·{' '}
              {lead.guardian?.phone}
            </div>
            {siblings.length > 0 && (
              <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: C.muted, letterSpacing: '.4px' }}>
                  FAMILY:
                </span>
                {siblings.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onOpenChild(s)}
                    style={{
                      fontFamily: FONT,
                      display: 'inline-flex',
                      gap: 6,
                      alignItems: 'center',
                      background: C.sand,
                      border: `1px solid ${C.line}`,
                      borderRadius: 4,
                      padding: '3px 8px',
                      cursor: 'pointer',
                      fontSize: 11.5,
                      fontWeight: 800,
                      color: C.ink,
                    }}
                  >
                    {childName(s)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Quiet onClick={onClose}>Close ✕</Quiet>
        </div>

        {/* action bar */}
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap', position: 'relative' }}>
          <Next onClick={() => setCallOpen(!callOpen)}>📞 Call</Next>
          {bookable && (
            <Next onClick={() => onBook(lead)}>
              {lead.status === 'noshow' ? 'Re-book trial' : 'Book trial'}
            </Next>
          )}
          {lead.status === 'booked' && <Sale onClick={() => onSale(lead)}>💰 Make the sale</Sale>}
          {callOpen && (
            <CallMenu
              onPick={(o) => {
                setCallOpen(false)
                if (o === 'Spoke — booking now') {
                  onLogCall(lead, o)
                  onBook(lead)
                } else onLogCall(lead, o)
              }}
              onClose={() => setCallOpen(false)}
            />
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Tag tone="grey">{progName}</Tag>
          {lead.form_received ? <Tag tone="green">form ✓</Tag> : <Tag tone="yellow">form pending</Tag>}
          {lead.status === 'won' &&
            (lead.verified_at ? (
              <Tag tone="green" solid>
                sale ✓
              </Tag>
            ) : (
              <Tag tone="yellow">sale — pending admin</Tag>
            ))}
          {lead.first_class_date && (
            <Tag tone="green">first class {fmtDate(lead.first_class_date)}</Tag>
          )}
        </div>

        <h4 style={h4s}>Original enquiry — received {fmtDate(lead.received_at)}</h4>
        <div style={{ background: C.bg, border: `1px solid ${C.lineSoft}`, borderRadius: 4, padding: '10px 12px' }}>
          {(
            [
              ['Site', SITE_LABEL[lead.site] ?? lead.site],
              ['Booking as', lead.relationship ?? '—'],
              ['Guardian', guardianName(lead)],
              ['Mobile', lead.guardian?.phone ?? '—'],
              ['Email', lead.guardian?.email ?? '—'],
              ['Child', childName(lead)],
              ['Date of birth', lead.dob ? fmtDate(lead.dob) : '—'],
              ['Gender', lead.gender ?? '—'],
              ['Source', lead.source],
            ] as [string, string][]
          ).map(([k, v]) => (
            <div
              key={k}
              style={{
                display: 'flex',
                fontSize: 12.5,
                fontWeight: 700,
                padding: '3px 0',
                borderBottom: `1px dashed ${C.lineSoft}`,
              }}
            >
              <span style={{ width: 150, color: C.muted }}>{k}</span>
              <span style={{ color: C.inkSoft }}>{v}</span>
            </div>
          ))}
        </div>

        <h4 style={h4s}>Status</h4>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: C.inkSoft }}>
          {lead.status.toUpperCase()}
          {lead.trial_at && ` · trial ${fmtDate(lead.trial_at)} ${fmtTime(lead.trial_at)}`}
          {lead.next_action_at && ` · next action ${fmtDate(lead.next_action_at)}`}
        </div>
      </div>
    </div>
  )
}
const h4s: React.CSSProperties = {
  margin: '18px 0 8px',
  fontSize: 10.5,
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: 1.2,
  color: C.muted,
}

function CallMenu({
  onPick,
  onClose,
}: {
  onPick: (o: string) => void
  onClose: () => void
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '105%',
        left: 0,
        background: '#fff',
        border: `1px solid ${C.line}`,
        borderRadius: 4,
        boxShadow: '0 10px 30px rgba(0,0,0,.2)',
        zIndex: 30,
        minWidth: 190,
      }}
      onMouseLeave={onClose}
    >
      <div style={{ ...colHead, padding: '7px 10px', borderBottom: `1px solid ${C.lineSoft}` }}>
        I called — what happened?
      </div>
      {CALL_OUTCOMES.map((o) => (
        <button
          key={o}
          onClick={() => onPick(o)}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            fontFamily: FONT,
            fontSize: 12.5,
            fontWeight: 700,
            padding: '8px 10px',
            background: 'none',
            border: 'none',
            borderBottom: `1px solid ${C.lineSoft}`,
            cursor: 'pointer',
            color: C.inkSoft,
          }}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

function LossPicker({
  onConfirm,
  onCancel,
}: {
  onConfirm: (reason: string) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState('Price')
  const [other, setOther] = useState('')
  const final =
    reason === 'Other' ? (other.trim() ? `Other — ${other.trim()}` : '') : reason
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{ ...inp, padding: '4px 6px', fontSize: 11.5 }}
      >
        {LOSS_REASONS.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      {reason === 'Other' && (
        <input
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder="what happened?"
          style={{ ...inp, padding: '4px 6px', fontSize: 11.5, width: 130 }}
        />
      )}
      <Quiet onClick={() => final && onConfirm(final)}>confirm</Quiet>
      <Quiet onClick={onCancel}>✕</Quiet>
    </span>
  )
}

/* ---------- main ---------- */
export default function TodayClient({
  user,
  target,
  newLeads,
  todayTrials,
  noShows,
  tomorrowTrials,
  weekTrials,
  unverifiedSales,
  programmes,
  checklistItems,
  completedItemIds,
  blockoutDays,
}: {
  user: AppUser
  target: Target | null
  newLeads: LeadWithGuardian[]
  todayTrials: LeadWithGuardian[]
  noShows: LeadWithGuardian[]
  tomorrowTrials: LeadWithGuardian[]
  weekTrials: LeadWithGuardian[]
  unverifiedSales: LeadWithGuardian[]
  programmes: Programme[]
  checklistItems: ChecklistItem[]
  completedItemIds: string[]
  blockoutDays: BlockoutDay[]
}) {
  const [, startTransition] = useTransition()
  const [openId, setOpenId] = useState<string | null>(null)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [enrolId, setEnrolId] = useState<string | null>(null)
  const [callFor, setCallFor] = useState<string | null>(null)
  const [lossFor, setLossFor] = useState<string | null>(null)
  const [weekOpen, setWeekOpen] = useState(false)
  // arrived is logged on the timeline only; track it locally for the step UI
  const [arrived, setArrived] = useState<Record<string, boolean>>({})
  const [done, setDone] = useState<Set<string>>(new Set(completedItemIds))

  const isAdmin = user.role === 'admin' || user.role === 'management'
  const allLeads = [
    ...newLeads,
    ...todayTrials,
    ...noShows,
    ...tomorrowTrials,
    ...weekTrials,
    ...unverifiedSales,
  ]
  const byId = (id: string) => allLeads.find((l) => l.id === id)
  const familyOf = (l: LeadWithGuardian) =>
    allLeads.filter((x) => x.guardian_id === l.guardian_id)

  const run = (fn: () => Promise<unknown>) => startTransition(() => void fn())

  /* ----- target maths ----- */
  const goal = target?.net_growth_goal ?? 0
  // Net members so far = verified sales this month. Only verified sales count
  // (rule 8); the Today screen only loads unverified sales, so verified net = 0
  // here. The Stats screen owns the full verified figure.
  const verifiedNet = 0
  const toGo = Math.max(0, goal - verifiedNet)
  const pct = goal > 0 ? Math.min(100, Math.round((verifiedNet / goal) * 100)) : 0

  // operating days left = Mon–Sat from today to end of month, minus blockouts
  const opDaysLeft = (() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    const blocked = new Set(blockoutDays.map((b) => b.day))
    let n = 0
    for (
      let d = new Date(today);
      d <= end;
      d = new Date(d.getTime() + 86400000)
    ) {
      if (d.getDay() === 0) continue // Sunday
      const key = d.toISOString().slice(0, 10)
      if (blocked.has(key)) continue
      n++
    }
    return n
  })()
  const perDay = opDaysLeft > 0 ? (toGo / opDaysLeft).toFixed(1) : '—'

  const monthLabel = new Date().toLocaleDateString('en-AU', { month: 'long' })
  const siteLabel = user.site ? SITE_LABEL[user.site] ?? user.site : 'All sites'

  /* ----- action handlers ----- */
  const doCall = (l: LeadWithGuardian, outcome: string) => {
    setCallFor(null)
    if (outcome === 'Spoke — booking now') {
      run(() => logCallOutcome(l.id, outcome, user.id))
      setBookingId(l.id)
      return
    }
    run(() => logCallOutcome(l.id, outcome, user.id))
  }

  /* ===================== render ===================== */
  const openLead = openId ? byId(openId) : null
  const bookingLead = bookingId ? byId(bookingId) : null
  const enrolLead = enrolId ? byId(enrolId) : null

  return (
    <div style={{ fontFamily: FONT, color: C.ink }}>
      {/* 1. TARGET BAR */}
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.line}`,
          borderLeft: `4px solid ${C.orange}`,
          borderRadius: 6,
          padding: '14px 18px',
          marginBottom: 22,
          display: 'flex',
          gap: 22,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1.2, color: C.muted }}>
            {siteLabel} · {monthLabel} target
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.1 }}>
            +{verifiedNet}{' '}
            <span style={{ fontSize: 14, color: C.muted, fontWeight: 800 }}>
              of +{goal} net members
            </span>
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
            {opDaysLeft} operating days left (Mon–Sat) · ≈{perDay} per day
          </div>
        </div>
      </div>

      {/* 2. NEW LEADS */}
      <Panel
        head="New leads — call & book"
        badge={<Tag tone="yellow" solid>act now</Tag>}
        sub={
          <span style={{ fontSize: 12, fontWeight: 800, color: newLeads.length ? C.yellow : C.green }}>
            {newLeads.length ? `${newLeads.length} waiting` : 'all booked'}
          </span>
        }
      >
        {newLeads.length === 0 && <Empty>No new leads right now.</Empty>}
        {newLeads.map((l) => {
          const mins = Math.max(
            0,
            Math.round((Date.now() - new Date(l.received_at).getTime()) / 60000)
          )
          return (
            <div
              key={l.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr auto',
                gap: 10,
                alignItems: 'center',
                padding: '10px 12px',
                borderBottom: `1px solid ${C.lineSoft}`,
              }}
            >
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.inkSoft }}>
                  {fmtTime(l.received_at)}
                </div>
                <div style={{ fontSize: 11, fontWeight: 900, color: mins > 240 ? C.red : C.yellow }}>
                  {waitLabel(mins)} waiting
                </div>
              </div>
              <div>
                <WhoCell l={l} onOpen={() => setOpenId(l.id)} />
                <div style={{ marginTop: 3, display: 'flex', gap: 5 }}>
                  {!l.contacted ? (
                    <Tag tone="red" solid>
                      not contacted yet
                    </Tag>
                  ) : l.last_outcome === 'Spoke — call back later' ? (
                    <Tag tone="yellow">spoke — call back later</Tag>
                  ) : (
                    <Tag tone="yellow">
                      {l.attempts} call{l.attempts > 1 ? 's' : ''} · not reached
                    </Tag>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', position: 'relative' }}>
                <Next onClick={() => setCallFor(callFor === l.id ? null : l.id)}>📞 Call to book</Next>
                <Quiet onClick={() => setBookingId(l.id)}>book directly</Quiet>
                {callFor === l.id && (
                  <div style={{ position: 'absolute', top: '105%', right: 0 }}>
                    <CallMenu onPick={(o) => doCall(l, o)} onClose={() => setCallFor(null)} />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </Panel>

      {/* 3. TODAY'S TRIALS */}
      <Panel
        head="Today's trials — the sale happens here"
        badge={<Tag tone="green" solid>today</Tag>}
        sub={
          <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>
            ① arrived → ② outcome: 💰 sale or didn&apos;t enrol
          </span>
        }
      >
        {todayTrials.length === 0 && noShows.length === 0 && (
          <Empty>No trials today.</Empty>
        )}
        {todayTrials.map((l) => {
          const isArrived = !!arrived[l.id]
          return (
            <div
              key={l.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '56px 1fr 170px 230px',
                gap: 10,
                alignItems: 'center',
                padding: '10px 12px',
                borderBottom: `1px solid ${C.lineSoft}`,
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 14 }}>{fmtTime(l.trial_at)}</div>
              <div>
                <WhoCell l={l} onOpen={() => setOpenId(l.id)} />
                <div style={{ marginTop: 3 }}>
                  {l.form_received ? <Tag tone="green">form ✓</Tag> : <Tag tone="grey">form pending</Tag>}
                </div>
              </div>
              {/* step 1 */}
              <div>
                {isArrived ? (
                  <span
                    onClick={() => setArrived((a) => ({ ...a, [l.id]: false }))}
                    title="Click to undo"
                    style={{ cursor: 'pointer' }}
                  >
                    <StepDot done label="arrived" />
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <Quiet
                      onClick={() => {
                        setArrived((a) => ({ ...a, [l.id]: true }))
                        run(() => markArrived(l.id, user.id))
                      }}
                    >
                      ① Arrived ✓
                    </Quiet>
                    <Quiet onClick={() => run(() => markNoShow(l.id, user.id))}>no-show</Quiet>
                  </span>
                )}
              </div>
              {/* step 2 */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                {!isArrived ? (
                  <span style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    ② outcome — after arrival
                  </span>
                ) : lossFor === l.id ? (
                  <LossPicker
                    onConfirm={(reason) => {
                      setLossFor(null)
                      run(() => markDidntEnrol(l.id, reason, user.id))
                    }}
                    onCancel={() => setLossFor(null)}
                  />
                ) : (
                  <>
                    <Sale onClick={() => setEnrolId(l.id)}>💰 Make the sale</Sale>
                    <Quiet onClick={() => setLossFor(l.id)}>didn&apos;t enrol</Quiet>
                  </>
                )}
              </div>
            </div>
          )
        })}

        {noShows.map((l) => (
          <div
            key={l.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 10,
              alignItems: 'center',
              padding: '10px 12px',
              borderBottom: `1px solid ${C.lineSoft}`,
            }}
          >
            <div>
              <WhoCell l={l} onOpen={() => setOpenId(l.id)} />
              <div style={{ marginTop: 3 }}>
                <Tag tone="red">no-show — reach out &amp; re-book</Tag>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Quiet onClick={() => setOpenId(l.id)}>send text</Quiet>
              <Next onClick={() => setBookingId(l.id)}>Re-book</Next>
            </div>
          </div>
        ))}
      </Panel>

      {/* 4. SALES TO PROCESS */}
      {unverifiedSales.length > 0 && (
        <Panel
          head="💰 Sales to process — enter in iClassPro"
          badge={<Tag tone="yellow">pending admin</Tag>}
          sub={
            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>
              tick each, then admin verifies the sale
            </span>
          }
        >
          {unverifiedSales.map((l) => (
            <SaleRow
              key={l.id}
              lead={l}
              isAdmin={isAdmin}
              onOpen={() => setOpenId(l.id)}
              onVerify={() => run(() => verifyLead(l.id, user.id))}
            />
          ))}
        </Panel>
      )}

      {/* 5. TOMORROW */}
      <Panel
        head="Tomorrow — confirmations & forms"
        sub={<span style={{ fontSize: 12, fontWeight: 800, color: C.muted }}>{tomorrowTrials.length} booked</span>}
      >
        {tomorrowTrials.length === 0 && <Empty>Nothing booked tomorrow.</Empty>}
        {tomorrowTrials.map((l) => (
          <TomorrowRow
            key={l.id}
            lead={l}
            onOpen={() => setOpenId(l.id)}
            onConfirm={() => run(() => sendConfirmation(l.id, user.id))}
          />
        ))}
      </Panel>

      {/* 6. LATER THIS WEEK */}
      <button
        onClick={() => setWeekOpen(!weekOpen)}
        style={{
          fontFamily: FONT,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 900,
          color: C.muted,
          padding: '0 0 6px',
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        }}
      >
        {weekOpen ? '▾' : '▸'} Later this week · {weekTrials.length} booked
      </button>
      {weekOpen && (
        <Panel head="Later this week">
          {weekTrials.length === 0 && <Empty>Nothing else this week.</Empty>}
          {weekTrials.map((l) => (
            <TomorrowRow
              key={l.id}
              lead={l}
              onOpen={() => setOpenId(l.id)}
              onConfirm={() => run(() => sendConfirmation(l.id, user.id))}
            />
          ))}
        </Panel>
      )}

      {/* 7. DAILY CHECKLIST */}
      <Panel head="Daily checklist" sub={<span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>tick each as you go</span>}>
        {checklistItems.length === 0 && <Empty>No checklist items set up.</Empty>}
        {checklistItems.map((item) => {
          const isDone = done.has(item.id)
          return (
            <label
              key={item.id}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                padding: '10px 14px',
                borderBottom: `1px solid ${C.lineSoft}`,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 800,
                color: isDone ? C.muted : C.inkSoft,
                textDecoration: isDone ? 'line-through' : 'none',
              }}
            >
              <input
                type="checkbox"
                checked={isDone}
                onChange={(e) => {
                  const next = e.target.checked
                  setDone((s) => {
                    const n = new Set(s)
                    if (next) n.add(item.id)
                    else n.delete(item.id)
                    return n
                  })
                  run(() => toggleChecklist(item.id, user.id, next))
                }}
                style={{ width: 16, height: 16, accentColor: C.green }}
              />
              {item.label}
            </label>
          )
        })}
      </Panel>

      {/* MODALS / PANELS */}
      {openLead && (
        <Profile
          lead={openLead}
          family={familyOf(openLead)}
          programmes={programmes}
          onClose={() => setOpenId(null)}
          onBook={(l) => {
            setOpenId(null)
            setBookingId(l.id)
          }}
          onSale={(l) => {
            setOpenId(null)
            setEnrolId(l.id)
          }}
          onLogCall={(l, o) => run(() => logCallOutcome(l.id, o, user.id))}
          onOpenChild={(l) => setOpenId(l.id)}
        />
      )}

      {bookingLead && (
        <BookingModal
          lead={bookingLead}
          programmes={programmes}
          onClose={() => setBookingId(null)}
          onConfirm={(trialAt, progId) => {
            setBookingId(null)
            run(() => bookTrial(bookingLead.id, trialAt, progId, user.id))
          }}
        />
      )}

      {enrolLead && (
        <EnrolModal
          lead={enrolLead}
          onClose={() => setEnrolId(null)}
          onConfirm={(date, slot, pay) => {
            setEnrolId(null)
            run(() => makeSale(enrolLead.id, date, slot, pay, user.id))
          }}
        />
      )}
    </div>
  )
}

/* ---------- leaf components ---------- */
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '14px', fontSize: 12.5, fontWeight: 700, color: C.muted }}>
      {children}
    </div>
  )
}

function StepDot({ done, label }: { done?: boolean; label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 10.5,
        fontWeight: 800,
        color: done ? C.green : C.muted,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 99,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          background: done ? C.green : C.greyBg,
          color: done ? '#fff' : C.muted,
          border: `1px solid ${done ? C.greenDark : C.line}`,
        }}
      >
        {done ? '✓' : ''}
      </span>
      {label}
    </span>
  )
}

function TomorrowRow({
  lead,
  onOpen,
  onConfirm,
}: {
  lead: LeadWithGuardian
  onOpen: () => void
  onConfirm: () => void
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '56px 1fr auto',
        gap: 10,
        alignItems: 'center',
        padding: '8px 12px',
        borderBottom: `1px solid ${C.lineSoft}`,
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 13 }}>{fmtTime(lead.trial_at)}</div>
      <div>
        <WhoCell l={lead} onOpen={onOpen} />
        <div style={{ marginTop: 3 }}>
          {lead.form_received ? <Tag tone="green">form ✓</Tag> : <Tag tone="grey">form pending</Tag>}
        </div>
      </div>
      <div>
        {lead.confirmation_sent_at ? (
          <Tag tone="green">confirmed ✓</Tag>
        ) : (
          <Next onClick={onConfirm}>Send confirmation</Next>
        )}
      </div>
    </div>
  )
}

function SaleRow({
  lead,
  isAdmin,
  onOpen,
  onVerify,
}: {
  lead: LeadWithGuardian
  isAdmin: boolean
  onOpen: () => void
  onVerify: () => void
}) {
  // LOCAL-only iClassPro checklist (visual confirmation workflow, not persisted)
  const [ticks, setTicks] = useState({ classEnrolled: false, regoPaid: false, paymentSetup: false })
  const allTicked = ticks.classEnrolled && ticks.regoPaid && ticks.paymentSetup
  const items: [keyof typeof ticks, string][] = [
    ['classEnrolled', 'Class enrolled'],
    ['regoPaid', 'Rego & insurance paid'],
    ['paymentSetup', 'Payment details set up'],
  ]
  return (
    <div
      style={{
        padding: '10px 14px',
        borderBottom: `1px solid ${C.lineSoft}`,
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <div>
        <WhoCell l={lead} onOpen={onOpen} />
        {lead.first_class_date && (
          <div style={{ fontSize: 11.5, fontWeight: 800, color: C.green, marginTop: 2 }}>
            first class {fmtDate(lead.first_class_date)}
            {lead.first_class ? ` · ${lead.first_class}` : ''}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginLeft: 'auto', alignItems: 'center' }}>
        {items.map(([k, label]) => (
          <label
            key={k}
            style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11.5, fontWeight: 800, color: C.inkSoft, cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={ticks[k]}
              onChange={() => setTicks((t) => ({ ...t, [k]: !t[k] }))}
              style={{ accentColor: C.green }}
            />
            {label}
          </label>
        ))}
        {allTicked ? (
          isAdmin ? (
            <Sale onClick={onVerify}>Admin: verify sale</Sale>
          ) : (
            <Tag tone="yellow">Awaiting admin verification</Tag>
          )
        ) : (
          <Tag tone="grey">finish checklist</Tag>
        )}
      </div>
    </div>
  )
}
