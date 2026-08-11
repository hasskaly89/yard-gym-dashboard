import { NextRequest, NextResponse } from 'next/server';
import { runBriefs } from '@/lib/dashboard/run-briefs';

// Manual trigger for the dashboard agent briefs (the nightly milestones cron
// also calls runBriefs). Auth: Bearer SYNC_SECRET / CRON_SECRET.
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const secret = process.env.SYNC_SECRET ?? process.env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const results = await runBriefs();
  return NextResponse.json({ ok: true, results });
}
