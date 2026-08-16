// Business reporting periods, all anchored to Australia/Sydney.
//
// Every number on the dashboard answers "for which period?" — and until now
// different parts of the app answered it differently (a rolling 7 days here, a
// calendar month there), which is why the dashboard and MindBody disagreed even
// when the data was fine. This is the single definition. Weeks start MONDAY,
// matching the MindBody Classes report.

export type PeriodKey =
  | 'this-week'
  | 'last-week'
  | 'next-week'
  | 'this-month'
  | 'last-month';

export const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: 'this-week', label: 'This week' },
  { key: 'last-week', label: 'Last week' },
  { key: 'next-week', label: 'Next week' },
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
];

export type Period = {
  key: PeriodKey;
  label: string;
  /** Inclusive start, UTC ISO. */
  start: string;
  /** Exclusive end, UTC ISO — capped at "now" for in-progress periods. */
  end: string;
  /** Uncapped end, so a part-week can be compared like-for-like. */
  fullEnd: string;
  /** True when the period hasn't finished yet. */
  inProgress: boolean;
  /** Matching slice of the preceding period, for honest comparison. */
  compare: { start: string; end: string; label: string };
};

const SYD = 'Australia/Sydney';
const DAY = 86400000;

/** Sydney's UTC offset (ms) at a given instant — +10 AEST or +11 AEDT. */
function sydneyOffset(at: Date): number {
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: SYD,
    timeZoneName: 'longOffset',
  })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+10';
  const m = s.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
  if (!m) return 10 * 3600000;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 3600000 + Number(m[3] ?? 0) * 60000);
}

/** UTC instant for a Sydney wall-clock date at 00:00. */
function sydneyMidnightUtc(y: number, mo: number, d: number): Date {
  const guess = new Date(Date.UTC(y, mo, d, 0, 0, 0));
  return new Date(guess.getTime() - sydneyOffset(guess));
}

/** Sydney calendar parts for an instant. */
function sydneyParts(at: Date): { y: number; mo: number; d: number; dow: number } {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: SYD,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(at);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? '';
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return {
    y: Number(get('year')),
    mo: Number(get('month')) - 1,
    d: Number(get('day')),
    dow: Math.max(0, days.indexOf(get('weekday'))),
  };
}

export function resolvePeriod(key: PeriodKey, now: Date = new Date()): Period {
  const p = sydneyParts(now);
  const label = PERIODS.find((x) => x.key === key)?.label ?? key;
  const thisWeekStart = sydneyMidnightUtc(p.y, p.mo, p.d - p.dow);

  const build = (start: Date, fullEnd: Date, cmpStart: Date, cmpLabel: string): Period => {
    const inProgress = now < fullEnd && now > start;
    const end = inProgress ? now : fullEnd;
    // A part-period compares against the SAME elapsed slice of the previous one
    // — comparing a Tuesday against a finished week is what makes normal
    // trading look like a crash. A finished period compares against the whole
    // previous period, so month-on-month isn't skewed by differing month
    // lengths (31 days measured from June 1 would run into July).
    const compareEnd = inProgress
      ? new Date(cmpStart.getTime() + (end.getTime() - start.getTime()))
      : start;
    return {
      key,
      label,
      start: start.toISOString(),
      end: end.toISOString(),
      fullEnd: fullEnd.toISOString(),
      inProgress,
      compare: {
        start: cmpStart.toISOString(),
        end: compareEnd.toISOString(),
        label: cmpLabel,
      },
    };
  };

  switch (key) {
    case 'this-week':
      return build(
        thisWeekStart,
        new Date(thisWeekStart.getTime() + 7 * DAY),
        new Date(thisWeekStart.getTime() - 7 * DAY),
        'same point last week',
      );
    case 'last-week': {
      const s = new Date(thisWeekStart.getTime() - 7 * DAY);
      return build(s, thisWeekStart, new Date(s.getTime() - 7 * DAY), 'week before');
    }
    case 'next-week': {
      const s = new Date(thisWeekStart.getTime() + 7 * DAY);
      return build(s, new Date(s.getTime() + 7 * DAY), thisWeekStart, 'this week');
    }
    case 'this-month': {
      const s = sydneyMidnightUtc(p.y, p.mo, 1);
      return build(
        s,
        sydneyMidnightUtc(p.y, p.mo + 1, 1),
        sydneyMidnightUtc(p.y, p.mo - 1, 1),
        'same point last month',
      );
    }
    case 'last-month': {
      const s = sydneyMidnightUtc(p.y, p.mo - 1, 1);
      return build(s, sydneyMidnightUtc(p.y, p.mo, 1), sydneyMidnightUtc(p.y, p.mo - 2, 1), 'month before');
    }
  }
}

export function isPeriodKey(v: string): v is PeriodKey {
  return PERIODS.some((p) => p.key === v);
}

/** "Mon 10 Aug – Sat 15 Aug" for display. */
export function formatRange(period: Period): string {
  const f = (iso: string) =>
    new Date(iso).toLocaleDateString('en-AU', {
      timeZone: SYD,
      day: 'numeric',
      month: 'short',
    });
  const endShown = new Date(new Date(period.end).getTime() - 1).toISOString();
  return `${f(period.start)} – ${f(endShown)}`;
}
