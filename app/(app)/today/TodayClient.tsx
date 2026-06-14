'use client'

import { useState, useTransition } from 'react'
import type { AppUser, Lead, Target, BlockoutDay, ChecklistItem, ChecklistCompletion, Programme, Guardian } from '@/types'
import {
  logCallOutcome,
  bookTrial,
  markArrived,
  undoArrived,
  markNoShow,
  makeSale,
  markDidntEnrol,
  sendConfirmation,
  toggleChecklist,
  verifyLead,
} from './actions'

/* ─── Design tokens ─── */
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

/* ─── Helpers ─── */
const waitLabel = (mins: number) =>
  mins < 60 ? `${mins} min` : mins < 1440 ? `${Math.round(mins / 60)} hrs` : `${Math.round(mins / 1440)} days`

const ageFrom = (dob: string | null) => {
  if (!dob) return null
  const d = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - d.getFullYear()
  if (today < new Date(today.getFullYear(), d.getMonth(), d.getDate())) age--
  return age
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).toLowerCase()

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })

function minutesAgo(receivedAt: string) {
  return Math.round((Date.now() - new Date(receivedAt).getTime()) / 60000)
}

function operatingDaysLeft(blockoutDays: string[]) {
  const today = new Date()
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  const blockSet = new Set(blockoutDays)
  let n = 0
  for (let d = new Date(today.getTime() + 86400000); d <= end; d = new Date(d.getTime() + 86400000)) {
    if (d.getDay() !== 0) { // not Sunday
      const iso = d.toISOString().split('T')[0]
      if (!blockSet.has(iso)) n++
    }
  }
  return n
}

/* ─── Tiny components ─── */
function Tag({ children, tone = 'grey', solid, onClick }: {
  children: React.ReactNode; tone?: 'green' | 'yellow' | 'red' | 'grey'; solid?: boolean; onClick?: () => void
}) {
  const map = {
    green: [C.green, C.greenBg],
    yellow: [C.yellow, C.yellowBg],
    red: [C.red, C.redBg],
    grey: [C.grey, C.greyBg],
  } as const
  const [fg, bg] = map[tone]
  return (
    <span
      onClick={onClick}
      style={{
        background: solid ? fg : bg,
        color: solid ? '#fff' : fg,
        fontSize: 10.5, fontWeight: 800,
        padding: '3px 8px', borderRadius: 3,
        letterSpacing: 0.4, textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >{children}</span>
  )
}

function OrangeBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: FONT, fontWeight: 800, fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
        borderRadius: 4, padding: '6px 13px',
        background: disabled ? C.greyBg : C.orange,
        color: disabled ? C.muted : '#fff',
        border: `1px solid ${disabled ? C.line : C.orangeDark}`,
      }}
    >{children}</button>
  )
}

function GreenBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: FONT, fontWeight: 800, fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
        borderRadius: 4, padding: '6px 13px',
        background: disabled ? C.greyBg : C.green,
        color: disabled ? C.muted : '#fff',
        border: `1px solid ${disabled ? C.line : C.greenDark}`,
      }}
    >{children}</button>
  )
}

function QuietBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: FONT, fontWeight: 700, fontSize: 11.5, cursor: 'pointer',
        borderRadius: 4, padding: '6px 10px',
        background: 'transparent', color: C.muted,
        border: `1px solid ${C.lineSoft}`,
      }}
    >{children}</button>
  )
}

const inp: React.CSSProperties = {
  fontFamily: FONT, fontSize: 13, fontWeight: 700,
  padding: '8px 10px', borderRadius: 4,
  border: `1px solid ${C.line}`, background: '#fff',
  width: '100%',
}

const lbl: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
  fontSize: 11.5, fontWeight: 800, color: '#2B2521',
  marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5,
}

/* ─── Panel wrapper ─── */
function Panel({ children, head, badge, sub, style }: {
  children: React.ReactNode; head: string;
  badge?: React.ReactNode; sub?: React.ReactNode; style?: React.CSSProperties
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

/* ─── WhoCell ─── */
function WhoCell({ lead, guardian, onOpenProfile, onOpenParent }: {
  lead: Lead; guardian: Guardian | null; onOpenProfile: () => void; onOpenParent: () => void
}) {
  const age = ageFrom(lead.dob)
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <button onClick={onOpenProfile} style={{
          fontFamily: FONT, fontWeight: 800, fontSize: 13.5, color: C.ink,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          borderBottom: `1px dotted ${C.muted}`,
        }}>
          {lead.child_first} {lead.child_last}
        </button>
        {age !== null && <span style={{ color: C.muted, fontWeight: 700, fontSize: 11.5 }}>{age} yrs</span>}
        {lead.rebooks > 0 && <Tag tone="yellow">re-booked ×{lead.rebooks}</Tag>}
      </div>
      <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700, marginTop: 1 }}>
        {(lead.relationship || 'parent').toLowerCase()} ·{' '}
        <button onClick={onOpenParent} style={{
          fontFamily: FONT, fontWeight: 700, fontSize: 11.5, color: C.muted,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          borderBottom: `1px dotted ${C.line}`,
        }}>
          {guardian ? `${guardian.first_name} ${guardian.last_name}` : '—'}
        </button>
        {' '}· {guardian?.phone ?? '—'}
      </div>
    </div>
  )
}

/* ─── CallMenu dropdown ─── */
const CALL_OUTCOMES = ['No answer', 'Left voicemail', 'Spoke — call back later', 'Spoke — booking now']

function CallMenu({ onPick, onClose }: { onPick: (o: string) => void; onClose: () => void }) {
  return (
    <div style={{
      position: 'absolute', top: '105%', right: 0, background: '#fff',
      border: `1px solid ${C.line}`, borderRadius: 4,
      boxShadow: '0 10px 30px rgba(0,0,0,.2)', zIndex: 30, minWidth: 200,
    }} onMouseLeave={onClose}>
      <div style={{ fontSize: 10, fontWeight: 900, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, padding: '7px 10px', borderBottom: `1px solid ${C.lineSoft}` }}>
        I called — what happened?
      </div>
      {CALL_OUTCOMES.map((o) => (
        <button key={o} onClick={() => onPick(o)} style={{
          display: 'block', width: '100%', textAlign: 'left', fontFamily: FONT,
          fontSize: 12.5, fontWeight: 700, padding: '8px 10px',
          background: 'none', border: 'none', borderBottom: `1px solid ${C.lineSoft}`,
          cursor: 'pointer', color: '#2B2521',
        }}>{o}</button>
      ))}
    </div>
  )
}

/* ─── LossPicker ─── */
function LossPicker({ onConfirm, onCancel }: { onConfirm: (r: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState('Price')
  const [other, setOther] = useState('')
  const final = reason === 'Other' ? (other.trim() ? `Other — ${other.trim()}` : '') : reason
  const smallInp: React.CSSProperties = { ...inp, padding: '4px 6px', fontSize: 11.5, width: 'auto' }
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      <select value={reason} onChange={(e) => setReason(e.target.value)} style={smallInp}>
        <option>Price</option>
        <option>Timing / not ready</option>
        <option>Day didn&apos;t suit</option>
        <option>Comparing options</option>
        <option>Other</option>
      </select>
      {reason === 'Other' && (
        <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="what happened?" style={{ ...smallInp, width: 130 }} />
      )}
      <QuietBtn onClick={() => final && onConfirm(final)}>confirm</QuietBtn>
      <QuietBtn onClick={onCancel}>✕</QuietBtn>
    </span>
  )
}

/* ─── BookingModal ─── */
function BookingModal({ lead, programmes, onClose, onConfirm }: {
  lead: Lead; programmes: Programme[]; onClose: () => void;
  onConfirm: (trialAt: string, programmeId: string | null) => void
}) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const age = ageFrom(lead.dob)
  const suggested = programmes.find(p =>
    (age === null) ? true : (p.min_age === null || age >= p.min_age) && (p.max_age === null || age <= p.max_age)
  )
  const [progId, setProgId] = useState(lead.programme_id ?? suggested?.id ?? '')
  const ok = date && time

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(23,19,14,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 6, padding: '22px 24px',
        width: 360, maxWidth: '92vw', borderTop: `3px solid ${C.orange}`,
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 900 }}>
          Book trial — {lead.child_first} {lead.child_last}
        </h3>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, marginBottom: 14 }}>
          {(lead.relationship || '').toLowerCase()} · {lead.guardian_id}
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
          <select value={progId} onChange={(e) => setProgId(e.target.value)} style={inp}>
            <option value="">— select —</option>
            {programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {age !== null && <span style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, textTransform: 'none' }}>Suggested from age {age}</span>}
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <QuietBtn onClick={onClose}>Cancel</QuietBtn>
          <OrangeBtn onClick={() => {
            if (!ok) return
            const trialAt = new Date(`${date}T${time}`).toISOString()
            onConfirm(trialAt, progId || null)
          }} disabled={!ok}>
            {ok ? 'Confirm booking' : 'Pick date & time'}
          </OrangeBtn>
        </div>
      </div>
    </div>
  )
}

/* ─── EnrolModal ─── */
function EnrolModal({ lead, onClose, onConfirm }: {
  lead: Lead; onClose: () => void;
  onConfirm: (firstClassDate: string, firstClass: string, paymentTaken: boolean) => void
}) {
  const [date, setDate] = useState('')
  const [slot, setSlot] = useState('')
  const [payTaken, setPayTaken] = useState(false)
  const ok = date && slot && payTaken
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(23,19,14,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 6, padding: '22px 24px',
        width: 380, maxWidth: '92vw', borderTop: `3px solid ${C.green}`,
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 900 }}>
          💰 Make the sale — {lead.child_first} {lead.child_last}
        </h3>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, marginBottom: 12 }}>
          Lock in their first class to complete the enrolment
        </div>
        {!lead.form_received && (
          <div style={{
            background: C.yellowBg, border: '1px solid #E5D49A', borderRadius: 4,
            padding: '8px 11px', marginBottom: 12, fontSize: 12, fontWeight: 800, color: C.yellow,
          }}>
            ⚠ Their Jotform hasn&apos;t come back — get it completed before their first class.
          </div>
        )}
        <label style={lbl}>
          First class date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} />
        </label>
        <label style={lbl}>
          Class
          <input placeholder="e.g. Sat 9:30 am Kinder Gym" value={slot} onChange={(e) => setSlot(e.target.value)} style={inp} />
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, fontWeight: 800, color: '#2B2521', cursor: 'pointer', margin: '4px 0 8px' }}>
          <input type="checkbox" checked={payTaken} onChange={(e) => setPayTaken(e.target.checked)} style={{ width: 16, height: 16, accentColor: C.green }} />
          Rego &amp; insurance payment taken
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
          <QuietBtn onClick={onClose}>Cancel</QuietBtn>
          <GreenBtn onClick={() => ok && onConfirm(date, slot, payTaken)} disabled={!ok}>
            {!date || !slot ? 'Add first class' : !payTaken ? 'Take payment first' : 'Confirm sale 🎉'}
          </GreenBtn>
        </div>
      </div>
    </div>
  )
}

/* ─── Profile slide-in ─── */
function ProfilePanel({ lead, guardian, siblings, activities, programmes, currentUser, onClose, onBook, onSale }: {
  lead: Lead
  guardian: Guardian | null
  siblings: Lead[]
  activities: { id: string; lead_id: string; user_id: string | null; kind: string; body: string; created_at: string }[]
  programmes: Programme[]
  currentUser: AppUser
  onClose: () => void
  onBook: () => void
  onSale: () => void
}) {
  const age = ageFrom(lead.dob)
  const prog = programmes.find(p => p.id === lead.programme_id)
  const bookable = lead.status === 'new' || lead.status === 'noshow' || lead.status === 'nurture'
  const leadActs = activities.filter(a => a.lead_id === lead.id).slice().reverse()

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(23,19,14,.4)' }} onClick={onClose} />
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 430, maxWidth: '94vw',
        background: '#fff', padding: '20px 22px', overflowY: 'auto',
        borderLeft: `3px solid ${C.orange}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>
              {lead.child_first} {lead.child_last}{' '}
              <span style={{ color: C.muted, fontWeight: 700, fontSize: 13 }}>
                {age !== null ? `${age} yrs` : ''}{lead.dob ? ` · DOB ${lead.dob}` : ''}
              </span>
            </h3>
            <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 700, marginTop: 2 }}>
              {(lead.relationship || '').toLowerCase()} · {guardian ? `${guardian.first_name} ${guardian.last_name}` : '—'} · {guardian?.phone ?? '—'}
            </div>
            {siblings.length > 0 && (
              <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: C.muted, letterSpacing: '.4px' }}>FAMILY:</span>
                {siblings.map(s => (
                  <span key={s.id} style={{
                    display: 'inline-flex', gap: 6, alignItems: 'center',
                    background: C.greyBg, border: `1px solid ${C.line}`, borderRadius: 4,
                    padding: '3px 8px', fontSize: 11.5, fontWeight: 800, color: C.ink,
                  }}>
                    {s.child_first} {s.child_last}
                  </span>
                ))}
              </div>
            )}
          </div>
          <QuietBtn onClick={onClose}>Close ✕</QuietBtn>
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {bookable && <OrangeBtn onClick={onBook}>{lead.status === 'noshow' ? 'Re-book trial' : 'Book trial'}</OrangeBtn>}
          {(lead.status === 'booked' || lead.status === 'nurture') && (
            <GreenBtn onClick={onSale}>💰 Make the sale</GreenBtn>
          )}
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.muted }}>Programme:</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{prog?.name ?? '—'}</span>
          {lead.form_received
            ? <Tag tone="green">form ✓</Tag>
            : <Tag tone="yellow">form pending</Tag>}
          {lead.status === 'won' && (
            lead.verified_at
              ? <Tag tone="green" solid>sale ✓ verified</Tag>
              : <Tag tone="yellow">sale — pending admin</Tag>
          )}
        </div>

        <h4 style={{ margin: '18px 0 8px', fontSize: 10.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1.2, color: C.muted }}>Original enquiry</h4>
        <div style={{ background: C.bg, border: `1px solid ${C.lineSoft}`, borderRadius: 4, padding: '10px 12px' }}>
          {[
            ['Guardian', guardian ? `${guardian.first_name} ${guardian.last_name}` : '—'],
            ['Mobile', guardian?.phone ?? '—'],
            ['Email', guardian?.email ?? '—'],
            ['Child', `${lead.child_first} ${lead.child_last}`],
            ['Date of birth', lead.dob ?? '—'],
            ['Gender', lead.gender ?? '—'],
            ['Source', lead.source],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', fontSize: 12.5, fontWeight: 700, padding: '3px 0', borderBottom: `1px dashed ${C.lineSoft}` }}>
              <span style={{ width: 150, color: C.muted }}>{k}</span>
              <span style={{ color: '#2B2521' }}>{v}</span>
            </div>
          ))}
        </div>

        <h4 style={{ margin: '18px 0 8px', fontSize: 10.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1.2, color: C.muted }}>Timeline</h4>
        <div>
          {leadActs.map((e) => (
            <div key={e.id} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: `1px solid ${C.lineSoft}` }}>
              <span style={{
                width: 8, height: 8, borderRadius: 99, marginTop: 5,
                background: e.kind === 'note' ? C.yellow : e.kind === 'comm' ? '#6A8CB5' : C.orange,
                flexShrink: 0,
              }} />
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 900, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {fmtDate(e.created_at)} {fmtTime(e.created_at)}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#2B2521' }}>{e.body}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <span style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>
            {currentUser.role === 'admin' || currentUser.role === 'management'
              ? 'Admin/Management view'
              : `Viewing as ${currentUser.name}`}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ─── Parent profile panel ─── */
function ParentPanel({ guardian, leads, onClose, onOpenChild }: {
  guardian: Guardian; leads: Lead[]; onClose: () => void; onOpenChild: (id: string) => void
}) {
  const fam = leads.filter(l => l.guardian_id === guardian.id)
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 45 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(23,19,14,.4)' }} onClick={onClose} />
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 430, maxWidth: '94vw',
        background: '#fff', padding: '20px 22px', overflowY: 'auto',
        borderLeft: `3px solid ${C.orange}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, letterSpacing: '.6px' }}>PARENT / GUARDIAN</div>
            <div style={{ fontSize: 19, fontWeight: 900, color: C.ink, marginTop: 2 }}>
              {guardian.first_name} {guardian.last_name}
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 700, marginTop: 3 }}>
              {guardian.phone} · {guardian.email ?? '—'}
            </div>
          </div>
          <QuietBtn onClick={onClose}>✕</QuietBtn>
        </div>
        <div style={{ marginTop: 16, fontSize: 11, fontWeight: 800, color: C.muted, letterSpacing: '.6px' }}>CHILDREN ({fam.length})</div>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {fam.map(l => (
            <button key={l.id} onClick={() => onOpenChild(l.id)} style={{
              fontFamily: FONT, display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', gap: 10, textAlign: 'left',
              background: C.bg, border: `1px solid ${C.line}`, borderRadius: 6,
              padding: '10px 12px', cursor: 'pointer',
            }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 13.5, color: C.ink }}>
                  {l.child_first} {l.child_last}{' '}
                  <span style={{ color: C.muted, fontWeight: 700, fontSize: 11.5 }}>
                    {ageFrom(l.dob) !== null ? `${ageFrom(l.dob)} yrs` : ''}
                  </span>
                </div>
              </div>
              <Tag tone={l.status === 'won' ? 'green' : l.status === 'new' ? 'red' : l.status === 'noshow' ? 'red' : l.status === 'booked' ? 'green' : 'yellow'}>
                {l.status.toUpperCase()}
              </Tag>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Data shape passed from server ─── */
export interface TodayData {
  user: AppUser
  target: Target | null
  newLeads: Lead[]
  todayTrials: Lead[]
  noShows: Lead[]
  tomorrowTrials: Lead[]
  weekTrials: Lead[]
  unverifiedSales: Lead[]
  checklistItems: ChecklistItem[]
  checklistCompletions: ChecklistCompletion[]
  blockoutDays: BlockoutDay[]
  guardians: Guardian[]
  programmes: Programme[]
  activities: { id: string; lead_id: string; user_id: string | null; kind: string; body: string; created_at: string }[]
}

/* ─── Main client component ─── */
export default function TodayClient({ data }: { data: TodayData }) {
  const { user, target, newLeads, todayTrials, noShows, tomorrowTrials, weekTrials, unverifiedSales, checklistItems, checklistCompletions, blockoutDays, guardians, programmes, activities } = data
  const [, startTransition] = useTransition()

  // Modal/overlay state
  const [profileId, setProfileId] = useState<string | null>(null)
  const [parentId, setParentId] = useState<string | null>(null)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [enrolId, setEnrolId] = useState<string | null>(null)
  const [callFor, setCallFor] = useState<string | null>(null)
  const [lossFor, setLossFor] = useState<string | null>(null)
  const [weekOpen, setWeekOpen] = useState(false)

  // Local checklist state (optimistic)
  const [completedItems, setCompletedItems] = useState<Set<string>>(
    new Set(checklistCompletions.map(c => c.item_id))
  )

  // Arrived state: track lead IDs with "Marked arrived ✓" in activities (today)
  const arrivedLeadIds = new Set(
    activities
      .filter(a => a.body === 'Marked arrived ✓')
      .map(a => a.lead_id)
  )
  const [arrivedOverride, setArrivedOverride] = useState<Record<string, boolean>>({})
  const isArrived = (leadId: string) => {
    if (arrivedOverride[leadId] !== undefined) return arrivedOverride[leadId]
    return arrivedLeadIds.has(leadId)
  }

  // Local iClassPro checklist state (not persisted, per spec)
  const [iclassState, setIclassState] = useState<Record<string, { class: boolean; regoins: boolean; payment: boolean }>>({})
  const getIclass = (leadId: string) => iclassState[leadId] ?? { class: false, regoins: false, payment: false }
  const tickIclass = (leadId: string, key: 'class' | 'regoins' | 'payment') => {
    setIclassState(prev => ({
      ...prev,
      [leadId]: { ...getIclass(leadId), [key]: !getIclass(leadId)[key] },
    }))
  }

  const allLeads = [...newLeads, ...todayTrials, ...noShows, ...tomorrowTrials, ...weekTrials, ...unverifiedSales]

  const getGuardian = (guardianId: string) => guardians.find(g => g.id === guardianId) ?? null

  const profileLead = profileId ? allLeads.find(l => l.id === profileId) ?? null : null
  const parentGuardian = parentId ? guardians.find(g => g.id === parentId) ?? null : null
  const bookingLead = bookingId ? allLeads.find(l => l.id === bookingId) ?? null : null
  const enrolLead = enrolId ? allLeads.find(l => l.id === enrolId) ?? null : null

  /* ─── Target bar ─── */
  const siteName = user.site === 'coolaroo' ? 'Coolaroo' : user.site === 'altona_north' ? 'Altona North' : 'All Sites'
  const monthName = new Date().toLocaleString('en-AU', { month: 'long' })
  const goal = target?.net_growth_goal ?? 0
  const actual = unverifiedSales.filter(l => l.verified_at).length + (target ? 0 : 0) // simplified: count verified sales
  const toGo = Math.max(0, goal - actual)
  const pct = goal > 0 ? Math.min(100, Math.round((actual / goal) * 100)) : 0
  const blockoutSet = blockoutDays.map(b => b.day)
  const opDaysLeft = operatingDaysLeft(blockoutSet)
  const perDay = opDaysLeft > 0 ? (toGo / opDaysLeft).toFixed(1) : '—'

  return (
    <div style={{ fontFamily: FONT }}>

      {/* ─── Target bar ─── */}
      <div style={{
        background: C.card, border: `1px solid ${C.line}`,
        borderLeft: `4px solid ${C.orange}`, borderRadius: 6,
        padding: '14px 18px', marginBottom: 22,
        display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1.2, color: C.muted }}>
            {siteName} · {monthName} target
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
            {opDaysLeft} operating days left (Mon–Sat) · ≈{perDay} per day
          </div>
        </div>
      </div>

      {/* ─── New leads ─── */}
      <Panel
        head="New leads — call &amp; book"
        badge={<Tag tone="yellow" solid>act now</Tag>}
        sub={<span style={{ fontSize: 12, fontWeight: 800, color: newLeads.length ? C.yellow : C.green }}>{newLeads.length ? `${newLeads.length} waiting` : 'all booked'}</span>}
      >
        {newLeads.length === 0 && (
          <div style={{ padding: '14px 16px', color: C.muted, fontSize: 13, fontWeight: 700 }}>No new leads right now.</div>
        )}
        {newLeads.map(l => {
          const guardian = getGuardian(l.guardian_id)
          const waitMins = minutesAgo(l.received_at)
          return (
            <div key={l.id} style={{
              display: 'grid', gridTemplateColumns: '120px 1fr auto',
              gap: 10, alignItems: 'center', padding: '10px 12px',
              borderBottom: `1px solid ${C.lineSoft}`,
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#2B2521' }}>
                  {fmtTime(l.received_at)}
                </div>
                <div style={{ fontSize: 11, fontWeight: 900, color: waitMins > 240 ? C.red : C.yellow }}>
                  {waitLabel(waitMins)} waiting
                </div>
              </div>
              <div>
                <WhoCell
                  lead={l}
                  guardian={guardian}
                  onOpenProfile={() => setProfileId(l.id)}
                  onOpenParent={() => setParentId(l.guardian_id)}
                />
                <div style={{ marginTop: 3, display: 'flex', gap: 5 }}>
                  {!l.contacted
                    ? <Tag tone="red" solid>not contacted yet</Tag>
                    : l.last_outcome === 'Spoke — call back later'
                      ? <Tag tone="yellow">spoke — call back later</Tag>
                      : <Tag tone="yellow">{l.attempts} call{l.attempts !== 1 ? 's' : ''} · not reached</Tag>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', position: 'relative' }}>
                <OrangeBtn onClick={() => setCallFor(callFor === l.id ? null : l.id)}>
                  📞 Call to book
                </OrangeBtn>
                <QuietBtn onClick={() => setBookingId(l.id)}>book directly</QuietBtn>
                {callFor === l.id && (
                  <CallMenu
                    onPick={(outcome) => {
                      setCallFor(null)
                      startTransition(async () => {
                        await logCallOutcome(l.id, outcome, user.id)
                        if (outcome === 'Spoke — booking now') {
                          setBookingId(l.id)
                        }
                      })
                    }}
                    onClose={() => setCallFor(null)}
                  />
                )}
              </div>
            </div>
          )
        })}
      </Panel>

      {/* ─── Today's trials ─── */}
      <Panel
        head="Today's trials — the sale happens here"
        badge={<Tag tone="green" solid>today</Tag>}
        sub={<span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>① arrived → ② outcome: 💰 sale or didn&apos;t enrol</span>}
      >
        {todayTrials.length === 0 && noShows.length === 0 && (
          <div style={{ padding: '14px 16px', color: C.muted, fontSize: 13, fontWeight: 700 }}>No trials today.</div>
        )}
        {todayTrials.map(l => {
          const guardian = getGuardian(l.guardian_id)
          const arrived = isArrived(l.id)
          return (
            <div key={l.id} style={{
              display: 'grid', gridTemplateColumns: '60px 1fr 180px 220px',
              gap: 10, alignItems: 'center', padding: '10px 12px',
              borderBottom: `1px solid ${C.lineSoft}`,
            }}>
              <div style={{ fontWeight: 900, fontSize: 14 }}>
                {l.trial_at ? fmtTime(l.trial_at) : '—'}
              </div>
              <div>
                <WhoCell
                  lead={l}
                  guardian={guardian}
                  onOpenProfile={() => setProfileId(l.id)}
                  onOpenParent={() => setParentId(l.guardian_id)}
                />
                <div style={{ marginTop: 3, display: 'flex', gap: 5, alignItems: 'center' }}>
                  {l.form_received
                    ? <Tag tone="green">form ✓</Tag>
                    : <Tag tone="grey">form pending</Tag>}
                </div>
              </div>
              {/* Step 1 */}
              <div>
                {arrived
                  ? <span
                      onClick={() => {
                        setArrivedOverride(prev => ({ ...prev, [l.id]: false }))
                        startTransition(() => undoArrived(l.id, user.id))
                      }}
                      title="Click to undo"
                      style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 800, color: C.green, textTransform: 'uppercase', letterSpacing: 0.5 }}
                    >
                      <span style={{
                        width: 16, height: 16, borderRadius: 99, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, background: C.green, color: '#fff', border: `1px solid ${C.greenDark}`,
                      }}>✓</span>
                      arrived
                    </span>
                  : <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <QuietBtn onClick={() => {
                        setArrivedOverride(prev => ({ ...prev, [l.id]: true }))
                        startTransition(() => markArrived(l.id, user.id))
                      }}>① Arrived ✓</QuietBtn>
                      <QuietBtn onClick={() => startTransition(() => markNoShow(l.id, user.id))}>no-show</QuietBtn>
                    </span>}
              </div>
              {/* Step 2 */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                {!arrived
                  ? <span style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>② outcome — after arrival</span>
                  : lossFor === l.id
                    ? <LossPicker
                        onConfirm={(reason) => {
                          setLossFor(null)
                          startTransition(() => markDidntEnrol(l.id, reason, user.id))
                        }}
                        onCancel={() => setLossFor(null)}
                      />
                    : <>
                        <GreenBtn onClick={() => setEnrolId(l.id)}>💰 Make the sale</GreenBtn>
                        <QuietBtn onClick={() => setLossFor(l.id)}>didn&apos;t enrol</QuietBtn>
                      </>}
              </div>
            </div>
          )
        })}

        {/* No-show rows */}
        {noShows.map(l => {
          const guardian = getGuardian(l.guardian_id)
          return (
            <div key={l.id} style={{
              display: 'grid', gridTemplateColumns: '1fr auto',
              gap: 10, alignItems: 'center', padding: '10px 12px',
              borderBottom: `1px solid ${C.lineSoft}`,
            }}>
              <div>
                <WhoCell
                  lead={l}
                  guardian={guardian}
                  onOpenProfile={() => setProfileId(l.id)}
                  onOpenParent={() => setParentId(l.guardian_id)}
                />
                <div style={{ marginTop: 3 }}>
                  <Tag tone="red">no-show — reach out &amp; re-book</Tag>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <QuietBtn onClick={() => {}}>send text</QuietBtn>
                <OrangeBtn onClick={() => setBookingId(l.id)}>Re-book</OrangeBtn>
              </div>
            </div>
          )
        })}
      </Panel>

      {/* ─── Sales to process ─── */}
      {unverifiedSales.length > 0 && (
        <Panel
          head="💰 Sales to process — enter in iClassPro"
          badge={<Tag tone="yellow">pending admin</Tag>}
          sub={<span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>tick each, then admin verifies the sale</span>}
        >
          {unverifiedSales.map(l => {
            const guardian = getGuardian(l.guardian_id)
            const ic = getIclass(l.id)
            const allTicked = ic.class && ic.regoins && ic.payment
            const canVerify = user.role === 'admin' || user.role === 'management'
            return (
              <div key={l.id} style={{ padding: '10px 14px', borderBottom: `1px solid ${C.lineSoft}`, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <WhoCell
                    lead={l}
                    guardian={guardian}
                    onOpenProfile={() => setProfileId(l.id)}
                    onOpenParent={() => setParentId(l.guardian_id)}
                  />
                  {l.first_class_date && l.first_class && (
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: C.green, marginTop: 2 }}>
                      first class {l.first_class_date} · {l.first_class}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginLeft: 'auto', alignItems: 'center' }}>
                  {([['class', 'Class enrolled'], ['regoins', 'Rego & insurance paid'], ['payment', 'Payment details set up']] as const).map(([k, label]) => (
                    <label key={k} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11.5, fontWeight: 800, color: '#2B2521', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={ic[k]}
                        onChange={() => tickIclass(l.id, k)}
                        style={{ accentColor: C.green }}
                      />
                      {label}
                    </label>
                  ))}
                  {allTicked && canVerify
                    ? <GreenBtn onClick={() => startTransition(() => verifyLead(l.id, user.id))}>Admin: verify sale</GreenBtn>
                    : allTicked
                      ? <Tag tone="yellow">Awaiting admin verification</Tag>
                      : <Tag tone="grey">finish checklist</Tag>}
                </div>
              </div>
            )
          })}
        </Panel>
      )}

      {/* ─── Tomorrow ─── */}
      <Panel
        head="Tomorrow — confirmations &amp; forms"
        sub={<span style={{ fontSize: 12, fontWeight: 800, color: C.muted }}>{tomorrowTrials.length} booked</span>}
      >
        {tomorrowTrials.length === 0 && (
          <div style={{ padding: '14px 16px', color: C.muted, fontSize: 13, fontWeight: 700 }}>No trials tomorrow.</div>
        )}
        {tomorrowTrials.map(l => {
          const guardian = getGuardian(l.guardian_id)
          return (
            <div key={l.id} style={{
              display: 'grid', gridTemplateColumns: '60px 1fr auto',
              gap: 10, alignItems: 'center', padding: '8px 12px',
              borderBottom: `1px solid ${C.lineSoft}`,
            }}>
              <div style={{ fontWeight: 900, fontSize: 13 }}>
                {l.trial_at ? fmtTime(l.trial_at) : '—'}
              </div>
              <div>
                <WhoCell
                  lead={l}
                  guardian={guardian}
                  onOpenProfile={() => setProfileId(l.id)}
                  onOpenParent={() => setParentId(l.guardian_id)}
                />
                <div style={{ marginTop: 3, display: 'flex', gap: 5 }}>
                  {l.form_received ? <Tag tone="green">form ✓</Tag> : <Tag tone="grey">form pending</Tag>}
                </div>
              </div>
              <div>
                {l.confirmation_sent_at
                  ? <Tag tone="green">confirmed ✓</Tag>
                  : <OrangeBtn onClick={() => startTransition(() => sendConfirmation(l.id, user.id))}>Send confirmation</OrangeBtn>}
              </div>
            </div>
          )
        })}
      </Panel>

      {/* ─── Later this week ─── */}
      <div style={{ marginBottom: 22 }}>
        <button
          onClick={() => setWeekOpen(!weekOpen)}
          style={{
            fontFamily: FONT, background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 900, color: C.muted, padding: '0 0 6px',
            textTransform: 'uppercase', letterSpacing: 0.8,
          }}
        >
          {weekOpen ? '▾' : '▸'} Later this week · {weekTrials.length} booked
        </button>
        {weekOpen && (
          <Panel head="Later this week">
            {weekTrials.length === 0 && (
              <div style={{ padding: '14px 16px', color: C.muted, fontSize: 13, fontWeight: 700 }}>No trials later this week.</div>
            )}
            {weekTrials.map(l => {
              const guardian = getGuardian(l.guardian_id)
              return (
                <div key={l.id} style={{
                  display: 'grid', gridTemplateColumns: '80px 1fr auto',
                  gap: 10, alignItems: 'center', padding: '8px 12px',
                  borderBottom: `1px solid ${C.lineSoft}`,
                }}>
                  <div style={{ fontWeight: 900, fontSize: 13 }}>
                    <div>{l.trial_at ? fmtDate(l.trial_at) : '—'}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{l.trial_at ? fmtTime(l.trial_at) : ''}</div>
                  </div>
                  <div>
                    <WhoCell
                      lead={l}
                      guardian={guardian}
                      onOpenProfile={() => setProfileId(l.id)}
                      onOpenParent={() => setParentId(l.guardian_id)}
                    />
                    <div style={{ marginTop: 3, display: 'flex', gap: 5 }}>
                      {l.form_received ? <Tag tone="green">form ✓</Tag> : <Tag tone="grey">form pending</Tag>}
                    </div>
                  </div>
                  <div>
                    {l.confirmation_sent_at
                      ? <Tag tone="green">confirmed ✓</Tag>
                      : <OrangeBtn onClick={() => startTransition(() => sendConfirmation(l.id, user.id))}>Send confirmation</OrangeBtn>}
                  </div>
                </div>
              )
            })}
          </Panel>
        )}
      </div>

      {/* ─── Daily checklist ─── */}
      <Panel
        head="Daily front-of-house checklist"
        sub={<span style={{ fontSize: 11.5, fontWeight: 800, color: completedItems.size === checklistItems.length ? C.green : C.muted }}>{completedItems.size}/{checklistItems.length} signed off</span>}
      >
        {checklistItems.length === 0 && (
          <div style={{ padding: '14px 16px', color: C.muted, fontSize: 13, fontWeight: 700 }}>No checklist items configured.</div>
        )}
        {checklistItems.map(item => {
          const done = completedItems.has(item.id)
          return (
            <label key={item.id} style={{
              display: 'flex', gap: 10, alignItems: 'center',
              padding: '9px 14px', borderBottom: `1px solid ${C.lineSoft}`, cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={done}
                onChange={() => {
                  const next = !done
                  setCompletedItems(prev => {
                    const s = new Set(prev)
                    if (next) s.add(item.id); else s.delete(item.id)
                    return s
                  })
                  startTransition(() => toggleChecklist(item.id, user.id, next))
                }}
                style={{ width: 16, height: 16, accentColor: C.green }}
              />
              <span style={{ fontSize: 13, fontWeight: 700, color: done ? C.muted : '#2B2521', textDecoration: done ? 'line-through' : 'none' }}>
                {item.label}
              </span>
              {done && <span style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, marginLeft: 'auto' }}>✓</span>}
            </label>
          )
        })}
      </Panel>

      {/* ─── Modals / slide-ins ─── */}
      {profileLead && (
        <ProfilePanel
          lead={profileLead}
          guardian={getGuardian(profileLead.guardian_id)}
          siblings={allLeads.filter(l => l.guardian_id === profileLead.guardian_id && l.id !== profileLead.id)}
          activities={activities}
          programmes={programmes}
          currentUser={user}
          onClose={() => setProfileId(null)}
          onBook={() => { setProfileId(null); setBookingId(profileLead.id) }}
          onSale={() => { setProfileId(null); setEnrolId(profileLead.id) }}
        />
      )}

      {parentGuardian && (
        <ParentPanel
          guardian={parentGuardian}
          leads={allLeads}
          onClose={() => setParentId(null)}
          onOpenChild={(id) => { setParentId(null); setProfileId(id) }}
        />
      )}

      {bookingLead && (
        <BookingModal
          lead={bookingLead}
          programmes={programmes}
          onClose={() => setBookingId(null)}
          onConfirm={(trialAt, programmeId) => {
            setBookingId(null)
            startTransition(() => bookTrial(bookingLead.id, trialAt, programmeId, user.id))
          }}
        />
      )}

      {enrolLead && (
        <EnrolModal
          lead={enrolLead}
          onClose={() => setEnrolId(null)}
          onConfirm={(firstClassDate, firstClass, paymentTaken) => {
            setEnrolId(null)
            startTransition(() => makeSale(enrolLead.id, firstClassDate, firstClass, paymentTaken, user.id))
          }}
        />
      )}
    </div>
  )
}
