import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Band } from '@/lib/retention/priority';

export type LogRow = {
  id: string;
  memberId: string;
  memberName: string;
  band: Band;
  contactedAt: string;
  contactedByName: string;
  channel: string | null;
  outcome: string | null;
};

export type LogsResponse = {
  logs: LogRow[];
};

// Returns the contact log, newest first, optionally bounded by a since/until
// window (ISO strings). Defaults to the last 90 days — enough for the report's
// presets while keeping the payload bounded. Staff/band/name filtering happens
// client-side on this set.
export async function GET(request: Request) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const since =
    searchParams.get('since') ??
    new Date(Date.now() - 90 * 86400000).toISOString();
  const until = searchParams.get('until');

  let query = supabase
    .from('member_contacts')
    .select(
      'id, member_id, member_name, band, contacted_at, contacted_by_name, channel, outcome',
    )
    .gte('contacted_at', since)
    .order('contacted_at', { ascending: false });

  if (until) query = query.lte('contacted_at', until);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const logs: LogRow[] = (data ?? []).map((row) => ({
    id: row.id,
    memberId: row.member_id,
    memberName: row.member_name,
    band: row.band as Band,
    contactedAt: row.contacted_at,
    contactedByName: row.contacted_by_name,
    channel: row.channel,
    outcome: row.outcome,
  }));

  return NextResponse.json({ logs } satisfies LogsResponse);
}
