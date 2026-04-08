import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RigShell from '@/components/rig/RigShell'

export default async function RigLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const role = (user.user_metadata?.role ?? 'member') as 'member' | 'admin'

  // If member, verify they exist in rig_members
  let memberData = null
  if (role === 'member') {
    const { data } = await supabase
      .from('rig_members')
      .select('*')
      .eq('email', user.email!)
      .single()

    if (!data) {
      redirect('/login?error=not_found')
    }
    memberData = data
  }

  return (
    <RigShell user={user} role={role} member={memberData}>
      {children}
    </RigShell>
  )
}
