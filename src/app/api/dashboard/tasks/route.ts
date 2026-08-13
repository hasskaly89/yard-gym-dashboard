import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { taskId } from '@/lib/dashboard/taskId';

// Marks a dashboard task complete/snoozed, or undoes either. Tasks have no
// stable id (regenerated nightly from AI output) so state is keyed by a
// deterministic hash of (scope, title, source) — see lib/dashboard/taskId.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { scope, title, source, action, days } = body ?? {};

  if (
    (scope !== 'personal' && scope !== 'business') ||
    typeof title !== 'string' ||
    typeof source !== 'string' ||
    !['complete', 'uncomplete', 'snooze', 'unsnooze'].includes(action)
  ) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const id = taskId(scope, title, source);
  const supabase = createAdminClient();
  const now = new Date();

  const patch: Record<string, unknown> = {
    id,
    scope,
    title,
    updated_at: now.toISOString(),
  };
  if (action === 'complete') {
    patch.completed_at = now.toISOString();
    patch.snoozed_until = null;
  } else if (action === 'uncomplete') {
    patch.completed_at = null;
  } else if (action === 'snooze') {
    const d = Number.isFinite(days) && days > 0 ? days : 1;
    patch.snoozed_until = new Date(now.getTime() + d * 86400000).toISOString();
    patch.completed_at = null;
  } else if (action === 'unsnooze') {
    patch.snoozed_until = null;
  }

  const { error } = await supabase
    .from('dashboard_task_state')
    .upsert(patch, { onConflict: 'id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id });
}
