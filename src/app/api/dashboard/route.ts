import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/profile';
import { computeMindBodyInsights } from '@/lib/dashboard/insights';
import { emailAccountFor } from '@/lib/email/imap';
import { isOAuthConnected } from '@/lib/email/gmail-oauth';
import { taskId } from '@/lib/dashboard/taskId';

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
  emails: unknown;
  truncated?: boolean;
};

export async function GET() {
  // The proxy's matcher excludes /api, so this route is NOT covered by the
  // page auth gate — without this check it hands member names, risk bands, AI
  // notes and both brief bodies to anyone who knows the URL.
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Content is scoped per profile, not just per page. The dashboard is the one
  // page everyone can reach (ALWAYS_ALLOWED, so nobody redirect-loops), which
  // means anything sensitive rendered on it has to be gated HERE — otherwise
  // adding a front-desk login silently hands over the owner's personal inbox.
  const isAdmin = me.role === 'admin';
  const canSeeRetention = isAdmin || me.allowedPages.includes('retention');

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
      .select('scope, summary, tasks, generated_at, emails_scanned, emails, truncated')
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

  // Annotate each task with its complete/snooze state (table may not exist
  // yet — fail soft, tasks just show with no state).
  try {
    const { data: states } = await supabase
      .from('dashboard_task_state')
      .select('id, completed_at, snoozed_until')
      .returns<{ id: string; completed_at: string | null; snoozed_until: string | null }[]>();
    const stateMap = new Map((states ?? []).map((s) => [s.id, s]));

    for (const scope of ['personal', 'business'] as const) {
      const brief = briefs[scope];
      if (!brief || !Array.isArray(brief.tasks)) continue;
      brief.tasks = (brief.tasks as { title: string; source: string }[]).map((t) => {
        const id = taskId(scope, t.title, t.source);
        const s = stateMap.get(id);
        return { ...t, id, completedAt: s?.completed_at ?? null, snoozedUntil: s?.snoozed_until ?? null };
      });
    }
  } catch {
    // table missing — tasks just show with no state
  }

  return NextResponse.json({
    access: { role: me.role, allowedPages: me.allowedPages },
    insights: canSeeRetention ? insights : null,
    briefs: {
      // The personal brief is the owner's own mailbox. Never leaves admin.
      personal: isAdmin ? briefs.personal : null,
      business: briefs.business,
    },
    config: {
      personalConnected: !!emailAccountFor('personal'),
      businessConnected: await isOAuthConnected('business'),
    },
    updatedAt: new Date().toISOString(),
  });
}
