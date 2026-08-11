import { getAnthropic, RETENTION_AI_MODEL } from './client';
import type { ScoredMember } from '@/lib/retention/health';

// Generates the Recovr-style "why they're at risk + what to do" blurb for a
// member, from the deterministic score + reasons (so the model explains, it
// doesn't invent). Returns null if no API key is configured.

export type SummaryInput = ScoredMember & {
  recentNotes?: string[];
  lastContactDaysAgo?: number | null;
};

const SYSTEM = `You write short retention notes for staff at The Yard Gym (a gym in Edensor Park, Sydney) who are about to call an at-risk member.
Given a member's attendance data and computed risk reasons, write EXACTLY:
1. One sentence explaining why they're at risk (specific, grounded in the numbers you're given — do not invent facts).
2. One sentence with a concrete suggested action for the call.
Tone: warm, direct, practical. Use the member's first name. No preamble, no bullet points, no more than ~45 words total.`;

export async function generateRetentionSummary(
  m: SummaryInput,
): Promise<string | null> {
  const client = getAnthropic();
  if (!client) return null;

  const context = {
    firstName: m.firstName,
    healthScore: m.score,
    riskBand: m.band,
    riskReasons: m.reasons,
    daysSinceLastVisit: m.daysSinceLastVisit,
    sessionsLast30Days: m.last30,
    sessionsPrior30Days: m.prior30,
    recentStaffNotes: m.recentNotes ?? [],
    lastContactedDaysAgo: m.lastContactDaysAgo ?? null,
  };

  const msg = await client.messages.create({
    model: RETENTION_AI_MODEL,
    max_tokens: 200,
    system: SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify(context) }],
  });

  const block = msg.content.find((b) => b.type === 'text');
  return block && block.type === 'text' ? block.text.trim() : null;
}

// Generates summaries for at-risk (high + medium) members only — healthy
// members don't need a call blurb — with bounded concurrency. Returns a map of
// member id -> summary. No-ops (empty map) when no API key is set.
export async function generateSummariesForAtRisk(
  members: ScoredMember[],
  opts?: { concurrency?: number; notesById?: Map<string, string[]> },
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!getAnthropic()) return out;

  const atRisk = members.filter((m) => m.band === 'high' || m.band === 'medium');
  const concurrency = opts?.concurrency ?? 5;

  for (let i = 0; i < atRisk.length; i += concurrency) {
    const batch = atRisk.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (m) => {
        const summary = await generateRetentionSummary({
          ...m,
          recentNotes: opts?.notesById?.get(m.id),
        });
        return { id: m.id, summary };
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.summary) {
        out.set(r.value.id, r.value.summary);
      }
    }
  }
  return out;
}
