import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isPublic = pathname === '/login' || pathname.startsWith('/auth')

  // Not logged in → redirect to /login for all protected routes
  if (!user) {
    if (isPublic) return supabaseResponse
    if (pathname.startsWith('/rig')) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    // Owner dashboard doesn't require auth yet
    return supabaseResponse
  }

  const role = user.user_metadata?.role as string | undefined

  // Already logged in and hitting /login → send them home
  if (pathname === '/login') {
    const dest = role === 'admin' ? '/' : '/rig/home'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  // Members can only access /rig routes
  if (role === 'member') {
    const allowed = pathname.startsWith('/rig') || pathname.startsWith('/auth')
    if (!allowed) {
      return NextResponse.redirect(new URL('/rig/home', request.url))
    }
  }

  // Members blocked from coach routes
  if (role === 'member' && pathname.startsWith('/rig/coach')) {
    return NextResponse.redirect(new URL('/rig/home', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
