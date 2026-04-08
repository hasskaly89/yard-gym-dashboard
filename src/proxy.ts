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
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isPublic = pathname.startsWith('/login') || pathname.startsWith('/auth')

  if (!user && !isPublic) {
    if (pathname.startsWith('/rig')) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    // Owner dashboard doesn't require auth yet (existing behaviour)
    return supabaseResponse
  }

  if (user) {
    const role = user.user_metadata?.role as string | undefined

    // Members can only access /rig routes
    if (role === 'member') {
      if (!pathname.startsWith('/rig') && !pathname.startsWith('/login') && !pathname.startsWith('/auth')) {
        return NextResponse.redirect(new URL('/rig/home', request.url))
      }
    }

    // Block members from coach routes
    if (pathname.startsWith('/rig/coach') && role === 'member') {
      return NextResponse.redirect(new URL('/rig/home', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
