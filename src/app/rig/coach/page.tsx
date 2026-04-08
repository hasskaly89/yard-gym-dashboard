import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { canAccessCoach } from '@/lib/rig/permissions'
import type { UserRole } from '@/lib/rig/permissions'
import Link from 'next/link'

export default async function RigCoachPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const role = (user.user_metadata?.role ?? 'member') as UserRole
  if (!canAccessCoach(role)) redirect('/rig/home')

  const { data: block } = await supabase
    .from('rig_blocks')
    .select('*')
    .eq('active', true)
    .single()

  // Member stats
  const { count: totalMembers } = await supabase
    .from('rig_members')
    .select('*', { count: 'exact', head: true })
    .eq('active', true)

  let weeklyLoggers = 0
  let totalPRs = 0

  if (block) {
    const { count: wl } = await supabase
      .from('rig_lifts')
      .select('member_id', { count: 'exact', head: true })
      .eq('block_id', block.id)
      .eq('week_number', block.current_week)

    weeklyLoggers = wl ?? 0

    const { count: prs } = await supabase
      .from('rig_lifts')
      .select('*', { count: 'exact', head: true })
      .eq('block_id', block.id)
      .eq('is_pr', true)

    totalPRs = prs ?? 0
  }

  return (
    <div className="px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#1A1A1A' }}>Coach Dashboard</h1>
        <p className="text-sm mt-1" style={{ color: '#888888' }}>
          {block ? `${block.name} · Week ${block.current_week}` : 'No active block'}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Active Members', value: totalMembers ?? 0 },
          { label: 'Logged This Week', value: weeklyLoggers },
          { label: 'PRs This Block', value: totalPRs },
          { label: 'Current Week', value: block?.current_week ?? '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-2xl p-4 border" style={{ borderColor: '#E8E6E3' }}>
            <p className="text-2xl font-bold" style={{ color: '#FF5722' }}>{value}</p>
            <p className="text-xs font-medium mt-1" style={{ color: '#888888' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: '#888888' }}>Quick Actions</h2>
        <div className="space-y-3">
          <Link
            href="/rig/coach/members"
            className="flex items-center justify-between bg-white rounded-2xl p-4 border"
            style={{ borderColor: '#E8E6E3' }}
          >
            <div>
              <p className="font-semibold" style={{ color: '#1A1A1A' }}>View All Members</p>
              <p className="text-sm" style={{ color: '#888888' }}>See member progress and 3RMs</p>
            </div>
            <span style={{ color: '#888888' }}>›</span>
          </Link>

          <Link
            href="/rig/coach/setup"
            className="flex items-center justify-between bg-white rounded-2xl p-4 border"
            style={{ borderColor: '#E8E6E3' }}
          >
            <div>
              <p className="font-semibold" style={{ color: '#1A1A1A' }}>Block Setup</p>
              <p className="text-sm" style={{ color: '#888888' }}>Manage training blocks and weeks</p>
            </div>
            <span style={{ color: '#888888' }}>›</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
