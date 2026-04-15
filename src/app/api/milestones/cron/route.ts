import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkBirthday, checkAnniversary, checkInactivity } from '@/lib/milestones/detect'
import { triggerMilestone } from '@/lib/milestones/trigger'

export async function GET(req: NextRequest) {
  // Auth: Vercel Cron sends CRON_SECRET, or use SYNC_SECRET for manual calls
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET ?? process.env.SYNC_SECRET
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'

  if (!isVercelCron && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const summary = {
    birthdays: 0,
    anniversaries: 0,
    inactivity: { 7: 0, 14: 0, 21: 0, 30: 0 } as Record<number, number>,
    errors: [] as string[],
  }

  // Fetch all active members
  const { data: members, error } = await supabase
    .from('members')
    .select('*')
    .eq('status', 'active')

  if (error || !members) {
    return NextResponse.json(
      { error: error?.message ?? 'No members found' },
      { status: 500 }
    )
  }

  for (const member of members) {
    try {
      // 1. Birthday check
      if (checkBirthday(member.birth_date)) {
        // Check if already triggered today
        const today = new Date().toISOString().split('T')[0]
        const { data: existing } = await supabase
          .from('milestone_log')
          .select('id')
          .eq('mindbody_client_id', member.mindbody_client_id)
          .eq('milestone_type', 'birthday')
          .gte('triggered_at', today + 'T00:00:00')
          .limit(1)

        if (!existing?.length) {
          await triggerMilestone(member, 'birthday', 'birthday')
          summary.birthdays++
        }
      }

      // 2. Anniversary check
      const anniversary = checkAnniversary(
        member.membership_start_date,
        member.last_milestone_anniversary
      )
      if (anniversary) {
        await triggerMilestone(member, 'anniversary', anniversary)
        summary.anniversaries++
      }

      // 3. Inactivity check
      const inactivityTier = checkInactivity(
        member.last_visit_date,
        member.inactivity_notified_days ?? 0
      )
      if (inactivityTier) {
        await triggerMilestone(member, 'inactivity', String(inactivityTier))
        summary.inactivity[inactivityTier] =
          (summary.inactivity[inactivityTier] ?? 0) + 1
      }
    } catch (err: any) {
      summary.errors.push(`${member.mindbody_client_id}: ${err.message}`)
    }
  }

  console.log('[Cron] Milestone scan complete:', summary)

  return NextResponse.json({
    ok: true,
    scanned: members.length,
    ...summary,
  })
}
