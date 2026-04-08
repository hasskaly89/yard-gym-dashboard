import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { calcTarget, WEEK_CONFIG } from '@/lib/rig/weights'
import Link from 'next/link'

export default async function RigHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const role = (user.user_metadata?.role ?? 'member') as string

  // Fetch active block
  const { data: block } = await supabase
    .from('rig_blocks')
    .select('*')
    .eq('active', true)
    .single()

  // Fetch member's 3RMs
  let memberId: string | null = null
  let member: any = null

  if (role === 'member') {
    const { data: m } = await supabase
      .from('rig_members')
      .select('id, first_name, last_name')
      .eq('email', user.email!)
      .single()
    member = m
    memberId = m?.id ?? null
  }

  // Fetch lifts logged this week (if block active)
  let weekLifts: any[] = []
  let threeRMs: any[] = []
  let recentPRs: any[] = []

  if (block && memberId) {
    const { data: rms } = await supabase
      .from('rig_three_rms')
      .select('*')
      .eq('member_id', memberId)
      .eq('block_id', block.id)

    threeRMs = rms || []

    const { data: lifts } = await supabase
      .from('rig_lifts')
      .select('*')
      .eq('member_id', memberId)
      .eq('block_id', block.id)
      .eq('week_number', block.current_week)

    weekLifts = lifts || []

    const { data: prs } = await supabase
      .from('rig_lifts')
      .select('*')
      .eq('member_id', memberId)
      .eq('is_pr', true)
      .order('logged_at', { ascending: false })
      .limit(3)

    recentPRs = prs || []
  }

  const currentWeek = block?.current_week ?? 1
  const weekConfig = WEEK_CONFIG.find(w => w.week === currentWeek)

  const lifts = ['squat', 'bench', 'deadlift']

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#1A1A1A' }}>
          {member?.first_name ? `Hey, ${member.first_name}` : 'Welcome back'}
        </h1>
        {block ? (
          <p className="text-sm mt-1" style={{ color: '#888888' }}>
            {block.name} · {weekConfig?.label ?? `Week ${currentWeek}`}
          </p>
        ) : (
          <p className="text-sm mt-1" style={{ color: '#888888' }}>No active training block</p>
        )}
      </div>

      {/* This Week's Targets */}
      {block && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: '#888888' }}>
            This Week&apos;s Targets
          </h2>
          <div className="space-y-3">
            {lifts.map(lift => {
              const rm = threeRMs.find(r => r.lift === lift)
              const target = rm ? calcTarget(rm.weight_kg, currentWeek) : null
              const logged = weekLifts.find(l => l.lift === lift)

              return (
                <div key={lift} className="bg-white rounded-2xl p-4 border" style={{ borderColor: '#E8E6E3' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold capitalize" style={{ color: '#1A1A1A' }}>{lift}</p>
                      {target ? (
                        <p className="text-sm mt-0.5" style={{ color: '#888888' }}>
                          Target: <strong style={{ color: '#FF5722' }}>{target} kg</strong> × {weekConfig?.reps} reps
                        </p>
                      ) : (
                        <p className="text-sm mt-0.5" style={{ color: '#888888' }}>Set your 3RM first</p>
                      )}
                    </div>
                    <div className="text-right">
                      {logged ? (
                        <div>
                          <p className="font-bold text-lg" style={{ color: logged.is_pr ? '#FF5722' : '#1A1A1A' }}>
                            {logged.weight_kg} kg
                          </p>
                          {logged.is_pr && (
                            <p className="text-xs font-bold" style={{ color: '#FF5722' }}>PR!</p>
                          )}
                        </div>
                      ) : (
                        <Link
                          href="/rig/log"
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                          style={{ backgroundColor: '#FFF0EB', color: '#FF5722' }}
                        >
                          Log
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent PRs */}
      {recentPRs.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: '#888888' }}>
            Recent PRs
          </h2>
          <div className="space-y-2">
            {recentPRs.map((pr: any) => (
              <div key={pr.id} className="bg-white rounded-xl px-4 py-3 flex items-center justify-between border" style={{ borderColor: '#E8E6E3' }}>
                <div>
                  <span className="font-semibold capitalize" style={{ color: '#1A1A1A' }}>{pr.lift}</span>
                  <span className="text-xs ml-2" style={{ color: '#888888' }}>
                    {new Date(pr.logged_at).toLocaleDateString()}
                  </span>
                </div>
                <span className="font-bold" style={{ color: '#FF5722' }}>{pr.weight_kg} kg</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No block state */}
      {!block && (
        <div className="bg-white rounded-2xl p-6 text-center border" style={{ borderColor: '#E8E6E3' }}>
          <p className="text-4xl mb-3">🏋️</p>
          <p className="font-semibold" style={{ color: '#1A1A1A' }}>No Active Block</p>
          <p className="text-sm mt-1" style={{ color: '#888888' }}>Your trainer will set up a training block soon.</p>
        </div>
      )}
    </div>
  )
}
