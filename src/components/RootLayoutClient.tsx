'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'

export default function RootLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const isFullScreen = pathname.startsWith('/login') || pathname.startsWith('/auth')

  // Close drawer on navigation
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  if (isFullScreen) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <main className="flex-1 overflow-auto min-w-0">
        {/* Mobile top bar with hamburger */}
        <div className="md:hidden sticky top-0 z-30 bg-white border-b border-gym-border px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="p-1.5 -ml-1 rounded text-gym-text hover:bg-gym-border"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gym-accent rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-sm">Y</span>
            </div>
            <span className="text-gym-text font-bold text-sm">The Yard Gym</span>
          </div>
        </div>
        {children}
      </main>
    </div>
  )
}
