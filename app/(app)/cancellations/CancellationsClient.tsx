'use client'

import { useState, useTransition } from 'react'
import type { AppUser, Cancellation, CancelStage, CancelOutcome } from '@/types'
import { advanceStage, setSaveOutcome, toggleFeesFlag, updateEffectiveDate, undoStage, archiveCancellation } from './actions'

const C = {
  SAND: '#F6F3EE',
  WHITE: '#FFFFFF',
  INK: '#17130E',
  MUTED: '#84776A',
  BORDER: '#D9CFC2',
  ORANGE: '#E26839',
  GREEN: '#3A7D44',
  RED: '#C0392B',
  YELLOW_BG: '#FFFBEB',
  YELLOW: '#B7791F',
}

const STAGE_LABELS: Record<CancelStage, string> = {
  received: 'Received',
  save_attempt: 'Save attempted',
  processed: 'Processed in iClassPro',
  verified: 'Verified & emailed',
}

const STAGE_ORDER: CancelStage[] = ['received', 'save_attempt', 'processed', 'verified']

const STAGE_COLOURS: Record<CancelStage, { bg: string; color: string }> = {
  received: { bg: C.RED, color: C.WHITE },
  save_attempt: { bg: '#D97706', color: C.WHITE },
  processed: { bg: '#2563EB', color: C.WHITE },
  verified: { bg: C.GREEN, color: C.WHITE },
}

const OUTCOME_LABELS: Record<CancelOutcome, string> = {
  departed: 'Departed',
  saved: 'Saved',
  paused: 'Paused',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

interface Props {
  user: AppUser
  cancellations: Cancellation[]
}

interface DetailPanelProps {
  c: Cancellation
  user: AppUser
  onClose: () => void
}

function DetailPanel({ c, user, onClose }: DetailPanelProps) {
  const [pending, startTransition] = useTransition()
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [saveOutcome, setSaveOutcomeLocal] = useState<CancelOutcome>('saved')
  const [saveNote, setSaveNote] = useState('')
  const [editDate, setEditDate] = useState(false)
  const [newDate, setNewDate] = useState(c.effective_date)

  const isAdmin = user.role === 'admin' || user.role === 'management'
  const stageIdx = STAGE_ORDER.indexOf(c.stage)
  const nextStage = STAGE_ORDER[stageIdx + 1] as CancelStage | undefined
  const prevStage = STAGE_ORDER[stageIdx - 1] as CancelStage | undefined
  const sc = STAGE_COLOURS[c.stage]

  const nextStageLabel: Record<CancelStage, string> = {
    received: 'Mark save attempted',
    save_attempt: 'Mark processed in iClassPro',
    processed: 'Mark verified & emailed',
    verified: '',
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 200 }} onClick={onClose} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, maxWidth: '100vw',
        background: C.WHITE, borderLeft: `1px solid ${C.BORDER}`, zIndex: 201,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{c.member_name}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ ...sc, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{STAGE_LABELS[c.stage]}</span>
              {c.outcome && <span style={{ padding: '2px 8px', fontSize: 11, background: '#E5E7EB', color: C.INK, fontWeight: 600 }}>{OUTCOME_LABELS[c.outcome]}</span>}
              <span style={{ padding: '2px 8px', fontSize: 11, background: '#E5E7EB', color: C.MUTED }}>{c.site === 'coolaroo' ? 'Coolaroo' : 'Altona North'}</span>
              {c.outstanding_fees_flag && <span style={{ padding: '2px 8px', fontSize: 11, background: C.RED, color: C.WHITE, fontWeight: 600 }}>⚠ Fees outstanding</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.MUTED }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 140px' }}>
          {/* Stage progress */}
          <div style={{ marginTop: 20, marginBottom: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Progress</div>
            <div style={{ display: 'flex', gap: 0 }}>
              {STAGE_ORDER.map((s, i) => {
                const done = STAGE_ORDER.indexOf(c.stage) >= i
                const active = c.stage === s
                return (
                  <div key={s} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{
                      height: 6, background: done ? C.GREEN : C.BORDER,
                      marginRight: i < 3 ? 2 : 0,
                      borderRadius: i === 0 ? '3px 0 0 3px' : i === 3 ? '0 3px 3px 0' : 0,
                    }} />
                    <div style={{ fontSize: 9, color: active ? C.INK : C.MUTED, fontWeight: active ? 700 : 400, marginTop: 4 }}>
                      {STAGE_LABELS[s].split(' ')[0]}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Member details */}
          <PSection title="Member">
            <PRow label="Member name" value={c.member_name} />
            {c.guardian_name && <PRow label="Guardian" value={c.guardian_name} />}
            {c.phone && <PRow label="Phone" value={c.phone} />}
            {c.email && <PRow label="Email" value={c.email} />}
            {c.level && <PRow label="Level" value={c.level} />}
            <PRow label="Site" value={c.site === 'coolaroo' ? 'Coolaroo' : 'Altona North'} />
          </PSection>

          {/* Cancellation details */}
          <PSection title="Cancellation">
            <PRow label="Notice date" value={fmtDate(c.notice_date)} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: `1px solid ${C.BORDER}`, alignItems: 'center' }}>
              <span style={{ color: C.MUTED }}>Effective date</span>
              {editDate && isAdmin ? (
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                    style={{ fontSize: 12, padding: '2px 6px', border: `1px solid ${C.BORDER}` }} />
                  <button onClick={() => { startTransition(() => updateEffectiveDate(c.id, newDate, user.id)); setEditDate(false) }}
                    style={{ fontSize: 11, padding: '2px 8px', background: C.GREEN, color: C.WHITE, border: 'none', cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setEditDate(false)} style={{ fontSize: 11, padding: '2px 8px', background: 'none', border: `1px solid ${C.BORDER}`, cursor: 'pointer' }}>×</button>
                </span>
              ) : (
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontWeight: 500 }}>{fmtDate(c.effective_date)}</span>
                  {isAdmin && <button onClick={() => setEditDate(true)} style={{ fontSize: 11, color: C.MUTED, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>edit</button>}
                </span>
              )}
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: C.MUTED, marginBottom: 4 }}>Reasons</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {c.reasons.map(r => (
                  <span key={r} style={{ padding: '2px 8px', fontSize: 12, background: '#F3F4F6', border: `1px solid ${C.BORDER}`, color: C.INK }}>{r}</span>
                ))}
              </div>
            </div>
            {c.feedback && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: C.MUTED, marginBottom: 4 }}>Feedback</div>
                <div style={{ fontSize: 13, color: C.INK, fontStyle: 'italic' }}>&ldquo;{c.feedback}&rdquo;</div>
              </div>
            )}
            {c.rating && (
              <PRow label="Rating" value={`${'★'.repeat(c.rating)}${'☆'.repeat(5 - c.rating)} (${c.rating}/5)`} />
            )}
          </PSection>

          {/* Save outcome */}
          {c.save_outcome && (
            <PSection title="Save attempt">
              <PRow label="Outcome" value={c.outcome ? OUTCOME_LABELS[c.outcome] : '—'} />
              <PRow label="Notes" value={c.save_outcome} />
            </PSection>
          )}

          {/* Save form */}
          {showSaveForm && (
            <PSection title="Record save outcome">
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: C.MUTED, marginBottom: 4 }}>Outcome</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['saved', 'paused', 'departed'] as CancelOutcome[]).map(o => (
                    <button key={o} onClick={() => setSaveOutcomeLocal(o)} style={{
                      flex: 1, padding: '7px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      background: saveOutcome === o ? C.INK : C.WHITE,
                      color: saveOutcome === o ? C.WHITE : C.INK,
                      border: `1px solid ${saveOutcome === o ? C.INK : C.BORDER}`,
                    }}>
                      {OUTCOME_LABELS[o]}
                    </button>
                  ))}
                </div>
              </div>
              <label style={{ fontSize: 12, color: C.MUTED, display: 'block', marginBottom: 4 }}>Notes</label>
              <textarea value={saveNote} onChange={e => setSaveNote(e.target.value)} rows={3}
                placeholder="What was discussed, what was offered…"
                style={{ width: '100%', padding: 8, border: `1px solid ${C.BORDER}`, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical', marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowSaveForm(false)} style={{ flex: 1, padding: '8px', border: `1px solid ${C.BORDER}`, background: C.WHITE, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                <button onClick={() => {
                  startTransition(() => setSaveOutcome(c.id, saveOutcome, saveNote || OUTCOME_LABELS[saveOutcome], user.id))
                  setShowSaveForm(false)
                }} style={{ flex: 1, padding: '8px', background: C.ORANGE, color: C.WHITE, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  Save outcome
                </button>
              </div>
            </PSection>
          )}

          {/* Fees flag */}
          <PSection title="Outstanding fees">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={c.outstanding_fees_flag}
                onChange={e => startTransition(() => toggleFeesFlag(c.id, e.target.checked, user.id))}
                style={{ width: 16, height: 16, accentColor: C.RED }} />
              <span>Outstanding fees — flag for follow-up</span>
            </label>
          </PSection>

          {/* Verified */}
          {c.verified_at && (
            <PSection title="Verification">
              <PRow label="Verified at" value={fmtDate(c.verified_at)} />
            </PSection>
          )}
        </div>

        {/* Action bar */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: C.WHITE, borderTop: `1px solid ${C.BORDER}`, padding: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Save attempt action */}
          {c.stage === 'received' && !showSaveForm && (
            <button onClick={() => { setShowSaveForm(true); startTransition(() => advanceStage(c.id, 'save_attempt', user.id)) }}
              style={{ padding: '9px 14px', background: C.ORANGE, color: C.WHITE, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              Record save attempt
            </button>
          )}
          {c.stage === 'save_attempt' && !showSaveForm && (
            <button onClick={() => setShowSaveForm(true)}
              style={{ padding: '9px 14px', background: C.ORANGE, color: C.WHITE, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              Record outcome
            </button>
          )}

          {/* Advance stage */}
          {nextStage && nextStage !== 'save_attempt' && c.stage !== 'received' && (
            <button onClick={() => startTransition(() => advanceStage(c.id, nextStage, user.id))} disabled={pending}
              style={{ padding: '9px 14px', background: nextStage === 'verified' ? C.GREEN : C.ORANGE, color: C.WHITE, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {nextStageLabel[c.stage]}
            </button>
          )}

          {/* Undo */}
          {prevStage && (
            <button onClick={() => { if (confirm('Undo this stage?')) startTransition(() => undoStage(c.id, prevStage, user.id)) }}
              style={{ padding: '9px 14px', background: C.WHITE, color: C.MUTED, border: `1px solid ${C.BORDER}`, cursor: 'pointer', fontSize: 13 }}>
              Undo
            </button>
          )}

          {/* Archive (admin only) */}
          {isAdmin && (
            <button onClick={() => { if (confirm('Archive this cancellation?')) { startTransition(() => archiveCancellation(c.id, user.id)); onClose() } }}
              style={{ padding: '9px 14px', background: C.WHITE, color: C.RED, border: `1px solid ${C.RED}`, cursor: 'pointer', fontSize: 13, marginLeft: 'auto' }}>
              Archive
            </button>
          )}
        </div>
      </div>
    </>
  )
}

function PSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

function PRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: `1px solid ${C.BORDER}` }}>
      <span style={{ color: C.MUTED }}>{label}</span>
      <span style={{ fontWeight: 500, color: C.INK, maxWidth: '60%', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

const STAGE_FILTER_LABELS: Record<string, string> = {
  all: 'All',
  received: 'Received',
  save_attempt: 'Save attempted',
  processed: 'Processed',
  verified: 'Verified',
}

export default function CancellationsClient({ user, cancellations }: Props) {
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [siteFilter, setSiteFilter] = useState<string>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const isAdmin = user.role === 'admin' || user.role === 'management'

  const filtered = cancellations.filter(c => {
    if (stageFilter !== 'all' && c.stage !== stageFilter) return false
    if (siteFilter !== 'all' && c.site !== siteFilter) return false
    return true
  })

  const selected = selectedId ? cancellations.find(c => c.id === selectedId) : null

  // Counts by stage for badges
  const counts = cancellations.reduce((acc, c) => {
    acc[c.stage] = (acc[c.stage] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: C.MUTED }}>{filtered.length} cancellation{filtered.length !== 1 ? 's' : ''}</div>
        <a href="/cancel" target="_blank"
          style={{ fontSize: 12, color: C.ORANGE, textDecoration: 'underline', cursor: 'pointer' }}>
          Public cancellation form ↗
        </a>
      </div>

      {/* Stage filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: isAdmin ? 8 : 16, flexWrap: 'wrap' }}>
        {(['all', ...STAGE_ORDER] as string[]).map(s => (
          <button key={s} onClick={() => setStageFilter(s)}
            style={{
              padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: stageFilter === s ? C.ORANGE : C.WHITE,
              color: stageFilter === s ? C.WHITE : C.INK,
              border: `1px solid ${stageFilter === s ? C.ORANGE : C.BORDER}`,
            }}>
            {STAGE_FILTER_LABELS[s as string]}
            {s !== 'all' && counts[s] ? ` (${counts[s]})` : ''}
          </button>
        ))}
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

      {filtered.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: C.MUTED, fontSize: 14 }}>No cancellations found</div>
      )}

      {filtered.map(c => {
        const sc = STAGE_COLOURS[c.stage]
        return (
          <div key={c.id} onClick={() => setSelectedId(c.id)}
            style={{
              background: C.WHITE, border: `1px solid ${C.BORDER}`,
              borderLeft: `4px solid ${sc.bg}`,
              marginBottom: 6, padding: '12px 16px', cursor: 'pointer',
              display: 'flex', gap: 12, alignItems: 'flex-start',
            }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{c.member_name}</span>
                <span style={{ ...sc, padding: '2px 7px', fontSize: 11, fontWeight: 600 }}>{STAGE_LABELS[c.stage]}</span>
                {c.outcome && <span style={{ padding: '2px 7px', fontSize: 11, background: '#E5E7EB', color: C.INK, fontWeight: 600 }}>{OUTCOME_LABELS[c.outcome]}</span>}
                {c.outstanding_fees_flag && <span style={{ fontSize: 11, color: C.RED, fontWeight: 700 }}>⚠ fees</span>}
              </div>
              <div style={{ fontSize: 12, color: C.MUTED, marginTop: 3 }}>
                {c.site === 'coolaroo' ? 'Coolaroo' : 'Altona North'}
                {c.phone && ` · ${c.phone}`}
                {` · effective ${fmtDate(c.effective_date)}`}
              </div>
              {c.reasons.length > 0 && (
                <div style={{ fontSize: 11, color: C.MUTED, marginTop: 2 }}>{c.reasons.join(', ')}</div>
              )}
            </div>
            <div style={{ fontSize: 11, color: C.MUTED, whiteSpace: 'nowrap' }}>
              {fmtDate(c.notice_date)}
            </div>
          </div>
        )
      })}

      {selected && (
        <DetailPanel c={selected} user={user} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}
