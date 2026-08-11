import { createAdminClient } from '@/lib/supabase/admin';

// "How the business is running" — the MindBody insight block for the dashboard.
// Reads entirely from Supabase (members + member_visits, already synced +
// scored nightly). ZERO MindBody API calls.

export type MindBodyInsights = {
  activeMembers: number;
  risk: { high: number; medium: number; healthy: number };
  sessionsLast7: number;
  sessionsPrior7: number;
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

  // Sessions this week vs last week (attendance pulse) from member_visits.
  const now = Date.now();
  const wk = 7 * 86400000;
  const last7Iso = new Date(now - wk).toISOString();
  const prior7Iso = new Date(now - 2 * wk).toISOString();

  const { count: sessionsLast7 } = await supabase
    .from('member_visits')
    .select('visit_at', { count: 'exact', head: true })
    .gte('visit_at', last7Iso);
  const { count: sessionsPrior7Raw } = await supabase
    .from('member_visits')
    .select('visit_at', { count: 'exact', head: true })
    .gte('visit_at', prior7Iso)
    .lt('visit_at', last7Iso);

  const updatedAt =
    rows.map((r) => r.score_updated_at).filter(Boolean).sort().at(-1) ?? null;

  return {
    activeMembers: rows.length,
    risk,
    sessionsLast7: sessionsLast7 ?? 0,
    sessionsPrior7: sessionsPrior7Raw ?? 0,
    atRisk,
    updatedAt,
  };
}
