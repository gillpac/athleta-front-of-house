'use client'

import { useState, useTransition, useMemo } from 'react'
import type { AppUser, Lead, Guardian, Activity, Programme } from '@/types'
import {
  logCallOutcome, bookTrial, markNoShow, makeSale,
  markDidntEnrol, markLost, sendConfirmation, verifyLead, addNote, archiveLead, createLead,
} from './actions'
import { logText, logEmail, updateLeadProfile, archiveLeadWithReason } from '../today/actions'

const C = {
  SAND: '#F6F3EE',
  WHITE: '#FFFFFF',
  INK: '#17130E',
  MUTED: '#84776A',
  BORDER: '#D9CFC2',
  ORANGE: '#E26839',
  GREEN: '#3A7D44',
  RED: '#C0392B',
  YELLOW: '#B7791F',
  YELLOW_BG: '#FFFBEB',
}

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  booked: 'Booked',
  noshow: 'No-show',
  won: 'Enrolled',
  nurture: 'Nurture',
  lost: 'Lost',
}

const STATUS_COLOURS: Record<string, { background: string; color: string }> = {
  new: { background: C.RED, color: C.WHITE },
  booked: { background: '#D97706', color: C.WHITE },
  noshow: { background: '#D97706', color: C.WHITE },
  won: { background: C.GREEN, color: C.WHITE },
  nurture: { background: '#6B7280', color: C.WHITE },
  lost: { background: '#9CA3AF', color: C.WHITE },
}

const LOSS_REASONS = ['Too expensive', 'Not the right time', 'Too far away', 'Chose another gym', 'Other']
const CALL_OUTCOMES = ['No answer', 'Left voicemail', 'Spoke — call back later', 'Spoke — booking now']

function age(dob: string | null): string {
  if (!dob) return '—'
  const d = new Date(dob)
  const now = new Date()
  const y = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  const adj = m < 0 || (m === 0 && now.getDate() < d.getDate()) ? 1 : 0
  return `${y - adj} yrs`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

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

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

function waitTime(receivedAt: string): { label: string; color: string } {
  const mins = (Date.now() - new Date(receivedAt).getTime()) / 60000
  if (mins > 240) return { label: `${Math.floor(mins / 60)}h`, color: C.RED }
  if (mins > 60) return { label: `${Math.floor(mins / 60)}h ${Math.floor(mins % 60)}m`, color: C.YELLOW }
  return { label: `${Math.floor(mins)}m`, color: C.MUTED }
}

interface Props {
  user: AppUser
  leads: Lead[]
  guardians: Guardian[]
  activities: Activity[]
  programmes: Programme[]
}

interface BookingModalProps {
  leadId: string
  userId: string
  programmes: Programme[]
  onClose: () => void
}

function BookingModal({ leadId, userId, programmes, onClose }: BookingModalProps) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [progId, setProgId] = useState('')
  const [pending, startTransition] = useTransition()

  function submit() {
    if (!date || !time) return
    const trialAt = `${date}T${time}:00`
    startTransition(async () => {
      await bookTrial(leadId, trialAt, progId || null, userId)
      onClose()
    })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: C.WHITE, width: 360, padding: 24, border: `1px solid ${C.BORDER}` }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Book Trial</div>
        <label style={{ fontSize: 12, color: C.MUTED, display: 'block', marginBottom: 4 }}>Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ width: '100%', padding: '8px', border: `1px solid ${C.BORDER}`, fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} />
        <label style={{ fontSize: 12, color: C.MUTED, display: 'block', marginBottom: 4 }}>Time</label>
        <input type="time" value={time} onChange={e => setTime(e.target.value)}
          style={{ width: '100%', padding: '8px', border: `1px solid ${C.BORDER}`, fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} />
        <label style={{ fontSize: 12, color: C.MUTED, display: 'block', marginBottom: 4 }}>Programme</label>
        <select value={progId} onChange={e => setProgId(e.target.value)}
          style={{ width: '100%', padding: '8px', border: `1px solid ${C.BORDER}`, fontSize: 14, marginBottom: 20, boxSizing: 'border-box' }}>
          <option value="">— select —</option>
          {programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', border: `1px solid ${C.BORDER}`, background: C.WHITE, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
          <button onClick={submit} disabled={!date || !time || pending}
            style={{ flex: 1, padding: '10px', background: C.ORANGE, color: C.WHITE, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: (!date || !time) ? 0.5 : 1 }}>
            {pending ? 'Booking…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface EnrolModalProps {
  leadId: string
  userId: string
  formReceived: boolean
  onClose: () => void
}

function EnrolModal({ leadId, userId, formReceived, onClose }: EnrolModalProps) {
  const [firstClassDate, setFirstClassDate] = useState('')
  const [firstClass, setFirstClass] = useState('')
  const [paymentTaken, setPaymentTaken] = useState(false)
  const [pending, startTransition] = useTransition()

  function submit() {
    if (!firstClassDate || !firstClass) return
    startTransition(async () => {
      await makeSale(leadId, firstClassDate, firstClass, paymentTaken, userId)
      onClose()
    })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: C.WHITE, width: 360, padding: 24, border: `1px solid ${C.BORDER}` }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Make the Sale</div>
        {!formReceived && (
          <div style={{ background: C.YELLOW_BG, border: `1px solid #D97706`, padding: '8px 12px', fontSize: 12, color: '#92400E', marginBottom: 12 }}>
            ⚠️ Enrolment form not yet received
          </div>
        )}
        <label style={{ fontSize: 12, color: C.MUTED, display: 'block', marginBottom: 4 }}>First class date</label>
        <input type="date" value={firstClassDate} onChange={e => setFirstClassDate(e.target.value)}
          style={{ width: '100%', padding: '8px', border: `1px solid ${C.BORDER}`, fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} />
        <label style={{ fontSize: 12, color: C.MUTED, display: 'block', marginBottom: 4 }}>First class (day/time)</label>
        <input type="text" placeholder="e.g. Tuesday 4:30pm" value={firstClass} onChange={e => setFirstClass(e.target.value)}
          style={{ width: '100%', padding: '8px', border: `1px solid ${C.BORDER}`, fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 20, cursor: 'pointer' }}>
          <input type="checkbox" checked={paymentTaken} onChange={e => setPaymentTaken(e.target.checked)} />
          Rego & insurance paid
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', border: `1px solid ${C.BORDER}`, background: C.WHITE, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
          <button onClick={submit} disabled={!firstClassDate || !firstClass || pending}
            style={{ flex: 1, padding: '10px', background: C.GREEN, color: C.WHITE, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: (!firstClassDate || !firstClass) ? 0.5 : 1 }}>
            {pending ? 'Saving…' : '💰 Enrol'}
          </button>
        </div>
      </div>
    </div>
  )
}

const LPROFILE_FONT = "'Nunito', system-ui, sans-serif"
const LC = {
  ink: '#17130E', orange: '#E26839', orangeDark: '#B94E22',
  bg: '#F6F3EE', card: '#FFFFFF', sand: '#EFE8DE',
  line: '#D9CFC2', lineSoft: '#E8E1D6', muted: '#84776A',
  green: '#27865C', greenDark: '#1E6B49', greenBg: '#DFF0E6',
  yellow: '#9A7409', yellowBg: '#FBF1CF',
  red: '#B23A24', redBg: '#F6DCD4', grey: '#6E655B', greyBg: '#ECE7DF',
}
const LINP: React.CSSProperties = { fontFamily: LPROFILE_FONT, fontSize: 13, fontWeight: 600, padding: '7px 9px', borderRadius: 4, border: `1px solid ${LC.line}`, background: '#fff' }
const LLBL: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700, color: LC.muted, marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: 0.5 }

function LBtn({ children, onClick, color = LC.orange, disabled }: { children: React.ReactNode; onClick?: () => void; color?: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ fontFamily: LPROFILE_FONT, fontWeight: 700, fontSize: 12, cursor: disabled ? 'default' : 'pointer', borderRadius: 4, padding: '6px 12px', background: disabled ? LC.greyBg : color, color: '#fff', border: 'none', opacity: disabled ? 0.6 : 1 }}>
      {children}
    </button>
  )
}
function LQuiet({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{ fontFamily: LPROFILE_FONT, fontWeight: 600, fontSize: 11.5, cursor: 'pointer', borderRadius: 4, padding: '6px 10px', background: 'transparent', color: LC.muted, border: `1px solid ${LC.lineSoft}` }}>
      {children}
    </button>
  )
}

const ARCHIVE_REASONS_L = ['Spam / test enquiry', 'Duplicate record', 'Entered in error', 'Parent requested removal', 'Other']

function LeadsArchiveModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (r: string) => void }) {
  const [reason, setReason] = useState(ARCHIVE_REASONS_L[0])
  const [other, setOther] = useState('')
  const final = reason === 'Other' ? (other.trim() ? `Other — ${other.trim()}` : '') : reason
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,19,14,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 320 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 6, padding: '20px 22px', width: 360, maxWidth: '90vw', borderTop: `3px solid ${LC.red}` }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 900, color: LC.red }}>Archive this lead?</h3>
        <p style={{ margin: '0 0 14px', fontSize: 12.5, color: LC.muted }}>Select a reason — used for reporting.</p>
        <label style={LLBL}>Reason
          <select value={reason} onChange={e => setReason(e.target.value)} style={LINP}>
            {ARCHIVE_REASONS_L.map(r => <option key={r}>{r}</option>)}
          </select>
        </label>
        {reason === 'Other' && (
          <label style={{ ...LLBL, marginTop: 8 }}>Details
            <input value={other} onChange={e => setOther(e.target.value)} placeholder="Brief reason…" style={LINP} />
          </label>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <LQuiet onClick={onClose}>Cancel</LQuiet>
          <button onClick={() => final && onConfirm(final)} disabled={!final}
            style={{ fontFamily: LPROFILE_FONT, fontWeight: 700, fontSize: 12, cursor: final ? 'pointer' : 'default', padding: '7px 14px', background: final ? LC.red : LC.greyBg, color: final ? '#fff' : LC.muted, border: 'none', borderRadius: 4 }}>
            Archive lead
          </button>
        </div>
      </div>
    </div>
  )
}

function LeadsEditModal({ lead, guardian, programmes, onClose, onArchive, onSave }: {
  lead: Lead; guardian: Guardian | undefined; programmes: Programme[]
  onClose: () => void; onArchive: () => void
  onSave: (lf: { child_first: string; child_last: string; dob: string | null; gender: string | null; programme_id: string | null }, gf: { first_name: string; last_name: string; phone: string; email: string | null; preferred_contact: string | null; secondary_contact_note: string | null }) => void
}) {
  const g = guardian
  const [childFirst, setChildFirst] = useState(lead.child_first)
  const [childLast, setChildLast] = useState(lead.child_last)
  const [dob, setDob] = useState(lead.dob ?? '')
  const [gender, setGender] = useState(lead.gender ?? '')
  const [progId, setProgId] = useState(lead.programme_id ?? '')
  const [firstName, setFirstName] = useState(g?.first_name ?? '')
  const [lastName, setLastName] = useState(g?.last_name ?? '')
  const [phone, setPhone] = useState(g?.phone ?? '')
  const [email, setEmail] = useState(g?.email ?? '')
  const [prefContact, setPrefContact] = useState(g?.preferred_contact ?? '')
  const [secondContact, setSecondContact] = useState(g?.secondary_contact_note ?? '')

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(23,19,14,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 310 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 6, padding: '22px 24px', width: 440, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto', borderTop: `3px solid ${LC.orange}` }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>Edit profile — {lead.child_first} {lead.child_last}</h3>
          <LQuiet onClick={onClose}>✕</LQuiet>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: LC.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Child</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <label style={LLBL}>First name<input value={childFirst} onChange={e => setChildFirst(e.target.value)} style={LINP} /></label>
          <label style={LLBL}>Last name<input value={childLast} onChange={e => setChildLast(e.target.value)} style={LINP} /></label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <label style={LLBL}>Date of birth<input type="date" value={dob} onChange={e => setDob(e.target.value)} style={LINP} /></label>
          <label style={LLBL}>Gender<select value={gender} onChange={e => setGender(e.target.value)} style={LINP}><option value="">—</option><option>Male</option><option>Female</option><option>Other</option></select></label>
        </div>
        <label style={{ ...LLBL, marginBottom: 14 }}>Programme
          <select value={progId} onChange={e => setProgId(e.target.value)} style={LINP}>
            <option value="">— unassigned —</option>
            {programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div style={{ fontSize: 11, fontWeight: 700, color: LC.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Guardian</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <label style={LLBL}>First name<input value={firstName} onChange={e => setFirstName(e.target.value)} style={LINP} /></label>
          <label style={LLBL}>Last name<input value={lastName} onChange={e => setLastName(e.target.value)} style={LINP} /></label>
        </div>
        <label style={LLBL}>Phone<input value={phone} onChange={e => setPhone(e.target.value)} style={LINP} /></label>
        <label style={LLBL}>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} style={LINP} /></label>
        <label style={LLBL}>Preferred contact<select value={prefContact} onChange={e => setPrefContact(e.target.value)} style={LINP}><option value="">—</option><option>Phone call</option><option>Text / SMS</option><option>Email</option></select></label>
        <label style={{ ...LLBL, marginBottom: 16 }}>Second guardian / contact
          <textarea value={secondContact} onChange={e => setSecondContact(e.target.value)} placeholder="e.g. Dad — John Smith, 0412 345 678" rows={2} style={{ ...LINP, resize: 'vertical' as const }} />
        </label>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={onArchive} style={{ fontFamily: LPROFILE_FONT, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '6px 10px', background: 'none', border: `1px solid ${LC.line}`, color: LC.red }}>Archive lead…</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <LQuiet onClick={onClose}>Cancel</LQuiet>
            <LBtn onClick={() => onSave({ child_first: childFirst.trim(), child_last: childLast.trim(), dob: dob || null, gender: gender || null, programme_id: progId || null }, { first_name: firstName.trim(), last_name: lastName.trim(), phone: phone.trim(), email: email.trim() || null, preferred_contact: prefContact || null, secondary_contact_note: secondContact.trim() || null })}>Save changes</LBtn>
          </div>
        </div>
      </div>
    </div>
  )
}

interface ProfilePanelProps {
  lead: Lead
  guardian: Guardian | undefined
  siblings: Lead[]
  activities: Activity[]
  programmes: Programme[]
  user: AppUser
  onClose: () => void
}

function ProfilePanel({ lead, guardian, siblings, activities, programmes, user, onClose }: ProfilePanelProps) {
  const [note, setNote] = useState('')
  const [pending, startTransition] = useTransition()
  const [showBooking, setShowBooking] = useState(false)
  const [showEnrol, setShowEnrol] = useState(false)
  const [showLoss, setShowLoss] = useState(false)
  const [lossMode, setLossMode] = useState<'nurture' | 'lost'>('nurture')
  const [lossReason, setLossReason] = useState('Price')
  const [lossFollowup, setLossFollowup] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0] })
  const [showCallMenu, setShowCallMenu] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [textMsgOpen, setTextMsgOpen] = useState(false)
  const [textMsg, setTextMsg] = useState('')

  const isAdmin = user.role === 'admin' || user.role === 'management'
  const prog = programmes.find(p => p.id === lead.programme_id)
  const leadActivities = [...activities.filter(a => a.lead_id === lead.id)].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const KNOWN_FIELDS = new Set([
    'site', 'phone', 'email', 'parent_first', 'parent_last', 'preferred_contact', 'relationship',
    'source', 'referrer_name', 'utm_source', 'utm_medium', 'utm_campaign',
    'child_first_1', 'child_last_1', 'dob_1', 'gender_1', 'programme_name_1', 'interest_1',
    'child_first_2', 'child_last_2', 'dob_2', 'gender_2', 'programme_name_2', 'interest_2',
    'child_first_3', 'child_last_3', 'dob_3', 'gender_3', 'programme_name_3', 'interest_3',
    'child_first_4', 'child_last_4', 'dob_4', 'gender_4', 'programme_name_4', 'interest_4',
  ])
  const extraFields = lead.enquiry_raw
    ? Object.entries(lead.enquiry_raw).filter(([k, v]) => !KNOWN_FIELDS.has(k) && v !== null && v !== '' && v !== undefined)
    : []
  const utmCampaign = lead.enquiry_raw?.utm_campaign as string | undefined
  const bookable = lead.status === 'new' || lead.status === 'noshow' || lead.status === 'nurture'
  const statusColors: Record<string, string> = { new: C.RED, booked: C.YELLOW, noshow: C.RED, won: C.GREEN, nurture: C.MUTED, lost: C.MUTED }
  const statusBg = statusColors[lead.status] ?? C.MUTED

  return (
    <>
      {showBooking && <BookingModal leadId={lead.id} userId={user.id} programmes={programmes} onClose={() => setShowBooking(false)} />}
      {showEnrol && <EnrolModal leadId={lead.id} userId={user.id} formReceived={lead.form_received} onClose={() => setShowEnrol(false)} />}
      {showLoss && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 310, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.WHITE, width: 360, padding: 24, border: `1px solid ${C.BORDER}` }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Didn&apos;t enrol — what now?</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {(['nurture', 'lost'] as const).map(m => (
                <button key={m} onClick={() => setLossMode(m)} style={{ flex: 1, padding: '8px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: lossMode === m ? C.INK : C.WHITE, color: lossMode === m ? C.WHITE : C.MUTED, border: `1px solid ${lossMode === m ? C.INK : C.BORDER}` }}>
                  {m === 'nurture' ? '🌱 Nurture' : '✗ Lost'}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: lossMode === 'nurture' ? C.MUTED : C.RED, marginBottom: 10 }}>
              {lossMode === 'nurture' ? 'Follow up later — stays in system with a future date' : 'Dead lead — no further follow-up'}
            </div>
            <label style={{ fontSize: 12, color: C.MUTED, display: 'block', marginBottom: 4 }}>Reason</label>
            <select value={lossReason} onChange={e => setLossReason(e.target.value)} style={{ width: '100%', padding: '8px', border: `1px solid ${C.BORDER}`, fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}>
              {LOSS_REASONS.map(r => <option key={r}>{r}</option>)}
            </select>
            {lossMode === 'nurture' && (
              <>
                <label style={{ fontSize: 12, color: C.MUTED, display: 'block', marginBottom: 4 }}>Follow-up date</label>
                <input type="date" value={lossFollowup} onChange={e => setLossFollowup(e.target.value)} style={{ width: '100%', padding: '8px', border: `1px solid ${C.BORDER}`, fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} />
              </>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowLoss(false)} style={{ flex: 1, padding: '10px', border: `1px solid ${C.BORDER}`, background: C.WHITE, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
              <button onClick={() => { setShowLoss(false); if (lossMode === 'nurture') startTransition(() => markDidntEnrol(lead.id, lossReason, user.id, lossFollowup)); else startTransition(() => markLost(lead.id, lossReason, user.id)) }}
                style={{ flex: 1, padding: '10px', background: C.INK, color: C.WHITE, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                {lossMode === 'nurture' ? 'Move to nurture' : 'Mark lost'}
              </button>
            </div>
          </div>
        </div>
      )}
      {editOpen && (
        <LeadsEditModal
          lead={lead} guardian={guardian} programmes={programmes}
          onClose={() => setEditOpen(false)}
          onArchive={() => { setEditOpen(false); setArchiveOpen(true) }}
          onSave={(lf, gf) => { setEditOpen(false); if (guardian) startTransition(() => updateLeadProfile(lead.id, guardian.id, user.id, lf, gf)) }}
        />
      )}
      {archiveOpen && (
        <LeadsArchiveModal
          onClose={() => setArchiveOpen(false)}
          onConfirm={(reason) => { setArchiveOpen(false); onClose(); startTransition(() => archiveLeadWithReason(lead.id, user.id, reason)) }}
        />
      )}

      <div style={{ position: 'fixed', inset: 0, zIndex: 200 }} onClick={onClose} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, maxWidth: '100vw', background: '#fff', borderLeft: `3px solid ${LC.orange}`, zIndex: 201, display: 'flex', flexDirection: 'column' }}>
        {/* Header — fixed, non-scrollable */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${LC.line}`, background: '#FCFAF7', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 900, fontSize: 18, color: LC.ink }}>{lead.child_first} {lead.child_last}</div>
              <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ background: statusBg, color: '#fff', fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: 0.4 }}>{STATUS_LABELS[lead.status]}</span>
                {prog && <span style={{ fontSize: 11, fontWeight: 400, color: LC.muted }}>{prog.name}</span>}
              </div>
              <div style={{ marginTop: 5, fontSize: 12, color: LC.muted, fontWeight: 400 }}>
                Enquired {fmtDate(lead.received_at)}{lead.source ? ` · ${lead.source}` : ''}{lead.trial_at ? ` · Trial ${fmtDateTime(lead.trial_at)}` : ''}
              </div>
              {guardian && (
                <div style={{ fontSize: 12.5, fontWeight: 400, color: LC.ink, marginTop: 2 }}>
                  {guardian.first_name} {guardian.last_name} · {guardian.phone}
                </div>
              )}
              {siblings.length > 0 && (
                <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: LC.muted }}>FAMILY:</span>
                  {siblings.map(s => (
                    <span key={s.id} style={{ fontSize: 11, fontWeight: 400, background: LC.sand, border: `1px solid ${LC.line}`, padding: '2px 7px', color: LC.ink }}>{s.child_first} · {STATUS_LABELS[s.status]}</span>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <LQuiet onClick={() => setEditOpen(true)}>Edit</LQuiet>
              <LQuiet onClick={onClose}>✕</LQuiet>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              <LBtn onClick={() => setShowCallMenu(v => !v)} color={LC.ink}>📞 Call</LBtn>
              {showCallMenu && (
                <div style={{ position: 'absolute', top: '105%', left: 0, background: '#fff', border: `1px solid ${LC.line}`, zIndex: 10, minWidth: 220, boxShadow: '0 6px 20px rgba(0,0,0,.15)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: LC.muted, textTransform: 'uppercase', letterSpacing: 1, padding: '6px 10px', borderBottom: `1px solid ${LC.lineSoft}` }}>I called — what happened?</div>
                  {CALL_OUTCOMES.map(o => (
                    <button key={o} onClick={() => { setShowCallMenu(false); startTransition(() => logCallOutcome(lead.id, o, user.id)) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', fontFamily: LPROFILE_FONT, fontSize: 12.5, fontWeight: 400, padding: '8px 10px', background: 'none', border: 'none', borderBottom: `1px solid ${LC.lineSoft}`, cursor: 'pointer', color: LC.ink }}>
                      {o}
                    </button>
                  ))}
                  <button onClick={() => { setShowCallMenu(false); setTextMsgOpen(true) }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', fontFamily: LPROFILE_FONT, fontSize: 12.5, fontWeight: 400, padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer', color: LC.muted }}>
                    Other — add a note
                  </button>
                </div>
              )}
            </div>
            <LQuiet onClick={() => { setTextMsgOpen(v => !v); setTextMsg('') }}>💬 Log text</LQuiet>
            <LQuiet onClick={() => startTransition(() => logEmail(lead.id, user.id))}>✉ Log email</LQuiet>
            {bookable && <LBtn onClick={() => setShowBooking(true)}>{lead.status === 'noshow' ? 'Re-book trial' : 'Book trial'}</LBtn>}
            {(lead.status === 'booked' || lead.status === 'nurture') && (
              <LBtn onClick={() => setShowEnrol(true)} color={LC.green}>💰 Make the sale</LBtn>
            )}
            {lead.status === 'booked' && !lead.confirmation_sent_at && (
              <LQuiet onClick={() => startTransition(() => sendConfirmation(lead.id, user.id))}>Send confirmation</LQuiet>
            )}
            {lead.status === 'booked' && <LQuiet onClick={() => setShowLoss(true)}>Didn&apos;t enrol</LQuiet>}
            {lead.status === 'booked' && <LQuiet onClick={() => { if (window.confirm('Mark as no-show?')) startTransition(() => markNoShow(lead.id, user.id)) }}>No-show</LQuiet>}
            {lead.status === 'won' && !lead.verified_at && isAdmin && <LBtn onClick={() => startTransition(() => verifyLead(lead.id, user.id))} color={LC.green}>Verify sale ✓</LBtn>}
          </div>

          {/* Log text inline */}
          {textMsgOpen && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input value={textMsg} onChange={e => setTextMsg(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && textMsg.trim()) { startTransition(() => logText(lead.id, user.id, textMsg.trim())); setTextMsg(''); setTextMsgOpen(false) } }}
                placeholder="What did you send?" autoFocus
                style={{ flex: 1, padding: '6px 8px', border: `1px solid ${LC.line}`, fontSize: 12, fontFamily: LPROFILE_FONT }} />
              <button onClick={() => { if (textMsg.trim()) { startTransition(() => logText(lead.id, user.id, textMsg.trim())); setTextMsg(''); setTextMsgOpen(false) } }}
                style={{ fontFamily: LPROFILE_FONT, fontWeight: 700, fontSize: 12, padding: '6px 12px', background: LC.ink, color: '#fff', border: 'none', cursor: 'pointer' }}>Log</button>
            </div>
          )}

          {/* Jotform / verification status */}
          <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {lead.form_received
              ? <span style={{ fontSize: 10.5, fontWeight: 700, color: LC.green, background: LC.greenBg, padding: '2px 8px', borderRadius: 3 }}>Jotform ✓</span>
              : lead.form_sent_at
                ? <span style={{ fontSize: 10.5, fontWeight: 600, color: LC.yellow, background: LC.yellowBg, padding: '2px 8px', borderRadius: 3 }}>Jotform pending</span>
                : null}
            {lead.status === 'won' && (lead.verified_at
              ? <span style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', background: LC.green, padding: '2px 8px', borderRadius: 3 }}>Sale verified ✓</span>
              : <span style={{ fontSize: 10.5, fontWeight: 600, color: LC.yellow, background: LC.yellowBg, padding: '2px 8px', borderRadius: 3 }}>Sale — pending admin</span>)}
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
          {/* Child details */}
          <Section title="Child">
            <Row label="Date of birth" value={lead.dob ? `${fmtDate(lead.dob)} (${age(lead.dob)})` : '—'} />
            {lead.gender && <Row label="Gender" value={lead.gender} />}
            <Row label="Source" value={lead.source ?? '—'} />
            {lead.referrer_name && <Row label="Referred by" value={lead.referrer_name} />}
            {utmCampaign && <Row label="Campaign" value={utmCampaign} />}
            <Row label="Jotform" value={lead.form_received ? '✓ Received' : lead.form_sent_at ? '⧗ Sent — awaiting return' : '— not yet sent'} valueColor={lead.form_received ? C.GREEN : lead.form_sent_at ? C.YELLOW : C.MUTED} />
          </Section>

          {guardian && (
            <Section title="Guardian">
              <Row label="Name" value={`${guardian.first_name} ${guardian.last_name}`} />
              <Row label="Phone" value={guardian.phone} />
              {guardian.email && <Row label="Email" value={guardian.email} />}
              {guardian.preferred_contact && <Row label="Preferred contact" value={guardian.preferred_contact} />}
              {guardian.secondary_contact_note && <Row label="Second contact" value={guardian.secondary_contact_note} longText={guardian.secondary_contact_note.length > 50} />}
            </Section>
          )}

          {siblings.length > 0 && (
            <Section title="Family">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {siblings.map(s => {
                  const sc = STATUS_COLOURS[s.status] ?? { background: '#6B7280', color: C.WHITE }
                  return (
                    <span key={s.id} style={{ ...sc, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                      {s.child_first} · {STATUS_LABELS[s.status]}
                    </span>
                  )
                })}
              </div>
            </Section>
          )}

          {(lead.trial_at || lead.status === 'won') && (
            <Section title="Trial / Enrolment">
              {lead.trial_at && <Row label="Trial" value={fmtDateTime(lead.trial_at)} />}
              {lead.confirmation_sent_at && <Row label="Confirmation sent" value={fmtDateTime(lead.confirmation_sent_at)} valueColor={C.GREEN} />}
              {lead.sold_at && <Row label="Enrolled" value={fmtDateTime(lead.sold_at)} />}
              {lead.first_class && <Row label="First class" value={`${lead.first_class_date ? fmtDate(lead.first_class_date) : ''} ${lead.first_class}`} />}
              {lead.payment_taken !== undefined && <Row label="Payment taken" value={lead.payment_taken ? '✓ Yes' : '✗ No'} valueColor={lead.payment_taken ? C.GREEN : C.RED} />}
              {lead.verified_at && <Row label="Admin verified" value={fmtDateTime(lead.verified_at)} valueColor={C.GREEN} />}
            </Section>
          )}

          {lead.status === 'nurture' && lead.nurture_followup_at && (
            <Section title="Nurture">
              <Row label="Follow-up date" value={fmtDate(lead.nurture_followup_at)} />
              {lead.lost_reason && <Row label="Reason" value={lead.lost_reason} />}
            </Section>
          )}

          {extraFields.length > 0 && (
            <Section title="Additional info">
              {extraFields.map(([k, v]) => (
                <Row key={k} label={fmtFieldLabel(k)} value={String(v)} longText={String(v).length > 60} />
              ))}
            </Section>
          )}

          <Section title="Add note">
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={note} onChange={e => setNote(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && note.trim()) { startTransition(() => addNote(lead.id, user.id, note.trim())); setNote('') } }}
                placeholder="Add a note…" style={{ flex: 1, padding: '7px 8px', border: `1px solid ${LC.line}`, fontSize: 13, fontFamily: LPROFILE_FONT }} />
              <button onClick={() => { if (note.trim()) { startTransition(() => addNote(lead.id, user.id, note.trim())); setNote('') } }} disabled={!note.trim() || pending}
                style={{ padding: '7px 14px', background: LC.ink, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: LPROFILE_FONT, opacity: !note.trim() ? 0.5 : 1 }}>
                {pending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </Section>

          <Section title="Timeline">
            {leadActivities.map(a => (
              <div key={a.id} style={{ borderLeft: `2px solid ${LC.line}`, paddingLeft: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: LC.muted, fontWeight: 400 }}>{new Date(a.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</div>
                <div style={{ fontSize: 12.5, color: LC.ink }}>{a.body}</div>
              </div>
            ))}
            <div style={{ borderLeft: `2px solid ${LC.lineSoft}`, paddingLeft: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: LC.muted, fontWeight: 400 }}>{fmtDate(lead.received_at)} · {lead.source ?? 'unknown source'}</div>
              <div style={{ fontSize: 12.5, color: LC.muted }}>Enquiry received</div>
            </div>
          </Section>
        </div>
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

function Row({ label, value, valueColor, longText }: { label: string; value: string; valueColor?: string; longText?: boolean }) {
  if (longText) {
    return (
      <div style={{ fontSize: 13, padding: '4px 0', borderBottom: `1px solid ${C.BORDER}` }}>
        <div style={{ color: C.MUTED, marginBottom: 3 }}>{label}</div>
        <div style={{ color: valueColor ?? C.INK, fontWeight: 500 }}>{value}</div>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: `1px solid ${C.BORDER}` }}>
      <span style={{ color: C.MUTED }}>{label}</span>
      <span style={{ color: valueColor ?? C.INK, fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{value}</span>
    </div>
  )
}

const SOURCES = ['walk-in', 'phone enquiry', 'website', 'facebook', 'instagram', 'referral', 'other']
const RELATIONSHIPS = ['Mother', 'Father', 'Carer', 'Guardian']

function AddLeadModal({ user, programmes, onClose }: { user: AppUser; programmes: Programme[]; onClose: () => void }) {
  const [pending, startTransition] = useTransition()
  const isAdmin = user.role === 'admin' || user.role === 'management'
  const [f, setF] = useState({
    childFirst: '', childLast: '', dob: '', gender: '', programmeId: '', site: user.site ?? 'coolaroo',
    source: 'walk-in', referrerName: '', notes: '',
    guardianFirst: '', guardianLast: '', phone: '', email: '', relationship: 'Mother',
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF(p => ({ ...p, [k]: e.target.value }))

  function submit() {
    if (!f.childFirst.trim() || !f.guardianFirst.trim() || !f.phone.trim()) return
    startTransition(async () => {
      await createLead({ ...f, dob: f.dob || null, gender: f.gender || null, programmeId: f.programmeId || null, referrerName: f.referrerName || null, notes: f.notes || null }, user.id)
      onClose()
    })
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: `1px solid ${C.BORDER}`, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' }
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: C.MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4, marginTop: 14 }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px' }}>
      <div style={{ background: C.WHITE, width: '100%', maxWidth: 480, padding: 24, border: `1px solid ${C.BORDER}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Add lead</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.MUTED }}>×</button>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: C.MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Child</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}><label style={label}>First name *</label><input value={f.childFirst} onChange={set('childFirst')} style={inp} /></div>
          <div style={{ flex: 1 }}><label style={label}>Last name</label><input value={f.childLast} onChange={set('childLast')} style={inp} /></div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}><label style={label}>Date of birth</label><input type="date" value={f.dob} onChange={set('dob')} style={inp} /></div>
          <div style={{ flex: 1 }}><label style={label}>Gender</label>
            <select value={f.gender} onChange={set('gender')} style={inp}>
              <option value="">—</option>
              <option>Female</option><option>Male</option><option>Other</option>
            </select>
          </div>
        </div>
        <label style={label}>Programme interest</label>
        <select value={f.programmeId} onChange={set('programmeId')} style={inp}>
          <option value="">—</option>
          {programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <div style={{ fontSize: 11, fontWeight: 700, color: C.MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 18, marginBottom: 8 }}>Guardian</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}><label style={label}>First name *</label><input value={f.guardianFirst} onChange={set('guardianFirst')} style={inp} /></div>
          <div style={{ flex: 1 }}><label style={label}>Last name</label><input value={f.guardianLast} onChange={set('guardianLast')} style={inp} /></div>
        </div>
        <label style={label}>Phone *</label><input value={f.phone} onChange={set('phone')} style={inp} placeholder="04xx xxx xxx" />
        <label style={label}>Email</label><input type="email" value={f.email} onChange={set('email')} style={inp} />
        <label style={label}>Relationship</label>
        <select value={f.relationship} onChange={set('relationship')} style={inp}>
          {RELATIONSHIPS.map(r => <option key={r}>{r}</option>)}
        </select>

        <div style={{ fontSize: 11, fontWeight: 700, color: C.MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 18, marginBottom: 8 }}>Enquiry</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}><label style={label}>Source</label>
            <select value={f.source} onChange={set('source')} style={inp}>
              {SOURCES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          {isAdmin && (
            <div style={{ flex: 1 }}><label style={label}>Site</label>
              <select value={f.site} onChange={set('site')} style={inp}>
                <option value="coolaroo">Coolaroo</option>
                <option value="altona_north">Altona North</option>
              </select>
            </div>
          )}
        </div>
        {f.source === 'referral' && (
          <><label style={label}>Referred by</label><input value={f.referrerName} onChange={set('referrerName')} style={inp} /></>
        )}
        <label style={label}>Notes</label>
        <textarea value={f.notes} onChange={set('notes')} rows={3} placeholder="Any additional notes…" style={{ ...inp, resize: 'vertical' }} />

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', border: `1px solid ${C.BORDER}`, background: C.WHITE, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
          <button onClick={submit} disabled={!f.childFirst.trim() || !f.guardianFirst.trim() || !f.phone.trim() || pending}
            style={{ flex: 2, padding: '10px', background: C.ORANGE, color: C.WHITE, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, opacity: (!f.childFirst.trim() || !f.guardianFirst.trim() || !f.phone.trim()) ? 0.5 : 1 }}>
            {pending ? 'Saving…' : 'Add lead'}
          </button>
        </div>
      </div>
    </div>
  )
}

const STATUS_FILTERS = ['all', 'new', 'booked', 'noshow', 'won', 'nurture'] as const
const STATUS_FILTER_LABELS: Record<string, string> = { all: 'All', new: 'New', booked: 'Booked', noshow: 'No-show', won: 'Enrolled', nurture: 'Nurture' }

// Granular pre-trial sub-filters for 'new' status
const PRE_TRIAL_FILTERS = [
  { key: 'new_all', label: 'All new' },
  { key: 'new_uncontacted', label: 'Not contacted' },
  { key: 'new_contacted', label: 'Contacted — not booked' },
]
const POST_TRIAL_FILTERS = [
  { key: 'booked', label: 'Booked for trial' },
  { key: 'noshow', label: 'No-show' },
  { key: 'won', label: 'Enrolled' },
  { key: 'nurture', label: 'Nurture' },
  { key: 'lost', label: 'Lost' },
]
const DATE_FILTERS = ['all', 'today', 'this_week', 'last_week', 'this_month', 'last_month', 'custom'] as const
const DATE_FILTER_LABELS: Record<string, string> = { all: 'All dates', today: 'Today', this_week: 'This week', last_week: 'Last week', this_month: 'This month', last_month: 'Last month', custom: 'Custom range…' }

function isInDateRange(isoDate: string, filter: string, customFrom?: string, customTo?: string): boolean {
  if (filter === 'all') return true
  const d = new Date(isoDate)
  const now = new Date()
  const startOfDay = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())
  const today = startOfDay(now)
  if (filter === 'today') return d >= today && d < new Date(today.getTime() + 86400000)
  const day = now.getDay()
  const monday = new Date(today); monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
  if (filter === 'this_week') return d >= monday
  const lastMonday = new Date(monday); lastMonday.setDate(monday.getDate() - 7)
  if (filter === 'last_week') return d >= lastMonday && d < monday
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  if (filter === 'this_month') return d >= firstOfMonth
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  if (filter === 'last_month') return d >= firstOfLastMonth && d < firstOfMonth
  if (filter === 'custom') {
    if (customFrom && d < new Date(customFrom + 'T00:00:00')) return false
    if (customTo && d > new Date(customTo + 'T23:59:59')) return false
    return true
  }
  return true
}

export default function LeadsClient({ user, leads, guardians, activities, programmes }: Props) {
  const isAdmin = user.role === 'admin' || user.role === 'management'
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [siteFilter, setSiteFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  const guardianMap = useMemo(() => {
    const m: Record<string, Guardian> = {}
    for (const g of guardians) m[g.id] = g
    return m
  }, [guardians])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return leads.filter(l => {
      if (statusFilter === 'new_all' && l.status !== 'new') return false
      if (statusFilter === 'new_uncontacted' && !(l.status === 'new' && !l.contacted)) return false
      if (statusFilter === 'new_contacted' && !(l.status === 'new' && l.contacted)) return false
      if (statusFilter !== 'all' && !statusFilter.startsWith('new_') && l.status !== statusFilter) return false
      if (siteFilter !== 'all' && l.site !== siteFilter) return false
      if (!isInDateRange(l.received_at, dateFilter, customFrom, customTo)) return false
      if (!q) return true
      const g = guardianMap[l.guardian_id]
      const childName = `${l.child_first} ${l.child_last}`.toLowerCase()
      const guardianName = g ? `${g.first_name} ${g.last_name}`.toLowerCase() : ''
      const phone = g?.phone ?? ''
      return childName.includes(q) || guardianName.includes(q) || phone.includes(q)
    })
  }, [leads, statusFilter, siteFilter, dateFilter, customFrom, customTo, search, guardianMap])

  const selectedLead = selectedId ? leads.find(l => l.id === selectedId) : null
  const siblings = selectedLead
    ? leads.filter(l => l.guardian_id === selectedLead.guardian_id && l.id !== selectedLead.id)
    : []

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Search */}
      <input
        type="search"
        placeholder="Search by child name, guardian name or phone…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', padding: '10px 14px', border: `1px solid ${C.BORDER}`, fontSize: 14, marginBottom: 12, boxSizing: 'border-box', background: C.WHITE }}
      />

      {/* Status filters — two rows */}
      <div style={{ marginBottom: isAdmin ? 8 : 16 }}>
        {/* Row 1: pre-trial (new leads) */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.MUTED, textTransform: 'uppercase', letterSpacing: 1, marginRight: 2 }}>New leads</span>
          <button onClick={() => setStatusFilter('all')}
            style={{ padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: statusFilter === 'all' ? C.ORANGE : C.WHITE, color: statusFilter === 'all' ? C.WHITE : C.INK, border: `1px solid ${statusFilter === 'all' ? C.ORANGE : C.BORDER}` }}>
            All
          </button>
          {PRE_TRIAL_FILTERS.map(f => (
            <button key={f.key} onClick={() => setStatusFilter(f.key)}
              style={{ padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: statusFilter === f.key ? C.ORANGE : C.WHITE, color: statusFilter === f.key ? C.WHITE : C.INK, border: `1px solid ${statusFilter === f.key ? C.ORANGE : C.BORDER}` }}>
              {f.label}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: C.MUTED, alignSelf: 'center' }}>{filtered.length} lead{filtered.length !== 1 ? 's' : ''}</span>
          <button onClick={() => setShowAddModal(true)}
            style={{ padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: C.ORANGE, color: C.WHITE, border: 'none' }}>
            + Add lead
          </button>
        </div>
        {/* Row 2: post-trial */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.MUTED, textTransform: 'uppercase', letterSpacing: 1, marginRight: 2 }}>Trials &amp; beyond</span>
          {POST_TRIAL_FILTERS.map(f => (
            <button key={f.key} onClick={() => setStatusFilter(f.key)}
              style={{ padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: statusFilter === f.key ? C.INK : C.WHITE, color: statusFilter === f.key ? C.WHITE : C.MUTED, border: `1px solid ${statusFilter === f.key ? C.INK : C.BORDER}` }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {isAdmin && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {(['all', 'coolaroo', 'altona_north'] as const).map(s => (
            <button key={s} onClick={() => setSiteFilter(s)}
              style={{
                padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: siteFilter === s ? C.INK : C.WHITE,
                color: siteFilter === s ? C.WHITE : C.INK,
                border: `1px solid ${siteFilter === s ? C.INK : C.BORDER}`,
              }}>
              {s === 'all' ? 'All sites' : s === 'coolaroo' ? 'Coolaroo' : 'Altona North'}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: C.MUTED, fontWeight: 600, whiteSpace: 'nowrap' }}>Date received:</label>
        <select value={dateFilter} onChange={e => setDateFilter(e.target.value)}
          style={{ padding: '5px 10px', fontSize: 12, border: `1px solid ${C.BORDER}`, background: C.WHITE, cursor: 'pointer' }}>
          {DATE_FILTERS.map(f => <option key={f} value={f}>{DATE_FILTER_LABELS[f]}</option>)}
        </select>
        {dateFilter === 'custom' && (
          <>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ padding: '5px 8px', fontSize: 12, border: `1px solid ${C.BORDER}`, background: C.WHITE }} />
            <span style={{ fontSize: 12, color: C.MUTED }}>to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ padding: '5px 8px', fontSize: 12, border: `1px solid ${C.BORDER}`, background: C.WHITE }} />
          </>
        )}
      </div>

      {/* Lead rows */}
      {filtered.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: C.MUTED, fontSize: 14 }}>No leads found</div>
      )}
      {filtered.map(lead => {
        const g = guardianMap[lead.guardian_id]
        const prog = programmes.find(p => p.id === lead.programme_id)
        const sc = STATUS_COLOURS[lead.status] ?? { bg: '#6B7280', color: C.WHITE }
        const wait = lead.status === 'new' ? waitTime(lead.received_at) : null

        return (
          <div key={lead.id}
            onClick={() => setSelectedId(lead.id)}
            style={{
              background: C.WHITE, border: `1px solid ${C.BORDER}`, marginBottom: 6,
              padding: '12px 16px', cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start',
            }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{lead.child_first} {lead.child_last}</span>
                <span style={{ ...sc, padding: '2px 7px', fontSize: 11, fontWeight: 600 }}>{STATUS_LABELS[lead.status]}</span>
                {prog && <span style={{ fontSize: 11, color: C.MUTED }}>{prog.name}</span>}
                {wait && <span style={{ fontSize: 11, color: wait.color, fontWeight: 600 }}>{wait.label}</span>}
              </div>
              <div style={{ fontSize: 12, color: C.MUTED, marginTop: 3 }}>
                {g ? `${g.first_name} ${g.last_name} · ${g.phone}` : '—'}
                {lead.trial_at && <span style={{ marginLeft: 10 }}>Trial: {fmtDateTime(lead.trial_at)}</span>}
              </div>
            </div>
            {isAdmin && (
              <div style={{ fontSize: 11, color: C.MUTED, whiteSpace: 'nowrap' }}>
                {lead.site === 'coolaroo' ? 'Coolaroo' : 'Altona North'}
              </div>
            )}
          </div>
        )
      })}

      {/* Profile panel */}
      {selectedLead && (
        <ProfilePanel
          lead={selectedLead}
          guardian={guardianMap[selectedLead.guardian_id]}
          siblings={siblings}
          activities={activities}
          programmes={programmes}
          user={user}
          onClose={() => setSelectedId(null)}
        />
      )}

      {showAddModal && (
        <AddLeadModal
          user={user}
          programmes={programmes}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}
