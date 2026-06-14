'use client'

import { useState, useTransition, useMemo } from 'react'
import type { AppUser, Lead, Guardian, Activity, Programme } from '@/types'
import {
  logCallOutcome, bookTrial, markNoShow, makeSale,
  markDidntEnrol, sendConfirmation, verifyLead, addNote, archiveLead,
} from './actions'

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

const STATUS_COLOURS: Record<string, { bg: string; color: string }> = {
  new: { bg: C.RED, color: C.WHITE },
  booked: { bg: '#D97706', color: C.WHITE },
  noshow: { bg: '#D97706', color: C.WHITE },
  won: { bg: C.GREEN, color: C.WHITE },
  nurture: { bg: '#6B7280', color: C.WHITE },
  lost: { bg: '#9CA3AF', color: C.WHITE },
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

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
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
  const [showCallMenu, setShowCallMenu] = useState(false)

  const isAdmin = user.role === 'admin' || user.role === 'management'
  const prog = programmes.find(p => p.id === lead.programme_id)
  const statusC = STATUS_COLOURS[lead.status] ?? { bg: '#6B7280', color: C.WHITE }
  const leadActivities = activities.filter(a => a.lead_id === lead.id)

  function submitNote() {
    if (!note.trim()) return
    startTransition(async () => {
      await addNote(lead.id, user.id, note.trim())
      setNote('')
    })
  }

  function doArchive() {
    if (!confirm('Archive this lead? This cannot be undone easily.')) return
    startTransition(async () => {
      await archiveLead(lead.id, user.id)
      onClose()
    })
  }

  const enquiryFields = lead.enquiry_raw
    ? Object.entries(lead.enquiry_raw).filter(([, v]) => v !== null && v !== '' && v !== undefined)
    : []

  return (
    <>
      {showBooking && <BookingModal leadId={lead.id} userId={user.id} programmes={programmes} onClose={() => setShowBooking(false)} />}
      {showEnrol && <EnrolModal leadId={lead.id} userId={user.id} formReceived={lead.form_received} onClose={() => setShowEnrol(false)} />}

      <div style={{ position: 'fixed', inset: 0, zIndex: 200 }} onClick={onClose} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '100vw',
        background: C.WHITE, borderLeft: `1px solid ${C.BORDER}`, zIndex: 201,
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{lead.child_first} {lead.child_last}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ ...statusC, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{STATUS_LABELS[lead.status]}</span>
              {prog && <span style={{ padding: '2px 8px', fontSize: 11, background: '#E5E7EB', color: C.INK }}>{prog.name}</span>}
              {lead.site && <span style={{ padding: '2px 8px', fontSize: 11, background: '#E5E7EB', color: C.MUTED }}>{lead.site === 'coolaroo' ? 'Coolaroo' : 'Altona North'}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.MUTED, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 120px' }}>
          {/* Child details */}
          <Section title="Child">
            <Row label="Date of birth" value={lead.dob ? `${fmtDate(lead.dob)} (${age(lead.dob)})` : '—'} />
            <Row label="Gender" value={lead.gender ?? '—'} />
            <Row label="Source" value={lead.source} />
            {lead.referrer_name && <Row label="Referred by" value={lead.referrer_name} />}
            <Row label="Form received" value={lead.form_received ? '✓ Yes' : '✗ No'} valueColor={lead.form_received ? C.GREEN : C.RED} />
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
                  const sc = STATUS_COLOURS[s.status] ?? { bg: '#6B7280', color: C.WHITE }
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

          {/* Enquiry */}
          {enquiryFields.length > 0 && (
            <Section title="Enquiry details">
              {enquiryFields.map(([k, v]) => (
                <Row key={k} label={k.replace(/_/g, ' ')} value={String(v)} />
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
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: C.WHITE, borderTop: `1px solid ${C.BORDER}`, padding: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Call dropdown */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowCallMenu(v => !v)}
              style={{ padding: '9px 12px', background: C.INK, color: C.WHITE, border: 'none', cursor: 'pointer', fontSize: 13 }}>
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
                  style={{ padding: '9px 14px', background: C.ORANGE, color: C.WHITE, border: 'none', cursor: 'pointer', fontSize: 13 }}>
                  Send confirmation
                </button>
              )}
              <button onClick={() => setShowEnrol(true)}
                style={{ padding: '9px 14px', background: C.GREEN, color: C.WHITE, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                💰 Make Sale
              </button>
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowLoss(v => !v)}
                  style={{ padding: '9px 14px', background: C.WHITE, color: C.RED, border: `1px solid ${C.RED}`, cursor: 'pointer', fontSize: 13 }}>
                  Didn&apos;t enrol ▾
                </button>
                {showLoss && (
                  <div style={{ position: 'absolute', bottom: '100%', left: 0, background: C.WHITE, border: `1px solid ${C.BORDER}`, zIndex: 10, minWidth: 180 }}>
                    {LOSS_REASONS.map(r => (
                      <button key={r} onClick={() => {
                        setShowLoss(false)
                        startTransition(() => markDidntEnrol(lead.id, r, user.id))
                      }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13 }}>
                        {r}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => { if (confirm('Mark as no-show?')) startTransition(() => markNoShow(lead.id, user.id)) }}
                style={{ padding: '9px 14px', background: C.WHITE, color: C.RED, border: `1px solid ${C.RED}`, cursor: 'pointer', fontSize: 13 }}>
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
              style={{ padding: '9px 14px', background: C.WHITE, color: C.RED, border: `1px solid ${C.RED}`, cursor: 'pointer', fontSize: 13 }}>
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

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: `1px solid ${C.BORDER}` }}>
      <span style={{ color: C.MUTED }}>{label}</span>
      <span style={{ color: valueColor ?? C.INK, fontWeight: 500 }}>{value}</span>
    </div>
  )
}

const STATUS_FILTERS = ['all', 'new', 'booked', 'noshow', 'won', 'nurture'] as const
const STATUS_FILTER_LABELS: Record<string, string> = { all: 'All', new: 'New', booked: 'Booked', noshow: 'No-show', won: 'Enrolled', nurture: 'Nurture' }

export default function LeadsClient({ user, leads, guardians, activities, programmes }: Props) {
  const isAdmin = user.role === 'admin' || user.role === 'management'
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [siteFilter, setSiteFilter] = useState<string>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

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
      if (!q) return true
      const g = guardianMap[l.guardian_id]
      const childName = `${l.child_first} ${l.child_last}`.toLowerCase()
      const guardianName = g ? `${g.first_name} ${g.last_name}`.toLowerCase() : ''
      const phone = g?.phone ?? ''
      return childName.includes(q) || guardianName.includes(q) || phone.includes(q)
    })
  }, [leads, statusFilter, siteFilter, search, guardianMap])

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
      </div>
      {isAdmin && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
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
    </div>
  )
}
