import { getAnthropic } from './client';
import type { FetchedEmail } from '@/lib/email/imap';

// The dashboard agent's brain. Reads recent emails (+ optional gym context) and
// returns a short "how it's running" summary plus a prioritised task list of
// what the owner needs to do / what's required from him. Draft-and-suggest:
// it surfaces and drafts, it never sends anything.

export const DASHBOARD_AI_MODEL =
  process.env.DASHBOARD_AI_MODEL ?? 'claude-sonnet-5';

export type Urgency = 'high' | 'medium' | 'low';
export type BriefTask = {
  title: string;
  detail: string;
  urgency: Urgency;
  source: string;
  url?: string | null;
};
export type Brief = { summary: string; tasks: BriefTask[] };

function systemPrompt(scope: 'personal' | 'business'): string {
  const who =
    scope === 'business'
      ? `You are the executive assistant to Hassan, who owns The Yard Gym (a gym in Edensor Park, Sydney). You are looking at his BUSINESS inbox and gym data.`
      : `You are Hassan's personal assistant, looking at his PERSONAL inbox.`;
  return `${who}

From the recent emails (and any gym data provided), produce a concise briefing for Hassan:
1. "summary": 2-3 plain sentences on what's going on / how things are running right now.
2. "tasks": a prioritised list of concrete things HE needs to do or that are required FROM him. Each: a short title, a one-line detail, an urgency ("high"|"medium"|"low"), and "source" — formatted EXACTLY as "{sender name} - {exact email subject}", copying the subject verbatim from the email it came from (used to link the task back to that email).

Rules:
- Only real, actionable items. IGNORE marketing, newsletters, promotions, receipts that need no action, and automated notifications.
- Be specific and grounded in the emails — never invent tasks or facts.
- Order tasks most-urgent first. If nothing needs doing, return an empty tasks array and say so in the summary.
- Return ONLY valid JSON, no prose, no code fences: {"summary": string, "tasks": [{"title": string, "detail": string, "urgency": "high"|"medium"|"low", "source": string}]}`;
}

function parseBrief(text: string): Brief | null {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    const tasks: BriefTask[] = Array.isArray(obj.tasks)
      ? obj.tasks
          .filter((t: unknown) => t && typeof (t as BriefTask).title === 'string')
          .map((t: BriefTask) => ({
            title: String(t.title).slice(0, 200),
            detail: String(t.detail ?? '').slice(0, 400),
            urgency: (['high', 'medium', 'low'].includes(t.urgency) ? t.urgency : 'medium') as Urgency,
            source: String(t.source ?? '').slice(0, 160),
          }))
      : [];
    return { summary: String(obj.summary ?? '').slice(0, 800), tasks };
  } catch {
    return null;
  }
}

export async function generateBrief(
  scope: 'personal' | 'business',
  emails: FetchedEmail[],
  context?: { gymData?: string },
): Promise<Brief | null> {
  const client = getAnthropic();
  if (!client) return null;

  const payload = {
    inboxScope: scope,
    today: new Date().toISOString().slice(0, 10),
    emails: emails.map((e) => ({
      from: e.from,
      subject: e.subject,
      date: e.date,
      snippet: e.snippet,
    })),
    gymData: context?.gymData ?? null,
  };

  const msg = await client.messages.create({
    model: DASHBOARD_AI_MODEL,
    max_tokens: 1800,
    system: systemPrompt(scope),
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
  });

  const block = msg.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') return null;
  return parseBrief(block.text);
}
