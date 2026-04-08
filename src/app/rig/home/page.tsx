import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { calcTarget, BLOCK_CONFIGS } from '@/lib/rig/weights'
import type { BlockType } from '@/lib/rig/weights'
import Link from 'next/link'

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

const LIFT_META: Record<Lift, { abbr: string; hue: string }> = {
  squat:    { abbr: 'S', hue: '#FF5C3E' },
  bench:    { abbr: 'B', hue: '#7C6FFF' },
  deadlift: { abbr: 'D', hue: '#00C9A7' },
}

export default async function RigHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const role = (user.user_metadata?.role ?? 'member') as string

  if (role === 'admin') redirect('/rig/coach')

  // 1. Active block
  const { data: block } = await supabase
    .from('rig_blocks')
    .select('*')
    .eq('is_active', true)
    .single()

  // 2. Member record
  const { data: m } = await supabase
    .from('rig_members')
    .select('id, first_name, last_name, email, photo_url')
    .eq('email', user.email!)
    .single()

  let threeRMs: { lift: string; weight_kg: number }[] = []
  let weekLifts: { lift: string; weight_kg: number; is_pr: boolean }[] = []
  let recentPRs: { lift: string; weight_kg: number; logged_at: string }[] = []

  if (block && m) {
    // 3. Member's 3RMs for the active block
    const { data: rms } = await supabase
      .from('rig_member_maxes')
      .select('rm3, rig_lifts!lift_id(slug)')
      .eq('member_id', m.id)
      .eq('block_id', block.id)

    threeRMs = ((rms as any[]) || []).map(r => ({
      lift: (r.rig_lifts as any)?.slug ?? '',
      weight_kg: r.rm3,
    }))

    // 4. Current week's block_week_id
    const { data: weekRow } = await supabase
      .from('rig_block_weeks')
      .select('id')
      .eq('block_id', block.id)
      .eq('week_number', block.current_week ?? 1)
      .single()

    if (weekRow) {
      // 5. This week's logged lifts
      const { data: lifts } = await supabase
        .from('rig_lift_results')
        .select('actual_weight, is_pr, rig_lifts!lift_id(slug)')
        .eq('member_id', m.id)
        .eq('block_week_id', weekRow.id)

      weekLifts = ((lifts as any[]) || []).map(l => ({
        lift: (l.rig_lifts as any)?.slug ?? '',
        weight_kg: l.actual_weight,
        is_pr: l.is_pr,
      }))
    }

    // 6. Recent PRs (last 3)
    const { data: prs } = await supabase
      .from('rig_lift_results')
      .select('actual_weight, logged_at, rig_lifts!lift_id(slug)')
      .eq('member_id', m.id)
      .eq('is_pr', true)
      .order('logged_at', { ascending: false })
      .limit(3)

    recentPRs = ((prs as any[]) || []).map(r => ({
      lift: (r.rig_lifts as any)?.slug ?? '',
      weight_kg: r.actual_weight,
      logged_at: r.logged_at,
    }))
  }

  const currentWeek = block?.current_week ?? 1
  const blockType = (block?.type ?? 'signature') as BlockType
  const blockCfg = BLOCK_CONFIGS[blockType]
  const weekConfig = blockCfg?.weeks.find(w => w.week === currentWeek)
  const totalWeeks = blockCfg?.durationWeeks ?? 6

  const doneCount = LIFTS.filter(lift => weekLifts.some(l => l.lift === lift)).length

  // Loading / no member state
  if (!m) {
    return (
      <div style={{ backgroundColor: C.bg, minHeight: '100vh', margin: '-20px -16px' }}>
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <p style={{ color: C.dim, fontSize: 14 }}>Member record not found.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ backgroundColor: C.bg, margin: '-20px -16px', padding: '24px 16px', paddingBottom: 96 }}>

      {/* Section 1 — Greeting */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ color: C.white, fontWeight: 900, fontSize: 28, margin: 0, lineHeight: 1.2 }}>
          Hey, {m.first_name}
        </h1>
        {block ? (
          <p style={{ color: C.dim, fontSize: 13, marginTop: 6, margin: '6px 0 0' }}>
            {block.name} &middot; {weekConfig?.label ?? `Week ${currentWeek}`}
          </p>
        ) : (
          <p style={{ color: C.dim, fontSize: 13, marginTop: 6, margin: '6px 0 0' }}>
            No active training block
          </p>
        )}

        {/* Week progress dots */}
        {block && (
          <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
            {Array.from({ length: totalWeeks }).map((_, i) => {
              const wNum = i + 1
              const wCfg = blockCfg?.weeks[i]
              const isPast = wNum < currentWeek
              const isCurrent = wNum === currentWeek
              const dotColor = isCurrent
                ? C.orange
                : isPast
                ? C.green
                : C.dimmer
              return (
                <div
                  key={i}
                  title={wCfg?.label ?? `Week ${wNum}`}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: dotColor,
                    transition: 'background-color 0.2s',
                  }}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* No block state */}
      {!block && (
        <div
          style={{
            backgroundColor: C.card,
            borderRadius: 16,
            padding: '32px 24px',
            textAlign: 'center',
            border: `1px solid ${C.border}`,
            marginBottom: 24,
          }}
        >
          <p style={{ fontSize: 40, marginBottom: 12 }}>🏋️</p>
          <p style={{ color: C.white, fontWeight: 700, fontSize: 16, margin: 0 }}>No Active Block</p>
          <p style={{ color: C.dim, fontSize: 13, marginTop: 6, margin: '8px 0 0' }}>
            Your trainer will set up a training block soon.
          </p>
        </div>
      )}

      {/* Section 2 — "This Week" label + completion badge */}
      {block && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span
              style={{
                color: C.dim,
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
              }}
            >
              This Week
            </span>
            <span
              style={{
                backgroundColor: doneCount === 3 ? C.green : C.cardAlt,
                color: doneCount === 3 ? '#0F0E1F' : C.dim,
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 10px',
                borderRadius: 99,
                border: `1px solid ${doneCount === 3 ? C.green : C.border}`,
              }}
            >
              {doneCount}/3 done
            </span>
          </div>

          {/* Section 3 — 3 lift cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
            {LIFTS.map(lift => {
              const meta = LIFT_META[lift]
              const rm = threeRMs.find(r => r.lift === lift)
              const target = rm ? calcTarget(rm.weight_kg, currentWeek, blockType) : null
              const logged = weekLifts.find(l => l.lift === lift)

              return (
                <div
                  key={lift}
                  style={{
                    backgroundColor: C.card,
                    borderRadius: 16,
                    padding: '16px 18px',
                    border: `1px solid ${logged ? C.borderHi : C.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                  }}
                >
                  {/* Colored circle badge */}
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      backgroundColor: meta.hue + '22',
                      border: `2px solid ${meta.hue}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: meta.hue,
                      fontWeight: 900,
                      fontSize: 15,
                    }}
                  >
                    {meta.abbr}
                  </div>

                  {/* Middle: name + target */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        color: C.white,
                        fontWeight: 700,
                        fontSize: 15,
                        margin: 0,
                        textTransform: 'capitalize',
                      }}
                    >
                      {lift}
                    </p>
                    {target != null ? (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                        <span style={{ color: C.orange, fontSize: 26, fontWeight: 900, lineHeight: 1 }}>
                          {target}
                        </span>
                        <span style={{ color: C.dim, fontSize: 13 }}>
                          kg &times; {weekConfig?.reps} reps
                        </span>
                      </div>
                    ) : (
                      <Link
                        href="/rig/log"
                        style={{
                          color: C.orange,
                          fontSize: 13,
                          fontWeight: 600,
                          marginTop: 2,
                          display: 'inline-block',
                          textDecoration: 'none',
                        }}
                      >
                        Set 3RM →
                      </Link>
                    )}
                  </div>

                  {/* Right: logged result or Log button */}
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    {logged ? (
                      <div>
                        <p
                          style={{
                            color: logged.is_pr ? C.orange : C.white,
                            fontWeight: 800,
                            fontSize: 18,
                            margin: 0,
                          }}
                        >
                          {logged.weight_kg} kg
                        </p>
                        <p
                          style={{
                            color: logged.is_pr ? C.orange : C.green,
                            fontSize: 12,
                            fontWeight: 700,
                            margin: '2px 0 0',
                          }}
                        >
                          {logged.is_pr ? '🔥 PR' : '✓'}
                        </p>
                      </div>
                    ) : (
                      <Link
                        href="/rig/log"
                        style={{
                          backgroundColor: C.orange + '22',
                          color: C.orange,
                          fontSize: 12,
                          fontWeight: 700,
                          padding: '6px 14px',
                          borderRadius: 8,
                          border: `1px solid ${C.orange}44`,
                          textDecoration: 'none',
                          display: 'inline-block',
                        }}
                      >
                        Log →
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Section 4 — Recent PRs */}
      {recentPRs.length > 0 && (
        <div>
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
            Recent PRs
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentPRs.map((pr, i) => {
              const liftKey = pr.lift as Lift
              const meta = LIFT_META[liftKey] ?? { abbr: pr.lift?.[0]?.toUpperCase() ?? '?', hue: C.orange }
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
                      fontSize: 13,
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
                      })}
                    </span>
                  </div>

                  {/* Weight */}
                  <span style={{ color: meta.hue, fontWeight: 800, fontSize: 18 }}>
                    {pr.weight_kg} kg
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
