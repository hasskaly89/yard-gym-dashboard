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

  // Admin allowlist — set ADMIN_EMAILS on Vercel as a comma-separated list.
  // Supports two patterns per entry:
  //   - exact email          e.g. hasskaly89@gmail.com
  //   - wildcard at a domain e.g. *@theyardgym.com.au (allows every email on that domain)
  const allowedPatterns = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  const userEmail = user?.email?.toLowerCase() ?? ''
  const isAllowed =
    userEmail !== '' &&
    allowedPatterns.some((p) =>
      p.startsWith('*@') ? userEmail.endsWith(p.slice(1)) : p === userEmail,
    )

  // Not logged in → bounce to /login
  if (!user && !isPublic) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Logged in but email not in allowlist → block
  if (user && !isPublic && !isAllowed) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('error', 'not_allowed')
    // sign them out so they can try with a different account
    await supabase.auth.signOut()
    return NextResponse.redirect(loginUrl)
  }

  // Already logged in and hitting /login → send them home
  if (user && isAllowed && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
