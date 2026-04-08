export type BlockType = 'signature' | 'doublegain' | 'sprint'
export type TestRM = '1RM' | '3RM'
export type PhaseName = 'Base' | 'Gain' | 'Perform' | 'Align' | 'Test'

export interface WeekConfig {
  week: number
  reps: number
  pct: number
  label: string
  phase: PhaseName
  isTestDay?: boolean
}

export interface BlockConfig {
  type: BlockType
  name: string
  description: string
  durationWeeks: number
  testRM: TestRM
  maxLifts: number // 1, 2, or 3
  weeks: WeekConfig[]
}

export const BLOCK_CONFIGS: Record<BlockType, BlockConfig> = {
  signature: {
    type: 'signature',
    name: 'Signature',
    description: '6-week progressive overload — 3 lifts, 3RM base',
    durationWeeks: 6,
    testRM: '3RM',
    maxLifts: 3,
    weeks: [
      { week: 1, reps: 10, pct: 0.70,  label: 'Week 1 · 10 Reps', phase: 'Base' },
      { week: 2, reps: 8,  pct: 0.75,  label: 'Week 2 · 8 Reps',  phase: 'Base' },
      { week: 3, reps: 6,  pct: 0.80,  label: 'Week 3 · 6 Reps',  phase: 'Gain' },
      { week: 4, reps: 5,  pct: 0.85,  label: 'Week 4 · 5 Reps',  phase: 'Gain' },
      { week: 5, reps: 4,  pct: 0.875, label: 'Week 5 · 4 Reps',  phase: 'Perform' },
      { week: 6, reps: 3,  pct: 0.90,  label: 'Week 6 · TEST DAY', phase: 'Test', isTestDay: true },
    ],
  },
  doublegain: {
    type: 'doublegain',
    name: 'Double Gain',
    description: '8-week strength cycle — 2 opposing lifts, 3RM base',
    durationWeeks: 8,
    testRM: '3RM',
    maxLifts: 2,
    weeks: [
      { week: 1, reps: 10, pct: 0.65,  label: 'Week 1 · 10 Reps', phase: 'Base' },
      { week: 2, reps: 10, pct: 0.70,  label: 'Week 2 · 10 Reps', phase: 'Base' },
      { week: 3, reps: 8,  pct: 0.75,  label: 'Week 3 · 8 Reps',  phase: 'Gain' },
      { week: 4, reps: 8,  pct: 0.80,  label: 'Week 4 · 8 Reps',  phase: 'Gain' },
      { week: 5, reps: 6,  pct: 0.82,  label: 'Week 5 · 6 Reps',  phase: 'Perform' },
      { week: 6, reps: 5,  pct: 0.85,  label: 'Week 6 · 5 Reps',  phase: 'Perform' },
      { week: 7, reps: 3,  pct: 0.875, label: 'Week 7 · 3 Reps',  phase: 'Align' },
      { week: 8, reps: 1,  pct: 0.95,  label: 'Week 8 · TEST DAY', phase: 'Test', isTestDay: true },
    ],
  },
  sprint: {
    type: 'sprint',
    name: 'Sprint',
    description: '4-week peak program — 1 lift, 1RM target',
    durationWeeks: 4,
    testRM: '1RM',
    maxLifts: 1,
    weeks: [
      { week: 1, reps: 5,  pct: 0.75,  label: 'Week 1 · 5 Reps',  phase: 'Base' },
      { week: 2, reps: 3,  pct: 0.85,  label: 'Week 2 · 3 Reps',  phase: 'Gain' },
      { week: 3, reps: 2,  pct: 0.90,  label: 'Week 3 · 2 Reps',  phase: 'Perform' },
      { week: 4, reps: 1,  pct: 1.00,  label: 'Week 4 · TEST DAY', phase: 'Test', isTestDay: true },
    ],
  },
}

// Legacy export for backwards compatibility
export const WEEK_CONFIG = BLOCK_CONFIGS.signature.weeks

export const roundToPlate = (kg: number) => Math.round(kg * 2) / 2

export const calcTarget = (rm: number, weekNum: number, blockType: BlockType = 'signature'): number => {
  const cfg = BLOCK_CONFIGS[blockType].weeks.find(w => w.week === weekNum)
  if (!cfg || !rm) return 0
  return roundToPlate(rm * cfg.pct)
}

export const isPR = (actual: number, currentRM: number) => actual > currentRM

export const pctOfRM = (actual: number, rm: number) =>
  rm ? Math.round((actual / rm) * 100) : 0

// Legacy alias
export const pctOf3RM = pctOfRM

export const getBlockConfig = (type: BlockType): BlockConfig => BLOCK_CONFIGS[type]

export const PHASE_COLORS: Record<PhaseName, string> = {
  Base:    '#3B82F6',
  Gain:    '#8B5CF6',
  Perform: '#FF5722',
  Align:   '#F59E0B',
  Test:    '#22C55E',
}
