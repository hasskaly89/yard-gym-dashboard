'use client';

import { useEffect, useState } from 'react';

interface MBCounts {
  active: number;
  intro: number;
  introLast7Days: number;
  classPacks: number;
  declined: number;
  attendance: { zero: number; low: number; mid: number; high: number };
  newActive: { thisWeek: number; thisMonth: number };
  milestones: { at50: number; at100: number; at200: number; at500: number; at1000: number };
}

interface MBData {
  counts: MBCounts;
  mock?: boolean;
  cached?: boolean;
  refreshing?: boolean;
  updatedAt?: string;
  error?: string;
}

// MindBody Business Portal (newer UI) — studio 5741283
const MB_REPORTS = {
  clients: 'https://clients.mindbodyonline.com/ASP/adm/adm_clt_srch.asp?studioid=5741283',
  reports: 'https://clients.mindbodyonline.com/ASP/main_reports.asp?studioid=5741283',
};

type CardColor = 'green' | 'blue' | 'purple' | 'red' | 'yellow' | 'teal' | 'orange' | 'pink';

function StatCard({
  label,
  value,
  sub,
  color = 'green',
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: CardColor;
  href?: string;
}) {
  const colorMap: Record<CardColor, string> = {
    green: 'text-green-400',
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    red: 'text-red-400',
    yellow: 'text-yellow-400',
    teal: 'text-teal-400',
    orange: 'text-orange-400',
    pink: 'text-pink-400',
  };

  const inner = (
    <div className="bg-gym-surface border border-gym-border rounded-xl p-6 h-full transition hover:border-gym-text/30 hover:bg-gym-surface/80">
      <div className="flex items-start justify-between mb-2">
        <p className="text-gym-muted text-xs uppercase tracking-wider">{label}</p>
        {href && (
          <svg className="w-3.5 h-3.5 text-gym-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        )}
      </div>
      <p className={`text-4xl font-bold ${colorMap[color]}`}>{value}</p>
      {sub && <p className="text-gym-muted text-xs mt-2">{sub}</p>}
    </div>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block">
        {inner}
      </a>
    );
  }

  return inner;
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4 mt-8 first:mt-0">
      <h2 className="text-gym-text text-lg font-semibold">{title}</h2>
      {subtitle && <p className="text-gym-muted text-sm mt-0.5">{subtitle}</p>}
    </div>
  );
}

const EMPTY_COUNTS: MBCounts = {
  active: 0,
  intro: 0,
  introLast7Days: 0,
  classPacks: 0,
  declined: 0,
  attendance: { zero: 0, low: 0, mid: 0, high: 0 },
  newActive: { thisWeek: 0, thisMonth: 0 },
  milestones: { at50: 0, at100: 0, at200: 0, at500: 0, at1000: 0 },
};

export default function MindBodyPage() {
  const [data, setData] = useState<MBData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/mindbody')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError('Failed to connect to MindBody'))
      .finally(() => setLoading(false));
  }, []);

  const counts = data?.counts ?? EMPTY_COUNTS;
  const v = (n: number) => (loading ? '—' : n);

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gym-text">MindBody</h1>
          <p className="text-gym-muted text-sm mt-1">
            Membership & attendance overview · click any card to open the MindBody report
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
          {loading ? 'Loading…' : error ? 'Error' : data?.mock ? 'No API Key' : 'Live'}
        </span>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Section 1: Memberships */}
      <SectionHeader title="Memberships" subtitle="Current membership status across the studio" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard
          label="Active Members"
          value={v(counts.active)}
          sub="Foundation T1 & T2, TYG, VIP, Black Friday"
          color="green"
          href={MB_REPORTS.clients}
        />
        <StatCard
          label="Intro Offers"
          value={v(counts.intro)}
          sub="All current intro memberships"
          color="blue"
          href={MB_REPORTS.clients}
        />
        <StatCard
          label="New Intro Offers"
          value={v(counts.introLast7Days)}
          sub="Signed up in the last 7 days"
          color="yellow"
          href={MB_REPORTS.reports}
        />
        <StatCard
          label="Class Packs"
          value={v(counts.classPacks)}
          sub="Casual session packs"
          color="purple"
          href={MB_REPORTS.clients}
        />
        <StatCard
          label="Declined Members"
          value={v(counts.declined)}
          sub="Failed payment status"
          color="red"
          href={MB_REPORTS.reports}
        />
      </div>

      {/* Section 2: Attendance (active members, last 30 days) */}
      <SectionHeader
        title="Attendance (last 30 days)"
        subtitle="Active members by signed-in classes (excludes creche)"
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="0 Visits"
          value={v(counts.attendance.zero)}
          sub="No visits in 30 days"
          color="red"
          href={MB_REPORTS.reports}
        />
        <StatCard
          label="1–10 Visits"
          value={v(counts.attendance.low)}
          sub="Light attendance"
          color="yellow"
          href={MB_REPORTS.reports}
        />
        <StatCard
          label="11–20 Visits"
          value={v(counts.attendance.mid)}
          sub="Regular attendance"
          color="blue"
          href={MB_REPORTS.reports}
        />
        <StatCard
          label="20+ Visits"
          value={v(counts.attendance.high)}
          sub="Highly active"
          color="green"
          href={MB_REPORTS.reports}
        />
      </div>

      {/* Section 3: New Active Members */}
      <SectionHeader
        title="New Active Members"
        subtitle="New sign-ups on the 5 active membership types"
      />
      <div className="grid grid-cols-2 gap-4">
        <StatCard
          label="This Week"
          value={v(counts.newActive.thisWeek)}
          sub="Monday – Sunday (Sydney time)"
          color="teal"
          href={MB_REPORTS.reports}
        />
        <StatCard
          label="This Month"
          value={v(counts.newActive.thisMonth)}
          sub="Calendar month so far"
          color="orange"
          href={MB_REPORTS.reports}
        />
      </div>

      {/* Section 4: Class Milestones */}
      <SectionHeader
        title="Class Milestones"
        subtitle="Lifetime signed-in classes (excludes creche) for active members"
      />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="50+ Classes"
          value={v(counts.milestones.at50)}
          sub="Signed-in classes, excludes creche"
          color="teal"
          href={MB_REPORTS.reports}
        />
        <StatCard
          label="100+ Classes"
          value={v(counts.milestones.at100)}
          sub="Signed-in classes, excludes creche"
          color="blue"
          href={MB_REPORTS.reports}
        />
        <StatCard
          label="200+ Classes"
          value={v(counts.milestones.at200)}
          sub="Signed-in classes, excludes creche"
          color="purple"
          href={MB_REPORTS.reports}
        />
        <StatCard
          label="500+ Classes"
          value={v(counts.milestones.at500)}
          sub="Signed-in classes, excludes creche"
          color="pink"
          href={MB_REPORTS.reports}
        />
        <StatCard
          label="1000+ Classes"
          value={v(counts.milestones.at1000)}
          sub="Signed-in classes, excludes creche"
          color="orange"
          href={MB_REPORTS.reports}
        />
      </div>

      {!loading && data?.updatedAt && (
        <p className="text-gym-muted text-xs text-center mt-8">
          Last updated:{' '}
          {new Date(data.updatedAt).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}
          {data.refreshing && ' · Refreshing…'}
        </p>
      )}
    </div>
  );
}
