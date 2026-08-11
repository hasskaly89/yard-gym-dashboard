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
  daysSinceLastVisit: number | null; // null = no visit on record
  totalVisitCount: number;
};

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

const TREND_PENALTY = (last30: number, prior30: number): number => {
  if (prior30 < 2) {
    // Not enough prior history for a ratio — judge on recent volume alone.
    if (last30 >= 8) return 0;
    if (last30 >= 4) return 8;
    if (last30 >= 1) return 18;
    return 40;
  }
  if (last30 === 0) return 42;
  const ratio = last30 / prior30;
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
  const trend = TREND_PENALTY(s.last30, s.prior30);
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

  if (s.last30 === 0 && s.prior30 > 0) {
    drivers.push({ weight: trend, text: `Stopped attending — 0 sessions in the last 30 days (was ${s.prior30})` });
  } else if (s.prior30 >= 2 && s.last30 < s.prior30) {
    drivers.push({
      weight: trend,
      text: `Attendance down: ${s.last30} sessions in last 30d vs ${s.prior30} the month before`,
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
