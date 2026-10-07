import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

// Did the message work? One row per staff contact and per cron inactivity
// message, measured against the member's own attendance before and after.
// See migration 024 for the definition and the proof-of-concept numbers.

const DAY = 86400000;
const WINDOW_DAYS = 28;

export type ResultVerdict = 'awaiting' | 'win' | 'no_impact' | 'not_measured';

export function judge(
  before8wk: number,
  before4wk: number,
  after4wk: number,
  windowClosed: boolean,
): { result: ResultVerdict; leaning: 'win' | 'no_impact' | null; expected: number } {
  // What they would likely have done anyway: their last 4 weeks, floored by
  // half their last 8 — a member mid-recovery is not credited to the message.
  const expected = Math.max(before4wk, before8wk / 4);
  const isWin = after4wk > expected && after4wk >= 2;
  if (!windowClosed) return { result: 'awaiting', leaning: isWin ? 'win' : 'no_impact', expected };
  if (before8wk === 0 && after4wk === 0) return { result: 'not_measured', leaning: null, expected };
  return { result: isWin ? 'win' : 'no_impact', leaning: null, expected };
}

type Touch = {
  source: 'contact' | 'milestone';
  sourceId: string;
  memberId: string;
  at: string;
  channel: string | null;
  byName: string | null;
};

// Recomputes every touch still inside its window plus any never computed.
// Settled rows are left alone. Reads member_visits only — no API cost.
export async function computeContactResults(
  supabase: SupabaseClient = createAdminClient(),
): Promise<{ touches: number; written: number; settled: number; errors: string[] }> {
  const errors: string[] = [];
  const now = Date.now();
  // Touches up to 56 days old: anything older is settled and untouched.
  const since = new Date(now - 56 * DAY).toISOString();

  const [contacts, milestones, existing] = await Promise.all([
    supabase
      .from('member_contacts')
      .select('id, member_id, contacted_at, channel, contacted_by_name')
      .gte('contacted_at', since),
    supabase
      .from('milestone_log')
      .select('id, mindbody_client_id, triggered_at, milestone_value')
      .eq('milestone_type', 'inactivity')
      .eq('runtime_env', 'production')
      .gte('triggered_at', since),
    supabase
      .from('contact_results')
      .select('source, source_id, result')
      .gte('contacted_at', since),
  ]);

  const settled = new Set(
    (existing.data ?? []).filter((r) => r.result !== 'awaiting').map((r) => `${r.source}:${r.source_id}`),
  );

  const touches: Touch[] = [
    ...(contacts.data ?? []).map((c) => ({
      source: 'contact' as const,
      sourceId: c.id,
      memberId: c.member_id,
      at: c.contacted_at,
      channel: c.channel,
      byName: c.contacted_by_name,
    })),
    ...(milestones.data ?? []).map((m) => ({
      source: 'milestone' as const,
      sourceId: m.id,
      memberId: m.mindbody_client_id,
      at: m.triggered_at,
      channel: `inactivity-${m.milestone_value}`,
      byName: 'Automated',
    })),
  ].filter((t) => !settled.has(`${t.source}:${t.sourceId}`));

  if (touches.length === 0) return { touches: 0, written: 0, settled: settled.size, errors };

  const ids = [...new Set(touches.map((t) => t.memberId))];
  const earliest = Math.min(...touches.map((t) => Date.parse(t.at)));
  const visits = new Map<string, number[]>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('member_visits')
      .select('mindbody_client_id, visit_at')
      .in('mindbody_client_id', ids)
      .eq('status', 'attended')
      .gte('visit_at', new Date(earliest - 56 * DAY).toISOString())
      .order('visit_at', { ascending: true })
      .range(from, from + 999);
    if (error) {
      errors.push(`results visits: ${error.message}`);
      break;
    }
    if (!data?.length) break;
    for (const r of data) (visits.get(r.mindbody_client_id) ?? visits.set(r.mindbody_client_id, []).get(r.mindbody_client_id)!).push(Date.parse(r.visit_at));
    if (data.length < 1000) break;
  }

  const rows = touches.map((t) => {
    const at = Date.parse(t.at);
    const ts = visits.get(t.memberId) ?? [];
    const before8 = ts.filter((x) => x < at && x >= at - 56 * DAY).length;
    const before4 = ts.filter((x) => x < at && x >= at - 28 * DAY).length;
    const after4 = ts.filter((x) => x >= at && x < at + WINDOW_DAYS * DAY).length;
    const closed = now >= at + WINDOW_DAYS * DAY;
    const v = judge(before8, before4, after4, closed);
    return {
      source: t.source,
      source_id: t.sourceId,
      member_id: t.memberId,
      contacted_at: t.at,
      channel: t.channel,
      by_name: t.byName,
      window_ends: new Date(at + WINDOW_DAYS * DAY).toISOString(),
      before_8wk: before8,
      before_4wk: before4,
      after_4wk: after4,
      expected: Math.round(v.expected * 10) / 10,
      result: v.result,
      leaning: v.leaning,
      computed_at: new Date(now).toISOString(),
    };
  });

  let written = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('contact_results').upsert(rows.slice(i, i + 500), { onConflict: 'source,source_id' });
    if (error) errors.push(`results upsert: ${error.message}`);
    else written += Math.min(500, rows.length - i);
  }
  return { touches: touches.length, written, settled: settled.size, errors };
}

// Backfill: every touch in history, once. Settled rows are not recomputed.
export async function backfillContactResults(
  supabase: SupabaseClient = createAdminClient(),
): Promise<{ touches: number; written: number; errors: string[] }> {
  const errors: string[] = [];
  const now = Date.now();
  const [contacts, milestones, existing] = await Promise.all([
    supabase.from('member_contacts').select('id, member_id, contacted_at, channel, contacted_by_name'),
    supabase.from('milestone_log').select('id, mindbody_client_id, triggered_at, milestone_value').eq('milestone_type', 'inactivity').eq('runtime_env', 'production'),
    supabase.from('contact_results').select('source, source_id'),
  ]);
  const have = new Set((existing.data ?? []).map((r) => `${r.source}:${r.source_id}`));
  const touches: Touch[] = [
    ...(contacts.data ?? []).map((c) => ({ source: 'contact' as const, sourceId: c.id, memberId: c.member_id, at: c.contacted_at, channel: c.channel, byName: c.contacted_by_name })),
    ...(milestones.data ?? []).map((m) => ({ source: 'milestone' as const, sourceId: m.id, memberId: m.mindbody_client_id, at: m.triggered_at, channel: `inactivity-${m.milestone_value}`, byName: 'Automated' })),
  ].filter((t) => !have.has(`${t.source}:${t.sourceId}`));
  if (touches.length === 0) return { touches: 0, written: 0, errors };

  const ids = [...new Set(touches.map((t) => t.memberId))];
  const earliest = Math.min(...touches.map((t) => Date.parse(t.at)));
  const visits = new Map<string, number[]>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('member_visits')
        .select('mindbody_client_id, visit_at')
        .in('mindbody_client_id', chunk)
        .eq('status', 'attended')
        .gte('visit_at', new Date(earliest - 56 * DAY).toISOString())
        .order('visit_at', { ascending: true })
        .range(from, from + 999);
      if (error) { errors.push(error.message); break; }
      if (!data?.length) break;
      for (const r of data) (visits.get(r.mindbody_client_id) ?? visits.set(r.mindbody_client_id, []).get(r.mindbody_client_id)!).push(Date.parse(r.visit_at));
      if (data.length < 1000) break;
    }
  }
  const rows = touches.map((t) => {
    const at = Date.parse(t.at); const ts = visits.get(t.memberId) ?? [];
    const before8 = ts.filter((x) => x < at && x >= at - 56 * DAY).length;
    const before4 = ts.filter((x) => x < at && x >= at - 28 * DAY).length;
    const after4 = ts.filter((x) => x >= at && x < at + WINDOW_DAYS * DAY).length;
    const v = judge(before8, before4, after4, now >= at + WINDOW_DAYS * DAY);
    return { source: t.source, source_id: t.sourceId, member_id: t.memberId, contacted_at: t.at, channel: t.channel, by_name: t.byName,
      window_ends: new Date(at + WINDOW_DAYS * DAY).toISOString(), before_8wk: before8, before_4wk: before4, after_4wk: after4,
      expected: Math.round(v.expected * 10) / 10, result: v.result, leaning: v.leaning, computed_at: new Date(now).toISOString() };
  });
  let written = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('contact_results').upsert(rows.slice(i, i + 500), { onConflict: 'source,source_id' });
    if (error) errors.push(error.message); else written += Math.min(500, rows.length - i);
  }
  return { touches: touches.length, written, errors };
}
