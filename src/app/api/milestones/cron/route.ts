import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkBirthday, checkAnniversary, checkInactivity } from '@/lib/milestones/detect'
import { triggerMilestone } from '@/lib/milestones/trigger'
import { syncMemberMemberships } from '@/lib/mindbody/active-memberships'
import { syncMemberVisitCounts } from '@/lib/mindbody/sync-visits'
import { isDue, markRun } from '@/lib/mindbody/sync-state'
import { runRetentionScoring } from '@/lib/retention/run-scoring'
import { runBriefs } from '@/lib/dashboard/run-briefs'

// ⚠️ DO NOT RUN THIS ROUTE LOCALLY. It is NOT read-only — it sends real
// messages to real members via triggerMilestone() → GHL webhooks (birthday,
// anniversary, inactivity), and there is NO separate dev database: local
// .env.local and Vercel production point at the SAME Supabase project.
//
// So a local "just testing" run does two harmful things at once:
//   1. Members actually receive the messages.
//   2. It writes the `triggered_at` dedupe row this route checks, so the real
//      21:00 UTC production run then SKIPS those members entirely.
// The second one is the dangerous half — it fails silently and looks like
// nothing happened.
//
// To test brief generation, use /api/dashboard/brief-cron instead: it calls
// runBriefs() only and sends nothing.
//
// TODO: env-scope the dedupe (add an `env` column) so a non-production run
// cannot consume production's daily slot, and route all outbound through a
// single dispatch() gated on `process.env.VERCEL_ENV === 'production'`.
//
// Cron does: (weekly) refresh membership flags → (nightly) incremental visit
// sync (paid members only) → birthday/anniversary/inactivity checks.
//
// COST: MindBody bills $0.002/call. Memberships are one call/active member, so
// they run at most weekly (MEMBERSHIP_MAX_AGE_DAYS). Visits run nightly but in
// 'incremental' mode — only new visits since each member's last known one — so
// the nightly bill stays small and does not grow with history.
const MEMBERSHIP_MAX_AGE_DAYS = 6
export const maxDuration = 300
export const dynamic = 'force-dynamic'

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
    membershipSync: {
      ran: false,
      skippedReason: null as string | null,
      scanned: 0,
      paid: 0,
      apiCalls: 0,
      errors: [] as string[],
      durationMs: 0,
    },
    visitSync: {
      scanned: 0,
      updated: 0,
      apiCalls: 0,
      errors: [] as string[],
      durationMs: 0,
    },
    scoring: {
      scored: 0,
      high: 0,
      medium: 0,
      healthy: 0,
      scoresUpdated: 0,
      summariesWritten: 0,
      errors: [] as string[],
      durationMs: 0,
    },
    birthdays: 0,
    anniversaries: 0,
    inactivity: { 7: 0, 14: 0, 21: 0, 30: 0 } as Record<number, number>,
    apiCalls: 0,
    estimatedCostUsd: 0,
    errors: [] as string[],
  }

  // Step 0a: refresh has_paid_membership — expensive (one call/active member),
  // so only weekly. Visit sync below still runs nightly.
  try {
    if (await isDue('membership_sync', MEMBERSHIP_MAX_AGE_DAYS)) {
      summary.membershipSync = { ...summary.membershipSync, ...(await syncMemberMemberships()), ran: true }
      await markRun('membership_sync')
    } else {
      summary.membershipSync.skippedReason = `ran within last ${MEMBERSHIP_MAX_AGE_DAYS}d`
    }
  } catch (err) {
    summary.errors.push(`membership sync: ${(err as Error).message}`)
  }

  // Step 0b: incremental visit sync (paid members only) so total_visit_count +
  // last_visit_date are current — pulls only new visits since last known one.
  try {
    summary.visitSync = await syncMemberVisitCounts({ mode: 'incremental' })
    await markRun('visit_sync')
  } catch (err) {
    summary.errors.push(`visit sync: ${(err as Error).message}`)
  }

  summary.apiCalls = summary.membershipSync.apiCalls + summary.visitSync.apiCalls
  summary.estimatedCostUsd = Math.round(summary.apiCalls * 0.002 * 100) / 100

  // Step 0c: recompute health scores + AI summaries from the fresh visit data.
  // Reads Supabase only (zero MindBody cost); AI summaries run only if a key is
  // configured, and only for at-risk members.
  try {
    summary.scoring = await runRetentionScoring()
  } catch (err) {
    summary.errors.push(`scoring: ${(err as Error).message}`)
  }

  // Step 0d: dashboard agent briefs (email → tasks). Skips inboxes that aren't
  // connected yet; costs nothing until email credentials are set.
  try {
    await runBriefs()
  } catch (err) {
    summary.errors.push(`briefs: ${(err as Error).message}`)
  }

  // Fetch all active members. PostgREST caps select() at 1000 rows by default,
  // so we paginate — without this ~500 members were missing from the legacy
  // birthday/anniversary/inactivity scans.
  const PAGE = 1000
  const members: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .eq('status', 'active')
      .order('mindbody_client_id')
      .range(from, from + PAGE - 1)
    if (error) {
      return NextResponse.json(
        { error: error.message ?? 'No members found' },
        { status: 500 }
      )
    }
    if (!data || data.length === 0) break
    members.push(...data)
    if (data.length < PAGE) break
  }

  // ⚠️ Everything below SENDS TO REAL MEMBERS (see the warning at the top of
  // this file). `milestone_log` is shared with production, so running this
  // outside prod both messages people and makes the real run skip them.
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
