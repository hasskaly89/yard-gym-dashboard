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

export default function RigShell({ children, user, role, member }: Props) {
  const pathname = usePathname()

  const displayName = member?.first_name || user?.email?.split('@')[0] || 'You'
  const initials = displayName.charAt(0).toUpperCase()

  const navItems = [
    { href: '/rig/home', icon: Home, label: 'Home' },
    { href: '/rig/log', icon: BarChart2, label: 'Log' },
    { href: '/rig/leaderboard', icon: Trophy, label: 'Board' },
    { href: '/rig/profile', icon: User, label: 'Me' },
    ...(canAccessCoach(role) ? [{ href: '/rig/coach', icon: Users, label: 'Coach' }] : []),
  ]

  return (
    <div style={{ backgroundColor: '#F8F7F5', minHeight: '100vh' }}>
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 h-14 bg-white border-b" style={{ borderColor: '#E8E6E3' }}>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center justify-center rounded-lg" style={{ width: 28, height: 28, backgroundColor: '#FF5722' }}>
            <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: '#fff' }}>
              <path d="M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z"/>
            </svg>
          </div>
          <span className="font-bold text-sm tracking-widest" style={{ color: '#1A1A1A' }}>THE YARD</span>
          <span className="mx-1" style={{ color: '#E8E6E3' }}>·</span>
          <span className="font-bold text-sm tracking-widest" style={{ color: '#FF5722' }}>RIG</span>
        </div>
        <Link href="/rig/profile" className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: '#FF5722' }}>
          {initials}
        </Link>
      </header>

      {/* Content */}
      <main className="pb-20">
        {children}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t flex" style={{ borderColor: '#E8E6E3', height: '64px', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
              style={{ color: active ? '#FF5722' : '#888888' }}
            >
              <Icon size={label === 'Log' ? 24 : 20} strokeWidth={active ? 2.5 : 1.5} />
              <span className="text-xs font-medium">{label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
