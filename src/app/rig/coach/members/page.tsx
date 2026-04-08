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

const LIFTS = ['squat', 'bench', 'deadlift'] as const
type Lift = typeof LIFTS[number]

const LIFT_META: Record<Lift, { abbr: string; hue: string }> = {
  squat:    { abbr: 'S', hue: '#FF5C3E' },
  bench:    { abbr: 'B', hue: '#7C6FFF' },
  deadlift: { abbr: 'D', hue: '#00C9A7' },
}

export default async function RigCoachMembersPage() {
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

  // 2. All members (no active filter)
  const { data: members } = await supabase
    .from('rig_members')
    .select('id, first_name, last_name, email')
    .order('first_name')

  let allRMs: { member_id: string; rm3: number; slug: string }[] = []
  let weekLifts: { member_id: string; actual_weight: number; is_pr: boolean; slug: string }[] = []

  if (block) {
    // 3. All 3RMs for this block joined with lift slug
    const { data: rmsRaw } = await supabase
      .from('rig_member_maxes')
      .select('member_id, rm3, rig_lifts!lift_id(slug)')
      .eq('block_id', block.id)

    allRMs = (rmsRaw as any[] || [])
      .map((r: any) => ({
        member_id: r.member_id as string,
        rm3:       r.rm3 as number,
        slug:      r.rig_lifts?.slug as string,
      }))
      .filter(r => r.slug)

    // 4. Current week row
    const { data: currentWeekRow } = await supabase
      .from('rig_block_weeks')
      .select('id')
      .eq('block_id', block.id)
      .eq('week_number', block.current_week ?? 1)
      .single()

    // 5. This week's lift results joined with lift slug
    const { data: liftsRaw } = await supabase
      .from('rig_lift_results')
      .select('member_id, actual_weight, is_pr, rig_lifts!lift_id(slug)')
      .eq('block_week_id', currentWeekRow?.id ?? '')

    weekLifts = (liftsRaw as any[] || [])
      .map((l: any) => ({
        member_id:     l.member_id as string,
        actual_weight: l.actual_weight as number,
        is_pr:         l.is_pr as boolean,
        slug:          l.rig_lifts?.slug as string,
      }))
      .filter(l => l.slug)
  }

  const blockType = block?.block_type as BlockType | undefined
  const blockConfig = blockType ? BLOCK_CONFIGS[blockType] ?? null : null
  const currentWeekNum = block?.current_week ?? 1

  const memberList = (members as any[] || []) as {
    id: string
    first_name: string
    last_name: string
    email: string
  }[]

  return (
    <div style={{ backgroundColor: C.bg, margin: '-20px -16px', padding: '24px 16px', paddingBottom: 96 }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link
          href="/rig/coach"
          style={{ color: C.dim, fontSize: 13, textDecoration: 'none', display: 'inline-block', marginBottom: 8 }}
        >
          ← Coach
        </Link>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ color: C.white, fontSize: 22, fontWeight: 900, margin: 0 }}>Members</h1>
          <span style={{ color: C.dim, fontSize: 13 }}>{memberList.length} members</span>
        </div>
        {block && (
          <p style={{ color: C.dim, fontSize: 13, marginTop: 4, marginBottom: 0 }}>
            {block.name}
          </p>
        )}
      </div>

      {/* Member list */}
      {memberList.length === 0 ? (
        <div style={{
          backgroundColor: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: 24,
          textAlign: 'center',
        }}>
          <p style={{ color: C.white, fontWeight: 700, fontSize: 15, margin: 0 }}>No members found</p>
          <p style={{ color: C.dim, fontSize: 13, marginTop: 6, marginBottom: 0 }}>
            Add members to get started.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {memberList.map(member => {
            const initials = `${member.first_name?.[0] ?? ''}${member.last_name?.[0] ?? ''}`.toUpperCase()

            const memberRMs = allRMs.filter(r => r.member_id === member.id)
            const memberWeekLifts = weekLifts.filter(l => l.member_id === member.id)

            const loggedCount = LIFTS.filter(lift =>
              memberWeekLifts.some(l => l.slug === lift)
            ).length

            const badgeBg = loggedCount === 3
              ? C.green + '33'
              : loggedCount > 0
                ? C.orange + '33'
                : 'rgba(255,255,255,0.08)'
            const badgeColor = loggedCount === 3
              ? C.green
              : loggedCount > 0
                ? C.orange
                : C.dimmer

            return (
              <div
                key={member.id}
                style={{
                  backgroundColor: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: 16,
                  padding: 16,
                }}
              >
                {/* Top row: avatar + name/email + badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: block ? 14 : 0 }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    backgroundColor: C.orange,
                    color: C.white,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 13,
                    flexShrink: 0,
                  }}>
                    {initials}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      color: C.white,
                      fontWeight: 700,
                      fontSize: 14,
                      margin: 0,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {member.first_name} {member.last_name}
                    </p>
                    <p style={{
                      color: C.dim,
                      fontSize: 12,
                      margin: 0,
                      marginTop: 2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {member.email}
                    </p>
                  </div>

                  {block && (
                    <span style={{
                      backgroundColor: badgeBg,
                      color: badgeColor,
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '4px 9px',
                      borderRadius: 20,
                      flexShrink: 0,
                    }}>
                      {loggedCount}/3
                    </span>
                  )}
                </div>

                {/* Lift sub-cards */}
                {block && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {LIFTS.map(lift => {
                      const meta = LIFT_META[lift]
                      const rm = memberRMs.find(r => r.slug === lift)
                      const logged = memberWeekLifts.find(l => l.slug === lift)
                      const target = rm && blockConfig
                        ? calcTarget(rm.rm3, currentWeekNum, blockType)
                        : null

                      return (
                        <div
                          key={lift}
                          style={{
                            backgroundColor: C.cardAlt,
                            border: `1px solid ${C.border}`,
                            borderRadius: 12,
                            padding: '10px 8px',
                            textAlign: 'center',
                          }}
                        >
                          {/* Lift abbr */}
                          <p style={{
                            color: meta.hue,
                            fontSize: 13,
                            fontWeight: 800,
                            margin: 0,
                            lineHeight: 1,
                          }}>
                            {meta.abbr}
                          </p>

                          {/* 3RM */}
                          {rm ? (
                            <p style={{ color: C.dim, fontSize: 10, margin: 0, marginTop: 4 }}>
                              {rm.rm3} kg
                            </p>
                          ) : (
                            <p style={{ color: C.dimmer, fontSize: 10, margin: 0, marginTop: 4 }}>—</p>
                          )}

                          {/* Logged / target / missing */}
                          {logged ? (
                            <p style={{
                              color: meta.hue,
                              fontSize: 11,
                              fontWeight: 700,
                              margin: 0,
                              marginTop: 4,
                            }}>
                              {logged.actual_weight} kg{logged.is_pr ? ' PR🔥' : ' ✓'}
                            </p>
                          ) : rm && target ? (
                            <p style={{
                              color: C.dim,
                              fontSize: 11,
                              fontWeight: 500,
                              margin: 0,
                              marginTop: 4,
                            }}>
                              → {target} kg
                            </p>
                          ) : !rm ? (
                            <p style={{
                              color: C.dimmer,
                              fontSize: 11,
                              margin: 0,
                              marginTop: 4,
                            }}>
                              —
                            </p>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
