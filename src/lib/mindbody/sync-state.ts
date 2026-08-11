import { createAdminClient } from '@/lib/supabase/admin';

// Small helper over the `sync_state` table so background jobs can run on
// different cadences (e.g. visits nightly, memberships weekly) without
// re-spending MindBody API calls every run.

export async function getLastRun(key: string): Promise<Date | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('sync_state')
    .select('last_run_at')
    .eq('key', key)
    .maybeSingle();
  if (!data?.last_run_at) return null;
  const d = new Date(data.last_run_at);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function daysSince(key: string): Promise<number | null> {
  const last = await getLastRun(key);
  if (!last) return null;
  return (Date.now() - last.getTime()) / 86400000;
}

export async function markRun(
  key: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  await supabase
    .from('sync_state')
    .upsert(
      { key, last_run_at: now, meta: meta ?? null, updated_at: now },
      { onConflict: 'key' },
    );
}

// True if `key` has never run or last ran more than `maxAgeDays` ago.
export async function isDue(key: string, maxAgeDays: number): Promise<boolean> {
  const d = await daysSince(key);
  return d === null || d >= maxAgeDays;
}
