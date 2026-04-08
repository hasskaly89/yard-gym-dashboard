export const WEEK_CONFIG = [
  { week: 1, reps: 10, pct: 0.70,  label: 'Week 1 · 10 Reps' },
  { week: 2, reps: 8,  pct: 0.75,  label: 'Week 2 · 8 Reps'  },
  { week: 3, reps: 6,  pct: 0.80,  label: 'Week 3 · 6 Reps'  },
  { week: 4, reps: 5,  pct: 0.85,  label: 'Week 4 · 5 Reps'  },
  { week: 5, reps: 4,  pct: 0.875, label: 'Week 5 · 4 Reps'  },
  { week: 6, reps: 3,  pct: 0.90,  label: 'Week 6 · 3 Reps'  },
]

export const roundToPlate = (kg: number) => Math.round(kg * 2) / 2

export const calcTarget = (rm3: number, weekNum: number): number => {
  const cfg = WEEK_CONFIG.find(w => w.week === weekNum)
  if (!cfg || !rm3) return 0
  return roundToPlate(rm3 * cfg.pct)
}

export const isPR = (actual: number, current3RM: number) => actual > current3RM

export const pctOf3RM = (actual: number, rm3: number) =>
  rm3 ? Math.round((actual / rm3) * 100) : 0
