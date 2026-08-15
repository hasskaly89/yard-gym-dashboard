import { createAdminClient } from '@/lib/supabase/admin';
import type { FetchedEmail } from '@/lib/email/imap';

// Deterministic pre-scoring for the dashboard brief.
//
// WHY THIS EXISTS: the brief used to hand Claude a raw email list and one
// paragraph of rules ("ignore newsletters, order by urgency") and ask it to
// judge importance cold, every night, with no grounding. That's a single
// ungrounded guess, which is why the priorities felt arbitrary — they were.
//
// Real priority inboxes (Gmail's, Superhuman, Shortwave) compute hard signals
// FIRST, then rank on top of them. This module is that first step: it decides
// what is objectively true about each email — who sent it, whether it names a
// deadline, whether it's money/legal, whether it's addressed to Hassan
// directly — and the model then ranks WITH that context instead of inventing
// it. Categories that must never be left to model discretion (an overdue
// invoice, a complaint, anything legal) are forced to high urgency here.

export type VipReason = 'staff' | 'at-risk member' | 'crm contact';

export type VipList = {
  // email address → why they matter. Lowercased keys.
  byEmail: Map<string, VipReason>;
};

export type EmailSignals = {
  isFromVip: boolean;
  vipReason: VipReason | null;
  isUnansweredDirectQuestion: boolean;
  /** Hassan has already sent a reply in this thread. */
  alreadyReplied: boolean;
  detectedDeadline: string | null;
  financialKeywordHit: string[];
  /** Set when a hard-flag category matched — the model may not lower it. */
  forcedUrgency: 'high' | null;
};

export type ScoredEmail = FetchedEmail & { signals: EmailSignals };

// ── VIP list ─────────────────────────────────────────────────────────────────
// Built entirely from data already in Supabase / GHL. No new integration.

function addressOf(raw: string): string {
  const m = raw.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return (m?.[0] ?? raw).trim().toLowerCase();
}

/**
 * @param exclude Addresses that must never be VIPs — in practice Hassan's own
 *   inboxes. NOTE: the "staff" source is Supabase auth, which lists every
 *   account with DASHBOARD ACCESS, not a curated staff roster. That set
 *   includes the two mailboxes being scanned, so without this exclusion Hassan
 *   is a VIP to himself and his own sent/self-addressed mail scores as staff.
 */
export async function buildVipList(exclude: Set<string> = new Set()): Promise<VipList> {
  const byEmail = new Map<string, VipReason>();
  const supabase = createAdminClient();

  // Weakest claim first, strongest last — later writes win, so a member who is
  // also staff ends up labelled "staff".
  try {
    const { data } = await supabase
      .from('members')
      .select('email, risk_band')
      .eq('risk_band', 'high')
      .not('email', 'is', null)
      .returns<{ email: string | null; risk_band: string }[]>();
    for (const m of data ?? []) {
      if (m.email) byEmail.set(addressOf(m.email), 'at-risk member');
    }
  } catch {
    // members table unavailable — VIP list degrades, brief still runs
  }

  // Staff = an account an admin actually granted access to, i.e. one with a
  // row in `profiles` carrying a role. auth.admin.listUsers() alone is NOT a
  // staff roster — it's every account that can sign in — so it's used only to
  // resolve id → email, and the role check comes from `profiles`.
  try {
    const [{ data: authData }, { data: profileRows }] = await Promise.all([
      supabase.auth.admin.listUsers(),
      supabase.from('profiles').select('id, role').returns<{ id: string; role: string | null }[]>(),
    ]);
    const roleById = new Map((profileRows ?? []).map((p) => [p.id, p.role]));
    for (const u of authData?.users ?? []) {
      if (!u.email) continue;
      const role = roleById.get(u.id);
      if (role === 'admin' || role === 'staff') byEmail.set(u.email.toLowerCase(), 'staff');
    }
  } catch {
    // auth admin / profiles unavailable — same graceful degrade
  }

  for (const addr of exclude) byEmail.delete(addressOf(addr));

  return { byEmail };
}

/**
 * CRM contacts with an open opportunity — people mid-deal, so an email from
 * them outranks a cold one. Merged into an existing list; failures are
 * swallowed by the caller since GHL is rate-limited and non-critical here.
 */
export async function addGhlOpportunityContacts(vips: VipList): Promise<void> {
  const token = process.env.GHL_PRIVATE_TOKEN ?? '';
  const locationId = process.env.GHL_LOCATION_ID ?? '';
  if (!token || !locationId) return;

  const res = await fetch(
    `https://services.leadconnectorhq.com/opportunities/search?location_id=${encodeURIComponent(
      locationId,
    )}&status=open&limit=100`,
    { headers: { Authorization: `Bearer ${token}`, Version: '2021-07-28', Accept: 'application/json' } },
  );
  if (!res.ok) return;

  const json: { opportunities?: Array<{ contact?: { email?: string | null } }> } = await res.json();
  for (const o of json.opportunities ?? []) {
    const email = o.contact?.email;
    // Don't downgrade someone already flagged staff / at-risk.
    if (email && !vips.byEmail.has(addressOf(email))) {
      vips.byEmail.set(addressOf(email), 'crm contact');
    }
  }
}

// ── Hard-flag categories ─────────────────────────────────────────────────────
// Matched on subject + snippet. These force high urgency regardless of what the
// model thinks, because "the invoice is overdue" is a fact, not a judgement.

const HARD_FLAGS: Array<{ label: string; re: RegExp }> = [
  { label: 'payment overdue', re: /\b(overdue|past due|final notice|unpaid|arrears|payment failed|declined payment|outstanding balance)\b/i },
  { label: 'invoice', re: /\b(invoice|tax invoice|remittance|statement of account)\b/i },
  { label: 'refund request', re: /\b(refund|chargeback|money back|reimbursement)\b/i },
  { label: 'complaint', re: /\b(complaint|complain|unacceptable|very disappointed|escalate|formal warning)\b/i },
  { label: 'legal', re: /\b(legal|solicitor|lawyer|liability|breach of contract|notice to remedy|tribunal)\b/i },
  { label: 'insurance', re: /\b(insurance|insurer|claim number|public liability|policy renewal)\b/i },
  { label: 'workcover', re: /\b(workcover|work cover|workers'? comp(ensation)?|incident report|injury)\b/i },
];

// ── Deadline detection ───────────────────────────────────────────────────────
// Explicit deadline language only. Loose inference is exactly what we're
// trying to remove, so a bare date with no deadline word does NOT count.

const DEADLINE_PATTERNS: RegExp[] = [
  /\b(?:due|by|before|deadline(?:\s+is)?|no later than|expires?(?:\s+on)?|closes?(?:\s+on)?)\s+(?:the\s+)?((?:\d{1,2}(?:st|nd|rd|th)?\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s+\d{1,2}(?:st|nd|rd|th)?)?(?:,?\s+\d{4})?)/i,
  /\b(?:due|by|before|deadline(?:\s+is)?|no later than)\s+(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)/i,
  /\b(?:due|by|before|no later than)\s+(today|tomorrow|tonight|end of (?:day|week|month)|eod|cob|close of business|this (?:morning|afternoon|week)|next (?:week|monday|tuesday|wednesday|thursday|friday))\b/i,
  /\b(asap|as soon as possible|urgent(?:ly)?|immediately)\b/i,
];

function detectDeadline(text: string): string | null {
  for (const re of DEADLINE_PATTERNS) {
    const m = text.match(re);
    if (m) return (m[1] ?? m[0]).trim();
  }
  return null;
}

// A question aimed at Hassan, not a thread he's merely copied on.
function isDirectQuestion(email: FetchedEmail, ownerAddresses: Set<string>): boolean {
  // Strip URLs first — a query string ("...gif?w=200") otherwise reads as a
  // question mark and flags automated mail as if someone had asked something.
  const body = `${email.subject} ${email.snippet}`.replace(/https?:\/\/\S+/gi, ' ');
  const asksSomething =
    /\?/.test(body) ||
    /\b(can you|could you|would you|please (?:confirm|advise|send|review|approve|let me know)|let me know|need(?:ed)? from you|waiting on|awaiting your|your approval|sign off)\b/i.test(
      body,
    );
  if (!asksSomething) return false;

  const to = (email.to ?? []).map(addressOf);
  const cc = (email.cc ?? []).map(addressOf);

  // No recipient data, or we don't know Hassan's own addresses — fall back to
  // the question test rather than guessing wrong in either direction.
  if ((to.length === 0 && cc.length === 0) || ownerAddresses.size === 0) return true;

  const inTo = to.some((a) => ownerAddresses.has(a));
  if (inTo) return true;

  // In CC only, or not addressed to him at all (bulk/automated mail addressed
  // to a member, a BCC blast). Neither is a question aimed at him.
  return false;
}

const AUTOMATED_SENDER =
  /(no[-_.]?reply|do[-_.]?not[-_.]?reply|notifications?@|mailer|postmaster|bounce|newsletter|marketing@|info@mailchimp)/i;

export function scoreEmail(
  email: FetchedEmail,
  vips: VipList,
  ownerAddresses: Set<string>,
  repliedIds: Set<string> = new Set(),
): EmailSignals {
  const haystack = `${email.subject} ${email.snippet}`;
  const fromAddr = addressOf(email.from);

  const vipReason = vips.byEmail.get(fromAddr) ?? null;
  const financialKeywordHit = HARD_FLAGS.filter((f) => f.re.test(haystack)).map((f) => f.label);

  // Automated and bulk senders can still carry a real overdue invoice, but they
  // never count as a "direct question" and never get VIP standing. isBulk comes
  // from the List-Unsubscribe header — the reason a marketing blast with a "?"
  // in the subject no longer reads as someone asking Hassan something.
  const automated = AUTOMATED_SENDER.test(email.from) || email.isBulk === true;
  const alreadyReplied = !!email.messageId && repliedIds.has(email.messageId);

  return {
    isFromVip: vipReason !== null && !automated,
    vipReason: automated ? null : vipReason,
    // An answered question is no longer outstanding. Without this it keeps
    // flagging forever and the signal stops meaning anything.
    isUnansweredDirectQuestion:
      !automated && !alreadyReplied && isDirectQuestion(email, ownerAddresses),
    alreadyReplied,
    detectedDeadline: detectDeadline(haystack),
    financialKeywordHit,
    forcedUrgency: financialKeywordHit.length > 0 ? 'high' : null,
  };
}

/** Emails that look like a direct question — the only ones worth a reply lookup. */
export function replyCheckCandidates(
  emails: FetchedEmail[],
  ownerAddresses: Set<string>,
): FetchedEmail[] {
  return emails.filter(
    (e) =>
      !!e.messageId &&
      e.isBulk !== true &&
      !AUTOMATED_SENDER.test(e.from) &&
      isDirectQuestion(e, ownerAddresses),
  );
}

export function scoreEmails(
  emails: FetchedEmail[],
  vips: VipList,
  ownerAddresses: Set<string>,
  repliedIds: Set<string> = new Set(),
): ScoredEmail[] {
  return emails.map((e) => ({
    ...e,
    signals: scoreEmail(e, vips, ownerAddresses, repliedIds),
  }));
}
