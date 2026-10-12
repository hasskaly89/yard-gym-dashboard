import { NextRequest, NextResponse } from 'next/server';
import { runBriefs } from '@/lib/dashboard/run-briefs';
import { bearerAuthorized } from '@/lib/auth/machine-auth';

// Manual trigger for the dashboard agent briefs (the nightly milestones cron
// also calls runBriefs). Auth: Bearer SYNC_SECRET / CRON_SECRET.
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Fail closed when neither secret is set. The old `if (secret && ...)`
  // check left this route open whenever the env var was missing.
  if (!bearerAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const results = await runBriefs();
  return NextResponse.json({ ok: true, results });
}
