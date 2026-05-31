'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  MilestoneBand,
  MilestoneBandGroup,
  MilestoneMember,
  MilestonesResponse,
} from '@/app/api/milestones/route';

const BAND_STYLE: Record<
  MilestoneBand,
  { ring: string; accent: string; pill: string; label: string }
> = {
  1000: {
    ring: 'border-amber-300',
    accent: 'text-amber-700',
    pill: 'bg-amber-100 text-amber-800 border-amber-300',
    label: 'Hall of Fame',
  },
  500: {
    ring: 'border-violet-300',
    accent: 'text-violet-700',
    pill: 'bg-violet-100 text-violet-800 border-violet-300',
    label: 'Legends',
  },
  300: {
    ring: 'border-indigo-300',
    accent: 'text-indigo-700',
    pill: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    label: 'Veterans',
  },
  250: {
    ring: 'border-sky-300',
    accent: 'text-sky-700',
    pill: 'bg-sky-100 text-sky-800 border-sky-300',
    label: 'Committed',
  },
  200: {
    ring: 'border-emerald-300',
    accent: 'text-emerald-700',
    pill: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    label: 'Strong',
  },
  150: {
    ring: 'border-teal-300',
    accent: 'text-teal-700',
    pill: 'bg-teal-100 text-teal-800 border-teal-300',
    label: 'Rising',
  },
  100: {
    ring: 'border-lime-300',
    accent: 'text-lime-700',
    pill: 'bg-lime-100 text-lime-800 border-lime-300',
    label: 'Century',
  },
  50: {
    ring: 'border-rose-200',
    accent: 'text-rose-700',
    pill: 'bg-rose-50 text-rose-700 border-rose-200',
    label: 'Halfway',
  },
  25: {
    ring: 'border-gray-200',
    accent: 'text-gray-700',
    pill: 'bg-gray-100 text-gray-700 border-gray-200',
    label: 'Getting Started',
  },
};

const mindBodyProfileUrl = (clientId: string) =>
  `https://clients.mindbodyonline.com/app/clients/${encodeURIComponent(clientId)}/client-info`;

function memberFullName(m: MilestoneMember): string {
  return `${m.first_name} ${m.last_name}`.trim();
}

function daysSinceLastVisit(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-AU');
}

function nextBandFor(count: number): number | null {
  const bands = [25, 50, 100, 150, 200, 250, 300, 500, 1000];
  for (const b of bands) {
    if (count < b) return b;
  }
  return null;
}

export default function MilestonesPage() {
  const [data, setData] = useState<MilestonesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/milestones')
      .then((r) => r.json())
      .then((d: MilestonesResponse | { error: string }) => {
        if (cancelled) return;
        if ('error' in d) {
          setError(d.error);
        } else {
          setData(d);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load milestone data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredBands = useMemo<MilestoneBandGroup[]>(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.bands;
    return data.bands
      .map((group) => ({
        ...group,
        members: group.members.filter((m) =>
          memberFullName(m).toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.members.length > 0);
  }, [data, search]);

  const leaderboard = useMemo<MilestoneMember[]>(() => {
    if (!data) return [];
    return data.bands
      .flatMap((g) => g.members)
      .sort(
        (a, b) => (b.total_visit_count ?? 0) - (a.total_visit_count ?? 0),
      )
      .slice(0, 10);
  }, [data]);

  const avgClasses =
    data && data.totalActiveMembers > 0
      ? Math.round(data.totalSignedInClasses / data.totalActiveMembers)
      : 0;

  const refreshedLabel = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleTimeString('en-AU', {
        timeZone: 'Australia/Sydney',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="p-4 md:p-8 min-h-screen bg-white">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Milestones</h1>
          <p className="text-gray-500 text-sm mt-1">
            Signed-in classes per active member since 1 Apr 2024
            {refreshedLabel ? ` · refreshed ${refreshedLabel}` : ''}
          </p>
        </div>
        <span
          className={`text-xs px-3 py-1 rounded-full font-medium ${
            loading
              ? 'bg-amber-50 text-amber-700'
              : error
                ? 'bg-rose-50 text-rose-700'
                : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {loading ? 'Loading…' : error ? 'Error' : 'Live'}
        </span>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-6">
          <p className="text-rose-700 text-sm">{error}</p>
        </div>
      )}

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatTile
          label="Active members"
          value={data ? formatNumber(data.totalActiveMembers) : '—'}
        />
        <StatTile
          label="Total signed-in classes"
          value={data ? formatNumber(data.totalSignedInClasses) : '—'}
        />
        <StatTile
          label="Average per member"
          value={data ? formatNumber(avgClasses) : '—'}
        />
        <StatTile
          label="Top member"
          value={
            data?.topMember
              ? `${formatNumber(data.topMember.total_visit_count)}`
              : '—'
          }
          sub={data?.topMember ? memberFullName(data.topMember) : ''}
        />
      </div>

      {/* Leaderboard */}
      {!loading && leaderboard.length > 0 && (
        <section className="mb-6 bg-white border border-gray-200 rounded-xl p-4 md:p-5">
          <div className="flex items-end justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Top 10 leaderboard
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Most signed-in classes since 1 Apr 2024
              </p>
            </div>
          </div>
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {leaderboard.map((m, i) => (
              <li
                key={m.mindbody_client_id}
                className="flex items-center gap-2 p-2 rounded-lg border border-gray-100 bg-gray-50"
              >
                <span
                  className={`shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                    i === 0
                      ? 'bg-amber-200 text-amber-900'
                      : i === 1
                        ? 'bg-gray-200 text-gray-800'
                        : i === 2
                          ? 'bg-orange-200 text-orange-900'
                          : 'bg-white text-gray-500 border border-gray-200'
                  }`}
                >
                  {i + 1}
                </span>
                <a
                  href={mindBodyProfileUrl(m.mindbody_client_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-900 font-medium truncate hover:underline flex-1"
                  title="Open in MindBody"
                >
                  {memberFullName(m)}
                </a>
                <span className="text-xs font-semibold text-gray-700 shrink-0">
                  {formatNumber(m.total_visit_count)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Search */}
      <div className="mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members by name…"
          className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-100"
        />
      </div>

      {/* Band grid */}
      {loading ? (
        <p className="text-gray-400 text-sm text-center py-12">
          Loading milestone bands…
        </p>
      ) : filteredBands.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-12">
          {search
            ? `No active members matching "${search}".`
            : 'No active members above the 25-class threshold yet. Run the milestones cron to backfill counts.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredBands.map((group) => (
            <BandCard key={group.band} group={group} />
          ))}
        </div>
      )}

      {!loading && data && data.underThreshold > 0 && (
        <p className="text-gray-400 text-xs text-center mt-8">
          {data.underThreshold} active member
          {data.underThreshold === 1 ? '' : 's'} under 25 classes (not shown)
        </p>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p className="text-2xl font-bold text-gray-900 mt-1.5">{value}</p>
      {sub && (
        <p className="text-xs text-gray-500 mt-0.5 truncate">{sub}</p>
      )}
    </div>
  );
}

function BandCard({ group }: { group: MilestoneBandGroup }) {
  const style = BAND_STYLE[group.band];
  return (
    <section
      className={`bg-gray-50 border ${style.ring} rounded-xl flex flex-col max-h-[60vh]`}
    >
      <header className="px-4 py-3 border-b border-gray-200 bg-white rounded-t-xl">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className={`text-sm font-bold ${style.accent}`}>
              {group.label}
            </h2>
            <p className="text-[11px] text-gray-500 mt-0.5">{style.label}</p>
          </div>
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-full border ${style.pill}`}
          >
            {group.members.length}
          </span>
        </div>
      </header>
      <ul className="flex-1 overflow-y-auto p-2">
        {group.members.map((m) => {
          const days = daysSinceLastVisit(m.last_visit_date);
          const nextBand = nextBandFor(m.total_visit_count);
          const toNext = nextBand !== null ? nextBand - m.total_visit_count : 0;
          return (
            <li
              key={m.mindbody_client_id}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white transition"
            >
              <a
                href={mindBodyProfileUrl(m.mindbody_client_id)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-900 truncate hover:underline flex-1"
                title="Open in MindBody"
              >
                {memberFullName(m)}
              </a>
              <span className="text-xs text-gray-400 shrink-0">
                {days !== null
                  ? `${days}d ago`
                  : 'no recent visit'}
              </span>
              <span className="text-xs font-semibold text-gray-700 shrink-0 w-12 text-right">
                {formatNumber(m.total_visit_count)}
              </span>
              {nextBand !== null && toNext <= 5 && (
                <span
                  className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 shrink-0"
                  title={`${toNext} away from ${nextBand}`}
                >
                  {toNext} TO {nextBand}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
