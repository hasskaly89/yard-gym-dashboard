import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { memberId, firstName, lastName } = await request.json()

  const admin = createAdminClient()
  const { error } = await admin
    .from('rig_members')
    .update({ first_name: firstName, last_name: lastName })
    .eq('id', memberId)
    .eq('email', user.email!) // ensure they can only update their own record

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
