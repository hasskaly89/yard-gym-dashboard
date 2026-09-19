// Trend classification, shared by the board (live) and the nightly snapshot so
// the column a member sits in today and the one recorded for history can never
// be computed two different ways.

export type TrendCategory = 'STABLE' | 'SLOWING' | 'SLIDING' | 'STOPPED';

const SEVERITY: Record<TrendCategory, number> = {
  STABLE: 0,
  SLOWING: 1,
  SLIDING: 2,
  STOPPED: 3,
};

// Classification is a trend ratio over 8 weeks, floored by how long it has
// actually been since the member turned up.
//
// The ratio alone cannot be trusted, because both of its windows lag. A member
// who stopped a fortnight ago still carries a month of earlier visits in his
// "recent" window, so the ratio can read as healthy — or even improving — while
// he is halfway out the door. The recency floor is what stops that: a ratio may
// make the verdict worse, never better than the member's actual absence allows.
export function classify(
  last56: number,
  prior56: number,
  daysSinceLastVisit: number | null,
): TrendCategory {
  if (daysSinceLastVisit === null || daysSinceLastVisit >= 30) return 'STOPPED';

  const byTrend = ((): TrendCategory => {
    if (last56 === 0) return 'STOPPED';
    if (prior56 < 4) {
      if (last56 >= 16) return 'STABLE';
      if (last56 >= 8) return 'SLOWING';
      return 'SLIDING';
    }
    const trend = last56 / prior56;
    if (trend >= 0.85) return 'STABLE';
    if (trend >= 0.55) return 'SLOWING';
    if (trend >= 0.25) return 'SLIDING';
    return 'STOPPED';
  })();

  // ...and the mirror of that floor. A ratio only carries information near the
  // bottom: someone still averaging 2+ sessions a week who trained this week is
  // not "slowing" in any sense a phone call helps, however their last 8 weeks
  // compare to a heavier 8 before it. Without this the board demotes its most
  // committed members for ordinary variation and buries the real leavers.
  if (daysSinceLastVisit <= 7 && last56 >= 16) return 'STABLE';

  // Two weeks absent is already at-risk regardless of what the ratio says.
  const floor: TrendCategory = daysSinceLastVisit >= 14 ? 'SLIDING' : 'STABLE';
  return SEVERITY[byTrend] >= SEVERITY[floor] ? byTrend : floor;
}
