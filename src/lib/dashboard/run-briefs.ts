import { createAdminClient } from '@/lib/supabase/admin';
import { emailAccountFor, fetchRecentEmails } from '@/lib/email/imap';
import { generateBrief } from '@/lib/ai/brief';
import { computeMindBodyInsights } from './insights';

export type BriefRunResult = {
  scope: 'personal' | 'business';
  ok: boolean;
  emails: number;
  tasks: number;
  error?: string;
};

// Generates + stores the personal and business briefs. Called nightly by the
// milestones cron and available as a manual trigger. Any scope without email
// credentials is skipped gracefully (dashboard shows a "connect inbox" state).
export async function runBriefs(): Promise<BriefRunResult[]> {
  const supabase = createAdminClient();
  const results: BriefRunResult[] = [];

  // Gym context so the BUSINESS brief factors in how the gym is actually doing.
  let gymData: string | undefined;
  try {
    const ins = await computeMindBodyInsights();
    gymData =
      `Active paid members: ${ins.activeMembers}. Retention risk: ${ins.risk.high} high, ${ins.risk.medium} medium, ${ins.risk.healthy} healthy. ` +
      `Sessions last 7 days: ${ins.sessionsLast7} (previous week: ${ins.sessionsPrior7}).`;
  } catch {
    // insights optional
  }

  for (const scope of ['personal', 'business'] as const) {
    const acct = emailAccountFor(scope);
    if (!acct) {
      results.push({ scope, ok: false, emails: 0, tasks: 0, error: 'inbox not connected' });
      continue;
    }
    try {
      const emails = await fetchRecentEmails(acct, { sinceDays: 3, max: 40 });
      const brief = await generateBrief(
        scope,
        emails,
        scope === 'business' ? { gymData } : undefined,
      );
      if (!brief) {
        results.push({ scope, ok: false, emails: emails.length, tasks: 0, error: 'no brief (AI key?)' });
        continue;
      }
      const now = new Date().toISOString();
      await supabase.from('agent_briefs').upsert(
        {
          scope,
          summary: brief.summary,
          tasks: brief.tasks,
          emails_scanned: emails.length,
          generated_at: now,
          updated_at: now,
        },
        { onConflict: 'scope' },
      );
      results.push({ scope, ok: true, emails: emails.length, tasks: brief.tasks.length });
    } catch (e) {
      results.push({ scope, ok: false, emails: 0, tasks: 0, error: (e as Error).message });
    }
  }

  return results;
}
