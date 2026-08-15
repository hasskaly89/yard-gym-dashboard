import { getAnthropic } from './client';
import type { FetchedEmail } from '@/lib/email/imap';
import type { ScoredEmail } from './email-signals';

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
export type Brief = {
  summary: string;
  tasks: BriefTask[];
  /** True when the model's response was cut off and only partially recovered. */
  truncated?: boolean;
};

// Hard ceiling on tasks. The point isn't the number — it's that output is
// BOUNDED BY CONSTRUCTION, so a busy inbox can never again produce a response
// too long to parse. Raising max_tokens alone just moves the same wall further
// out; this removes it. Enforced in code after parsing, not only in the prompt,
// because the prompt is a request and this is a guarantee.
export const MAX_TASKS = 20;

function systemPrompt(scope: 'personal' | 'business'): string {
  const who =
    scope === 'business'
      ? `You are the executive assistant to Hassan, who owns The Yard Gym (a gym in Edensor Park, Sydney). You are looking at his BUSINESS inbox and gym data.`
      : `You are Hassan's personal assistant, looking at his PERSONAL inbox.`;
  return `${who}

From the recent emails (and any gym data provided), produce a concise briefing for Hassan:
1. "summary": 2-3 plain sentences on what's going on / how things are running right now.
2. "tasks": a prioritised list of concrete things HE needs to do or that are required FROM him. Each: a short title, a one-line detail, an urgency ("high"|"medium"|"low"), and "source" — formatted EXACTLY as "{sender name} - {exact email subject}", copying the subject verbatim from the email it came from (used to link the task back to that email).

Each email arrives with a "signals" object computed deterministically BEFORE you see it. These are facts, not suggestions — rank with them:
- "forcedUrgency": "high" — you MUST emit this task with urgency "high". Never lower it. These are money, complaint, legal, insurance or WorkCover matters where being wrong is expensive.
- "financialKeywordHit": which of those categories matched.
- "isFromVip" / "vipReason" — the sender is staff, a member already flagged at high churn risk, or a CRM contact with an open deal. Outrank a stranger or a newsletter accordingly. An at-risk member reaching out is a retention emergency, not routine correspondence.
- "isUnansweredDirectQuestion" — addressed to Hassan, asking for something, and NOT yet replied to by him. Weight these up.
- "alreadyReplied" — he has already sent a reply in this thread. Do not raise it as something awaiting his response; only include it if something genuinely still needs doing beyond replying.
- "detectedDeadline" — explicit deadline language found in the email. Reference the actual deadline in the task detail.

Gym data, when provided, includes "atRisk": members closest to leaving. A member about to churn competes directly with inbox items for the top of the list — if the retention picture is worse than anything in the inbox, say so in the summary and put it in the tasks.

Rules:
- Only real, actionable items. IGNORE marketing, newsletters, promotions, receipts that need no action, and automated notifications — UNLESS forcedUrgency is set, in which case it is never ignorable.
- Be specific and grounded in the emails — never invent tasks or facts.
- Order tasks most-urgent first. If nothing needs doing, return an empty tasks array and say so in the summary.
- Return AT MOST ${MAX_TASKS} tasks. If more than that would qualify, return only the ${MAX_TASKS} most urgent and note in the summary that the list was trimmed. Never exceed this — a long list is worse than a short accurate one.
- Return ONLY valid JSON, no prose, no code fences: {"summary": string, "tasks": [{"title": string, "detail": string, "urgency": "high"|"medium"|"low", "source": string}]}`;
}

function normaliseTasks(raw: unknown): BriefTask[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t: unknown) => t && typeof (t as BriefTask).title === 'string')
    .map((t: BriefTask) => ({
      title: String(t.title).slice(0, 200),
      detail: String(t.detail ?? '').slice(0, 400),
      urgency: (['high', 'medium', 'low'].includes(t.urgency) ? t.urgency : 'medium') as Urgency,
      source: String(t.source ?? '').slice(0, 160),
    }));
}

// A response cut off at max_tokens leaves the tasks array unterminated, which
// makes JSON.parse throw and previously threw away the ENTIRE brief — every
// task that HAD completed included. Recover them by scanning the array for
// balanced {...} objects and keeping the ones that parse.
function salvageTruncated(cleaned: string): Brief | null {
  const summary = cleaned.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? '';
  const arrStart = cleaned.indexOf('[', cleaned.indexOf('"tasks"'));
  if (arrStart === -1) return summary ? { summary: summary.slice(0, 800), tasks: [] } : null;

  const objs: unknown[] = [];
  let depth = 0;
  let objStart = -1;
  let inStr = false;
  let esc = false;
  for (let i = arrStart; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') { if (depth === 0) objStart = i; depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try { objs.push(JSON.parse(cleaned.slice(objStart, i + 1))); } catch { /* skip */ }
        objStart = -1;
      }
    }
  }

  const tasks = normaliseTasks(objs);
  if (!summary && tasks.length === 0) return null;
  return {
    summary: summary.replace(/\\"/g, '"').slice(0, 800),
    tasks,
    truncated: true, // caller must surface this — a partial list must not read as complete
  };
}

// Exported for testing — the truncation-salvage path is hard to trigger on
// demand through generateBrief() once max_tokens is generous.
export function parseBrief(text: string): Brief | null {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1) return null;
  if (end !== -1) {
    try {
      const obj = JSON.parse(cleaned.slice(start, end + 1));
      return {
        summary: String(obj.summary ?? '').slice(0, 800),
        tasks: normaliseTasks(obj.tasks),
      };
    } catch {
      // fall through to salvage
    }
  }
  return salvageTruncated(cleaned);
}

// A hard-flagged email must not come back as medium/low. The prompt says so,
// but the prompt is a request — this is the guarantee. Matches the task back to
// its email via the "source" string the model was told to copy verbatim.
function enforceForcedUrgency(brief: Brief, emails: ScoredEmail[]): Brief {
  const forced = emails.filter((e) => e.signals.forcedUrgency === 'high');
  if (forced.length === 0) return brief;

  const tasks = brief.tasks.map((t) => {
    const src = t.source.toLowerCase();
    const hit = forced.some((e) => {
      const subject = e.subject.toLowerCase().replace(/^(re|fwd?):\s*/, '').trim();
      return subject.length > 3 && src.includes(subject.slice(0, 40));
    });
    return hit ? { ...t, urgency: 'high' as Urgency } : t;
  });

  const rank: Record<Urgency, number> = { high: 0, medium: 1, low: 2 };
  tasks.sort((a, b) => rank[a.urgency] - rank[b.urgency]);
  return { ...brief, tasks };
}

// The guarantee behind MAX_TASKS: sort by urgency, then cut. Applied to every
// brief, however it was parsed, so output size can't run away with inbox size.
function capTasks(brief: Brief): Brief {
  if (brief.tasks.length <= MAX_TASKS) return brief;
  const rank: Record<Urgency, number> = { high: 0, medium: 1, low: 2 };
  const tasks = [...brief.tasks].sort((a, b) => rank[a.urgency] - rank[b.urgency]).slice(0, MAX_TASKS);
  return { ...brief, tasks, truncated: true };
}

export type AtRiskMember = { name: string; score: number | null; summary: string | null };

export async function generateBrief(
  scope: 'personal' | 'business',
  emails: ScoredEmail[],
  context?: { gymData?: string; atRisk?: AtRiskMember[] },
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
      signals: e.signals,
    })),
    gymData: context?.gymData ?? null,
    atRisk: context?.atRisk ?? null,
  };

  // 1800 was too tight: a 40-email personal inbox produces more tasks than that
  // and the response was being cut off mid-object, failing to parse, and
  // surfacing as "no brief (AI key?)" — which pointed diagnosis at the wrong
  // thing entirely. parseBrief now salvages truncation too, so this is the
  // first line of defence rather than the only one.
  const msg = await client.messages.create({
    model: DASHBOARD_AI_MODEL,
    max_tokens: 8000,
    system: systemPrompt(scope),
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
  });

  const block = msg.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') return null;
  const brief = parseBrief(block.text);
  if (!brief) return null;
  // Flag truncation from the API itself too, not just from a failed parse — a
  // response can stop at max_tokens and still happen to end on a valid object.
  const cut = msg.stop_reason === 'max_tokens';
  return capTasks({ ...enforceForcedUrgency(brief, emails), truncated: brief.truncated || cut });
}
