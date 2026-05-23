export type Band = 'STABLE' | 'SLOWING' | 'SLIDING' | 'STOPPED';

const BAND_WEIGHT: Record<Band, number> = {
  STOPPED: 40,
  SLIDING: 100,
  SLOWING: 60,
  STABLE: 0,
};

export function priorityScore(opts: {
  band: Band;
  visitsCurrent: number;
  visitsPrior: number;
  daysSinceLastContact: number | null;
}): number {
  if (opts.band === 'STABLE') return 0;
  const bandScore = BAND_WEIGHT[opts.band];
  const declinePct =
    opts.visitsPrior > 0
      ? Math.max(0, (opts.visitsPrior - opts.visitsCurrent) / opts.visitsPrior)
      : opts.band === 'STOPPED'
        ? 1
        : 0;
  // Never-contacted members get a 1.5x boost so they surface above stale follow-ups.
  // Contacted within 14d are de-prioritised proportionally to recency.
  const recencyMultiplier =
    opts.daysSinceLastContact === null
      ? 1.5
      : Math.min(1.5, opts.daysSinceLastContact / 14);
  return Math.round((bandScore + declinePct * 50) * recencyMultiplier);
}
