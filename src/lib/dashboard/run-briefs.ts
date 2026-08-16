import { createAdminClient } from '@/lib/supabase/admin';
import {
  emailAccountFor,
  fetchRecentEmails,
  findRepliedMessageIds,
  type FetchedEmail,
} from '@/lib/email/imap';
import {
  fetchRecentEmailsOAuth,
  findRepliedMessageIdsOAuth,
  isOAuthConnected,
} from '@/lib/email/gmail-oauth';
import { generateBrief, type BriefTask, type AtRiskMember } from '@/lib/ai/brief';
import {
  buildVipList,
  addGhlOpportunityContacts,
  replyCheckCandidates,
  scoreEmails,
  type ScoredEmail,
} from '@/lib/ai/email-signals';
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

// Match each task back to the email it came from, and carry across both the
// link AND the signals that made it urgent — the flags are why the dashboard can
// label a task "legal" or "payment overdue" rather than just colouring it red.
function linkTasksToEmails(tasks: BriefTask[], emails: ScoredEmail[]): BriefTask[] {
  return tasks.map((t) => {
    const subjectPart = t.source.includes(' - ')
      ? t.source.split(' - ').slice(1).join(' - ')
      : t.source;
    const sourceTokens = tokenize(subjectPart);
    if (sourceTokens.size === 0) return { ...t, url: null };

    let best: { email: ScoredEmail; score: number } | null = null;
    for (const e of emails) {
      const subjTokens = tokenize(e.subject);
      if (subjTokens.size === 0) continue;
      let overlap = 0;
      for (const tok of sourceTokens) if (subjTokens.has(tok)) overlap++;
      const score = overlap / Math.min(sourceTokens.size, subjTokens.size);
      if (score > 0.5 && (!best || score > best.score)) best = { email: e, score };
    }
    if (!best) return { ...t, url: null };

    const s = best.email.signals;
    return {
      ...t,
      url: best.email.url,
      flags: s.financialKeywordHit,
      deadline: s.detectedDeadline,
      vip: s.vipReason,
    };
  });
}

// Generates + stores the personal and business briefs. Called nightly by the
// milestones cron and available as a manual trigger. Any scope without email
// credentials is skipped gracefully (dashboard shows a "connect inbox" state).
export async function runBriefs(): Promise<BriefRunResult[]> {
  const supabase = createAdminClient();
  const results: BriefRunResult[] = [];

  // Gym context so the BUSINESS brief factors in how the gym is actually doing.
  // atRisk goes through as STRUCTURED data (not just the summary string) so a
  // member about to churn can compete fairly with inbox items for the top spot.
  let gymData: string | undefined;
  let atRisk: AtRiskMember[] | undefined;
  try {
    const ins = await computeMindBodyInsights();
    gymData =
      `Active paid members: ${ins.activeMembers}. Retention risk: ${ins.risk.high} high, ${ins.risk.medium} medium, ${ins.risk.healthy} healthy. ` +
      `Attendance this week (Monday-start): ${ins.sessionsThisWeek} sessions, versus ${ins.sessionsLastWeekToDate} at the same point last week (last week finished on ${ins.sessionsLastWeekFull}). ` +
      `Compare like for like — this week is still in progress, so a lower number is not automatically a decline.`;
    atRisk = ins.atRisk.map((m) => ({ name: m.name, score: m.score, summary: m.summary }));
  } catch {
    // insights optional
  }

  // Hassan's own addresses, so "addressed to me" can be told from "CC'd" —
  // and so he never lands on his own VIP list (both mailboxes are dashboard
  // accounts, which is where the "staff" VIPs come from).
  const ownerAddresses = new Set(
    [process.env.GMAIL_PERSONAL_USER, process.env.GMAIL_BUSINESS_USER]
      .filter((a): a is string => !!a)
      .map((a) => a.toLowerCase()),
  );

  // VIP list — staff, high-risk members, CRM contacts mid-deal. Built once and
  // reused for both scopes. GHL is rate-limited and non-critical, so a failure
  // there just means a slightly thinner list, never a failed brief.
  const vips = await buildVipList(ownerAddresses);
  await addGhlOpportunityContacts(vips).catch((e) => {
    console.error('[briefs] GHL VIP enrichment failed:', e);
  });

  for (const scope of ['personal', 'business'] as const) {
    const emails = await fetchEmailsForScope(scope);
    if (!emails) {
      results.push({ scope, ok: false, emails: 0, tasks: 0, error: 'inbox not connected' });
      continue;
    }
    try {
      // Which of these has he already answered? Only direct-question candidates
      // are looked up, so this costs a handful of calls, not one per email.
      const candidates = replyCheckCandidates(emails, ownerAddresses);
      let repliedIds = new Set<string>();
      try {
        if (scope === 'business') {
          repliedIds = await findRepliedMessageIdsOAuth('business', candidates, ownerAddresses);
        } else if (candidates.length > 0) {
          const acct = emailAccountFor('personal');
          if (acct) repliedIds = await findRepliedMessageIds(acct, { sinceDays: 14 });
        }
      } catch (e) {
        // Unknown ≠ answered: leave the set empty so nothing is wrongly silenced.
        console.error(`[briefs] reply lookup failed for ${scope}:`, e);
      }

      const scored = scoreEmails(emails, vips, ownerAddresses, repliedIds);
      const brief = await generateBrief(
        scope,
        scored,
        scope === 'business' ? { gymData, atRisk } : undefined,
      );
      if (!brief) {
        // Was "no brief (AI key?)" — misleading, since by far the commonest
        // cause is an unparseable/truncated model response, not a bad key.
        results.push({
          scope,
          ok: false,
          emails: emails.length,
          tasks: 0,
          error: 'brief generation returned nothing (missing ANTHROPIC_API_KEY, or unparseable model response)',
        });
        continue;
      }
      const now = new Date().toISOString();
      const row = {
        scope,
        summary: brief.summary,
        tasks: linkTasksToEmails(brief.tasks, scored),
        emails_scanned: emails.length,
        emails: emails.slice(0, 20),
        generated_at: now,
        updated_at: now,
      };

      // `truncated` needs migration 013. If that hasn't been applied yet the
      // insert would fail outright and save NOTHING, so fall back to writing
      // the brief without the flag rather than losing it. Deploy order then
      // doesn't matter; the warning banner just stays dark until the migration
      // lands.
      let { error } = await supabase
        .from('agent_briefs')
        .upsert({ ...row, truncated: brief.truncated ?? false }, { onConflict: 'scope' });
      if (error?.code === '42703') {
        console.warn('[briefs] agent_briefs.truncated missing — apply migration 013; saving without it');
        ({ error } = await supabase.from('agent_briefs').upsert(row, { onConflict: 'scope' }));
      }
      if (error) throw new Error(error.message);

      results.push({ scope, ok: true, emails: emails.length, tasks: brief.tasks.length });
    } catch (e) {
      results.push({ scope, ok: false, emails: 0, tasks: 0, error: (e as Error).message });
    }
  }

  return results;
}
