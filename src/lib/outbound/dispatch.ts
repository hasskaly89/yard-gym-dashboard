import { createAdminClient } from '@/lib/supabase/admin';

// The one door every message to a member goes through.
//
// Local .env.local and Vercel production point at the SAME Supabase project,
// so until now any local run of the milestones cron messaged real members and
// consumed production's dedupe row. The gate is VERCEL_ENV === 'production'
// rather than a DRY_RUN flag: a flag fails open when someone forgets it;
// VERCEL_ENV is simply absent on a laptop, so local code structurally cannot
// send. Preview deploys are blocked too.
//
// Every attempt — sent, suppressed, or failed — is written to outbound_log with
// the recipient and payload. A suppressed row IS the dry-run artefact: run the
// cron locally, read what it would have sent.
//
// OUTBOUND_REDIRECT_TO, when set, keeps the real transport but delivers to that
// address/number instead, with the intended recipient recorded. That is how a
// send path is proven end to end without a member ever receiving a test.

export type OutboundChannel = 'ghl_webhook' | 'ghl_tag' | 'ghl_sms' | 'email';

export type OutboundRequest = {
  channel: OutboundChannel;
  // Who this is for — a member id where there is one; always the human-readable
  // recipient (phone/email/contact id) for the log.
  memberId?: string | null;
  recipient: string;
  purpose: string; // 'milestone:inactivity:30', 'eod-summary', 'timesheet', 'invite'
  payload: Record<string, unknown>;
  // The transport. Only called when the gate allows a send.
  send: (recipient: string) => Promise<void>;
};

export type OutboundResult = {
  status: 'sent' | 'suppressed' | 'redirected' | 'failed';
  reason?: string;
};

export function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

export async function dispatch(req: OutboundRequest): Promise<OutboundResult> {
  const supabase = createAdminClient();
  const redirect = process.env.OUTBOUND_REDIRECT_TO?.trim() || null;
  const prod = isProductionRuntime();

  let result: OutboundResult;
  let deliveredTo: string | null = null;

  if (!prod && !redirect) {
    result = { status: 'suppressed', reason: `VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'}` };
  } else {
    const target = redirect ?? req.recipient;
    try {
      await req.send(target);
      deliveredTo = target;
      result = redirect ? { status: 'redirected' } : { status: 'sent' };
    } catch (err) {
      result = { status: 'failed', reason: (err as Error).message };
    }
  }

  // The log must never be the reason a send fails, and must never be skipped
  // because a send did.
  try {
    await supabase.from('outbound_log').insert({
      channel: req.channel,
      member_id: req.memberId ?? null,
      recipient: req.recipient,
      delivered_to: deliveredTo,
      purpose: req.purpose,
      payload: req.payload,
      status: result.status,
      reason: result.reason ?? null,
      runtime_env: process.env.VERCEL_ENV ?? 'local',
    });
  } catch (err) {
    console.error('[outbound] log write failed:', (err as Error).message);
  }

  return result;
}
