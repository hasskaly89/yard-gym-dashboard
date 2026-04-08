import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { canAccessCoach } from '@/lib/rig/permissions'
import type { UserRole } from '@/lib/rig/permissions'
import { calcTarget, WEEK_CONFIG } from '@/lib/rig/weights'
import Link from 'next/link'

export default async function RigCoachMembersPage() {
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

  const { data: members } = await supabase
    .from('rig_members')
    .select('id, first_name, last_name, email, photo_url')
    .eq('active', true)
    .order('first_name')

  // Fetch all 3RMs and lifts for this block
  let threeRMs: any[] = []
  let weekLifts: any[] = []

  if (block) {
    const { data: rms } = await supabase
      .from('rig_three_rms')
      .select('member_id, lift, weight_kg')
      .eq('block_id', block.id)

    threeRMs = rms || []

    const { data: lifts } = await supabase
      .from('rig_lifts')
      .select('member_id, lift, weight_kg, is_pr')
      .eq('block_id', block.id)
      .eq('week_number', block?.current_week)

    weekLifts = lifts || []
  }

  const currentWeek = block?.current_week ?? 1
  const weekConfig = WEEK_CONFIG.find(w => w.week === currentWeek)

  return (
    <div className="px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/rig/coach" style={{ color: '#888888' }}>‹ Back</Link>
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#1A1A1A' }}>All Members</h1>
          <p className="text-sm" style={{ color: '#888888' }}>{members?.length ?? 0} active members</p>
        </div>
      </div>

      {!block && (
        <div className="bg-white rounded-2xl p-4 border text-center" style={{ borderColor: '#E8E6E3' }}>
          <p className="text-sm" style={{ color: '#888888' }}>No active block — showing member list only</p>
        </div>
      )}

      <div className="space-y-3">
        {(members || []).map(member => {
          const memberRMs = threeRMs.filter(r => r.member_id === member.id)
          const memberLifts = weekLifts.filter(l => l.member_id === member.id)
          const initials = `${member.first_name?.[0] ?? ''}${member.last_name?.[0] ?? ''}`.toUpperCase()

          const loggedCount = memberLifts.length
          const hasSetRMs = memberRMs.length > 0

          return (
            <div key={member.id} className="bg-white rounded-2xl p-4 border" style={{ borderColor: '#E8E6E3' }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm text-white" style={{ backgroundColor: '#FF5722' }}>
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate" style={{ color: '#1A1A1A' }}>
                    {member.first_name} {member.last_name}
                  </p>
                  <p className="text-xs truncate" style={{ color: '#888888' }}>{member.email}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  {block && (
                    <span
                      className="text-xs font-semibold px-2 py-1 rounded-lg"
                      style={{
                        backgroundColor: loggedCount === 3 ? '#E8F5E9' : loggedCount > 0 ? '#FFF3E0' : '#F5F5F5',
                        color: loggedCount === 3 ? '#2E7D32' : loggedCount > 0 ? '#E65100' : '#9E9E9E',
                      }}
                    >
                      {loggedCount}/3
                    </span>
                  )}
                </div>
              </div>

              {block && memberRMs.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {['squat', 'bench', 'deadlift'].map(lift => {
                    const rm = memberRMs.find(r => r.lift === lift)
                    const target = rm ? calcTarget(rm.weight_kg, currentWeek) : null
                    const logged = memberLifts.find(l => l.lift === lift)

                    return (
                      <div key={lift} className="rounded-xl p-2 text-center" style={{ backgroundColor: '#F8F7F5' }}>
                        <p className="text-xs font-semibold uppercase" style={{ color: '#888888' }}>{lift.slice(0, 3)}</p>
                        {rm ? (
                          <>
                            <p className="text-xs mt-0.5" style={{ color: '#888888' }}>3RM: {rm.weight_kg}</p>
                            {target && <p className="text-xs font-bold" style={{ color: logged ? (logged.is_pr ? '#FF5722' : '#2E7D32') : '#FF5722' }}>
                              {logged ? `${logged.weight_kg} kg${logged.is_pr ? ' PR' : ''}` : `→ ${target} kg`}
                            </p>}
                          </>
                        ) : (
                          <p className="text-xs mt-0.5" style={{ color: '#CCCCCC' }}>—</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {block && !hasSetRMs && (
                <p className="text-xs" style={{ color: '#CCCCCC' }}>No 3RMs set yet</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
