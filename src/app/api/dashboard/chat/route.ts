import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAnthropic } from '@/lib/ai/client';
import { computeMindBodyInsights } from '@/lib/dashboard/insights';
import { DASHBOARD_AI_MODEL } from '@/lib/ai/brief';

// Ask-anything endpoint for the dashboard chat panel. Answers from data
// already on hand (today's brief + MindBody insights) — no new email/GHL
// fetching per message, keeps it fast and cheap. History is client-only
// for now (not persisted), matching the "get the layout right first" scope.

export const dynamic = 'force-dynamic';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function buildContext(briefs: Record<string, unknown>, insights: unknown): string {
  return JSON.stringify({ today: new Date().toISOString().slice(0, 10), briefs, insights });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const message = body?.message;
  const history: ChatMessage[] = Array.isArray(body?.history) ? body.history : [];
  if (typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'Missing message' }, { status: 400 });
  }

  const client = getAnthropic();
  if (!client) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 });
  }

  const supabase = createAdminClient();
  const [{ data: briefRows }, insights] = await Promise.all([
    supabase.from('agent_briefs').select('scope, summary, tasks, emails_scanned'),
    computeMindBodyInsights().catch(() => null),
  ]);

  const briefs: Record<string, unknown> = {};
  for (const row of briefRows ?? []) {
    briefs[(row as { scope: string }).scope] = row;
  }

  const system = `You are Hassan's assistant for The Yard Gym's owner dashboard. Answer using ONLY the context JSON provided (today's business/personal email briefs and MindBody retention insights) — never invent facts. If something isn't in the context, say you don't have that yet rather than guessing. Keep replies short and direct, a few sentences at most, like a sharp EA texting back. No markdown headers, plain prose.

Context:
${buildContext(briefs, insights)}`;

  const msg = await client.messages.create({
    model: DASHBOARD_AI_MODEL,
    max_tokens: 500,
    system,
    messages: [
      ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: message },
    ],
  });

  const block = msg.content.find((b) => b.type === 'text');
  const reply = block && block.type === 'text' ? block.text : "Sorry, I couldn't work that out.";

  return NextResponse.json({ reply });
}
