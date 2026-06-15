'use client'

import { useState, useTransition } from 'react'
import type { AppUser, Lead, Target, BlockoutDay, Cancellation, SiteT, SiteSettings } from '@/types'
import { upsertTarget, updateSiteMembers } from './actions'

const C = {
  SAND: '#F6F3EE',
  WHITE: '#FFFFFF',
  INK: '#17130E',
  MUTED: '#84776A',
  BORDER: '#D9CFC2',
  ORANGE: '#E26839',
  GREEN: '#3A7D44',
  RED: '#C0392B',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function monthLabel(monthStart: string): string {
  return new Date(monthStart + 'T12:00:00').toLocaleString('en-AU', { month: 'long', year: 'numeric' })
}

function calcOpDaysLeft(todayStr: string, blockoutDays: BlockoutDay[]): { elapsed: number; remaining: number; total: number } {
  const today = new Date(todayStr + 'T12:00:00')
  const year = today.getFullYear()
  const month = today.getMonth()
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 0)
  const blockoutSet = new Set(blockoutDays.map(b => b.day))

  let elapsed = 0, remaining = 0
  const d = new Date(monthStart)
  while (d <= monthEnd) {
    const ds = d.toISOString().split('T')[0]
    if (d.getDay() !== 0 && !blockoutSet.has(ds)) {
      if (d <= today) elapsed++
      else remaining++
    }
    d.setDate(d.getDate() + 1)
  }
  return { elapsed, remaining, total: elapsed + remaining }
}

function Bar({ value, max, color = C.ORANGE }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div style={{ background: '#E5E7EB', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 6 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s' }} />
    </div>
  )
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div style={{ background: C.WHITE, border: `1px solid ${C.BORDER}`, padding: '16px 20px', flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: accent ?? C.INK, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.MUTED, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.MUTED, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}

interface TargetFormProps {
  site: SiteT
  existing: Target | undefined
  userId: string
}

function TargetForm({ site, existing, userId }: TargetFormProps) {
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const [netGoal, setNetGoal] = useState(String(existing?.net_growth_goal ?? ''))
  const [salesGoal, setSalesGoal] = useState(String(existing?.sales_goal ?? ''))
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      await upsertTarget(site, monthStart, parseInt(netGoal) || 0, salesGoal ? parseInt(salesGoal) : null, userId)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div style={{ background: C.WHITE, border: `1px solid ${C.BORDER}`, padding: '16px 20px', marginBottom: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{site === 'coolaroo' ? 'Coolaroo' : 'Altona North'}</div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, color: C.MUTED, marginBottom: 4 }}>NET GROWTH GOAL</div>
          <input type="number" value={netGoal} onChange={e => setNetGoal(e.target.value)} min="0"
            style={{ width: 80, padding: '8px', border: `1px solid ${C.BORDER}`, fontSize: 16, fontWeight: 700, textAlign: 'center' }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.MUTED, marginBottom: 4 }}>SALES GOAL (optional)</div>
          <input type="number" value={salesGoal} onChange={e => setSalesGoal(e.target.value)} min="0"
            style={{ width: 80, padding: '8px', border: `1px solid ${C.BORDER}`, fontSize: 16, fontWeight: 700, textAlign: 'center' }} />
        </div>
        <button onClick={save} disabled={pending || !netGoal}
          style={{ padding: '9px 20px', background: saved ? C.GREEN : C.ORANGE, color: C.WHITE, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          {saved ? '✓ Saved' : pending ? 'Saving…' : 'Save target'}
        </button>
      </div>
    </div>
  )
}

function MemberBaselineForm({ site, currentValue, userId }: { site: SiteT; currentValue: number; userId: string }) {
  const [val, setVal] = useState(String(currentValue))
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      await updateSiteMembers(site, parseInt(val) || 0, userId)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div style={{ background: C.WHITE, border: `1px solid ${C.BORDER}`, padding: '14px 20px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <span style={{ fontWeight: 600, fontSize: 14, minWidth: 130 }}>{site === 'coolaroo' ? 'Coolaroo' : 'Altona North'}</span>
      <div>
        <div style={{ fontSize: 11, color: C.MUTED, marginBottom: 4 }}>CURRENT ACTIVE MEMBERS</div>
        <input type="number" value={val} onChange={e => setVal(e.target.value)} min="0"
          style={{ width: 90, padding: '7px 10px', border: `1px solid ${C.BORDER}`, fontSize: 16, fontWeight: 700, textAlign: 'center' }} />
      </div>
      <button onClick={save} disabled={pending}
        style={{ padding: '9px 20px', background: saved ? C.GREEN : C.ORANGE, color: C.WHITE, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, alignSelf: 'flex-end', marginBottom: 1 }}>
        {saved ? '✓ Saved' : pending ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

function DebitScheduleTable({ siteSettings, netGrowthPerDay, netGoalPerMonth, todayStr }: {
  siteSettings: SiteSettings[]
  netGrowthPerDay: number
  netGoalPerMonth: number
  todayStr: string
}) {
  const baseMembers = siteSettings.reduce((sum, s) => sum + s.current_members, 0)

  if (baseMembers === 0) {
    return (
      <div style={{ background: C.WHITE, border: `1px solid ${C.BORDER}`, padding: 24, textAlign: 'center', color: C.MUTED, fontSize: 13 }}>
        Set the current active member count above to generate projections.
      </div>
    )
  }

  // Next Monday from today
  const today = new Date(todayStr + 'T12:00:00')
  const dayOfWeek = today.getDay()
  const daysToNextMon = dayOfWeek === 1 ? 0 : dayOfWeek === 0 ? 1 : 8 - dayOfWeek
  const firstDate = new Date(today)
  firstDate.setDate(today.getDate() + daysToNextMon)

  const netGoalPerDay = netGoalPerMonth / 30

  const rows: { date: string; runRate: number; targetTrajectory: number }[] = []
  for (let i = 0; i < 26; i++) {
    const d = new Date(firstDate)
    d.setDate(firstDate.getDate() + i * 14)
    const daysAhead = (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    rows.push({
      date: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
      runRate: Math.round(baseMembers + netGrowthPerDay * daysAhead),
      targetTrajectory: Math.round(baseMembers + netGoalPerDay * daysAhead),
    })
  }

  return (
    <div style={{ background: C.WHITE, border: `1px solid ${C.BORDER}`, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: C.SAND }}>
            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: C.MUTED, letterSpacing: '0.07em' }}>Debit date</th>
            <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: C.MUTED, letterSpacing: '0.07em' }}>Run-rate projection</th>
            <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: C.MUTED, letterSpacing: '0.07em' }}>Target trajectory</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.date} style={{ background: i % 2 === 0 ? C.WHITE : C.SAND }}>
              <td style={{ padding: '9px 14px', fontWeight: 600 }}>{r.date}</td>
              <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: C.INK }}>{r.runRate.toLocaleString()}</td>
              <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: r.runRate >= r.targetTrajectory ? C.GREEN : C.RED }}>{r.targetTrajectory.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface Props {
  user: AppUser
  leads: Lead[]
  cancellations: Cancellation[]
  targets: Target[]
  sourceLeads: { source: string; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; received_at: string }[]
  staff: AppUser[]
  blockoutDays: BlockoutDay[]
  monthStart: string
  todayStr: string
  siteSettings: SiteSettings[]
}

export default function StatsClient({ user, leads, cancellations, targets, sourceLeads, staff, blockoutDays, monthStart, todayStr, siteSettings }: Props) {
  const isAdmin = user.role === 'admin' || user.role === 'management'
  const isManagement = user.role === 'management'
  const siteFilter = isAdmin ? null : user.site
  const [tab, setTab] = useState<'overview' | 'sources' | 'targets' | 'debit'>('overview')

  const opDays = calcOpDaysLeft(todayStr, blockoutDays)

  // Core metrics
  const verifiedSales = leads.filter(l => l.status === 'won' && l.verified_at)
  const pendingSales = leads.filter(l => l.status === 'won' && !l.verified_at)
  const verifiedDepartures = cancellations.filter(c => c.stage === 'verified' && c.outcome === 'departed')
  const netGrowth = verifiedSales.length - verifiedDepartures.length

  const target = targets[0] // for single-site users; admin sees combined
  const netGoal = targets.reduce((sum, t) => sum + t.net_growth_goal, 0)
  const salesGoal = targets.reduce((sum, t) => sum + (t.sales_goal ?? 0), 0)

  const pace = opDays.elapsed > 0 ? (verifiedSales.length / opDays.elapsed) : 0
  const projectedSales = Math.round(pace * opDays.total)
  const neededPerDay = opDays.remaining > 0 ? ((netGoal - netGrowth) / opDays.remaining).toFixed(1) : '0'

  // Stage counts
  const newLeads = leads.filter(l => l.status === 'new')
  const bookedLeads = leads.filter(l => l.status === 'booked')
  const noShows = leads.filter(l => l.status === 'noshow')
  const nurtureLeads = leads.filter(l => l.status === 'nurture')

  // First response time (new leads that have been contacted)
  const contactedLeads = leads.filter(l => l.contacted && l.received_at)
  // We don't have first_contact_at, so approximate from activities — skip for now, show attempted count
  const contactRate = leads.length > 0 ? Math.round((leads.filter(l => l.contacted).length / leads.length) * 100) : 0

  // My sales
  const mySales = leads.filter(l => l.status === 'won' && l.sold_by === user.id)
  const myVerified = mySales.filter(l => l.verified_at)

  // Source breakdown (last 90 days)
  const sourceCounts: Record<string, number> = {}
  for (const l of sourceLeads) {
    const key = l.utm_source ? `${l.utm_source}${l.utm_medium ? ` / ${l.utm_medium}` : ''}` : (l.source || 'Unknown')
    sourceCounts[key] = (sourceCounts[key] ?? 0) + 1
  }
  const sortedSources = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])
  const totalSourceLeads = sourceLeads.length

  // Staff sales leaderboard
  const staffSales = staff
    .filter(s => s.role !== 'management')
    .map(s => {
      const sold = leads.filter(l => l.status === 'won' && l.sold_by === s.id)
      return { ...s, sold: sold.length, verified: sold.filter(l => l.verified_at).length }
    })
    .filter(s => s.sold > 0)
    .sort((a, b) => b.verified - a.verified)

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.BORDER}`, marginBottom: 24 }}>
        {(['overview', 'sources', ...(isAdmin ? ['targets', 'debit'] : [])] as string[]).map(t => (
          <button key={t} onClick={() => setTab(t as typeof tab)}
            style={{
              padding: '10px 18px', fontSize: 13, fontWeight: tab === t ? 700 : 500, cursor: 'pointer',
              background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? C.ORANGE : 'transparent'}`,
              color: tab === t ? C.ORANGE : C.INK, marginBottom: -1, textTransform: 'capitalize',
            }}>
            {t === 'targets' ? 'Set targets' : t === 'debit' ? 'Debit schedule' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div style={{ background: C.WHITE, border: `2px solid ${C.ORANGE}`, padding: '20px 24px', marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              Net growth — {monthLabel(monthStart)}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontSize: 48, fontWeight: 800, color: netGrowth >= 0 ? C.GREEN : C.RED, lineHeight: 1 }}>
                {netGrowth >= 0 ? '+' : ''}{netGrowth}
              </span>
              {netGoal > 0 && (
                <span style={{ fontSize: 18, color: C.MUTED, fontWeight: 600 }}>of +{netGoal} goal</span>
              )}
            </div>
            {netGoal > 0 && <Bar value={Math.max(0, netGrowth)} max={netGoal} color={netGrowth >= netGoal ? C.GREEN : C.ORANGE} />}
            <div style={{ display: 'flex', gap: 20, marginTop: 12, fontSize: 12, color: C.MUTED, flexWrap: 'wrap' }}>
              <span>{verifiedSales.length} verified sale{verifiedSales.length !== 1 ? 's' : ''}</span>
              <span>{verifiedDepartures.length} verified departure{verifiedDepartures.length !== 1 ? 's' : ''}</span>
              {pendingSales.length > 0 && <span style={{ color: C.ORANGE }}>{pendingSales.length} pending verification</span>}
              {opDays.remaining > 0 && netGoal > 0 && <span>≈{neededPerDay}/day needed · {opDays.remaining} op-days left</span>}
            </div>
          </div>

          <Section title="This month at a glance">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <StatCard label="New leads" value={newLeads.length} />
              <StatCard label="Booked" value={bookedLeads.length} />
              <StatCard label="No-shows" value={noShows.length} accent={noShows.length > 0 ? C.RED : undefined} />
              <StatCard label="Nurture" value={nurtureLeads.length} />
              <StatCard label="Contact rate" value={`${contactRate}%`} sub={`${leads.filter(l => l.contacted).length} of ${leads.length} leads`} />
            </div>
          </Section>

          {salesGoal > 0 && (
            <Section title="Sales goal">
              <div style={{ background: C.WHITE, border: `1px solid ${C.BORDER}`, padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{verifiedSales.length} verified of {salesGoal} goal</span>
                  <span style={{ fontSize: 12, color: C.MUTED }}>Projected: {projectedSales}</span>
                </div>
                <Bar value={verifiedSales.length} max={salesGoal} color={verifiedSales.length >= salesGoal ? C.GREEN : C.ORANGE} />
              </div>
            </Section>
          )}

          <Section title="My sales this month">
            <div style={{ display: 'flex', gap: 8 }}>
              <StatCard label="My sales" value={mySales.length} />
              <StatCard label="Verified" value={myVerified.length} accent={myVerified.length > 0 ? C.GREEN : undefined} />
              <StatCard label="Pending verify" value={mySales.length - myVerified.length} accent={mySales.length - myVerified.length > 0 ? C.ORANGE : undefined} />
            </div>
          </Section>

          {isAdmin && staffSales.length > 0 && (
            <Section title="Sales leaderboard">
              <div style={{ background: C.WHITE, border: `1px solid ${C.BORDER}` }}>
                {staffSales.map((s, i) => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: i < staffSales.length - 1 ? `1px solid ${C.BORDER}` : 'none' }}>
                    <span style={{ fontSize: 13, color: C.MUTED, width: 20, textAlign: 'center' }}>{i + 1}</span>
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{s.name}</span>
                    <span style={{ fontSize: 13, color: C.GREEN, fontWeight: 700 }}>{s.verified} verified</span>
                    {s.sold - s.verified > 0 && <span style={{ fontSize: 12, color: C.ORANGE }}>+{s.sold - s.verified} pending</span>}
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      {tab === 'sources' && (
        <>
          <Section title={`Lead sources — last 90 days (${totalSourceLeads} total)`}>
            <div style={{ background: C.WHITE, border: `1px solid ${C.BORDER}` }}>
              {sortedSources.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: C.MUTED, fontSize: 13 }}>No lead data yet</div>
              )}
              {sortedSources.map(([source, count], i) => (
                <div key={source} style={{ padding: '10px 16px', borderBottom: i < sortedSources.length - 1 ? `1px solid ${C.BORDER}` : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{source}</span>
                    <span style={{ fontSize: 13, color: C.MUTED }}>{count} ({totalSourceLeads > 0 ? Math.round((count / totalSourceLeads) * 100) : 0}%)</span>
                  </div>
                  <Bar value={count} max={sortedSources[0][1]} color={C.ORANGE} />
                </div>
              ))}
            </div>
          </Section>
        </>
      )}

      {tab === 'targets' && isAdmin && (
        <>
          <Section title={`Set targets — ${monthLabel(monthStart)}`}>
            <p style={{ fontSize: 13, color: C.MUTED, marginBottom: 16 }}>
              Net growth = verified sales − verified departures. Only verified items count toward targets.
            </p>
            {(['coolaroo', 'altona_north'] as SiteT[]).map(site => (
              <TargetForm
                key={site}
                site={site}
                existing={targets.find(t => t.site === site)}
                userId={user.id}
              />
            ))}
          </Section>
        </>
      )}

      {tab === 'debit' && isAdmin && (
        <>
          <Section title="Member baseline">
            <p style={{ fontSize: 13, color: C.MUTED, marginBottom: 12 }}>
              Enter the current active member count per site to anchor the projections below.
            </p>
            {(['coolaroo', 'altona_north'] as SiteT[]).filter(s => !siteFilter || siteFilter === s).map(site => (
              <MemberBaselineForm
                key={site}
                site={site}
                currentValue={siteSettings.find(s => s.site === site)?.current_members ?? 0}
                userId={user.id}
              />
            ))}
          </Section>

          <Section title="Fortnightly debit schedule — next 12 months">
            <p style={{ fontSize: 13, color: C.MUTED, marginBottom: 12 }}>
              Run-rate uses this month's verified net growth pace. Target trajectory uses the monthly net growth goal.
            </p>
            <DebitScheduleTable
              siteSettings={siteSettings.filter(s => !siteFilter || siteFilter === s.site)}
              netGrowthPerDay={opDays.elapsed > 0 ? netGrowth / opDays.elapsed : 0}
              netGoalPerMonth={netGoal}
              todayStr={todayStr}
            />
          </Section>
        </>
      )}
    </div>
  )
}
