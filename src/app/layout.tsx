import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import RootLayoutClient from '@/components/RootLayoutClient'

const inter = Inter({ subsets: ['latin'] })

// ── Viewport (separate export — required by Next.js 14+) ──────────────────────
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',          // full-screen on iPhone notch / Dynamic Island
  themeColor: '#0F0E1F',         // dark status bar chrome on Android
}

// ── Page metadata ──────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: 'The Yard · RIG',
  description: 'Strength tracking for The Yard Gym',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'RIG',
    statusBarStyle: 'black-translucent', // dark status bar, content bleeds under notch
  },
  icons: {
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800;900&display=swap"
        />
      </head>
      <body className={inter.className}>
        <RootLayoutClient>
          {children}
        </RootLayoutClient>
      </body>
    </html>
  )
}
