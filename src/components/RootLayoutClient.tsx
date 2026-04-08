'use client'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'

export default function RootLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isRig = pathname.startsWith('/rig') || pathname.startsWith('/login') || pathname.startsWith('/auth')

  if (isRig) {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
