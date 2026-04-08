import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { canAccessCoach } from '@/lib/rig/permissions'
import type { UserRole } from '@/lib/rig/permissions'
import { BLOCK_CONFIGS, PHASE_COLORS, calcTarget } from '@/lib/rig/weights'
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

async function advanceWeek() {
  'use server'
  const supabase = await createClient()
  const { data: b } = await supabase
    .from('rig_blocks')
    .select('id, current_week, duration_weeks')
    .eq('is_active', true)
    .single()
  if (!b || (b.current_week ?? 1) >= b.duration_weeks) return
  await supabase
    .from('rig_blocks')
    .update({ current_week: (b.current_week ?? 1) + 1 })
    .eq('id', b.id)
  redirect('/rig/coach')
}

export default async function RigCoachPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const role = (user.user_metadata?.role ?? 'member') as UserRole
  if (!canAccessCoach(role)) redirect('/rig/home')

  // 1. Active block
  const { data: block } = await supabase
    .from('rig_blocks')
    .select('*')
    .eq('is_active', true)
    .single()

  // 2. All block week IDs
  let allWeekIds: string[] = []
  let currentWeekId: string | null = null

  if (block) {
    const { data: allWeeks } = await supabase
      .from('rig_block_weeks')
      .select('id, week_number')
      .eq('block_id', block.id)

    allWeekIds = (allWeeks as any[] || []).map((w: any) => w.id)

    // 3. Current week row
    const { data: currentWeek } = await supabase
      .from('rig_block_weeks')
      .select('id')
      .eq('block_id', block.id)
      .eq('week_number', block.current_week ?? 1)
      .single()

    currentWeekId = currentWeek?.id ?? null
  }

  // 4. Total members (no active filter)
  const { count: totalMembers } = await supabase
    .from('rig_members')
    .select('*', { count: 'exact', head: true })

  // 5. Members who logged this week (distinct)
  let weeklyLoggers = 0
  if (currentWeekId) {
    const { data: weekResults } = await supabase
      .from('rig_lift_results')
      .select('member_id')
      .eq('block_week_id', currentWeekId)

    weeklyLoggers = new Set((weekResults as any[] || []).map((r: any) => r.member_id)).size
  }

  // 6. Total PRs this block
  let totalPRs = 0
  if (allWeekIds.length > 0) {
    const { count: prCount } = await supabase
      .from('rig_lift_results')
      .select('*', { count: 'exact', head: true })
      .in('block_week_id', allWeekIds)
      .eq('is_pr', true)

    totalPRs = prCount ?? 0
  }

  const blockType = block?.block_type as BlockType | undefined
  const blockConfig = blockType ? BLOCK_CONFIGS[blockType] ?? null : null
  const currentWeekNum = block?.current_week ?? 1
  const durationWeeks = block?.duration_weeks ?? blockConfig?.durationWeeks ?? 1
  const currentWeekCfg = blockConfig?.weeks.find(w => w.week === currentWeekNum)
  const phaseColor = currentWeekCfg ? PHASE_COLORS[currentWeekCfg.phase] : C.purple

  const stats = [
    { label: 'Total Members',    value: String(totalMembers ?? 0) },
    { label: 'Logged This Week', value: block ? `${weeklyLoggers} / ${totalMembers ?? 0}` : '—' },
    { label: 'PRs This Block',   value: block ? String(totalPRs) : '—' },
    { label: 'Current Week',     value: block ? String(currentWeekNum) : '—' },
  ]

  return (
    <div style={{ backgroundColor: C.bg, margin: '-20px -16px', padding: '24px 16px', paddingBottom: 96 }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ color: C.white, fontSize: 22, fontWeight: 900, margin: 0 }}>Coach</h1>
          {block && currentWeekCfg && (
            <span style={{
              backgroundColor: phaseColor + '22',
              color: phaseColor,
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: 20,
              letterSpacing: '0.04em',
              border: `1px solid ${phaseColor}44`,
            }}>
              {currentWeekCfg.phase}
            </span>
          )}
        </div>
        {block ? (
          <p style={{ color: C.dim, fontSize: 13, marginTop: 4, marginBottom: 0 }}>
            {block.name} · Week {currentWeekNum} of {durationWeeks}
          </p>
        ) : (
          <p style={{ color: C.dim, fontSize: 13, marginTop: 4, marginBottom: 0 }}>No active block</p>
        )}
      </div>

      {/* Stats 2×2 grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        {stats.map(({ label, value }) => (
          <div key={label} style={{
            backgroundColor: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            padding: '16px 14px',
          }}>
            <p style={{ color: C.orange, fontSize: 26, fontWeight: 800, margin: 0, lineHeight: 1 }}>{value}</p>
            <p style={{ color: C.dim, fontSize: 11, fontWeight: 500, marginTop: 6, marginBottom: 0 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Block progress section */}
      {block && blockConfig ? (
        <div style={{
          backgroundColor: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: 16,
          marginBottom: 24,
        }}>
          <p style={{ color: C.white, fontSize: 13, fontWeight: 700, marginBottom: 12, marginTop: 0 }}>
            Block Progress
          </p>

          {/* Week dots */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {blockConfig.weeks.map(wk => {
              const isCurrentWeek = wk.week === currentWeekNum
              const isPast = wk.week < currentWeekNum
              const weekPhaseColor = PHASE_COLORS[wk.phase]
              return (
                <div key={wk.week} style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  backgroundColor: isCurrentWeek
                    ? weekPhaseColor
                    : isPast
                      ? weekPhaseColor + '44'
                      : C.cardAlt,
                  color: isCurrentWeek ? C.white : isPast ? weekPhaseColor : C.dimmer,
                  border: isCurrentWeek
                    ? `2px solid ${weekPhaseColor}`
                    : `1px solid ${C.border}`,
                }}>
                  {wk.week}
                </div>
              )
            })}
          </div>

          {/* Advance week */}
          {currentWeekNum < durationWeeks ? (
            <form action={advanceWeek}>
              <button
                type="submit"
                style={{
                  backgroundColor: C.cardAlt,
                  color: C.white,
                  border: `1px solid ${C.borderHi}`,
                  borderRadius: 12,
                  padding: '10px 18px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                Advance to Week {currentWeekNum + 1}
              </button>
            </form>
          ) : (
            <p style={{ color: C.dim, fontSize: 12, margin: 0 }}>Final week — block complete</p>
          )}
        </div>
      ) : !block ? (
        /* No active block CTA */
        <div style={{
          backgroundColor: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: 24,
          marginBottom: 24,
          textAlign: 'center',
        }}>
          <p style={{ color: C.white, fontWeight: 700, fontSize: 15, marginBottom: 6, marginTop: 0 }}>
            No Active Block
          </p>
          <p style={{ color: C.dim, fontSize: 13, marginBottom: 16, marginTop: 0 }}>
            Set up a training block to get started.
          </p>
          <Link
            href="/rig/coach/setup"
            style={{
              display: 'inline-block',
              backgroundColor: C.orange,
              color: C.white,
              fontWeight: 700,
              fontSize: 13,
              padding: '10px 22px',
              borderRadius: 12,
              textDecoration: 'none',
            }}
          >
            Set Up Block
          </Link>
        </div>
      ) : null}

      {/* Quick links */}
      <p style={{
        color: C.dim,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        marginBottom: 12,
        marginTop: 0,
      }}>
        Quick Links
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[
          {
            href:     '/rig/coach/members',
            icon:     '👥',
            title:    'Members',
            subtitle: 'View progress & 3RMs',
          },
          {
            href:     '/rig/coach/setup',
            icon:     '⚙️',
            title:    'Block Setup',
            subtitle: 'Manage training blocks',
          },
        ].map(({ href, icon, title, subtitle }) => (
          <Link
            key={href}
            href={href}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              backgroundColor: C.card,
              border: `1px solid ${C.border}`,
              borderLeft: `3px solid ${C.orange}`,
              borderRadius: 14,
              padding: '14px 16px',
              textDecoration: 'none',
            }}
          >
            <span style={{ fontSize: 20 }}>{icon}</span>
            <div style={{ flex: 1 }}>
              <p style={{ color: C.white, fontWeight: 700, fontSize: 14, margin: 0 }}>{title}</p>
              <p style={{ color: C.dim, fontSize: 12, margin: 0, marginTop: 2 }}>{subtitle}</p>
            </div>
            <span style={{ color: C.dimmer, fontSize: 18, fontWeight: 300 }}>›</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
