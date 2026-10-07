import { getAnthropic, RETENTION_AI_MODEL } from './client';
import { redactForModel } from './retention-summary';

// Drafts the SMS a staff member would send, in the gym's own voice. Recovr's
// five categories, their default examples as the tone reference, and the one
// closing line every one of their suggestions used: "Want me to lock you in
// for {day} {time}?" Nothing here sends — the draft comes back to the drawer
// for a human to edit and decide.

export type DraftCategory =
  | 'high_risk'
  | 'new_member_activation'
  | 'existing_bookings'
  | 'lapsed'
  | 'engaged';

export const DRAFT_CATEGORY_LABEL: Record<DraftCategory, string> = {
  high_risk: 'High risk',
  new_member_activation: 'New member activation',
  existing_bookings: 'Reduced bookings',
  lapsed: 'Lapsed',
  engaged: 'Engaged',
};

// Recovr's defaults (captured 13 Sep), used as examples of register, never
// copied out.
const EXAMPLES: Record<DraftCategory, string> = {
  high_risk: "Hey Sarah, I noticed that you haven't been into the gym in a few days. Wanted to check in and see how everything is on your end?",
  new_member_activation: "Hey Tom, I saw that you purchased our intro but you haven't come in yet. Do you want me to book you in for tomorrow morning to get you started?",
  existing_bookings: 'Hey Lisa, how is your training going at the moment?',
  lapsed: "Hey Mike, I noticed you missed your usual Tuesday and Thursday sessions. Want me to book you back in for this Thursday at 6pm like usual?",
  engaged: "Hey Rachel, you attended 25 sessions this month. That's your most ever. Well done!",
};

// The Yard's own staff, from real threads: short, warm, first-name, often a
// sign-off. "where you been? its hass" / "Hey Alyce! See you tomorrow? let's
// get a session in :) -Jas, The Yard"
const SYSTEM = `You draft ONE SMS from a coach at The Yard Gym (Edensor Park, Sydney) to a member.
Voice: warm, casual, direct — like a text from someone who knows them, not a marketing message. First name only. Australian English. No emoji unless the examples use one. One or two sentences, 160 characters or under — this is a single SMS segment.
If a usual class time or a booked session is given, close with the house line: "Want me to lock you in for {day} {time}?" (adapt the day/time; if they already have a booking, confirm it instead).
Never mention health scores, risk, data or that this was generated. Never invent facts. Never ask for payment.
Sign off with " – {signOff}" only if a signOff is given.
Reply with the message text only.`;

export type DraftInput = {
  firstName: string;
  category: DraftCategory;
  daysSinceLastVisit: number | null;
  usualSlot: string | null; // "Monday 6:30 pm"
  nextBooking: string | null; // "tomorrow at 5:55 am"
  packageName: string | null;
  packageEndsInDays: number | null;
  totalSessions: number;
  recentNote: string | null;
  signOff: string | null;
};

export function categoryFor(m: {
  band: string;
  daysSinceLastVisit: number | null;
  totalVisitCount: number;
  last56: number;
  prior56: number;
  isIntro: boolean;
}): DraftCategory {
  if (m.isIntro && m.totalVisitCount === 0) return 'new_member_activation';
  if (m.daysSinceLastVisit === null || m.daysSinceLastVisit >= 21) return 'lapsed';
  if (m.band === 'high' || m.band === 'medium') return 'high_risk';
  if (m.prior56 >= 4 && m.last56 < m.prior56 * 0.7) return 'existing_bookings';
  return 'engaged';
}

export async function draftMessage(i: DraftInput): Promise<string | null> {
  const client = getAnthropic();
  if (!client) return null;
  const context = {
    firstName: i.firstName,
    category: DRAFT_CATEGORY_LABEL[i.category],
    exampleOfRegister: EXAMPLES[i.category],
    daysSinceLastVisit: i.daysSinceLastVisit,
    usualSlot: i.usualSlot,
    nextBooking: i.nextBooking,
    package: i.packageName,
    packageEndsInDays: i.packageEndsInDays,
    totalSessions: i.totalSessions,
    recentStaffNote: i.recentNote ? redactForModel(i.recentNote) : null,
    signOff: i.signOff,
  };
  const msg = await client.messages.create({
    model: RETENTION_AI_MODEL,
    max_tokens: 120,
    system: SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify(context) }],
  });
  const block = msg.content.find((b) => b.type === 'text');
  const text = block && block.type === 'text' ? block.text.trim().replace(/^["']|["']$/g, '') : null;
  return text && text.length <= 320 ? text : text?.slice(0, 320) ?? null;
}
