import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  const [
    todayMilestones,
    recentActivity,
    atRiskMembers,
    monthlyStats,
    upcomingBirthdays,
  ] = await Promise.all([
    // Today's milestones
    supabase
      .from('milestone_log')
      .select('*, members!inner(first_name, last_name)')
      .gte('triggered_at', today + 'T00:00:00')
      .order('triggered_at', { ascending: false }),

    // Recent activity (last 20)
    supabase
      .from('milestone_log')
      .select('*, members!inner(first_name, last_name)')
      .order('triggered_at', { ascending: false })
      .limit(20),

    // At-risk members (14+ days inactive)
    supabase
      .from('members')
      .select('*')
      .eq('status', 'active')
      .not('last_visit_date', 'is', null)
      .lt(
        'last_visit_date',
        new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      )
      .order('last_visit_date', { ascending: true })
      .limit(20),

    // Monthly milestone count
    supabase
      .from('milestone_log')
      .select('id', { count: 'exact', head: true })
      .gte('triggered_at', monthAgo + 'T00:00:00'),

    // Upcoming birthdays (next 7 days)
    supabase
      .from('members')
      .select('mindbody_client_id, first_name, last_name, birth_date')
      .eq('status', 'active')
      .not('birth_date', 'is', null),
  ])

  // Filter upcoming birthdays in JS (Supabase can't easily do month/day matching)
  const now = new Date()
  const upcoming = (upcomingBirthdays.data ?? []).filter((m) => {
    if (!m.birth_date) return false
    const bd = new Date(m.birth_date + 'T00:00:00')
    for (let d = 0; d <= 7; d++) {
      const check = new Date(now)
      check.setDate(check.getDate() + d)
      if (
        bd.getMonth() === check.getMonth() &&
        bd.getDate() === check.getDate()
      ) {
        return true
      }
    }
    return false
  })

  return NextResponse.json({
    todayMilestones: todayMilestones.data ?? [],
    recentActivity: recentActivity.data ?? [],
    atRiskMembers: atRiskMembers.data ?? [],
    monthlyMilestoneCount: monthlyStats.count ?? 0,
    upcomingBirthdays: upcoming,
    atRiskCount: atRiskMembers.data?.length ?? 0,
  })
}
