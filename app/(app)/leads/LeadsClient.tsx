'use client'

import { useState, useTransition, useMemo } from 'react'
import type { AppUser, Lead, Guardian, Activity, Programme } from '@/types'
import {
  logCallOutcome, bookTrial, markNoShow, makeSale,
  markDidntEnrol, markLost, sendConfirmation, verifyLead, addNote, archiveLead, createLead,
} from './actions'
import { logText, logEmail } from '../today/actions'

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

  const isAdmin = user.role === 'admin' || user.role === 'management'
  const prog = programmes.find(p => p.id === lead.programme_id)
  const statusC = STATUS_COLOURS[lead.status] ?? { background: '#6B7280', color: C.WHITE }
  const leadActivities = activities.filter(a => a.lead_id === lead.id)

  function submitNote() {
    if (!note.trim()) return
    startTransition(async () => {
      await addNote(lead.id, user.id, note.trim())
      setNote('')
    })
  }

  function doArchive() {
    const reason = window.prompt('Reason for archiving (e.g. Spam / test enquiry, Duplicate record, Entered in error, Parent requested removal, Other):')
    if (!reason?.trim()) return
    startTransition(async () => {
      await archiveLead(lead.id, user.id, reason.trim())
      onClose()
    })
  }

  // Fields already shown in structured sections — exclude from the extra info dump
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

  return (
    <>
      {showBooking && <BookingModal leadId={lead.id} userId={user.id} programmes={programmes} onClose={() => setShowBooking(false)} />}
      {showEnrol && <EnrolModal leadId={lead.id} userId={user.id} formReceived={lead.form_received} onClose={() => setShowEnrol(false)} />}
      {showLoss && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.WHITE, width: 360, padding: 24, border: `1px solid ${C.BORDER}` }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Didn&apos;t enrol — what now?</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {(['nurture', 'lost'] as const).map(m => (
                <button key={m} onClick={() => setLossMode(m)} style={{
                  flex: 1, padding: '8px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  background: lossMode === m ? C.INK : C.WHITE,
                  color: lossMode === m ? C.WHITE : C.MUTED,
                  border: `1px solid ${lossMode === m ? C.INK : C.BORDER}`,
                }}>
                  {m === 'nurture' ? '🌱 Nurture' : '✗ Lost'}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: lossMode === 'nurture' ? C.MUTED : C.RED, marginBottom: 10 }}>
              {lossMode === 'nurture' ? 'Follow up later — stays in system with a future date' : 'Dead lead — no further follow-up'}
            </div>
            <label style={{ fontSize: 12, color: C.MUTED, display: 'block', marginBottom: 4 }}>Reason</label>
            <select value={lossReason} onChange={e => setLossReason(e.target.value)}
              style={{ width: '100%', padding: '8px', border: `1px solid ${C.BORDER}`, fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}>
              {LOSS_REASONS.map(r => <option key={r}>{r}</option>)}
            </select>
            {lossMode === 'nurture' && (
              <>
                <label style={{ fontSize: 12, color: C.MUTED, display: 'block', marginBottom: 4 }}>Follow-up date</label>
                <input type="date" value={lossFollowup} onChange={e => setLossFollowup(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: `1px solid ${C.BORDER}`, fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }} />
              </>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowLoss(false)} style={{ flex: 1, padding: '10px', border: `1px solid ${C.BORDER}`, background: C.WHITE, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
              <button onClick={() => {
                setShowLoss(false)
                if (lossMode === 'nurture') startTransition(() => markDidntEnrol(lead.id, lossReason, user.id, lossFollowup))
                else startTransition(() => markLost(lead.id, lossReason, user.id))
              }} style={{ flex: 1, padding: '10px', background: C.INK, color: C.WHITE, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                {lossMode === 'nurture' ? 'Move to nurture' : 'Mark lost'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ position: 'fixed', inset: 0, zIndex: 200 }} onClick={onClose} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, maxWidth: '100vw',
        background: C.WHITE, borderLeft: `3px solid ${C.ORANGE}`, zIndex: 201,
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{lead.child_first} {lead.child_last}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ ...statusC, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{STATUS_LABELS[lead.status]}</span>
              {prog && <span style={{ padding: '2px 8px', fontSize: 11, background: '#E5E7EB', color: C.INK, fontWeight: 600 }}>{prog.name}</span>}
              {lead.site && <span style={{ padding: '2px 8px', fontSize: 11, background: '#E5E7EB', color: C.MUTED }}>{lead.site === 'coolaroo' ? 'Coolaroo' : 'Altona North'}</span>}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: C.MUTED, lineHeight: 1.6 }}>
              <span>Enquired {fmtDate(lead.received_at)}</span>
              {lead.source && <span> · {lead.source}</span>}
              {lead.trial_at && <span> · Trial {fmtDateTime(lead.trial_at)}</span>}
            </div>
            {guardian && (
              <div style={{ marginTop: 4, fontSize: 12, color: C.INK, fontWeight: 600 }}>
                {guardian.first_name} {guardian.last_name} · {guardian.phone}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.MUTED, lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 120px' }}>
          {/* Child details */}
          <Section title="Child">
            <Row label="Date of birth" value={lead.dob ? `${fmtDate(lead.dob)} (${age(lead.dob)})` : '—'} />
            <Row label="Gender" value={lead.gender ?? '—'} />
            <Row label="Source" value={lead.source ?? '—'} />
            {lead.referrer_name && <Row label="Referred by" value={lead.referrer_name} />}
            {utmCampaign && <Row label="Campaign" value={utmCampaign} />}
            <Row label="Jotform received" value={lead.form_received ? '✓ Yes' : '✗ No'} valueColor={lead.form_received ? C.GREEN : C.RED} />
          </Section>

          {/* Guardian */}
          {guardian && (
            <Section title="Guardian">
              <Row label="Name" value={`${guardian.first_name} ${guardian.last_name}`} />
              <Row label="Phone" value={guardian.phone} />
              {guardian.email && <Row label="Email" value={guardian.email} />}
              {guardian.preferred_contact && <Row label="Preferred contact" value={guardian.preferred_contact} />}
            </Section>
          )}

          {/* Family */}
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

          {/* Trial info */}
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

          {/* Nurture */}
          {lead.status === 'nurture' && lead.nurture_followup_at && (
            <Section title="Nurture">
              <Row label="Follow-up date" value={fmtDate(lead.nurture_followup_at)} />
              {lead.lost_reason && <Row label="Reason" value={lead.lost_reason} />}
            </Section>
          )}

          {/* Extra fields from enquiry not already shown above */}
          {extraFields.length > 0 && (
            <Section title="Additional info">
              {extraFields.map(([k, v]) => (
                <Row key={k} label={fmtFieldLabel(k)} value={String(v)} longText={String(v).length > 60} />
              ))}
            </Section>
          )}

          {/* Add note */}
          <Section title="Add note">
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              placeholder="Type a note…"
              style={{ width: '100%', padding: 8, border: `1px solid ${C.BORDER}`, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            <button onClick={submitNote} disabled={!note.trim() || pending}
              style={{ marginTop: 6, padding: '8px 16px', background: C.INK, color: C.WHITE, border: 'none', cursor: 'pointer', fontSize: 13, opacity: !note.trim() ? 0.5 : 1 }}>
              {pending ? 'Saving…' : 'Add note'}
            </button>
          </Section>

          {/* Timeline */}
          <Section title="Timeline">
            {leadActivities.length === 0 && <div style={{ fontSize: 13, color: C.MUTED }}>No activity yet</div>}
            {leadActivities.map(a => (
              <div key={a.id} style={{ borderLeft: `2px solid ${C.BORDER}`, paddingLeft: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: C.MUTED }}>{new Date(a.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</div>
                <div style={{ fontSize: 13 }}>{a.body}</div>
              </div>
            ))}
          </Section>
        </div>

        {/* Action bar */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: C.WHITE, borderTop: `1px solid ${C.BORDER}`, padding: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }}>
          {/* Call dropdown */}
          <div style={{ position: 'relative', display: 'flex' }}>
            <button onClick={() => setShowCallMenu(v => !v)}
              style={{ padding: '9px 12px', background: C.INK, color: C.WHITE, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              📞 Call ▾
            </button>
            {showCallMenu && (
              <div style={{ position: 'absolute', bottom: '100%', left: 0, background: C.WHITE, border: `1px solid ${C.BORDER}`, zIndex: 10, minWidth: 200 }}>
                {CALL_OUTCOMES.map(o => (
                  <button key={o} onClick={() => {
                    setShowCallMenu(false)
                    startTransition(() => logCallOutcome(lead.id, o, user.id))
                  }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13 }}>
                    {o}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => startTransition(() => logText(lead.id, user.id))}
            style={{ padding: '9px 12px', background: C.WHITE, color: C.INK, border: `1px solid ${C.BORDER}`, cursor: 'pointer', fontSize: 13 }}>
            💬 Log text
          </button>
          <button onClick={() => startTransition(() => logEmail(lead.id, user.id))}
            style={{ padding: '9px 12px', background: C.WHITE, color: C.INK, border: `1px solid ${C.BORDER}`, cursor: 'pointer', fontSize: 13 }}>
            ✉ Log email
          </button>

          {(lead.status === 'new' || lead.status === 'noshow') && (
            <button onClick={() => setShowBooking(true)}
              style={{ padding: '9px 14px', background: C.ORANGE, color: C.WHITE, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {lead.status === 'noshow' ? 'Re-book' : 'Book Trial'}
            </button>
          )}

          {lead.status === 'booked' && (
            <>
              {!lead.confirmation_sent_at && (
                <button onClick={() => startTransition(() => sendConfirmation(lead.id, user.id))}
                  style={{ padding: '9px 14px', background: C.ORANGE, color: C.WHITE, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  Send confirmation
                </button>
              )}
              <button onClick={() => setShowEnrol(true)}
                style={{ padding: '9px 14px', background: C.GREEN, color: C.WHITE, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                💰 Make Sale
              </button>
              <button onClick={() => setShowLoss(true)}
                style={{ padding: '9px 14px', background: C.WHITE, color: C.RED, border: `1px solid ${C.RED}`, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Didn&apos;t enrol
              </button>
              <button onClick={() => { if (confirm('Mark as no-show?')) startTransition(() => markNoShow(lead.id, user.id)) }}
                style={{ padding: '9px 14px', background: C.WHITE, color: C.RED, border: `1px solid ${C.RED}`, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                No-show
              </button>
            </>
          )}

          {lead.status === 'won' && !lead.verified_at && isAdmin && (
            <button onClick={() => startTransition(() => verifyLead(lead.id, user.id))}
              style={{ padding: '9px 14px', background: C.GREEN, color: C.WHITE, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              Verify Sale ✓
            </button>
          )}

          {isAdmin && (
            <button onClick={doArchive}
              style={{ padding: '9px 14px', background: C.WHITE, color: C.RED, border: `1px solid ${C.RED}`, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              Archive
            </button>
          )}
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
      if (statusFilter !== 'all' && l.status !== statusFilter) return false
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

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: isAdmin ? 8 : 16, flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            style={{
              padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: statusFilter === s ? C.ORANGE : C.WHITE,
              color: statusFilter === s ? C.WHITE : C.INK,
              border: `1px solid ${statusFilter === s ? C.ORANGE : C.BORDER}`,
            }}>
            {STATUS_FILTER_LABELS[s]}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: C.MUTED, alignSelf: 'center' }}>{filtered.length} lead{filtered.length !== 1 ? 's' : ''}</span>
        <button onClick={() => setShowAddModal(true)}
          style={{ padding: '5px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: C.ORANGE, color: C.WHITE, border: 'none' }}>
          + Add lead
        </button>
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
