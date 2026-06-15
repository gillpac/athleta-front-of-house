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
  { label: 'Today', href: '/today', roles: ['receptionist', 'site_lead', 'admin', 'management'] },
  { label: 'Leads', href: '/leads', roles: ['receptionist', 'site_lead', 'admin', 'management'] },
  { label: 'Cancellations', href: '/cancellations', roles: ['receptionist', 'site_lead', 'admin', 'management'] },
  { label: 'Reports', href: '/stats', roles: ['receptionist', 'site_lead', 'admin', 'management'] },
  { label: 'Settings', href: '/settings', roles: ['admin', 'management'] },
]

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
    <div style={{ minHeight: '100vh', backgroundColor: '#F4F4F2' }}>
      {/* Header */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderTop: '3px solid #E26839',
          borderBottom: '1px solid #D9CFC2',
          height: 52,
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
       <div style={{ maxWidth: 1040, margin: '0 auto', padding: '0 24px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-0.5px', color: '#17130E' }}>
            ATHLETA
          </span>
          <span style={{ fontSize: 11, color: '#84776A', letterSpacing: '0.08em', fontWeight: 600 }}>
            FRONT OF HOUSE
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#17130E' }}>{user.name}</div>
            <div style={{ fontSize: 11, color: '#84776A', marginTop: 1 }}>
              {user.site ? (SITE_LABELS[user.site] ?? user.site) : 'All sites'}
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              fontSize: 11, fontWeight: 600, color: '#84776A', background: 'none',
              border: '1px solid #D9CFC2', padding: '4px 10px', cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Log out
          </button>
        </div>
       </div>
      </div>

      {/* Tab row */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #D9CFC2',
        }}
      >
       <div style={{ maxWidth: 1040, margin: '0 auto', padding: '0 24px', display: 'flex', gap: 0 }}>
        {visibleTabs.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/')
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                display: 'inline-block',
                padding: '12px 16px',
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? '#E26839' : '#17130E',
                textDecoration: 'none',
                borderBottom: isActive ? '2px solid #E26839' : '2px solid transparent',
                marginBottom: -1,
                transition: 'color 0.1s, border-color 0.1s',
              }}
            >
              {tab.label}
            </Link>
          )
        })}
       </div>
      </div>

      {/* Page content */}
      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 24px 64px' }}>{children}</main>
    </div>
  )
}
