'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
  { label: 'Stats', href: '/stats', roles: ['receptionist', 'site_lead', 'admin', 'management'] },
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

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F6F3EE' }}>
      {/* Header */}
      <div
        style={{
          backgroundColor: '#17130E',
          color: '#FFFFFF',
          padding: '0 24px',
          height: 52,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.3px' }}>
            ATHLETA
          </span>
          <span style={{ fontSize: 12, color: '#84776A', letterSpacing: '0.05em' }}>
            FRONT OF HOUSE
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{user.full_name}</div>
          {user.site && (
            <div style={{ fontSize: 11, color: '#84776A', marginTop: 1 }}>
              {SITE_LABELS[user.site] ?? user.site}
            </div>
          )}
          {!user.site && (
            <div style={{ fontSize: 11, color: '#84776A', marginTop: 1 }}>
              All sites
            </div>
          )}
        </div>
      </div>

      {/* Tab row */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #D9CFC2',
          padding: '0 24px',
          display: 'flex',
          gap: 0,
        }}
      >
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

      {/* Page content */}
      <main style={{ padding: 24 }}>{children}</main>
    </div>
  )
}
