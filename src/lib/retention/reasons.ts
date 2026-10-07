// The one-line reason on a task card, in Recovr's grammar.
//
// Every one of the ~110 lines captured from their queues (13 Sep) pairs ONE
// score-or-attendance fact with the booking state, never names the member,
// and stays under about twelve words. The templates below are theirs, near
// verbatim; the patterns decide which fact matters most. Ordered by what
// their queues put first: an ending package, then a score collapse, then an
// attendance collapse, then plain absence, then missed classes.
//
// Kept as data so a template can be reworded without touching the rules.

export type ReasonMembership = {
  name: string;
  kind: 'paid' | 'intro' | 'class_pack' | 'other';
  daysToExpiry: number | null;
  justExpired: boolean;
};

export type ReasonInput = {
  score: number;
  band: 'healthy' | 'medium' | 'high' | 'lost';
  scoreDelta: { points: number; sinceDate: string } | null;
  perWeekNow: number;
  perWeekPrior: number;
  declinePct: number | null;
  daysSinceLastVisit: number | null;
  nextBookingAt: string | null;
  noShows30: number;
  membership: ReasonMembership | null;
  nowMs: number;
  // What the score engine already says, used when no pattern fits.
  fallback: string;
};

export const REASON_TEMPLATES: Record<string, string> = {
  expired_and_dropoff: 'Expired package and steep drop-off — immediate outreach needed.',
  expired_no_booking: '{package} expired {ago} days ago with no sessions booked.',
  expired_booked: '{package} expired {ago} days ago; next session booked {when}.',
  expires_today_no_booking: 'Membership expires today and no sessions are booked.',
  expires_tomorrow_no_booking: 'Membership expires tomorrow and no sessions are booked.',
  expires_today_booked: 'Membership expires today; next session booked {when}.',
  expiring_soon_no_booking: '{package} ends in {days} days with no sessions booked.',
  expiring_soon_booked: '{package} ends in {days} days; next session booked {when}.',
  intro_expiring: '{package} expires in {days} days.',
  stopped_no_booking: 'No visits in {dslv} days and no sessions booked.',
  stopped_booked: 'No visits in {dslv} days, but a session is booked {when}.',
  score_drop: 'Health score dropped {points} points to {score} since {date}.',
  drop_no_booking: 'Attendance down from {prior}/week to {now}/week; no sessions booked.',
  drop_booked: 'Attendance down from {prior}/week to {now}/week, but {when} is booked.',
  absent_no_booking: 'Last session {dslv} days ago with no sessions booked.',
  absent_but_booked: 'Absent {dslv} days, but next session is booked {when}.',
  no_shows: '{n} no-shows in 30 days with no sessions booked.',
};

type Pattern = { id: keyof typeof REASON_TEMPLATES; when: (i: ReasonInput) => boolean };

const PATTERNS: Pattern[] = [
  { id: 'expired_and_dropoff', when: (i) => !!i.membership?.justExpired && (i.declinePct ?? 0) >= 30 },
  { id: 'expired_no_booking', when: (i) => i.membership?.kind === 'paid' && expiresIn(i) !== null && expiresIn(i)! < 0 && !i.nextBookingAt },
  { id: 'expired_booked', when: (i) => i.membership?.kind === 'paid' && expiresIn(i) !== null && expiresIn(i)! < 0 && !!i.nextBookingAt },
  { id: 'expires_today_no_booking', when: (i) => expiresIn(i) === 0 && !i.nextBookingAt && i.membership?.kind === 'paid' },
  { id: 'expires_tomorrow_no_booking', when: (i) => expiresIn(i) === 1 && !i.nextBookingAt && i.membership?.kind === 'paid' },
  { id: 'expires_today_booked', when: (i) => expiresIn(i) === 0 && !!i.nextBookingAt && i.membership?.kind === 'paid' },
  { id: 'intro_expiring', when: (i) => (i.membership?.kind === 'intro' || i.membership?.kind === 'class_pack') && expiresIn(i) !== null && expiresIn(i)! <= 30 },
  { id: 'expiring_soon_no_booking', when: (i) => i.membership?.kind === 'paid' && expiresIn(i) !== null && expiresIn(i)! <= 14 && !i.nextBookingAt },
  { id: 'expiring_soon_booked', when: (i) => i.membership?.kind === 'paid' && expiresIn(i) !== null && expiresIn(i)! <= 14 && !!i.nextBookingAt },
  { id: 'stopped_no_booking', when: (i) => (i.daysSinceLastVisit ?? 0) >= 30 && !i.nextBookingAt },
  { id: 'stopped_booked', when: (i) => (i.daysSinceLastVisit ?? 0) >= 30 && !!i.nextBookingAt },
  { id: 'score_drop', when: (i) => !!i.scoreDelta && i.scoreDelta.points <= -10 },
  { id: 'drop_no_booking', when: (i) => (i.declinePct ?? 0) >= 45 && !i.nextBookingAt },
  { id: 'drop_booked', when: (i) => (i.declinePct ?? 0) >= 45 && !!i.nextBookingAt },
  { id: 'absent_no_booking', when: (i) => (i.daysSinceLastVisit ?? 0) >= 14 && !i.nextBookingAt },
  { id: 'absent_but_booked', when: (i) => (i.daysSinceLastVisit ?? 0) >= 14 && !!i.nextBookingAt },
  { id: 'no_shows', when: (i) => i.noShows30 >= 2 && !i.nextBookingAt },
];

function expiresIn(i: ReasonInput): number | null {
  return i.membership?.daysToExpiry ?? null;
}

const SYD_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' });
const SYD_TIME = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit' });
const SYD_WEEKDAY = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short' });
const SYD_DATE = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short' });

// "tomorrow at 5:00 am", "Tue at 6:50 am", "12 Oct at 9:30 am" — gym time.
export function bookingWhen(iso: string, nowMs: number): string {
  const d = new Date(iso);
  const days = Math.round(
    (Date.parse(`${SYD_DAY.format(d)}T00:00:00Z`) - Date.parse(`${SYD_DAY.format(new Date(nowMs))}T00:00:00Z`)) / 86400000,
  );
  const t = SYD_TIME.format(d).toLowerCase();
  if (days <= 0) return `today at ${t}`;
  if (days === 1) return `tomorrow at ${t}`;
  if (days < 7) return `${SYD_WEEKDAY.format(d)} at ${t}`;
  return `${SYD_DATE.format(d)} at ${t}`;
}

function fill(template: string, i: ReasonInput): string {
  const vars: Record<string, string> = {
    when: i.nextBookingAt ? bookingWhen(i.nextBookingAt, i.nowMs) : '',
    package: i.membership?.name ?? 'Membership',
    days: String(i.membership?.daysToExpiry ?? ''),
    ago: String(Math.abs(i.membership?.daysToExpiry ?? 0)),
    dslv: String(i.daysSinceLastVisit ?? ''),
    points: String(Math.abs(i.scoreDelta?.points ?? 0)),
    score: String(i.score),
    date: i.scoreDelta ? SYD_DATE.format(new Date(`${i.scoreDelta.sinceDate}T12:00:00Z`)) : '',
    prior: i.perWeekPrior.toFixed(1),
    now: i.perWeekNow.toFixed(1),
    n: String(i.noShows30),
  };
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

export function reasonFor(i: ReasonInput): string {
  for (const p of PATTERNS) if (p.when(i)) return fill(REASON_TEMPLATES[p.id], i);
  return i.fallback;
}
