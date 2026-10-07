// "Dropped 17 points to 30 since 31 August" — the phrase every Recovr card
// leans on, made possible by member_score_snapshots.
//
// The reference point is the most recent day the member was in a different
// band (the moment the story changed), or, failing that, their best score in
// the last four weeks if today is meaningfully below it.

export type Snapshot = { snapshot_date: string; score: number; band: string };
export type ScoreDelta = { points: number; fromScore: number; sinceDate: string };

export function scoreDeltaSince(
  history: Snapshot[], // ascending by date, excluding today
  score: number,
  band: string,
): ScoreDelta | null {
  if (history.length === 0) return null;
  for (let k = history.length - 1; k >= 0; k--) {
    const s = history[k];
    if (s.band !== band) {
      // The day AFTER the last different-band day is when the current band began.
      const from = history[k + 1] ?? s;
      return { points: score - s.score, fromScore: s.score, sinceDate: from.snapshot_date };
    }
  }
  const best = history.reduce((a, b) => (b.score > a.score ? b : a));
  if (score <= best.score - 5) {
    return { points: score - best.score, fromScore: best.score, sinceDate: best.snapshot_date };
  }
  return null;
}
