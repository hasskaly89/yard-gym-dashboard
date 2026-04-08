import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import BlockSetupClient from './BlockSetupClient'

export default async function CoachSetupPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.user_metadata?.role !== 'admin') redirect('/rig/home')

  const { data: blocks } = await supabase
    .from('rig_blocks')
    .select('*')
    .order('created_at', { ascending: false })

  const { data: lifts } = await supabase
    .from('rig_lifts')
    .select('*')
    .order('sort_order')

  return <BlockSetupClient blocks={blocks || []} lifts={lifts || []} />
}
