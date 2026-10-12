import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { computeAccess, canAccess, isEmailAllowlisted, pathToPageKey } from '@/lib/access'
import { bearerAuthorized, isMachineRoute, webhookTokenAuthorized } from '@/lib/auth/machine-auth'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Cron, manual sync, and the Mindbody webhook have no session. Decide that
  // before touching Supabase, so a login outage cannot stop the nightly sync.
  if (pathname.startsWith('/api') && isMachineRoute(pathname)) {
    const webhook = pathname === '/api/mindbody/webhooks' || pathname === '/api/mindbody/webhooks/'
    const signed =
      webhook &&
      !!request.headers.get('x-mindbody-signature') &&
      !!process.env.MINDBODY_WEBHOOK_SIGNATURE_KEY
    const allowed =
      bearerAuthorized(request, webhook ? ['MINDBODY_WEBHOOK_SECRET'] : []) ||
      (webhook && webhookTokenAuthorized(request)) ||
      signed
    if (!allowed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.next()
  }

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

  // A redirect needs its own response object, but getUser() above may have
  // just refreshed the session and written the new cookies onto
  // supabaseResponse — copy them over so a redirect never silently drops a
  // refreshed session (which otherwise forces an unnecessary re-login).
  function redirect(url: URL) {
    const res = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c))
    return res
  }

  const isPublic = pathname === '/login' || pathname.startsWith('/auth')

  // Admin allowlist — set ADMIN_EMAILS on Vercel as a comma-separated list.
  // Supports two patterns per entry:
  //   - exact email          e.g. hasskaly89@gmail.com
  //   - wildcard at a domain e.g. *@theyardgym.com.au (allows every email on that domain)
  const userEmail = user?.email?.toLowerCase() ?? ''
  const inAdminEmails = isEmailAllowlisted(userEmail)

  // Load the user's profile once — used for BOTH the allowlist (a profile row
  // means an admin added them via Team Access) and per-page permissions below.
  const prof = user
    ? (
        await supabase
          .from('profiles')
          .select('role, allowed_pages')
          .eq('id', user.id)
          .maybeSingle()
      ).data
    : null

  // Allowed to log in if in the ADMIN_EMAILS env allowlist OR an admin has
  // added them (they have a profile row). This lets admins add staff in-app.
  const isAllowed = userEmail !== '' && (inAdminEmails || !!prof)

  function json401() {
    const res = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c))
    return res
  }

  // Data routes need the same logged-in allowlisted session the pages
  // require, and must answer 401 rather than a redirect to /login.
  if (pathname.startsWith('/api')) {
    if (!user || !isAllowed) return json401()
    return supabaseResponse
  }

  // Not logged in → bounce to /login
  if (!user && !isPublic) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return redirect(loginUrl)
  }

  // Logged in but email not in allowlist → block
  if (user && !isPublic && !isAllowed) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('error', 'not_allowed')
    // sign them out so they can try with a different account
    await supabase.auth.signOut()
    return redirect(loginUrl)
  }

  // Already logged in and hitting /login → send them home
  if (user && isAllowed && pathname === '/login') {
    return redirect(new URL('/', request.url))
  }

  // Per-page access control (admin sees all; staff only their allowed pages).
  if (user && isAllowed && !isPublic) {
    const access = computeAccess({
      email: userEmail,
      profileRole: prof?.role,
      profileAllowedPages: prof?.allowed_pages,
    })

    // Admin-only Team Access screen
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      if (access.role !== 'admin') {
        return redirect(new URL('/', request.url))
      }
    } else if (!canAccess(pathToPageKey(pathname), access)) {
      // Staff hitting a page they're not granted → back to their dashboard
      return redirect(new URL('/', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
