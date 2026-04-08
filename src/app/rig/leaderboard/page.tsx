import { createClient } from '@/lib/supabase/server'

export default async function RigLeaderboardPage() {
  const supabase = await createClient()

  const { data: block } = await supabase
    .from('rig_blocks')
    .select('*')
    .eq('active', true)
    .single()

  let rows: any[] = []

  if (block) {
    // Fetch all lifts for this block grouped by member and lift
    const { data: lifts } = await supabase
      .from('rig_lifts')
      .select(`
        lift,
        weight_kg,
        is_pr,
        rig_members (first_name, last_name, photo_url)
      `)
      .eq('block_id', block.id)
      .order('weight_kg', { ascending: false })

    rows = lifts || []
  }

  const lifts = ['squat', 'bench', 'deadlift'] as const

  // Group by lift
  const byLift: Record<string, any[]> = { squat: [], bench: [], deadlift: [] }
  rows.forEach(r => {
    if (byLift[r.lift]) {
      byLift[r.lift].push(r)
    }
  })

  // Keep top entry per member per lift
  const topByLift: Record<string, any[]> = {}
  for (const lift of lifts) {
    const seen = new Set<string>()
    topByLift[lift] = byLift[lift]
      .sort((a, b) => b.weight_kg - a.weight_kg)
      .filter(r => {
        const name = `${r.rig_members?.first_name} ${r.rig_members?.last_name}`
        if (seen.has(name)) return false
        seen.add(name)
        return true
      })
      .slice(0, 10)
  }

  const medalEmoji = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`

  return (
    <div className="px-4 py-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#1A1A1A' }}>Leaderboard</h1>
        {block && (
          <p className="text-sm mt-1" style={{ color: '#888888' }}>{block.name} · Week {block.current_week}</p>
        )}
      </div>

      {!block ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">🏆</p>
          <p className="font-semibold" style={{ color: '#1A1A1A' }}>No Active Block</p>
          <p className="text-sm mt-1" style={{ color: '#888888' }}>Leaderboard will appear when a block is running.</p>
        </div>
      ) : (
        lifts.map(lift => (
          <div key={lift}>
            <h2 className="font-bold capitalize mb-3 text-base" style={{ color: '#1A1A1A' }}>{lift}</h2>
            {topByLift[lift].length === 0 ? (
              <div className="bg-white rounded-2xl p-4 text-center border" style={{ borderColor: '#E8E6E3' }}>
                <p className="text-sm" style={{ color: '#888888' }}>No lifts logged yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {topByLift[lift].map((r, i) => {
                  const name = r.rig_members
                    ? `${r.rig_members.first_name} ${r.rig_members.last_name}`
                    : 'Unknown'
                  const initials = name.split(' ').map((n: string) => n[0]).join('').toUpperCase()

                  return (
                    <div
                      key={i}
                      className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3 border"
                      style={{
                        borderColor: i === 0 ? '#FF5722' : '#E8E6E3',
                        borderWidth: i === 0 ? '1.5px' : '1px',
                      }}
                    >
                      <span className="text-xl w-8 text-center">{medalEmoji(i)}</span>
                      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold text-white" style={{ backgroundColor: '#FF5722' }}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate" style={{ color: '#1A1A1A' }}>{name}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-lg" style={{ color: i === 0 ? '#FF5722' : '#1A1A1A' }}>
                          {r.weight_kg} kg
                        </p>
                        {r.is_pr && <p className="text-xs font-bold" style={{ color: '#FF5722' }}>PR</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
