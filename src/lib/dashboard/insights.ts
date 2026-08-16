import { createAdminClient } from '@/lib/supabase/admin';

// "How the business is running" — the MindBody insight block for the dashboard.
// Reads entirely from Supabase (members + member_visits, already synced +
// scored nightly). ZERO MindBody API calls.

export type MindBodyInsights = {
  activeMembers: number;
  risk: { high: number; medium: number; healthy: number };
  /** Monday-start week, matching the MindBody Classes report. */
  sessionsThisWeek: number;
  /** Same elapsed slice of last week — the like-for-like comparison. */
  sessionsLastWeekToDate: number;
  /** Last week complete, for reference. */
  sessionsLastWeekFull: number;
  weekStart: string;
  atRisk: Array<{
    id: string;
    name: string;
    score: number | null;
    summary: string | null;
  }>;
  updatedAt: string | null;
};

type MemberRow = {
  mindbody_client_id: string;
  first_name: string | null;
  last_name: string | null;
  health_score: number | null;
  risk_band: string | null;
  ai_summary: string | null;
  score_updated_at: string | null;
};

export async function computeMindBodyInsights(): Promise<MindBodyInsights> {
  const supabase = createAdminClient();

  const { data: members } = await supabase
    .from('members')
    .select(
      'mindbody_client_id, first_name, last_name, health_score, risk_band, ai_summary, score_updated_at',
    )
    .eq('status', 'active')
    .eq('has_paid_membership', true)
    .returns<MemberRow[]>();

  const rows = members ?? [];
  const risk = { high: 0, medium: 0, healthy: 0 };
  for (const m of rows) {
    if (m.risk_band === 'high') risk.high++;
    else if (m.risk_band === 'medium') risk.medium++;
    else risk.healthy++;
  }

  // Top at-risk to call — lowest score first, with their AI summary.
  const atRisk = [...rows]
    .filter((m) => m.risk_band === 'high' || m.risk_band === 'medium')
    .sort((a, b) => (a.health_score ?? 999) - (b.health_score ?? 999))
    .slice(0, 5)
    .map((m) => ({
      id: m.mindbody_client_id,
      name: `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim(),
      score: m.health_score,
      summary: m.ai_summary,
    }));

  // Attendance runs on a MONDAY-START week, matching the MindBody Classes
  // report Hassan reads the real numbers off. It used to be a rolling 7 days,
  // which silently disagreed with MindBody even when the data was perfect.
  const { weekStart, lastWeekStart, sameElapsedLastWeek } = sydneyWeekBounds();

  const [{ count: thisWeek }, { count: lastWeekFull }, { count: lastWeekToDate }] =
    await Promise.all([
      supabase
        .from('member_visits')
        .select('visit_at', { count: 'exact', head: true })
        .gte('visit_at', weekStart),
      supabase
        .from('member_visits')
        .select('visit_at', { count: 'exact', head: true })
        .gte('visit_at', lastWeekStart)
        .lt('visit_at', weekStart),
      // Same elapsed slice of last week — comparing a part-week against a full
      // one is what made a normal Tuesday look like a 30% collapse.
      supabase
        .from('member_visits')
        .select('visit_at', { count: 'exact', head: true })
        .gte('visit_at', lastWeekStart)
        .lt('visit_at', sameElapsedLastWeek),
    ]);

  const updatedAt =
    rows.map((r) => r.score_updated_at).filter(Boolean).sort().at(-1) ?? null;

  return {
    activeMembers: rows.length,
    risk,
    sessionsThisWeek: thisWeek ?? 0,
    sessionsLastWeekToDate: lastWeekToDate ?? 0,
    sessionsLastWeekFull: lastWeekFull ?? 0,
    weekStart,
    atRisk,
    updatedAt,
  };
}

// Monday 00:00 in Australia/Sydney, expressed as UTC ISO strings. Sydney is
// UTC+10 (AEST) or UTC+11 (AEDT), so the offset is derived rather than assumed
// — hardcoding +10 would shift the week boundary by an hour over summer.
function sydneyWeekBounds(): {
  weekStart: string;
  lastWeekStart: string;
  sameElapsedLastWeek: string;
} {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayIdx = Math.max(0, days.indexOf(get('weekday')));
  const msIntoDay =
    Number(get('hour')) * 3600000 + Number(get('minute')) * 60000 + Number(get('second')) * 1000;
  const msIntoWeek = dayIdx * 86400000 + msIntoDay;

  const weekStartMs = now.getTime() - msIntoWeek;
  return {
    weekStart: new Date(weekStartMs).toISOString(),
    lastWeekStart: new Date(weekStartMs - 7 * 86400000).toISOString(),
    sameElapsedLastWeek: new Date(weekStartMs - 7 * 86400000 + msIntoWeek).toISOString(),
  };
}
