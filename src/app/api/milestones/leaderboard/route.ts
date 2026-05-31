import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

const TZ = 'Australia/Sydney';

export type LeaderboardEntry = {
  mindbody_client_id: string;
  first_name: string;
  last_name: string;
  count: number;
};

export type LeaderboardResponse = {
  month: string; // YYYY-MM
  label: string; // "May 2026"
  startUtc: string;
  endUtc: string;
  entries: LeaderboardEntry[];
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function parseMonthParam(monthParam: string | null): {
  startUtc: Date;
  endUtc: Date;
  label: string;
  monthKey: string;
} {
  let year: number;
  let monthOneBased: number;

  if (!monthParam) {
    const nowKey = formatInTimeZone(new Date(), TZ, 'yyyy-MM');
    [year, monthOneBased] = nowKey.split('-').map((s) => parseInt(s, 10)) as [
      number,
      number,
    ];
  } else {
    const [yStr, mStr] = monthParam.split('-');
    year = parseInt(yStr, 10);
    monthOneBased = parseInt(mStr, 10);
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(monthOneBased) ||
      monthOneBased < 1 ||
      monthOneBased > 12
    ) {
      throw new Error(`Invalid month param: ${monthParam}`);
    }
  }

  // Wall-clock 00:00 on the 1st of the month in Sydney → UTC instant.
  const startWallClock = `${year}-${pad2(monthOneBased)}-01T00:00:00`;
  const nextYear = monthOneBased === 12 ? year + 1 : year;
  const nextMonth = monthOneBased === 12 ? 1 : monthOneBased + 1;
  const endWallClock = `${nextYear}-${pad2(nextMonth)}-01T00:00:00`;

  const startUtc = fromZonedTime(startWallClock, TZ);
  const endUtc = fromZonedTime(endWallClock, TZ);

  return {
    startUtc,
    endUtc,
    label: formatInTimeZone(startUtc, TZ, 'MMMM yyyy'),
    monthKey: `${year}-${pad2(monthOneBased)}`,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const monthParam = url.searchParams.get('month');

  let bounds: ReturnType<typeof parseMonthParam>;
  try {
    bounds = parseMonthParam(monthParam);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }

  const { startUtc, endUtc } = bounds;

  const supabase = createAdminClient();

  // Restrict to current paid members — no point leaderboarding a trial pass
  // that happened to show up 10 times in one month.
  const { data: paidRows, error: paidErr } = await supabase
    .from('members')
    .select('mindbody_client_id')
    .eq('status', 'active')
    .eq('has_paid_membership', true);

  if (paidErr) {
    return NextResponse.json({ error: paidErr.message }, { status: 500 });
  }

  const paidIds = (paidRows ?? []).map((r) => r.mindbody_client_id);
  if (paidIds.length === 0) {
    const body: LeaderboardResponse = {
      month: bounds.monthKey,
      label: bounds.label,
      startUtc: startUtc.toISOString(),
      endUtc: endUtc.toISOString(),
      entries: [],
    };
    return NextResponse.json(body);
  }

  // Pull visits within the month, then group + sort + take top 10 in JS.
  // Supabase doesn't support GROUP BY in JS-client queries directly, so an
  // RPC would be cleaner — but for ~few-thousand rows per month this is fast.
  const { data: rows, error } = await supabase
    .from('member_visits')
    .select('mindbody_client_id')
    .in('mindbody_client_id', paidIds)
    .gte('visit_at', startUtc.toISOString())
    .lt('visit_at', endUtc.toISOString());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const counts = new Map<string, number>();
  for (const r of rows ?? []) {
    counts.set(r.mindbody_client_id, (counts.get(r.mindbody_client_id) ?? 0) + 1);
  }

  const topIds = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => id);

  if (topIds.length === 0) {
    const body: LeaderboardResponse = {
      month: bounds.monthKey,
      label: bounds.label,
      startUtc: startUtc.toISOString(),
      endUtc: endUtc.toISOString(),
      entries: [],
    };
    return NextResponse.json(body);
  }

  const { data: members, error: mErr } = await supabase
    .from('members')
    .select('mindbody_client_id, first_name, last_name')
    .in('mindbody_client_id', topIds);

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  const memberMap = new Map<string, { first_name: string; last_name: string }>();
  for (const m of members ?? []) {
    memberMap.set(m.mindbody_client_id, {
      first_name: m.first_name ?? '',
      last_name: m.last_name ?? '',
    });
  }

  const entries: LeaderboardEntry[] = topIds.map((id) => ({
    mindbody_client_id: id,
    first_name: memberMap.get(id)?.first_name ?? '',
    last_name: memberMap.get(id)?.last_name ?? '',
    count: counts.get(id) ?? 0,
  }));

  const body: LeaderboardResponse = {
    month: bounds.monthKey,
    label: bounds.label,
    startUtc: startUtc.toISOString(),
    endUtc: endUtc.toISOString(),
    entries,
  };
  return NextResponse.json(body);
}
