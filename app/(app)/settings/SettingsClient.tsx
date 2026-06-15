'use client'

import { useState, useTransition } from 'react'
import type { AppUser, Programme, BlockoutDay, ChecklistItem, SiteT, UserRole } from '@/types'
import {
  addBlockoutDay, deleteBlockoutDay,
  upsertProgramme, archiveProgramme, restoreProgramme,
  upsertChecklistItem, toggleChecklistItem,
  createUser, updateUser, setUserActive,
} from './actions'

const C = {
  WHITE: '#FFFFFF', INK: '#17130E', MUTED: '#84776A',
  BORDER: '#D9CFC2', ORANGE: '#E26839', GREEN: '#3A7D44',
  RED: '#C0392B', SAND: '#F6F3EE',
}

const inp: React.CSSProperties = {
  padding: '8px 10px', border: `1px solid ${C.BORDER}`, fontSize: 13,
  background: C.WHITE, fontFamily: 'inherit', boxSizing: 'border-box' as const,
}

const ROLES: UserRole[] = ['receptionist', 'site_lead', 'admin', 'management']
const ROLE_LABELS: Record<UserRole, string> = {
  receptionist: 'Receptionist',
  site_lead: 'Site Lead',
  admin: 'Admin',
  management: 'Management',
}
const SITES: { value: SiteT | ''; label: string }[] = [
  { value: '', label: '— All sites —' },
  { value: 'coolaroo', label: 'Coolaroo' },
  { value: 'altona_north', label: 'Altona North' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.INK, marginBottom: 14, paddingBottom: 8, borderBottom: `2px solid ${C.BORDER}` }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Btn({ children, onClick, color = C.ORANGE, disabled }: { children: React.ReactNode; onClick?: () => void; color?: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
      background: color, color: C.WHITE, border: 'none', opacity: disabled ? 0.5 : 1,
    }}>{children}</button>
  )
}

function Ghost({ children, onClick, color = C.MUTED }: { children: React.ReactNode; onClick?: () => void; color?: string }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
      background: C.WHITE, color, border: `1px solid ${C.BORDER}`,
    }}>{children}</button>
  )
}

// ── Blockout Days ─────────────────────────────────────────────────────────────
function BlockoutSection({ days, userId }: { days: BlockoutDay[]; userId: string }) {
  const [site, setSite] = useState<SiteT>('coolaroo')
  const [day, setDay] = useState('')
  const [label, setLabel] = useState('')
  const [pending, startTransition] = useTransition()

  function add() {
    if (!day || !label.trim()) return
    startTransition(async () => {
      await addBlockoutDay(site, day, label.trim(), userId)
      setDay(''); setLabel('')
    })
  }

  const coolaroo = days.filter(d => d.site === 'coolaroo')
  const altona = days.filter(d => d.site === 'altona_north')

  function fmtDay(iso: string) {
    const d = new Date(iso + 'T12:00:00')
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
  }

  return (
    <Section title="Blockout days">
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, color: C.MUTED, marginBottom: 3 }}>SITE</div>
          <select value={site} onChange={e => setSite(e.target.value as SiteT)} style={{ ...inp }}>
            <option value="coolaroo">Coolaroo</option>
            <option value="altona_north">Altona North</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.MUTED, marginBottom: 3 }}>DATE</div>
          <input type="date" value={day} onChange={e => setDay(e.target.value)} style={{ ...inp }} />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 11, color: C.MUTED, marginBottom: 3 }}>LABEL</div>
          <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Good Friday"
            style={{ ...inp, width: '100%' }} />
        </div>
        <Btn onClick={add} disabled={!day || !label.trim() || pending}>Add</Btn>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {[{ site: 'coolaroo', label: 'Coolaroo', items: coolaroo }, { site: 'altona_north', label: 'Altona North', items: altona }].map(({ site: s, label: l, items }) => (
          <div key={s} style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.MUTED, marginBottom: 6 }}>{l}</div>
            {items.length === 0 && <div style={{ fontSize: 12, color: C.MUTED }}>None set</div>}
            {items.map(d => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${C.BORDER}`, fontSize: 13 }}>
                <span>{fmtDay(d.day)} — {d.label}</span>
                <Ghost color={C.RED} onClick={() => { if (confirm('Remove this blockout day?')) startTransition(() => deleteBlockoutDay(d.id, userId)) }}>Remove</Ghost>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Section>
  )
}

// ── Programmes ────────────────────────────────────────────────────────────────
function ProgrammeRow({ prog, userId, maxSort }: { prog: Programme; userId: string; maxSort: number }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(prog.name)
  const [minAge, setMinAge] = useState(String(prog.min_age ?? ''))
  const [maxAge, setMaxAge] = useState(String(prog.max_age ?? ''))
  const [sort, setSort] = useState(String(prog.sort))
  const [pending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      await upsertProgramme(prog.id, name.trim(), minAge ? parseFloat(minAge) : null, maxAge ? parseFloat(maxAge) : null, parseInt(sort) || 0, userId)
      setEditing(false)
    })
  }

  if (editing) {
    return (
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.BORDER}`, background: '#FAFAF8' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: 120 }}>
            <div style={{ fontSize: 10, color: C.MUTED, marginBottom: 2 }}>NAME</div>
            <input value={name} onChange={e => setName(e.target.value)} style={{ ...inp, width: '100%' }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.MUTED, marginBottom: 2 }}>MIN AGE</div>
            <input type="number" value={minAge} onChange={e => setMinAge(e.target.value)} style={{ ...inp, width: 60 }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.MUTED, marginBottom: 2 }}>MAX AGE</div>
            <input type="number" value={maxAge} onChange={e => setMaxAge(e.target.value)} style={{ ...inp, width: 60 }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.MUTED, marginBottom: 2 }}>SORT</div>
            <input type="number" value={sort} onChange={e => setSort(e.target.value)} style={{ ...inp, width: 50 }} />
          </div>
          <Btn onClick={save} disabled={!name.trim() || pending}>Save</Btn>
          <Ghost onClick={() => setEditing(false)}>Cancel</Ghost>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: `1px solid ${C.BORDER}`, opacity: prog.active ? 1 : 0.5 }}>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{prog.name}</span>
      <span style={{ fontSize: 12, color: C.MUTED }}>
        {prog.min_age != null && prog.max_age != null ? `${prog.min_age}–${prog.max_age} yrs` : prog.min_age != null ? `${prog.min_age}+ yrs` : prog.max_age != null ? `up to ${prog.max_age} yrs` : '—'}
      </span>
      <span style={{ fontSize: 11, color: C.MUTED }}>#{prog.sort}</span>
      <Ghost onClick={() => setEditing(true)}>Edit</Ghost>
      {prog.active
        ? <Ghost color={C.RED} onClick={() => { if (confirm('Archive this programme?')) startTransition(() => archiveProgramme(prog.id, userId)) }}>Archive</Ghost>
        : <Ghost color={C.GREEN} onClick={() => startTransition(() => restoreProgramme(prog.id, userId))}>Restore</Ghost>
      }
    </div>
  )
}

function ProgrammesSection({ programmes, userId }: { programmes: Programme[]; userId: string }) {
  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [minAge, setMinAge] = useState('')
  const [maxAge, setMaxAge] = useState('')
  const [pending, startTransition] = useTransition()
  const maxSort = programmes.reduce((m, p) => Math.max(m, p.sort), 0)

  function create() {
    if (!name.trim()) return
    startTransition(async () => {
      await upsertProgramme(null, name.trim(), minAge ? parseFloat(minAge) : null, maxAge ? parseFloat(maxAge) : null, maxSort + 10, userId)
      setName(''); setMinAge(''); setMaxAge(''); setShowNew(false)
    })
  }

  return (
    <Section title="Programmes">
      <div style={{ background: C.WHITE, border: `1px solid ${C.BORDER}`, marginBottom: 10 }}>
        {programmes.map(p => <ProgrammeRow key={p.id} prog={p} userId={userId} maxSort={maxSort} />)}
        {programmes.length === 0 && <div style={{ padding: 16, fontSize: 13, color: C.MUTED }}>No programmes yet</div>}
      </div>
      {showNew ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: 120 }}>
            <div style={{ fontSize: 10, color: C.MUTED, marginBottom: 2 }}>NAME</div>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Programme name" style={{ ...inp, width: '100%' }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.MUTED, marginBottom: 2 }}>MIN AGE</div>
            <input type="number" value={minAge} onChange={e => setMinAge(e.target.value)} style={{ ...inp, width: 60 }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.MUTED, marginBottom: 2 }}>MAX AGE</div>
            <input type="number" value={maxAge} onChange={e => setMaxAge(e.target.value)} style={{ ...inp, width: 60 }} />
          </div>
          <Btn onClick={create} disabled={!name.trim() || pending}>Create</Btn>
          <Ghost onClick={() => setShowNew(false)}>Cancel</Ghost>
        </div>
      ) : (
        <Ghost onClick={() => setShowNew(true)}>+ Add programme</Ghost>
      )}
    </Section>
  )
}

// ── Checklist items ───────────────────────────────────────────────────────────
function ChecklistRow({ item, userId }: { item: ChecklistItem; userId: string }) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(item.label)
  const [site, setSite] = useState<SiteT | ''>(item.site ?? '')
  const [role, setRole] = useState<UserRole | ''>(item.role ?? '')
  const [sort, setSort] = useState(String(item.sort))
  const [pending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      await upsertChecklistItem(item.id, label.trim(), site || null, role as UserRole | null, parseInt(sort) || 0, userId)
      setEditing(false)
    })
  }

  if (editing) {
    return (
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.BORDER}`, background: '#FAFAF8' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: 140 }}>
            <div style={{ fontSize: 10, color: C.MUTED, marginBottom: 2 }}>LABEL</div>
            <input value={label} onChange={e => setLabel(e.target.value)} style={{ ...inp, width: '100%' }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.MUTED, marginBottom: 2 }}>SITE</div>
            <select value={site} onChange={e => setSite(e.target.value as SiteT | '')} style={{ ...inp }}>
              {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.MUTED, marginBottom: 2 }}>ROLE</div>
            <select value={role} onChange={e => setRole(e.target.value as UserRole | '')} style={{ ...inp }}>
              <option value="">— All roles —</option>
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.MUTED, marginBottom: 2 }}>SORT</div>
            <input type="number" value={sort} onChange={e => setSort(e.target.value)} style={{ ...inp, width: 50 }} />
          </div>
          <Btn onClick={save} disabled={!label.trim() || pending}>Save</Btn>
          <Ghost onClick={() => setEditing(false)}>Cancel</Ghost>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: `1px solid ${C.BORDER}`, opacity: item.active ? 1 : 0.5 }}>
      <span style={{ flex: 1, fontSize: 13 }}>{item.label}</span>
      <span style={{ fontSize: 11, color: C.MUTED }}>{item.site ? (item.site === 'coolaroo' ? 'Coo' : 'AN') : 'All'}</span>
      <span style={{ fontSize: 11, color: C.MUTED }}>{item.role ? ROLE_LABELS[item.role] : 'All roles'}</span>
      <Ghost onClick={() => setEditing(true)}>Edit</Ghost>
      <Ghost color={item.active ? C.RED : C.GREEN}
        onClick={() => startTransition(() => toggleChecklistItem(item.id, !item.active, userId))}>
        {item.active ? 'Disable' : 'Enable'}
      </Ghost>
    </div>
  )
}

function ChecklistSection({ items, userId }: { items: ChecklistItem[]; userId: string }) {
  const [showNew, setShowNew] = useState(false)
  const [label, setLabel] = useState('')
  const [site, setSite] = useState<SiteT | ''>('')
  const [role, setRole] = useState<UserRole | ''>('')
  const [pending, startTransition] = useTransition()
  const maxSort = items.reduce((m, i) => Math.max(m, i.sort), 0)

  function create() {
    if (!label.trim()) return
    startTransition(async () => {
      await upsertChecklistItem(null, label.trim(), site || null, role as UserRole | null, maxSort + 10, userId)
      setLabel(''); setSite(''); setRole(''); setShowNew(false)
    })
  }

  return (
    <Section title="Daily checklist">
      <div style={{ background: C.WHITE, border: `1px solid ${C.BORDER}`, marginBottom: 10 }}>
        {items.map(i => <ChecklistRow key={i.id} item={i} userId={userId} />)}
        {items.length === 0 && <div style={{ padding: 16, fontSize: 13, color: C.MUTED }}>No checklist items yet</div>}
      </div>
      {showNew ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: 160 }}>
            <div style={{ fontSize: 10, color: C.MUTED, marginBottom: 2 }}>LABEL</div>
            <input autoFocus value={label} onChange={e => setLabel(e.target.value)} placeholder="Checklist item" style={{ ...inp, width: '100%' }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.MUTED, marginBottom: 2 }}>SITE</div>
            <select value={site} onChange={e => setSite(e.target.value as SiteT | '')} style={{ ...inp }}>
              {SITES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.MUTED, marginBottom: 2 }}>ROLE</div>
            <select value={role} onChange={e => setRole(e.target.value as UserRole | '')} style={{ ...inp }}>
              <option value="">— All roles —</option>
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <Btn onClick={create} disabled={!label.trim() || pending}>Add</Btn>
          <Ghost onClick={() => setShowNew(false)}>Cancel</Ghost>
        </div>
      ) : (
        <Ghost onClick={() => setShowNew(true)}>+ Add item</Ghost>
      )}
    </Section>
  )
}

// ── Users ─────────────────────────────────────────────────────────────────────
function UserRow({ u, currentUserId }: { u: AppUser; currentUserId: string }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(u.name)
  const [role, setRole] = useState<UserRole>(u.role)
  const [site, setSite] = useState<SiteT | ''>(u.site ?? '')
  const [pending, startTransition] = useTransition()
  const isSelf = u.id === currentUserId

  function save() {
    startTransition(async () => {
      await updateUser(u.id, name.trim(), role, site || null, currentUserId)
      setEditing(false)
    })
  }

  const needsSite = role === 'receptionist' || role === 'site_lead'

  if (editing) {
    return (
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.BORDER}`, background: '#FAFAF8' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: 120 }}>
            <div style={{ fontSize: 10, color: C.MUTED, marginBottom: 2 }}>NAME</div>
            <input value={name} onChange={e => setName(e.target.value)} style={{ ...inp, width: '100%' }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.MUTED, marginBottom: 2 }}>ROLE</div>
            <select value={role} onChange={e => setRole(e.target.value as UserRole)} style={{ ...inp }}>
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          {needsSite && (
            <div>
              <div style={{ fontSize: 10, color: C.MUTED, marginBottom: 2 }}>SITE</div>
              <select value={site} onChange={e => setSite(e.target.value as SiteT | '')} style={{ ...inp }}>
                <option value="">— select —</option>
                <option value="coolaroo">Coolaroo</option>
                <option value="altona_north">Altona North</option>
              </select>
            </div>
          )}
          <Btn onClick={save} disabled={!name.trim() || (needsSite && !site) || pending}>Save</Btn>
          <Ghost onClick={() => setEditing(false)}>Cancel</Ghost>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: `1px solid ${C.BORDER}`, opacity: u.active ? 1 : 0.4 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{u.name} {isSelf && <span style={{ fontSize: 11, color: C.MUTED }}>(you)</span>}</div>
        <div style={{ fontSize: 11, color: C.MUTED }}>{u.email}</div>
      </div>
      <span style={{ fontSize: 12, color: C.MUTED }}>{ROLE_LABELS[u.role]}</span>
      <span style={{ fontSize: 12, color: C.MUTED }}>{u.site ? (u.site === 'coolaroo' ? 'Coolaroo' : 'Altona North') : 'All sites'}</span>
      <Ghost onClick={() => setEditing(true)}>Edit</Ghost>
      {!isSelf && (
        <Ghost color={u.active ? C.RED : C.GREEN}
          onClick={() => { if (confirm(u.active ? 'Deactivate this user?' : 'Reactivate this user?')) startTransition(() => setUserActive(u.id, !u.active, currentUserId)) }}>
          {u.active ? 'Deactivate' : 'Reactivate'}
        </Ghost>
      )}
    </div>
  )
}

function UsersSection({ users, userId }: { users: AppUser[]; userId: string }) {
  const [showNew, setShowNew] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<UserRole>('receptionist')
  const [site, setSite] = useState<SiteT | ''>('coolaroo')
  const [errMsg, setErrMsg] = useState('')
  const [pending, startTransition] = useTransition()
  const needsSite = role === 'receptionist' || role === 'site_lead'

  function create() {
    if (!email.trim() || !name.trim()) return
    setErrMsg('')
    startTransition(async () => {
      const result = await createUser(email.trim(), name.trim(), role, needsSite ? (site || null) : null, userId)
      if (result.ok) {
        setEmail(''); setName(''); setRole('receptionist'); setSite('coolaroo'); setShowNew(false)
      } else {
        setErrMsg(result.error ?? 'Failed to create user')
      }
    })
  }

  return (
    <Section title="Users">
      <div style={{ background: C.WHITE, border: `1px solid ${C.BORDER}`, marginBottom: 10 }}>
        {users.map(u => <UserRow key={u.id} u={u} currentUserId={userId} />)}
      </div>
      {showNew ? (
        <div style={{ background: C.WHITE, border: `1px solid ${C.BORDER}`, padding: '16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>New user</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ flex: 2, minWidth: 160 }}>
              <div style={{ fontSize: 10, color: C.MUTED, marginBottom: 2 }}>FULL NAME</div>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" style={{ ...inp, width: '100%' }} />
            </div>
            <div style={{ flex: 2, minWidth: 180 }}>
              <div style={{ fontSize: 10, color: C.MUTED, marginBottom: 2 }}>EMAIL</div>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@athleta.com.au" style={{ ...inp, width: '100%' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: C.MUTED, marginBottom: 2 }}>ROLE</div>
              <select value={role} onChange={e => setRole(e.target.value as UserRole)} style={{ ...inp }}>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
            {needsSite && (
              <div>
                <div style={{ fontSize: 10, color: C.MUTED, marginBottom: 2 }}>SITE</div>
                <select value={site} onChange={e => setSite(e.target.value as SiteT | '')} style={{ ...inp }}>
                  <option value="">— select —</option>
                  <option value="coolaroo">Coolaroo</option>
                  <option value="altona_north">Altona North</option>
                </select>
              </div>
            )}
          </div>
          <div style={{ fontSize: 11, color: C.MUTED, marginBottom: 10 }}>
            A temporary password will be generated. The user should change it on first login via Supabase Auth or the login page.
          </div>
          {errMsg && <div style={{ color: C.RED, fontSize: 12, marginBottom: 8 }}>{errMsg}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <Ghost onClick={() => setShowNew(false)}>Cancel</Ghost>
            <Btn onClick={create} disabled={!email.trim() || !name.trim() || (needsSite && !site) || pending}>
              {pending ? 'Creating…' : 'Create user'}
            </Btn>
          </div>
        </div>
      ) : (
        <Ghost onClick={() => setShowNew(true)}>+ Add user</Ghost>
      )}
    </Section>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  user: AppUser
  programmes: Programme[]
  blockoutDays: BlockoutDay[]
  checklistItems: ChecklistItem[]
  allUsers: AppUser[]
}

export default function SettingsClient({ user, programmes, blockoutDays, checklistItems, allUsers }: Props) {
  return (
    <div style={{ maxWidth: 860 }}>
      <BlockoutSection days={blockoutDays} userId={user.id} />
      <ProgrammesSection programmes={programmes} userId={user.id} />
      <ChecklistSection items={checklistItems} userId={user.id} />
      <UsersSection users={allUsers} userId={user.id} />
    </div>
  )
}
