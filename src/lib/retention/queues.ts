import type { ContactInfo, SnoozeInfo, AssignmentInfo } from '@/app/api/retention/contact-state/route';

// The five queues, as one pure function, so the badge counts and the lists can
// never disagree. Mirrors Recovr's My Tasks: High Risk, Medium Risk,
// Conversions, Renewals, Assigned — each sorted worst first.

export type QueueKey = 'high' | 'medium' | 'conversions' | 'renewals' | 'assigned';

export const QUEUE_LABELS: Record<QueueKey, string> = {
  high: 'High Risk',
  medium: 'Medium Risk',
  conversions: 'Conversions',
  renewals: 'Renewals',
  assigned: 'Assigned',
};

export type QueueMembership = {
  name: string;
  kind: 'paid' | 'intro' | 'class_pack' | 'other';
  activeDate: string | null;
  expirationDate: string | null;
  daysToExpiry: number | null;
  remainingSessions: number | null; // null = unlimited
  totalSessions: number | null;
  justExpired: boolean;
};

// The fields a queue needs. RetentionMember (the board's row) satisfies it.
export type QueueMember = {
  id: string;
  firstName: string;
  lastName: string;
  mobilePhone: string;
  ghlContactId: string | null;
  trendCategory: 'STABLE' | 'SLOWING' | 'SLIDING' | 'STOPPED';
  riskBand: 'healthy' | 'medium' | 'high' | 'lost';
  healthScore: number;
  daysSinceLastVisit: number | null;
  last56d: number;
  prior56d: number;
  nextBookingAt: string | null;
  membership: QueueMembership | null;
  reason: string;
  hasPaidMembership: boolean;
};

export type Queues = Record<QueueKey, QueueMember[]>;

export function buildQueues(input: {
  members: QueueMember[];
  contacts: Record<string, ContactInfo>;
  snoozes: Record<string, SnoozeInfo>;
  assignments: Record<string, AssignmentInfo>;
  currentUserId: string | null;
  nowMs: number;
}): Queues {
  const { members, contacts, snoozes, assignments, currentUserId, nowMs } = input;
  const sevenDays = 7 * 86400000;

  // Snoozed, or contacted this week: out of the four work queues (not Assigned —
  // an assignment is a commitment, and it stays visible until it is released).
  const workable = (m: QueueMember) => {
    const s = snoozes[m.id];
    if (s && new Date(s.snoozedUntil).getTime() > nowMs) return false;
    const c = contacts[m.id];
    if (c && nowMs - new Date(c.contactedAt).getTime() < sevenDays) return false;
    return true;
  };

  // Score ascending, worst first — but a member gone 60+ days sorts after
  // everyone still winnable, the STOPPED de-weighting from priority.ts on
  // the health scale.
  const byUrgency = (a: QueueMember, b: QueueMember) => {
    const ua = a.healthScore + ((a.daysSinceLastVisit ?? 0) >= 60 ? 100 : 0);
    const ub = b.healthScore + ((b.daysSinceLastVisit ?? 0) >= 60 ? 100 : 0);
    return ua - ub || (b.daysSinceLastVisit ?? 0) - (a.daysSinceLastVisit ?? 0);
  };
  const byExpiry = (a: QueueMember, b: QueueMember) =>
    (a.membership?.daysToExpiry ?? 9999) - (b.membership?.daysToExpiry ?? 9999) ||
    (a.membership?.remainingSessions ?? 9999) - (b.membership?.remainingSessions ?? 9999);

  const high = members.filter((m) => m.hasPaidMembership && m.riskBand === 'high' && workable(m)).sort(byUrgency);
  const medium = members.filter((m) => m.hasPaidMembership && m.riskBand === 'medium' && workable(m)).sort(byUrgency);

  const conversions = members
    .filter((m) => !m.hasPaidMembership && (m.membership?.kind === 'intro' || m.membership?.kind === 'class_pack') && workable(m))
    .sort(byExpiry);

  const renewals = members
    .filter((m) => {
      if (!m.hasPaidMembership || m.membership?.kind !== 'paid' || !workable(m)) return false;
      const ms = m.membership;
      if (ms.justExpired) return true;
      // Up to a fortnight either side of the end date. MindBody keeps returning
      // a membership for a few days after it ends; past two weeks the member is
      // a lapse, not a renewal, and the risk queues have them.
      if (ms.daysToExpiry !== null && ms.daysToExpiry <= 14 && ms.daysToExpiry >= -14) return true;
      if (ms.remainingSessions !== null && ms.remainingSessions <= 2) return true;
      return false;
    })
    .sort((a, b) => Number(b.membership?.justExpired) - Number(a.membership?.justExpired) || byExpiry(a, b));

  const assigned = members
    .filter((m) => assignments[m.id])
    .sort((a, b) => {
      const mine = (m: QueueMember) => (assignments[m.id]?.assignedTo === currentUserId ? 0 : 1);
      return mine(a) - mine(b) || assignments[b.id].assignedAt.localeCompare(assignments[a.id].assignedAt);
    });

  return { high, medium, conversions, renewals, assigned };
}
