import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      let role = user?.user_metadata?.role as string | undefined

      // Self-signup: no role = new member signing up for the first time
      if (!role && user) {
        // Assign member role
        await supabase.auth.updateUser({ data: { role: 'member' } })
        role = 'member'

        // Create their rig_members record (admin client bypasses RLS)
        const admin = createAdminClient()
        const firstName = (user.user_metadata?.first_name ?? '') as string
        const lastName = (user.user_metadata?.last_name ?? '') as string
        await admin.from('rig_members').upsert({
          email: user.email!,
          first_name: firstName || user.email!.split('@')[0],
          last_name: lastName,
        }, { onConflict: 'email' })
      }

      // Members ONLY go to /rig — never to the admin dashboard
      if (role === 'member') {
        return NextResponse.redirect(new URL('/rig/home', origin))
      }

      // Admins go to the main dashboard
      if (role === 'admin' || role === 'trainer' || role === 'owner') {
        return NextResponse.redirect(new URL('/', origin))
      }

      // Unknown role — back to login
      return NextResponse.redirect(new URL('/login?error=no-role', origin))
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth', origin))
}
