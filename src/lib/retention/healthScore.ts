// Member health-score engine — the deterministic core of the retention system,
// mirroring what Recovr charges for. Produces a 0-100 score where LOW = high
// risk (like Recovr's "5% — high risk"), a risk band, and transparent reason
// codes. The reasons feed both the UI and the AI summary layer, so the model
// explains a score it did not invent.
//
// All inputs come from data we already sync cheaply into Supabase
// (member_visits windows + members.last_visit_date), so scoring costs ZERO
// MindBody API calls.

// 'lost' is not a score band — it is an absence state. A member who has not
// been in for 30 days is not "at high risk of leaving"; they have left, for
// now, and belong on a win-back list rather than a call queue. Before this
// existed the high band was 24 people of whom 14 had been gone 50–440 days,
// while the members Recovr had at the top — away 12–20 days, still winnable —
// sat in medium or even healthy.
export type RiskBand = 'healthy' | 'medium' | 'high' | 'lost';

export type HealthSignals = {
  last7: number;
  prior7: number;
  last30: number;
  prior30: number;
  last56: number;
  prior56: number;
  daysSinceLastVisit: number | null; // null = no visit on record
  totalVisitCount: number;
};

// Visits per week, to one decimal — the unit the reasons and the AI narrative
// speak in ("0.6/week, down from 1.5"), because a raw 8-week count means
// nothing to whoever is about to make the call.
export const perWeek = (visits: number, days: number): number =>
  Math.round((visits / (days / 7)) * 10) / 10;

export type HealthResult = {
  score: number; // 0-100, higher = healthier
  band: RiskBand;
  reasons: string[]; // human-readable drivers, worst first
};

// --- Tunable weights (kept explicit so the model is auditable) -------------
const RECENCY_PENALTY = (days: number | null): number => {
  if (days === null) return 60;
  if (days <= 7) return 0;
  if (days <= 13) return 12;
  if (days <= 20) return 28;
  if (days <= 29) return 45;
  return 65;
};

// Measured over 8 weeks vs the 8 before it — see the note on VisitWindows for
// why 30-vs-30 was the wrong window. Ratio thresholds are unchanged; only the
// span they are measured over is longer.
const TREND_PENALTY = (last56: number, prior56: number): number => {
  if (prior56 < 4) {
    // Below ~0.5 visits/week there is no baseline worth taking a ratio
    // against — judge on recent volume alone.
    if (last56 >= 16) return 0;
    if (last56 >= 8) return 8;
    if (last56 >= 1) return 18;
    return 40;
  }
  if (last56 === 0) return 42;
  const ratio = last56 / prior56;
  if (ratio >= 0.85) return 0;
  if (ratio >= 0.55) return 8;
  if (ratio >= 0.25) return 20;
  return 32;
};

const FREQUENCY_PENALTY = (last30: number): number => {
  if (last30 >= 12) return 0;
  if (last30 >= 8) return 3;
  if (last30 >= 4) return 8;
  if (last30 >= 1) return 15;
  return 20;
};

const BAND_ORDER: Record<RiskBand, number> = { healthy: 0, medium: 1, high: 2, lost: 3 };

// Score decides the band, and absence floors it — the same rule the trend
// columns already use (14 days ⇒ at least SLIDING, 30 ⇒ STOPPED). Without the
// floor a member 17 days absent could still read "healthy 64" while every
// column, and Recovr, had them flagged. The score itself is unchanged; only
// the label on it is.
function bandFor(score: number, daysSinceLastVisit: number | null): RiskBand {
  // No visit on record is a member who never started, not one who left — they
  // belong to activation, not win-back. The 60-point recency penalty already
  // puts them in 'high'; leave them there rather than filing them as lost.
  if (daysSinceLastVisit === null) return score >= 60 ? 'healthy' : score >= 35 ? 'medium' : 'high';
  if (daysSinceLastVisit >= 30) return 'lost';
  const byScore: RiskBand = score >= 60 ? 'healthy' : score >= 35 ? 'medium' : 'high';
  const floor: RiskBand =
    daysSinceLastVisit >= 21 ? 'high' : daysSinceLastVisit >= 14 ? 'medium' : 'healthy';
  return BAND_ORDER[byScore] >= BAND_ORDER[floor] ? byScore : floor;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function computeHealthScore(s: HealthSignals): HealthResult {
  const recency = RECENCY_PENALTY(s.daysSinceLastVisit);
  const trend = TREND_PENALTY(s.last56, s.prior56);
  const frequency = FREQUENCY_PENALTY(s.last30);

  const score = clamp(Math.round(100 - (recency + trend + frequency)), 0, 100);
  const band = bandFor(score, s.daysSinceLastVisit);

  // Reasons, ordered by the penalty each carried (biggest driver first).
  const drivers: { weight: number; text: string }[] = [];

  if (s.daysSinceLastVisit === null) {
    drivers.push({ weight: recency, text: 'No visits on record' });
  } else if (s.daysSinceLastVisit > 7) {
    drivers.push({
      weight: recency,
      text: `Last visited ${s.daysSinceLastVisit} days ago`,
    });
  }

  if (s.last56 === 0 && s.prior56 > 0) {
    drivers.push({
      weight: trend,
      text: `Stopped attending — 0 sessions in the last 8 weeks (was ${perWeek(s.prior56, 56)}/week)`,
    });
  } else if (s.prior56 >= 4 && s.last56 < s.prior56) {
    drivers.push({
      weight: trend,
      text: `Attendance down to ${perWeek(s.last56, 56)}/week from ${perWeek(s.prior56, 56)}/week over the 8 weeks before`,
    });
  }

  if (s.last30 > 0 && s.last30 < 4) {
    drivers.push({ weight: frequency, text: `Low frequency — only ${s.last30} session(s) in the last 30 days` });
  }

  drivers.sort((a, b) => b.weight - a.weight);
  let reasons = drivers.filter((d) => d.weight > 0).map((d) => d.text);

  if (reasons.length === 0) {
    reasons = [
      band === 'healthy'
        ? `Consistent attendance — ${s.last30} sessions in the last 30 days`
        : 'No strong risk signals',
    ];
  }

  return { score, band, reasons };
}
