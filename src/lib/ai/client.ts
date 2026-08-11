import Anthropic from '@anthropic-ai/sdk';

// Lazily-constructed Anthropic client. Returns null when ANTHROPIC_API_KEY is
// unset so every AI feature degrades gracefully (the cron still runs, members
// just get no summary) rather than throwing.
let client: Anthropic | null = null;

export function getAnthropic(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

// Haiku 4.5 by default — cheap and fast for short per-member blurbs at scale.
// Override with RETENTION_AI_MODEL (e.g. claude-sonnet-5) for higher quality.
export const RETENTION_AI_MODEL =
  process.env.RETENTION_AI_MODEL ?? 'claude-haiku-4-5-20251001';
