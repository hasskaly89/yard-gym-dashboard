import { createAdminClient } from '@/lib/supabase/admin';
import { emailAccountFor, fetchRecentEmails, type FetchedEmail } from '@/lib/email/imap';
import { fetchRecentEmailsOAuth, isOAuthConnected } from '@/lib/email/gmail-oauth';
import { generateBrief, type BriefTask } from '@/lib/ai/brief';
import { computeMindBodyInsights } from './insights';

export type BriefRunResult = {
  scope: 'personal' | 'business';
  ok: boolean;
  emails: number;
  tasks: number;
  error?: string;
};

// Business (Workspace) inbox uses Google OAuth — app passwords are disabled
// org-wide there. Personal keeps the simpler IMAP + app-password path.
// Returns null when the scope's inbox isn't connected yet.
async function fetchEmailsForScope(
  scope: 'personal' | 'business',
): Promise<FetchedEmail[] | null> {
  if (scope === 'business') {
    if (!(await isOAuthConnected('business'))) return null;
    return fetchRecentEmailsOAuth('business', { sinceDays: 3, max: 40 });
  }
  const acct = emailAccountFor('personal');
  if (!acct) return null;
  return fetchRecentEmails(acct, { sinceDays: 3, max: 40 });
}

// Best-effort: attach the source email's link to each task by matching the
// AI's "{sender} - {subject}" source string against the fetched emails —
// lets the dashboard open the actual email a task came from. Uses word-token
// overlap rather than a strict substring match, since the AI doesn't always
// copy the subject verbatim (paraphrases, truncates, reorders).
function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/^(re|fwd?):\s*/i, '')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2),
  );
}

function linkTasksToEmails(tasks: BriefTask[], emails: FetchedEmail[]): BriefTask[] {
  return tasks.map((t) => {
    const subjectPart = t.source.includes(' - ')
      ? t.source.split(' - ').slice(1).join(' - ')
      : t.source;
    const sourceTokens = tokenize(subjectPart);
    if (sourceTokens.size === 0) return { ...t, url: null };

    let best: { url: string | null; score: number } | null = null;
    for (const e of emails) {
      const subjTokens = tokenize(e.subject);
      if (subjTokens.size === 0) continue;
      let overlap = 0;
      for (const tok of sourceTokens) if (subjTokens.has(tok)) overlap++;
      const score = overlap / Math.min(sourceTokens.size, subjTokens.size);
      if (score > 0.5 && (!best || score > best.score)) best = { url: e.url, score };
    }
    return { ...t, url: best?.url ?? null };
  });
}

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
    const emails = await fetchEmailsForScope(scope);
    if (!emails) {
      results.push({ scope, ok: false, emails: 0, tasks: 0, error: 'inbox not connected' });
      continue;
    }
    try {
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
          tasks: linkTasksToEmails(brief.tasks, emails),
          emails_scanned: emails.length,
          emails: emails.slice(0, 20),
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
