// Member health-score engine — the deterministic core of the retention system,
// mirroring what Recovr charges for. Produces a 0-100 score where LOW = high
// risk (like Recovr's "5% — high risk"), a risk band, and transparent reason
// codes. The reasons feed both the UI and the AI summary layer, so the model
// explains a score it did not invent.
//
// All inputs come from data we already sync cheaply into Supabase
// (member_visits windows + members.last_visit_date), so scoring costs ZERO
// MindBody API calls.

export type RiskBand = 'healthy' | 'medium' | 'high';

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

function bandFor(score: number): RiskBand {
  if (score >= 60) return 'healthy';
  if (score >= 35) return 'medium';
  return 'high';
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function computeHealthScore(s: HealthSignals): HealthResult {
  const recency = RECENCY_PENALTY(s.daysSinceLastVisit);
  const trend = TREND_PENALTY(s.last56, s.prior56);
  const frequency = FREQUENCY_PENALTY(s.last30);

  const score = clamp(Math.round(100 - (recency + trend + frequency)), 0, 100);
  const band = bandFor(score);

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
