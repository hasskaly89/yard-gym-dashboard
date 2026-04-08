import { createClient } from '@/lib/supabase/server'

const C = {
  bg:      '#0F0E1F',
  card:    '#1A1830',
  cardAlt: '#201E38',
  border:  'rgba(255,255,255,0.07)',
  borderHi:'rgba(255,255,255,0.13)',
  orange:  '#FF5C3E',
  white:   '#FFFFFF',
  dim:     'rgba(255,255,255,0.45)',
  dimmer:  'rgba(255,255,255,0.22)',
  green:   '#00C896',
  purple:  '#7C6FFF',
  teal:    '#00C9A7',
}

const LIFTS = ['squat', 'bench', 'deadlift'] as const
type Lift = typeof LIFTS[number]

const LIFT_META: Record<Lift, { abbr: string; hue: string; label: string }> = {
  squat:    { abbr: 'S', hue: '#FF5C3E', label: 'Squat' },
  bench:    { abbr: 'B', hue: '#7C6FFF', label: 'Bench' },
  deadlift: { abbr: 'D', hue: '#00C9A7', label: 'Deadlift' },
}

const RANK_COLORS: Record<number, string> = {
  1: '#FFD700',
  2: '#C0C0C0',
  3: '#CD7F32',
}

export default async function RigLeaderboardPage() {
  const supabase = await createClient()

  // 1. Active block
  const { data: block } = await supabase
    .from('rig_blocks')
    .select('*')
    .eq('is_active', true)
    .single()

  let topByLift: Record<Lift, any[]> = { squat: [], bench: [], deadlift: [] }

  if (block) {
    // 2. All block week IDs
    const { data: blockWeeks } = await supabase
      .from('rig_block_weeks')
      .select('id')
      .eq('block_id', block.id)

    const weekIds = (blockWeeks || []).map((w: any) => w.id)

    if (weekIds.length > 0) {
      // 3. All lift results for those weeks, with joins
      const { data: results } = await supabase
        .from('rig_lift_results')
        .select('actual_weight, is_pr, member_id, rig_lifts!lift_id(slug), rig_members!member_id(first_name, last_name)')
        .in('block_week_id', weekIds)
        .order('actual_weight', { ascending: false })

      const rows = (results as any[]) || []

      // 4. Group by lift slug, deduplicate by member_id keeping highest weight, top 10
      for (const lift of LIFTS) {
        const liftRows = rows.filter(r => (r.rig_lifts as any)?.slug === lift)
        const seen = new Set<string>()
        topByLift[lift] = liftRows
          .filter(r => {
            const mid = r.member_id as string
            if (seen.has(mid)) return false
            seen.add(mid)
            return true
          })
          .slice(0, 10)
      }
    }
  }

  // No block state
  if (!block) {
    return (
      <div style={{ backgroundColor: C.bg, minHeight: '100vh', margin: '-20px -16px' }}>
        <div style={{ padding: '80px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 56, marginBottom: 16 }}>🏆</p>
          <p style={{ color: C.white, fontWeight: 800, fontSize: 20, margin: 0 }}>No Active Block</p>
          <p style={{ color: C.dim, fontSize: 14, marginTop: 8 }}>
            Leaderboard will appear when a block is running.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ backgroundColor: C.bg, margin: '-20px -16px', padding: '24px 16px', paddingBottom: 96 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ color: C.white, fontWeight: 900, fontSize: 28, margin: 0 }}>
          Leaderboard
        </h1>
        <p style={{ color: C.dim, fontSize: 13, marginTop: 6, margin: '6px 0 0' }}>
          {block.name} &middot; Week {block.current_week ?? 1}
        </p>
      </div>

      {/* 3 lift sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        {LIFTS.map(lift => {
          const meta = LIFT_META[lift]
          const entries = topByLift[lift]

          return (
            <div key={lift}>
              {/* Lift section header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 12,
                  paddingBottom: 10,
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    backgroundColor: meta.hue + '22',
                    border: `2px solid ${meta.hue}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: meta.hue,
                    fontWeight: 900,
                    fontSize: 13,
                    flexShrink: 0,
                  }}
                >
                  {meta.abbr}
                </div>
                <h2
                  style={{
                    color: meta.hue,
                    fontWeight: 800,
                    fontSize: 17,
                    margin: 0,
                  }}
                >
                  {meta.label}
                </h2>
              </div>

              {entries.length === 0 ? (
                <div
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 14,
                    padding: '18px 20px',
                    textAlign: 'center',
                    border: `1px solid ${C.border}`,
                  }}
                >
                  <p style={{ color: C.dim, fontSize: 13, margin: 0 }}>No lifts logged yet</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {entries.map((r: any, i: number) => {
                    const rank = i + 1
                    const rankColor = RANK_COLORS[rank] ?? C.dim
                    const memberData = r.rig_members as any
                    const firstName = memberData?.first_name ?? ''
                    const lastName = memberData?.last_name ?? ''
                    const fullName = firstName || lastName
                      ? `${firstName} ${lastName}`.trim()
                      : 'Unknown'
                    const initials = fullName
                      .split(' ')
                      .map((n: string) => n[0] ?? '')
                      .join('')
                      .toUpperCase()
                      .slice(0, 2)
                    const isTop = rank === 1

                    return (
                      <div
                        key={i}
                        style={{
                          backgroundColor: isTop ? C.cardAlt : C.card,
                          borderRadius: 14,
                          padding: '14px 16px',
                          border: isTop
                            ? `1.5px solid ${meta.hue}44`
                            : `1px solid ${C.border}`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                          boxShadow: isTop ? `0 0 16px ${meta.hue}18` : 'none',
                        }}
                      >
                        {/* Rank number */}
                        <div
                          style={{
                            width: 32,
                            textAlign: 'center',
                            flexShrink: 0,
                            color: rankColor,
                            fontWeight: 900,
                            fontSize: rank <= 3 ? 20 : 16,
                            lineHeight: 1,
                          }}
                        >
                          {rank}
                        </div>

                        {/* Avatar circle with initials */}
                        <div
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: '50%',
                            backgroundColor: meta.hue + '22',
                            border: `2px solid ${meta.hue}55`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: meta.hue,
                            fontWeight: 800,
                            fontSize: 13,
                            flexShrink: 0,
                          }}
                        >
                          {initials}
                        </div>

                        {/* Member name */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p
                            style={{
                              color: C.white,
                              fontWeight: 600,
                              fontSize: 15,
                              margin: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {fullName}
                          </p>
                        </div>

                        {/* Weight */}
                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                          <span
                            style={{
                              color: meta.hue,
                              fontWeight: 900,
                              fontSize: 20,
                              lineHeight: 1,
                            }}
                          >
                            {r.actual_weight}
                          </span>
                          <span
                            style={{
                              color: C.dim,
                              fontWeight: 500,
                              fontSize: 13,
                              marginLeft: 4,
                            }}
                          >
                            kg
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
