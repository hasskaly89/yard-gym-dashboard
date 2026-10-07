// Pill styling by risk band and trend column. One copy, shared by the board,
// the task queue and the drawer. Status colours are data encoding only — the
// gym accent is reserved for urgency controls (DESIGN.md).

export type RiskBand = 'healthy' | 'medium' | 'high' | 'lost';
export type Band = 'STABLE' | 'SLOWING' | 'SLIDING' | 'STOPPED';

export const HEALTH_STYLE: Record<RiskBand, string> = {
  healthy: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high: 'bg-rose-50 text-rose-700 border-rose-200',
  lost: 'bg-gray-100 text-gray-600 border-gray-200',
};

export const BAND_PILL: Record<Band, string> = {
  STABLE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  SLOWING: 'bg-amber-50 text-amber-700 border-amber-200',
  SLIDING: 'bg-rose-50 text-rose-700 border-rose-200',
  STOPPED: 'bg-gray-100 text-gray-700 border-gray-200',
};
