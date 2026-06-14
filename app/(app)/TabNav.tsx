'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { UserRole } from '@/types'

interface TabNavProps {
  role: UserRole
}

const TABS = [
  { label: 'Today', href: '/today' },
  { label: 'Leads', href: '/leads' },
  { label: 'Cancellations', href: '/cancellations' },
  { label: 'Stats', href: '/stats' },
  { label: 'Settings', href: '/settings', adminOnly: true },
]

export default function TabNav({ role }: TabNavProps) {
  const pathname = usePathname()
  const isAdminOrManagement = role === 'admin' || role === 'management'

  const visibleTabs = TABS.filter(
    (tab) => !tab.adminOnly || isAdminOrManagement
  )

  return (
    <nav
      style={{
        display: 'flex',
        borderBottom: '1px solid #D9CFC2',
        backgroundColor: '#FFFFFF',
        paddingLeft: '16px',
        gap: '0',
      }}
    >
      {visibleTabs.map((tab) => {
        const isActive =
          pathname === tab.href || pathname.startsWith(tab.href + '/')

        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              display: 'inline-block',
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: isActive ? 700 : 500,
              color: isActive ? '#E26839' : '#84776A',
              textDecoration: 'none',
              borderBottom: isActive ? '2px solid #E26839' : '2px solid transparent',
              marginBottom: '-1px',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
