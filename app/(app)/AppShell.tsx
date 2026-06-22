'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AppUser } from '@/types'

const SITE_LABELS: Record<string, string> = {
  coolaroo: 'Coolaroo',
  altona_north: 'Altona North',
}

interface Tab {
  label: string
  href: string
  roles: string[]
}

const TABS: Tab[] = [
  { label: 'Dashboard', href: '/today', roles: ['receptionist', 'site_lead', 'admin', 'management'] },
  { label: 'Leads', href: '/leads', roles: ['receptionist', 'site_lead', 'admin', 'management'] },
  { label: 'Cancellations', href: '/cancellations', roles: ['receptionist', 'site_lead', 'admin', 'management'] },
  { label: 'Reports', href: '/stats', roles: ['receptionist', 'site_lead', 'admin', 'management'] },
  { label: 'Settings', href: '/settings', roles: ['admin', 'management'] },
]

const C = {
  ink: '#23201d',
  muted: '#5f5851',
  faint: '#877f75',
  orange: '#E26839',
  line: '#efeae3',
  line2: '#e6e0d8',
  soft: '#faf8f6',
  font: "'Nunito Sans', -apple-system, system-ui, sans-serif",
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export default function AppShell({
  user,
  children,
}: {
  user: AppUser
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const visibleTabs = TABS.filter((tab) => tab.roles.includes(user.role))

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f6f4f1', fontFamily: C.font }}>
      {/* Orange top stripe */}
      <div style={{ height: 3, background: C.orange }} />

      {/* Header */}
      <header style={{
        background: '#fff',
        borderBottom: `1px solid ${C.line}`,
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        padding: '14px 32px',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 'none' }}>
          <span style={{ width: 18, height: 18, borderRadius: 5, background: C.orange, display: 'inline-block', flexShrink: 0 }} />
          <b style={{ fontWeight: 800, fontSize: 17, color: C.ink, letterSpacing: '-0.3px' }}>Athleta</b>
          <span style={{ color: C.muted, fontSize: 12, fontWeight: 600, letterSpacing: '0.3px', paddingLeft: 9, borderLeft: `1px solid ${C.line2}` }}>
            Front of House
          </span>
        </div>

        {/* Search */}
        <div style={{
          flex: 1, maxWidth: 420,
          display: 'flex', alignItems: 'center', gap: 9,
          background: C.soft, border: `1px solid ${C.line2}`,
          borderRadius: 8, padding: '9px 13px',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            placeholder="Search a child, parent or mobile number…"
            style={{
              border: 'none', background: 'none', outline: 'none',
              fontFamily: C.font, fontSize: 13.5, color: C.ink, width: '100%',
            }}
          />
        </div>

        {/* Add lead shortcut */}
        <Link
          href="/leads?add=1"
          title="Add a new lead"
          style={{
            display: 'grid', placeItems: 'center',
            width: 36, height: 36, borderRadius: 8,
            background: C.orange, color: '#fff',
            textDecoration: 'none', flexShrink: 0,
            fontSize: 22, fontWeight: 400, lineHeight: 1,
          }}
        >
          +
        </Link>

        {/* User */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14, flex: 'none' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: C.ink }}>{user.name}</div>
            <div style={{ color: C.muted, fontSize: 11.5 }}>
              {user.site ? (SITE_LABELS[user.site] ?? user.site) : 'All sites'}
            </div>
          </div>
          <div style={{
            width: 34, height: 34, borderRadius: 8, background: C.ink, color: '#fff',
            display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0,
          }}>
            {initials(user.name)}
          </div>
          <button
            onClick={handleLogout}
            style={{
              fontFamily: C.font, background: 'none', border: `1px solid ${C.line2}`,
              color: C.muted, borderRadius: 7, padding: '6px 11px', fontSize: 12, cursor: 'pointer',
            }}
          >
            Log out
          </button>
        </div>
      </header>

      {/* Tab row */}
      <nav style={{
        background: '#fff',
        borderBottom: `1px solid ${C.line}`,
        padding: '0 32px',
        display: 'flex',
        gap: 26,
      }}>
        {visibleTabs.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/')
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                padding: '13px 2px',
                textDecoration: 'none',
                color: isActive ? C.ink : C.muted,
                fontSize: 13.5,
                fontWeight: isActive ? 700 : 500,
                borderBottom: isActive ? `2px solid ${C.orange}` : '2px solid transparent',
                display: 'inline-block',
              }}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>

      {/* Page content */}
      <main style={{ maxWidth: 1240, margin: '0 auto', padding: '26px 32px 60px' }}>{children}</main>
    </div>
  )
}
