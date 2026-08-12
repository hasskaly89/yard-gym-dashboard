import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeMindBodyInsights } from '@/lib/dashboard/insights';
import { emailAccountFor } from '@/lib/email/imap';
import { isOAuthConnected } from '@/lib/email/gmail-oauth';

// Powers the redesigned Dashboard: live MindBody insights (Supabase, $0) plus
// the agent's personal/business briefs (once the inbox is connected + the
// nightly cron has run). Everything degrades gracefully before setup.

export const dynamic = 'force-dynamic';

type BriefRow = {
  scope: string;
  summary: string | null;
  tasks: unknown;
  generated_at: string;
  emails_scanned: number;
};

export async function GET() {
  const supabase = createAdminClient();

  const insights = await computeMindBodyInsights().catch(() => null);

  // Briefs — table may not exist yet (migration 009 not applied). Fail soft.
  let briefs: { personal: BriefRow | null; business: BriefRow | null } = {
    personal: null,
    business: null,
  };
  try {
    const { data } = await supabase
      .from('agent_briefs')
      .select('scope, summary, tasks, generated_at, emails_scanned')
      .returns<BriefRow[]>();
    if (data) {
      briefs = {
        personal: data.find((b) => b.scope === 'personal') ?? null,
        business: data.find((b) => b.scope === 'business') ?? null,
      };
    }
  } catch {
    // table missing — leave briefs null
  }

  return NextResponse.json({
    insights,
    briefs,
    config: {
      personalConnected: !!emailAccountFor('personal'),
      businessConnected: await isOAuthConnected('business'),
    },
    updatedAt: new Date().toISOString(),
  });
}
