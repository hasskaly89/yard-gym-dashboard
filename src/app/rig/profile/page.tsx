import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function RigProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const role = (user.user_metadata?.role ?? 'member') as string

  let member: any = null
  let threeRMs: any[] = []
  let allPRs: any[] = []
  let liftHistory: any[] = []

  if (role === 'member') {
    const { data: m } = await supabase
      .from('rig_members')
      .select('*')
      .eq('email', user.email!)
      .single()

    member = m

    if (m) {
      const { data: rms } = await supabase
        .from('rig_three_rms')
        .select('lift, weight_kg, updated_at')
        .eq('member_id', m.id)
        .order('lift')

      threeRMs = rms || []

      const { data: prs } = await supabase
        .from('rig_lifts')
        .select('lift, weight_kg, logged_at')
        .eq('member_id', m.id)
        .eq('is_pr', true)
        .order('logged_at', { ascending: false })
        .limit(10)

      allPRs = prs || []

      const { data: history } = await supabase
        .from('rig_lifts')
        .select('lift, weight_kg, week_number, logged_at, is_pr, rig_blocks(name)')
        .eq('member_id', m.id)
        .order('logged_at', { ascending: false })
        .limit(20)

      liftHistory = history || []
    }
  }

  const displayName = member
    ? `${member.first_name} ${member.last_name}`
    : user.email?.split('@')[0] ?? 'User'

  const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)

  async function handleSignOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Profile header */}
      <div className="bg-white rounded-2xl p-6 border text-center" style={{ borderColor: '#E8E6E3' }}>
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl font-bold text-white" style={{ backgroundColor: '#FF5722' }}>
          {initials}
        </div>
        <h1 className="text-xl font-bold" style={{ color: '#1A1A1A' }}>{displayName}</h1>
        <p className="text-sm mt-1" style={{ color: '#888888' }}>{user.email}</p>
        <span
          className="inline-block mt-2 text-xs font-semibold px-3 py-1 rounded-full capitalize"
          style={{ backgroundColor: '#FFF0EB', color: '#FF5722' }}
        >
          {role}
        </span>
      </div>

      {/* 3RMs */}
      {threeRMs.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: '#888888' }}>Your 3-Rep Maxes</h2>
          <div className="grid grid-cols-3 gap-3">
            {threeRMs.map(rm => (
              <div key={rm.lift} className="bg-white rounded-2xl p-4 border text-center" style={{ borderColor: '#E8E6E3' }}>
                <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: '#888888' }}>{rm.lift}</p>
                <p className="text-xl font-bold" style={{ color: '#FF5722' }}>{rm.weight_kg}</p>
                <p className="text-xs" style={{ color: '#888888' }}>kg</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PR History */}
      {allPRs.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: '#888888' }}>PR History</h2>
          <div className="space-y-2">
            {allPRs.map((pr, i) => (
              <div key={i} className="bg-white rounded-xl px-4 py-3 flex items-center justify-between border" style={{ borderColor: '#E8E6E3' }}>
                <div>
                  <span className="font-semibold capitalize" style={{ color: '#1A1A1A' }}>{pr.lift}</span>
                  <span className="text-xs ml-2" style={{ color: '#888888' }}>
                    {new Date(pr.logged_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <span className="font-bold" style={{ color: '#FF5722' }}>{pr.weight_kg} kg</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lift History */}
      {liftHistory.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: '#888888' }}>Recent Lifts</h2>
          <div className="space-y-2">
            {liftHistory.map((l, i) => (
              <div key={i} className="bg-white rounded-xl px-4 py-3 flex items-center justify-between border" style={{ borderColor: '#E8E6E3' }}>
                <div>
                  <span className="font-semibold capitalize" style={{ color: '#1A1A1A' }}>{l.lift}</span>
                  <span className="text-xs ml-2" style={{ color: '#888888' }}>Week {l.week_number}</span>
                  {l.is_pr && <span className="ml-2 text-xs font-bold" style={{ color: '#FF5722' }}>PR</span>}
                </div>
                <span className="font-semibold" style={{ color: '#1A1A1A' }}>{l.weight_kg} kg</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sign out */}
      <form action={handleSignOut}>
        <button
          type="submit"
          className="w-full py-3 rounded-xl font-semibold border text-sm"
          style={{ borderColor: '#E8E6E3', color: '#888888', backgroundColor: 'white' }}
        >
          Sign Out
        </button>
      </form>
    </div>
  )
}
