'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type TrendCategory = 'STABLE' | 'SLOWING' | 'SLIDING' | 'STOPPED';

interface RetentionMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobilePhone: string;
  trendCategory: TrendCategory;
  last30d: number;
  prior30d: number;
  last7d: number;
  prior7d: number;
  trend: number;
}

interface RetentionData {
  members: RetentionMember[];
  ghlLocationId?: string;
  mock?: boolean;
  cached?: boolean;
  refreshing?: boolean;
  updatedAt?: string;
  error?: string;
}

const mindBodyProfileUrl = (clientId: string) =>
  `https://clients.mindbodyonline.com/app/clients/${encodeURIComponent(clientId)}/client-info`;

// GHL Conversations: deep-link to the location's contacts search pre-filled
// with the member's phone. Staff land on the contact, click → conversation.
const ghlContactSearchUrl = (locationId: string, phone: string) =>
  `https://app.gohighlevel.com/v2/location/${encodeURIComponent(locationId)}/contacts?search=${encodeURIComponent(phone)}`;

type ColumnDef = {
  key: TrendCategory;
  label: string;
  hint: string;
  text: string;
  bar: string;
  pill: string;
};

const COLUMN_DEFS: ColumnDef[] = [
  {
    key: 'STABLE',
    label: 'Stable',
    hint: 'Holding pace vs. last month',
    text: 'text-emerald-700',
    bar: 'bg-emerald-500',
    pill: 'bg-emerald-50 text-emerald-700',
  },
  {
    key: 'SLOWING',
    label: 'Slowing',
    hint: 'Early warning · down 15–45%',
    text: 'text-amber-700',
    bar: 'bg-amber-500',
    pill: 'bg-amber-50 text-amber-700',
  },
  {
    key: 'SLIDING',
    label: 'Sliding',
    hint: 'At risk · down 45–75%',
    text: 'text-rose-700',
    bar: 'bg-rose-500',
    pill: 'bg-rose-50 text-rose-700',
  },
  {
    key: 'STOPPED',
    label: 'Stopped',
    hint: 'Down 75%+ or zero visits',
    text: 'text-gray-700',
    bar: 'bg-gray-400',
    pill: 'bg-gray-100 text-gray-700',
  },
];

function trendLabel(m: RetentionMember): string {
  if (m.last30d === 0) return 'No visits in 30d';
  if (m.prior30d === 0) return 'New activity';
  const pct = Math.round((m.trend - 1) * 100);
  if (pct === 0) return 'Same as last month';
  return pct > 0 ? `↑ ${pct}% vs last month` : `↓ ${Math.abs(pct)}% vs last month`;
}

function MemberCard({
  member,
  col,
  copied,
  ghlLocationId,
  onCopy,
}: {
  member: RetentionMember;
  col: ColumnDef;
  copied: boolean;
  ghlLocationId: string;
  onCopy: (m: RetentionMember) => void;
}) {
  // Bar fill: 100% = held pace, less than 100% = decline, more = growth.
  // Cap at 100% so growth doesn't visually swamp the column.
  const barPct = Math.min(Math.round(member.trend * 100), 100);
  const showGhl = Boolean(ghlLocationId && member.mobilePhone);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 mb-2 hover:border-gray-300 hover:shadow-sm transition">
      <div className="flex items-center justify-between gap-2 mb-2">
        <a
          href={mindBodyProfileUrl(member.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-900 text-sm font-medium truncate hover:text-gym-accent hover:underline transition flex-1"
          title="Open MindBody profile"
        >
          {member.firstName} {member.lastName}
        </a>
        <div className="flex items-center gap-1 shrink-0">
          {showGhl && (
            <a
              href={ghlContactSearchUrl(ghlLocationId, member.mobilePhone)}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open in GHL (search by ${member.mobilePhone})`}
              className="text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition"
            >
              GHL
            </a>
          )}
          {member.mobilePhone && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onCopy(member);
              }}
              title={copied ? 'Copied' : `Copy ${member.mobilePhone}`}
              className={`text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 rounded border transition ${
                copied
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs text-gray-500">
          {member.prior30d} → <span className="text-gray-900 font-medium">{member.last30d}</span> visits
        </p>
        <p className={`text-xs font-semibold ${col.text}`}>{trendLabel(member)}</p>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${col.bar} transition-all`}
          style={{ width: `${Math.max(barPct, 2)}%` }}
        />
      </div>
    </div>
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
    const groups: Record<TrendCategory, RetentionMember[]> = {
      STABLE: [],
      SLOWING: [],
      SLIDING: [],
      STOPPED: [],
    };
    for (const m of filtered) groups[m.trendCategory].push(m);
    // Worst trend first within each column — the steepest decline at the top.
    for (const cat of Object.keys(groups) as TrendCategory[]) {
      groups[cat].sort((a, b) => a.trend - b.trend);
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
      // clipboard blocked — ignore silently
    }
  }

  return (
    <div className="p-4 md:p-8 min-h-screen bg-white">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Retention</h1>
          <p className="text-gray-500 text-sm mt-1">
            Active members grouped by attendance trend (last 30d vs. prior 30d) · click a name to open their MindBody profile
          </p>
        </div>
        <span
          className={`text-xs px-3 py-1 rounded-full font-medium ${
            loading
              ? 'bg-amber-50 text-amber-700'
              : error
                ? 'bg-rose-50 text-rose-700'
                : data?.mock
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-emerald-50 text-emerald-700'
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
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-6">
          <p className="text-rose-700 text-sm">{error}</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members by name…"
          className="flex-1 bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-100"
        />
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing || loading}
          className="px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50"
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
              className="bg-gray-50 border border-gray-200 rounded-xl flex flex-col min-h-[40vh] max-h-[78vh]"
            >
              <header className="px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2
                    className={`text-sm font-semibold uppercase tracking-wider ${col.text}`}
                  >
                    {col.label}
                  </h2>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${col.pill}`}
                  >
                    {list.length}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">{col.hint}</p>
              </header>
              <div className="flex-1 overflow-y-auto p-3 scroll-smooth">
                {loading ? (
                  <p className="text-gray-400 text-xs text-center py-8">
                    Loading…
                  </p>
                ) : list.length === 0 ? (
                  <p className="text-gray-400 text-xs text-center py-8">
                    No members
                  </p>
                ) : (
                  list.map((m) => (
                    <MemberCard
                      key={m.id}
                      member={m}
                      col={col}
                      copied={copiedId === m.id}
                      ghlLocationId={data?.ghlLocationId ?? ''}
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
        <p className="text-gray-400 text-xs text-center mt-8">
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
