'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type RiskCategory = 'LOW_RISK' | 'MEDIUM_RISK' | 'HIGH_RISK' | 'NON_ATTENDER';

interface RetentionMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobilePhone: string;
  riskCategory: RiskCategory;
  recentCount: number;
  visits60d: number;
  visits90d: number;
  expectedVisits: number;
  ratio: number;
  activeDate: string;
}

interface RetentionData {
  members: RetentionMember[];
  mock?: boolean;
  cached?: boolean;
  refreshing?: boolean;
  updatedAt?: string;
  error?: string;
}

type ColumnDef = {
  key: RiskCategory;
  label: string;
  accent: string;
  headerBg: string;
  border: string;
  bar: string;
};

const COLUMN_DEFS: ColumnDef[] = [
  {
    key: 'LOW_RISK',
    label: 'Low Risk',
    accent: 'text-green-400',
    headerBg: 'bg-green-500/10',
    border: 'border-green-500/30',
    bar: 'bg-green-500',
  },
  {
    key: 'MEDIUM_RISK',
    label: 'Medium Risk',
    accent: 'text-yellow-400',
    headerBg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    bar: 'bg-yellow-500',
  },
  {
    key: 'HIGH_RISK',
    label: 'High Risk',
    accent: 'text-red-400',
    headerBg: 'bg-red-500/10',
    border: 'border-red-500/30',
    bar: 'bg-red-500',
  },
  {
    key: 'NON_ATTENDER',
    label: 'Non Attender',
    accent: 'text-gym-muted',
    headerBg: 'bg-gym-border',
    border: 'border-gym-border',
    bar: 'bg-gym-muted',
  },
];

function MemberCard({
  member,
  bar,
  copied,
  onCopy,
}: {
  member: RetentionMember;
  bar: string;
  copied: boolean;
  onCopy: (m: RetentionMember) => void;
}) {
  const percent = Math.round(member.ratio * 100);
  return (
    <button
      type="button"
      onClick={() => onCopy(member)}
      className="w-full text-left bg-gym-bg border border-gym-border rounded-lg p-3 mb-2 hover:border-gym-text/30 transition"
    >
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <p className="text-gym-text text-sm font-medium truncate">
          {member.firstName} {member.lastName}
        </p>
        <span
          className={`text-[10px] tracking-wider uppercase shrink-0 ${
            copied ? 'text-green-400' : 'text-gym-muted'
          }`}
        >
          {copied
            ? 'Copied'
            : member.mobilePhone
              ? 'Tap to copy'
              : 'No phone'}
        </span>
      </div>
      <p className="text-gym-muted text-xs mb-2">
        {member.recentCount} / {member.expectedVisits} visits · 30d
      </p>
      <div className="h-1.5 bg-gym-border rounded-full overflow-hidden">
        <div
          className={`h-full ${bar} transition-all`}
          style={{ width: `${Math.max(percent, 2)}%` }}
        />
      </div>
      <p className="text-gym-muted text-[10px] mt-1.5">
        {percent}% of expected
      </p>
    </button>
  );
}

export default function RetentionPage() {
  const [data, setData] = useState<RetentionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/mindbody/retention${refresh ? '?refresh=true' : ''}`,
      );
      const d: RetentionData = await res.json();
      if (d.error) setError(d.error);
      else setData(d);
    } catch {
      setError('Failed to connect to retention API');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const members = data?.members ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      `${m.firstName} ${m.lastName}`.toLowerCase().includes(q),
    );
  }, [members, search]);

  const grouped = useMemo(() => {
    const groups: Record<RiskCategory, RetentionMember[]> = {
      LOW_RISK: [],
      MEDIUM_RISK: [],
      HIGH_RISK: [],
      NON_ATTENDER: [],
    };
    for (const m of filtered) groups[m.riskCategory].push(m);
    for (const cat of Object.keys(groups) as RiskCategory[]) {
      groups[cat].sort((a, b) => a.ratio - b.ratio);
    }
    return groups;
  }, [filtered]);

  async function copyPhone(m: RetentionMember) {
    if (!m.mobilePhone) return;
    try {
      await navigator.clipboard.writeText(m.mobilePhone);
      setCopiedId(m.id);
      setTimeout(
        () => setCopiedId((id) => (id === m.id ? null : id)),
        1500,
      );
    } catch {
      // ignore clipboard errors silently
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gym-text">Retention</h1>
          <p className="text-gym-muted text-sm mt-1">
            Active members grouped by attendance vs. their personal baseline · tap a card to copy phone
          </p>
        </div>
        <span
          className={`text-xs px-3 py-1 rounded-full font-medium ${
            loading
              ? 'bg-yellow-500/10 text-yellow-400'
              : error
                ? 'bg-red-500/10 text-red-400'
                : data?.mock
                  ? 'bg-blue-500/10 text-blue-400'
                  : 'bg-green-500/10 text-green-400'
          }`}
        >
          {loading
            ? 'Loading…'
            : error
              ? 'Error'
              : data?.mock
                ? 'No API Key'
                : 'Live'}
        </span>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members by name…"
          className="flex-1 bg-gym-surface border border-gym-border rounded-lg px-4 py-2.5 text-sm text-gym-text placeholder:text-gym-muted focus:border-gym-text/30"
        />
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing || loading}
          className="px-4 py-2.5 bg-gym-surface border border-gym-border rounded-lg text-sm text-gym-text hover:border-gym-text/30 disabled:opacity-50"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {COLUMN_DEFS.map((col) => {
          const list = grouped[col.key];
          return (
            <section
              key={col.key}
              className={`bg-gym-surface border ${col.border} rounded-xl flex flex-col min-h-[40vh] max-h-[75vh]`}
            >
              <header
                className={`${col.headerBg} px-4 py-3 rounded-t-xl border-b border-gym-border flex items-center justify-between`}
              >
                <h2
                  className={`text-sm font-semibold uppercase tracking-wider ${col.accent}`}
                >
                  {col.label}
                </h2>
                <span className={`text-sm font-bold ${col.accent}`}>
                  {list.length}
                </span>
              </header>
              <div className="flex-1 overflow-y-auto p-3 scroll-smooth">
                {loading ? (
                  <p className="text-gym-muted text-xs text-center py-8">
                    Loading…
                  </p>
                ) : list.length === 0 ? (
                  <p className="text-gym-muted text-xs text-center py-8">
                    No members
                  </p>
                ) : (
                  list.map((m) => (
                    <MemberCard
                      key={m.id}
                      member={m}
                      bar={col.bar}
                      copied={copiedId === m.id}
                      onCopy={copyPhone}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      {!loading && data?.updatedAt && (
        <p className="text-gym-muted text-xs text-center mt-8">
          Last updated:{' '}
          {new Date(data.updatedAt).toLocaleString('en-AU', {
            timeZone: 'Australia/Sydney',
          })}
          {data.refreshing && ' · Refreshing…'}
        </p>
      )}
    </div>
  );
}
