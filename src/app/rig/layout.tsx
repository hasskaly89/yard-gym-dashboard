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
    const admin = createAdminClient()

    // Try to find existing record
    const { data: existing } = await admin
      .from('rig_members')
      .select('*')
      .eq('email', user.email!)
      .single()

    if (existing) {
      memberData = existing
    } else {
      // Create it — pull name from user_metadata if available
      const firstName = (user.user_metadata?.first_name ?? '') as string
      const lastName = (user.user_metadata?.last_name ?? '') as string
      const { data: created } = await admin
        .from('rig_members')
        .insert({
          email: user.email!,
          first_name: firstName,
          last_name: lastName,
        })
        .select()
        .single()
      memberData = created
    }
  }

  return (
    <RigShell user={user} role={role} member={memberData}>
      {children}
    </RigShell>
  )
}
