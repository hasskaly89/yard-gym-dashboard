import { NextRequest, NextResponse } from 'next/server';
import { syncMindBodyMembers } from '@/lib/mindbody/sync';
import {
  syncMemberMemberships,
  type MembershipSyncScope,
} from '@/lib/mindbody/active-memberships';
import { syncMemberVisitCounts, type VisitSyncMode } from '@/lib/mindbody/sync-visits';
import { resetMBCallCount, getMBCallCount } from '@/lib/mindbody/api';
import { markRun } from '@/lib/mindbody/sync-state';
import { computeScoresForPaidMembers } from '@/lib/retention/health';
import { generateRetentionSummary } from '@/lib/ai/retention-summary';
import { runRetentionScoring } from '@/lib/retention/run-scoring';

// Controlled, MEASURED MindBody refresh — the safe way to run a sync by hand.
// Every step reports how many MindBody API calls it made (apiCalls) so a run's
// dollar cost is visible ($0.002/call). Use `limit` for a tiny, cheap probe
// before committing to a full run.
//
//   POST /api/mindbody/sync-refresh
//   Authorization: Bearer <SYNC_SECRET>
//   body: {
//     steps?: ("members"|"memberships"|"visits")[]  // default all three
//     mode?: "incremental" | "backfill"              // visits only, default incremental
//     limit?: number                                 // cap members processed (test runs)
//     scope?: "full" | "narrow"                      // memberships only, default full
//   }
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const secret = process.env.SYNC_SECRET ?? process.env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    steps?: string[];
    mode?: VisitSyncMode;
    limit?: number;
    scope?: MembershipSyncScope;
  } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine — use defaults
  }

  const steps = body.steps ?? ['members', 'memberships', 'visits'];
  const mode: VisitSyncMode = body.mode ?? 'incremental';
  const limit = body.limit;

  const result: Record<string, unknown> = { steps, mode, limit: limit ?? null };
  let totalCalls = 0;

  try {
    if (steps.includes('members')) {
      // syncMindBodyMembers isn't self-instrumented; measure it here.
      resetMBCallCount();
      const members = await syncMindBodyMembers();
      const apiCalls = getMBCallCount();
      totalCalls += apiCalls;
      result.members = { ...members, apiCalls };
    }

    if (steps.includes('memberships')) {
      const memberships = await syncMemberMemberships({ limit, scope: body.scope });
      totalCalls += memberships.apiCalls;
      result.memberships = memberships;
    }

    if (steps.includes('visits')) {
      const visits = await syncMemberVisitCounts({ mode, limit });
      totalCalls += visits.apiCalls;
      result.visits = visits;
    }

    // Read-only health-score preview — computes scores for all paid members and
    // returns the distribution + worst 10, WITHOUT writing (no migration needed).
    if (steps.includes('score-preview')) {
      const scored = await computeScoresForPaidMembers();
      const dist = { high: 0, medium: 0, healthy: 0 };
      for (const s of scored) dist[s.band]++;
      const worst = [...scored]
        .sort((a, b) => a.score - b.score)
        .slice(0, 10)
        .map((s) => ({
          name: `${s.firstName} ${s.lastName}`.trim(),
          score: s.score,
          band: s.band,
          daysSinceLastVisit: s.daysSinceLastVisit,
          reason: s.reasons[0] ?? null,
        }));
      result.scorePreview = { scored: scored.length, distribution: dist, worst };
    }

    // Generate REAL AI summaries for the worst N at-risk members (no DB write) —
    // used to eyeball quality before the full populate run.
    if (steps.includes('summary-sample')) {
      const scored = await computeScoresForPaidMembers();
      const sample = scored
        .filter((s) => s.band === 'high' || s.band === 'medium')
        .sort((a, b) => a.score - b.score)
        .slice(0, limit ?? 4);
      const summaries = await Promise.all(
        sample.map(async (s) => ({
          name: `${s.firstName} ${s.lastName}`.trim(),
          score: s.score,
          band: s.band,
          summary: await generateRetentionSummary(s),
        })),
      );
      result.summarySample = summaries;
    }

    // Persist scores for all paid members + AI summaries for at-risk. $0
    // MindBody; a few cents of Anthropic. Requires migration 007.
    if (steps.includes('score')) {
      result.scoring = await runRetentionScoring();
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message, partial: result },
      { status: 500 },
    );
  }

  // Record cadence only for full (unbounded) runs.
  if (!limit) {
    if (steps.includes('memberships')) await markRun('membership_sync');
    if (steps.includes('visits')) await markRun('visit_sync');
  }

  result.totalApiCalls = totalCalls;
  result.estimatedCostUsd = Math.round(totalCalls * 0.002 * 100) / 100;
  return NextResponse.json({ ok: true, ...result });
}
