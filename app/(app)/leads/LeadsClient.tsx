'use client'

import { useState, useTransition, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import type { AppUser, Lead, Guardian, Activity, Programme } from '@/types'
import { createLead, bookTrial, makeSale } from './actions'
import { ProfilePanel } from '../components/ProfilePanel'

const C = {
  WHITE: '#ffffff',
  INK: '#23201d',
  HEAD: '#14110d',
  BODY: '#4a453f',
  MUTED: '#5f5851',
  FAINT: '#877f75',
  BORDER: '#efeae3',
  LINE2: '#e6e0d8',
  SOFT: '#faf8f6',
  ORANGE: '#E26839',
  GREEN: '#3f8f5e',
  RED: '#bf4a30',
  YELLOW: '#9A7409',
  YELLOW_BG: '#FBF1CF',
  SAND: '#f6f4f1',
}
const FONT = "'Nunito Sans', -apple-system, system-ui, sans-serif"

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  booked: 'Booked',
  noshow: 'No-show',
  won: 'Enrolled',
  nurture: 'Nurture',
  lost: 'Lost',
}

const STATUS_COLOURS: Record<string, { background: string; color: string; borderRadius: number }> = {
  new: { background: '#fde8e3', color: C.RED, borderRadius: 5 },
  booked: { background: '#FBF1CF', color: '#9A7409', borderRadius: 5 },
  noshow: { background: '#fde8e3', color: C.RED, borderRadius: 5 },
  won: { background: '#eef6f0', color: C.GREEN, borderRadius: 5 },
  nurture: { background: '#f3efe9', color: C.MUTED, borderRadius: 5 },
  lost: { background: '#f3efe9', color: C.FAINT, borderRadius: 5 },
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
  userNames: Record<string, string>
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

export default function LeadsClient({ user, leads, guardians, activities, programmes, userNames }: Props) {
  const isAdmin = user.role === 'admin' || user.role === 'management'
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [siteFilter, setSiteFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const searchParams = useSearchParams()
  useEffect(() => {
    if (searchParams.get('add') === '1') setShowAddModal(true)
  }, [searchParams])

  const guardianMap = useMemo(() => {
    const m: Record<string, Guardian> = {}
    for (const g of guardians) m[g.id] = g
    return m
  }, [guardians])

  const leadsWithGuardians = useMemo(() =>
    leads.flatMap(l => {
      const g = guardianMap[l.guardian_id]
      return g ? [{ ...l, guardians: g }] : []
    }), [leads, guardianMap])

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

  const filterBtn = (active: boolean, dark?: boolean): React.CSSProperties => ({
    padding: '5px 12px', fontSize: 12.5, fontWeight: active ? 600 : 500, cursor: 'pointer',
    borderRadius: 6, fontFamily: FONT,
    background: active ? (dark ? C.INK : C.ORANGE) : C.WHITE,
    color: active ? C.WHITE : C.MUTED,
    border: `1px solid ${active ? (dark ? C.INK : C.ORANGE) : C.LINE2}`,
  })

  return (
    <div style={{ maxWidth: 860 }}>
      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: C.SOFT, border: `1px solid ${C.LINE2}`, borderRadius: 8, padding: '9px 13px', marginBottom: 16 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.FAINT} strokeWidth="2.2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="search"
          placeholder="Search by child name, guardian name or phone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ border: 'none', background: 'none', outline: 'none', fontFamily: FONT, fontSize: 13.5, color: C.INK, width: '100%' }}
        />
      </div>

      {/* Status filters */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.FAINT, textTransform: 'uppercase', letterSpacing: 1, marginRight: 4 }}>New leads</span>
          <button onClick={() => setStatusFilter('all')} style={filterBtn(statusFilter === 'all')}>All</button>
          {PRE_TRIAL_FILTERS.map(f => (
            <button key={f.key} onClick={() => setStatusFilter(f.key)} style={filterBtn(statusFilter === f.key)}>{f.label}</button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: C.MUTED }}>{filtered.length} lead{filtered.length !== 1 ? 's' : ''}</span>
          <button onClick={() => setShowAddModal(true)} style={{ ...filterBtn(true), marginLeft: 8 }}>+ Add lead</button>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: C.FAINT, textTransform: 'uppercase', letterSpacing: 1, marginRight: 4 }}>Trials &amp; beyond</span>
          {POST_TRIAL_FILTERS.map(f => (
            <button key={f.key} onClick={() => setStatusFilter(f.key)} style={filterBtn(statusFilter === f.key, true)}>{f.label}</button>
          ))}
        </div>
      </div>

      {isAdmin && (
        <div style={{ display: 'inline-flex', background: '#f3efe9', borderRadius: 7, padding: 3, gap: 2, marginBottom: 10 }}>
          {(['all', 'coolaroo', 'altona_north'] as const).map(s => (
            <button key={s} onClick={() => setSiteFilter(s)} style={{
              fontFamily: FONT, border: 'none', fontSize: 12,
              background: siteFilter === s ? C.WHITE : 'none',
              color: siteFilter === s ? C.INK : C.MUTED,
              padding: '5px 11px', borderRadius: 5, cursor: 'pointer',
              fontWeight: siteFilter === s ? 600 : 500,
              boxShadow: siteFilter === s ? '0 1px 2px rgba(0,0,0,.07)' : 'none',
            }}>
              {s === 'all' ? 'All sites' : s === 'coolaroo' ? 'Coolaroo' : 'Altona North'}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12.5, color: C.MUTED, fontWeight: 600, whiteSpace: 'nowrap' }}>Date received:</label>
        <select value={dateFilter} onChange={e => setDateFilter(e.target.value)}
          style={{ padding: '5px 10px', fontSize: 12.5, border: `1px solid ${C.LINE2}`, background: C.WHITE, cursor: 'pointer', borderRadius: 6, fontFamily: FONT }}>
          {DATE_FILTERS.map(f => <option key={f} value={f}>{DATE_FILTER_LABELS[f]}</option>)}
        </select>
        {dateFilter === 'custom' && (
          <>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ padding: '5px 8px', fontSize: 12, border: `1px solid ${C.LINE2}`, background: C.WHITE, borderRadius: 6 }} />
            <span style={{ fontSize: 12, color: C.MUTED }}>to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ padding: '5px 8px', fontSize: 12, border: `1px solid ${C.LINE2}`, background: C.WHITE, borderRadius: 6 }} />
          </>
        )}
      </div>

      {/* Lead rows */}
      {filtered.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: C.MUTED, fontSize: 13 }}>No leads found</div>
      )}
      {filtered.map(lead => {
        const g = guardianMap[lead.guardian_id]
        const prog = programmes.find(p => p.id === lead.programme_id)
        const sc = STATUS_COLOURS[lead.status] ?? { background: '#f3efe9', color: C.MUTED, borderRadius: 5 }
        const wait = lead.status === 'new' ? waitTime(lead.received_at) : null

        return (
          <div key={lead.id}
            onClick={() => setSelectedId(lead.id)}
            style={{
              background: C.WHITE, border: `1px solid ${C.BORDER}`, borderRadius: 8, marginBottom: 6,
              padding: '13px 18px', cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start',
              fontFamily: FONT,
            }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: C.INK }}>{lead.child_first} {lead.child_last}</span>
                <span style={{ ...sc, padding: '2px 7px', fontSize: 11, fontWeight: 600 }}>{STATUS_LABELS[lead.status]}</span>
                {prog && <span style={{ fontSize: 11, color: C.MUTED, background: '#f4f0ea', padding: '2px 7px', borderRadius: 5 }}>{prog.name}</span>}
                {wait && <span style={{ fontSize: 11, color: wait.color, fontWeight: 600 }}>{wait.label}</span>}
              </div>
              <div style={{ fontSize: 13, color: '#524b43', marginTop: 3 }}>
                {g ? `${g.first_name} ${g.last_name}` : '—'}
              </div>
              <div style={{ fontSize: 13, color: C.MUTED, marginTop: 1 }}>
                {g?.phone}
                {lead.trial_at && <span style={{ marginLeft: 10 }}>Trial: {fmtDateTime(lead.trial_at)}</span>}
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: C.MUTED, whiteSpace: 'nowrap', textAlign: 'right', lineHeight: 1.7 }}>
              {isAdmin && <div>{lead.site === 'coolaroo' ? 'Coolaroo' : 'Altona North'}</div>}
              <div>{new Date(lead.received_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Australia/Melbourne' })}</div>
            </div>
          </div>
        )
      })}

      {/* Profile panel */}
      {selectedId && (() => {
        const sel = leadsWithGuardians.find(l => l.id === selectedId)
        if (!sel) return null
        return (
          <ProfilePanel
            lead={sel}
            allLeads={leadsWithGuardians}
            userId={user.id}
            userRole={user.role}
            programmes={programmes}
            activities={activities}
            userNames={userNames}
            onClose={() => setSelectedId(null)}
            onSwitchLead={(id) => setSelectedId(id)}
          />
        )
      })()}

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
