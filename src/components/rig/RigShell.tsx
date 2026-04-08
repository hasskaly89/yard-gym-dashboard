'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Home, BarChart2, Trophy, User, Users } from 'lucide-react'
import type { UserRole } from '@/lib/rig/permissions'
import { canAccessCoach } from '@/lib/rig/permissions'

interface Props {
  children: React.ReactNode
  user: any
  role: UserRole
  member: any
}

const SHELL_BG  = '#0F0E1F'
const SHELL_HDR = '#0F0E1F'   // header matches page bg — no flash on nav
const BORDER    = 'rgba(255,255,255,0.07)'
const ORANGE    = '#FF5C3E'
const DIM       = 'rgba(255,255,255,0.45)'

export default function RigShell({ children, user, role, member }: Props) {
  const pathname = usePathname()

  const displayName = member?.first_name || user?.email?.split('@')[0] || 'You'
  const initials    = displayName.charAt(0).toUpperCase()

  const navItems = [
    { href: '/rig/home',        icon: Home,     label: 'Home'  },
    { href: '/rig/log',         icon: BarChart2, label: 'Log'   },
    { href: '/rig/leaderboard', icon: Trophy,    label: 'Board' },
    { href: '/rig/profile',     icon: User,      label: 'Me'    },
    ...(canAccessCoach(role)
      ? [{ href: '/rig/coach', icon: Users, label: 'Coach' }]
      : []),
  ]

  return (
    <div style={{
      backgroundColor: SHELL_BG,
      minHeight: '100dvh',           // dynamic viewport — handles mobile browser chrome
      display: 'flex',
      flexDirection: 'column',
    }}>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      {/*
        paddingTop: env(safe-area-inset-top) → pushes content below the notch/
        Dynamic Island. The header bg fills the safe area visually.
      */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backgroundColor: SHELL_HDR,
        borderBottom: `1px solid ${BORDER}`,
        paddingTop: 'env(safe-area-inset-top)',  // notch / Dynamic Island
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
        // Subtle blur so content scrolling under the header looks polished
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}>
        <div style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: 16,
          paddingRight: 16,
        }}>
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 30, height: 30,
              backgroundColor: ORANGE,
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg viewBox="0 0 24 24" style={{ width: 15, height: 15, fill: '#fff' }}>
                <path d="M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z"/>
              </svg>
            </div>
            <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: '0.12em', color: '#fff' }}>
              THE YARD
            </span>
            <span style={{ color: BORDER, fontSize: 13 }}>·</span>
            <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: '0.12em', color: ORANGE }}>
              RIG
            </span>
          </div>

          {/* Avatar link to profile */}
          <Link href="/rig/profile" style={{
            width: 36, height: 36,
            borderRadius: '50%',
            backgroundColor: ORANGE,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff',
            fontWeight: 800,
            fontSize: 14,
            textDecoration: 'none',
            flexShrink: 0,
          }}>
            {initials}
          </Link>
        </div>
      </header>

      {/* ── Page content ─────────────────────────────────────────────────── */}
      <main style={{
        flex: 1,
        // Bottom padding clears the fixed nav + home-indicator safe area
        paddingBottom: 'calc(64px + env(safe-area-inset-bottom))',
        // Horizontal safe area for landscape
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}>
        {children}
      </main>

      {/* ── Bottom nav ───────────────────────────────────────────────────── */}
      {/*
        Height = 64px nav + env(safe-area-inset-bottom) for the iPhone home indicator.
        The extra padding at the bottom pushes the tab labels above the indicator.
      */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        backgroundColor: SHELL_HDR,
        borderTop: `1px solid ${BORDER}`,
        display: 'flex',
        alignItems: 'stretch',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}>
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                height: 64,
                color: active ? ORANGE : DIM,
                textDecoration: 'none',
                // Minimum 44px tap target (height is 64px so this is fine)
                minWidth: 44,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <Icon
                size={active ? 22 : 20}
                strokeWidth={active ? 2.5 : 1.5}
              />
              <span style={{
                fontSize: 11,
                fontWeight: active ? 700 : 500,
                letterSpacing: active ? '0.02em' : 0,
              }}>
                {label}
              </span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
