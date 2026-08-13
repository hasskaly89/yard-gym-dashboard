'use client';

import { useEffect, useMemo, useState } from 'react';

type TrendCategory = 'STABLE' | 'SLOWING' | 'SLIDING' | 'STOPPED';
type RiskBand = 'healthy' | 'medium' | 'high';
type SortKey = 'risk' | 'name' | 'lastVisit' | 'totalVisits';
type RecencyKey = 'all' | '7' | '30' | '30+' | 'never';

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  trendCategory: TrendCategory;
  healthScore: number;
  riskBand: RiskBand;
  daysSinceLastVisit: number | null;
  last30d: number;
  totalVisitCount: number;
  membershipStartDate: string | null;
}

const RISK_STYLE: Record<RiskBand, string> = {
  healthy: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  high: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

const TREND_STYLE: Record<TrendCategory, string> = {
  STABLE: 'text-emerald-400',
  SLOWING: 'text-amber-400',
  SLIDING: 'text-orange-400',
  STOPPED: 'text-rose-400',
};

const RISK_OPTIONS: RiskBand[] = ['high', 'medium', 'healthy'];
const TREND_OPTIONS: TrendCategory[] = ['STABLE', 'SLOWING', 'SLIDING', 'STOPPED'];
const RECENCY_OPTIONS: { key: RecencyKey; label: string }[] = [
  { key: 'all', label: 'Any time' },
  { key: '7', label: 'Last 7 days' },
  { key: '30', label: 'Last 30 days' },
  { key: '30+', label: '30+ days ago' },
  { key: 'never', label: 'Never visited' },
];
const RISK_ORDER: Record<RiskBand, number> = { high: 0, medium: 1, healthy: 2 };

function matchesRecency(days: number | null, bucket: RecencyKey): boolean {
  if (bucket === 'all') return true;
  if (bucket === 'never') return days === null;
  if (days === null) return false;
  if (bucket === '7') return days <= 7;
  if (bucket === '30') return days <= 30;
  return days > 30;
}

function lastVisitLabel(days: number | null): string {
  if (days === null) return 'Never';
  if (days === 0) return 'Today';
  return `${days}d ago`;
}

function dateLabel(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export default function MemberTable() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<Set<RiskBand>>(new Set());
  const [trendFilter, setTrendFilter] = useState<Set<TrendCategory>>(new Set());
  const [recency, setRecency] = useState<RecencyKey>('all');
  const [sortBy, setSortBy] = useState<SortKey>('risk');

  useEffect(() => {
    fetch('/api/mindbody/retention')
      .then((r) => r.json())
      .then((d) => setMembers(Array.isArray(d.members) ? d.members : []))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const list = members ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((m) => {
      if (q && !`${m.firstName} ${m.lastName}`.toLowerCase().includes(q)) return false;
      if (riskFilter.size > 0 && !riskFilter.has(m.riskBand)) return false;
      if (trendFilter.size > 0 && !trendFilter.has(m.trendCategory)) return false;
      if (!matchesRecency(m.daysSinceLastVisit, recency)) return false;
      return true;
    });
  }, [members, search, riskFilter, trendFilter, recency]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      if (sortBy === 'name') {
        return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
      }
      if (sortBy === 'lastVisit') {
        return (b.daysSinceLastVisit ?? 99999) - (a.daysSinceLastVisit ?? 99999);
      }
      if (sortBy === 'totalVisits') {
        return b.totalVisitCount - a.totalVisitCount;
      }
      const riskDiff = RISK_ORDER[a.riskBand] - RISK_ORDER[b.riskBand];
      if (riskDiff !== 0) return riskDiff;
      return (b.daysSinceLastVisit ?? 99999) - (a.daysSinceLastVisit ?? 99999);
    });
    return copy;
  }, [filtered, sortBy]);

  const activeFilterCount = riskFilter.size + trendFilter.size + (recency !== 'all' ? 1 : 0);

  return (
    <div className="bg-gym-surface border border-gym-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gym-border flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-gym-text text-lg font-semibold">Members</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="bg-gym-bg border border-gym-border rounded-lg px-3 py-1.5 text-sm text-gym-text placeholder:text-gym-muted focus:border-gym-text/30 focus:outline-none w-48"
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="bg-gym-bg border border-gym-border rounded-lg px-3 py-1.5 text-sm text-gym-text focus:border-gym-text/30 focus:outline-none"
            >
              <option value="risk">Sort: Risk</option>
              <option value="name">Sort: Name</option>
              <option value="lastVisit">Sort: Last visit</option>
              <option value="totalVisits">Sort: Total visits</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-gym-muted uppercase tracking-wider font-semibold mr-1">Risk</span>
          {RISK_OPTIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRiskFilter(toggle(riskFilter, r))}
              className={`px-2.5 py-1 rounded-full border capitalize transition ${
                riskFilter.has(r) ? RISK_STYLE[r] : 'border-gym-border text-gym-muted hover:text-gym-text'
              }`}
            >
              {r}
            </button>
          ))}
          <span className="text-gym-muted uppercase tracking-wider font-semibold ml-3 mr-1">Trend</span>
          {TREND_OPTIONS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTrendFilter(toggle(trendFilter, t))}
              className={`px-2.5 py-1 rounded-full border capitalize transition ${
                trendFilter.has(t)
                  ? `border-gym-text/30 bg-gym-text/10 ${TREND_STYLE[t]}`
                  : 'border-gym-border text-gym-muted hover:text-gym-text'
              }`}
            >
              {t.toLowerCase()}
            </button>
          ))}
          <span className="text-gym-muted uppercase tracking-wider font-semibold ml-3 mr-1">Last visit</span>
          <select
            value={recency}
            onChange={(e) => setRecency(e.target.value as RecencyKey)}
            className="bg-gym-bg border border-gym-border rounded-lg px-2.5 py-1 text-gym-text focus:border-gym-text/30 focus:outline-none"
          >
            {RECENCY_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setRiskFilter(new Set());
                setTrendFilter(new Set());
                setRecency('all');
              }}
              className="text-gym-accent hover:underline ml-1"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-gym-muted text-sm py-12 text-center">Loading members…</p>
      ) : sorted.length === 0 ? (
        <p className="text-gym-muted text-sm py-12 text-center">No members match these filters.</p>
      ) : (
        <div className="overflow-auto max-h-[600px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gym-surface z-10">
              <tr className="text-left text-gym-muted text-[11px] uppercase tracking-wider border-b border-gym-border">
                <th className="px-5 py-2.5 font-semibold">Name</th>
                <th className="px-3 py-2.5 font-semibold">Risk</th>
                <th className="px-3 py-2.5 font-semibold">Trend</th>
                <th className="px-3 py-2.5 font-semibold">Last visit</th>
                <th className="px-3 py-2.5 font-semibold">Visits / 30d</th>
                <th className="px-3 py-2.5 font-semibold">Total visits</th>
                <th className="px-5 py-2.5 font-semibold">Member since</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => (
                <tr key={m.id} className="border-b border-gym-border/60 hover:bg-gym-text/5">
                  <td className="px-5 py-2.5 text-gym-text font-medium whitespace-nowrap">
                    {m.firstName} {m.lastName}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[11px] px-1.5 py-0.5 rounded border capitalize ${RISK_STYLE[m.riskBand]}`}>
                      {m.riskBand}
                    </span>
                  </td>
                  <td className={`px-3 py-2.5 capitalize ${TREND_STYLE[m.trendCategory]}`}>
                    {m.trendCategory.toLowerCase()}
                  </td>
                  <td className="px-3 py-2.5 text-gym-text whitespace-nowrap">
                    {lastVisitLabel(m.daysSinceLastVisit)}
                  </td>
                  <td className="px-3 py-2.5 text-gym-text">{m.last30d}</td>
                  <td className="px-3 py-2.5 text-gym-text">{m.totalVisitCount}</td>
                  <td className="px-5 py-2.5 text-gym-muted whitespace-nowrap">
                    {dateLabel(m.membershipStartDate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-5 py-2.5 border-t border-gym-border text-[11px] text-gym-muted">
        {sorted.length} of {members?.length ?? 0} members
      </div>
    </div>
  );
}
