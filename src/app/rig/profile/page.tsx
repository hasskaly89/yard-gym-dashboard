import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

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

async function handleSignOut() {
  'use server'
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export default async function RigProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const role = (user.user_metadata?.role ?? 'member') as string

  let member: any = null
  let threeRMs: { lift: string; weight_kg: number }[] = []
  let allPRs: { lift: string; weight_kg: number; logged_at: string }[] = []
  let liftHistory: { lift: string; weight_kg: number; reps_completed: number | null; is_pr: boolean; logged_at: string; week_number: number | null }[] = []

  if (role === 'member') {
    // 1. Member record
    const { data: m } = await supabase
      .from('rig_members')
      .select('id, first_name, last_name, email, photo_url')
      .eq('email', user.email!)
      .single()

    member = m

    if (m) {
      // 2. Active block
      const { data: block } = await supabase
        .from('rig_blocks')
        .select('id, name, current_week, type')
        .eq('is_active', true)
        .single()

      if (block) {
        // 3. Member's 3RMs for active block
        const { data: rms } = await supabase
          .from('rig_member_maxes')
          .select('rm3, rig_lifts!lift_id(slug)')
          .eq('member_id', m.id)
          .eq('block_id', block.id)

        threeRMs = ((rms as any[]) || []).map(r => ({
          lift: (r.rig_lifts as any)?.slug ?? '',
          weight_kg: r.rm3,
        }))
      }

      // 4. All-time PRs (last 10)
      const { data: prs } = await supabase
        .from('rig_lift_results')
        .select('actual_weight, logged_at, rig_lifts!lift_id(slug)')
        .eq('member_id', m.id)
        .eq('is_pr', true)
        .order('logged_at', { ascending: false })
        .limit(10)

      allPRs = ((prs as any[]) || []).map(r => ({
        lift: (r.rig_lifts as any)?.slug ?? '',
        weight_kg: r.actual_weight,
        logged_at: r.logged_at,
      }))

      // 5. Lift history (last 15)
      const { data: history } = await supabase
        .from('rig_lift_results')
        .select('actual_weight, reps_completed, is_pr, logged_at, rig_lifts!lift_id(slug), rig_block_weeks!block_week_id(week_number)')
        .eq('member_id', m.id)
        .order('logged_at', { ascending: false })
        .limit(15)

      liftHistory = ((history as any[]) || []).map(l => ({
        lift: (l.rig_lifts as any)?.slug ?? '',
        weight_kg: l.actual_weight,
        reps_completed: l.reps_completed ?? null,
        is_pr: l.is_pr,
        logged_at: l.logged_at,
        week_number: (l.rig_block_weeks as any)?.week_number ?? null,
      }))
    }
  }

  const displayName = member
    ? `${member.first_name} ${member.last_name}`.trim()
    : user.email?.split('@')[0] ?? 'User'

  const initials = displayName
    .split(' ')
    .map((n: string) => n[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2)

  // Filter 3RMs to only known lift slugs, in order
  const orderedRMs = LIFTS
    .map(lift => {
      const rm = threeRMs.find(r => r.lift === lift)
      return rm ? { lift, weight_kg: rm.weight_kg } : null
    })
    .filter(Boolean) as { lift: Lift; weight_kg: number }[]

  return (
    <div style={{ padding: '24px 16px 8px' }}>

      {/* Section 1 — Profile card */}
      <div
        style={{
          backgroundColor: C.card,
          borderRadius: 20,
          padding: '28px 20px',
          border: `1px solid ${C.border}`,
          textAlign: 'center',
          marginBottom: 24,
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            backgroundColor: C.orange + '22',
            border: `3px solid ${C.orange}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px',
            color: C.orange,
            fontWeight: 900,
            fontSize: 28,
          }}
        >
          {initials}
        </div>

        <h1 style={{ color: C.white, fontWeight: 900, fontSize: 22, margin: 0 }}>
          {displayName}
        </h1>
        <p style={{ color: C.dim, fontSize: 13, marginTop: 6 }}>
          {user.email}
        </p>

        {/* Role badge */}
        <span
          style={{
            display: 'inline-block',
            marginTop: 10,
            padding: '4px 14px',
            borderRadius: 99,
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'capitalize',
            letterSpacing: '0.05em',
            backgroundColor: role === 'admin' ? C.purple + '22' : C.orange + '22',
            color: role === 'admin' ? C.purple : C.orange,
            border: `1px solid ${role === 'admin' ? C.purple + '55' : C.orange + '55'}`,
          }}
        >
          {role}
        </span>
      </div>

      {/* Section 2 — 3-Rep Maxes */}
      {orderedRMs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <p
            style={{
              color: C.dim,
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              marginBottom: 12,
            }}
          >
            3-Rep Maxes
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {orderedRMs.map(({ lift, weight_kg }) => {
              const meta = LIFT_META[lift]
              return (
                <div
                  key={lift}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 16,
                    padding: '16px 12px',
                    border: `1px solid ${C.border}`,
                    textAlign: 'center',
                  }}
                >
                  {/* Lift abbr badge */}
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      backgroundColor: meta.hue + '22',
                      border: `2px solid ${meta.hue}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 8px',
                      color: meta.hue,
                      fontWeight: 900,
                      fontSize: 13,
                    }}
                  >
                    {meta.abbr}
                  </div>
                  {/* Big weight */}
                  <p style={{ color: meta.hue, fontWeight: 900, fontSize: 24, margin: 0, lineHeight: 1 }}>
                    {weight_kg}
                  </p>
                  <p style={{ color: C.dim, fontSize: 11, margin: '4px 0 0' }}>kg</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Section 3 — Personal Records */}
      {allPRs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <p
            style={{
              color: C.dim,
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              marginBottom: 12,
            }}
          >
            Personal Records
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {allPRs.map((pr, i) => {
              const liftKey = pr.lift as Lift
              const meta = LIFT_META[liftKey] ?? { abbr: pr.lift?.[0]?.toUpperCase() ?? '?', hue: C.orange, label: pr.lift }
              return (
                <div
                  key={i}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 12,
                    padding: '12px 16px',
                    border: `1px solid ${C.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  {/* Lift badge */}
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      backgroundColor: meta.hue + '22',
                      border: `1.5px solid ${meta.hue}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: meta.hue,
                      fontWeight: 900,
                      fontSize: 12,
                      flexShrink: 0,
                    }}
                  >
                    {meta.abbr}
                  </div>

                  {/* Name + date */}
                  <div style={{ flex: 1 }}>
                    <span
                      style={{
                        color: C.white,
                        fontWeight: 600,
                        fontSize: 14,
                        textTransform: 'capitalize',
                      }}
                    >
                      {pr.lift}
                    </span>
                    <span style={{ color: C.dimmer, fontSize: 12, marginLeft: 8 }}>
                      {new Date(pr.logged_at).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>

                  {/* Weight */}
                  <span style={{ color: meta.hue, fontWeight: 800, fontSize: 18, flexShrink: 0 }}>
                    {pr.weight_kg} kg
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Section 4 — Recent Lifts */}
      {liftHistory.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <p
            style={{
              color: C.dim,
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              marginBottom: 12,
            }}
          >
            Recent Lifts
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {liftHistory.map((l, i) => {
              const liftKey = l.lift as Lift
              const meta = LIFT_META[liftKey] ?? { abbr: l.lift?.[0]?.toUpperCase() ?? '?', hue: C.orange, label: l.lift }
              return (
                <div
                  key={i}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 12,
                    padding: '12px 16px',
                    border: `1px solid ${C.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  {/* Lift badge */}
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      backgroundColor: meta.hue + '22',
                      border: `1.5px solid ${meta.hue}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: meta.hue,
                      fontWeight: 900,
                      fontSize: 12,
                      flexShrink: 0,
                    }}
                  >
                    {meta.abbr}
                  </div>

                  {/* Name + week */}
                  <div style={{ flex: 1 }}>
                    <span
                      style={{
                        color: C.white,
                        fontWeight: 600,
                        fontSize: 14,
                        textTransform: 'capitalize',
                      }}
                    >
                      {l.lift}
                    </span>
                    {l.week_number != null && (
                      <span style={{ color: C.dimmer, fontSize: 12, marginLeft: 8 }}>
                        Week {l.week_number}
                      </span>
                    )}
                  </div>

                  {/* Weight + PR badge */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ color: C.white, fontWeight: 700, fontSize: 16 }}>
                      {l.weight_kg} kg
                    </span>
                    {l.is_pr && (
                      <span
                        style={{
                          display: 'inline-block',
                          marginLeft: 8,
                          padding: '2px 7px',
                          borderRadius: 6,
                          fontSize: 10,
                          fontWeight: 800,
                          backgroundColor: C.orange + '22',
                          color: C.orange,
                          border: `1px solid ${C.orange}44`,
                          verticalAlign: 'middle',
                        }}
                      >
                        PR
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Section 5 — Sign Out */}
      <form action={handleSignOut}>
        <button
          type="submit"
          style={{
            width: '100%',
            padding: '14px 20px',
            borderRadius: 14,
            backgroundColor: C.card,
            border: `1px solid rgba(239,68,68,0.35)`,
            color: 'rgba(239,68,68,0.7)',
            fontWeight: 700,
            fontSize: 15,
            cursor: 'pointer',
            textAlign: 'center',
          }}
        >
          Sign Out
        </button>
      </form>
    </div>
  )
}
