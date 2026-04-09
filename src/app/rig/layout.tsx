import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import RigShell from '@/components/rig/RigShell'

export default async function RigLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const role = (user.user_metadata?.role ?? 'member') as 'member' | 'admin'

  let memberData = null
  if (role === 'member') {
    const { data } = await supabase
      .from('rig_members')
      .select('*')
      .eq('email', user.email!)
      .single()

    if (!data) {
      // Auto-create the member record so they don't get stuck in a redirect loop
      const admin = createAdminClient()
      const firstName = (user.user_metadata?.first_name ?? user.email!.split('@')[0]) as string
      const lastName = (user.user_metadata?.last_name ?? '') as string
      const { data: created } = await admin
        .from('rig_members')
        .upsert({ email: user.email!, first_name: firstName, last_name: lastName }, { onConflict: 'email' })
        .select()
        .single()
      memberData = created
    } else {
      memberData = data
    }
  }

  return (
    <RigShell user={user} role={role} member={memberData}>
      {children}
    </RigShell>
  )
}
