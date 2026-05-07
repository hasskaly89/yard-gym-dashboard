'use client';

import { useEffect, useState } from 'react';

type RangeKey = 'week' | 'month' | 'ytd';

interface RangedMetrics {
  newIntros: number;
  newActive: number;
  terminations: number;
}

interface MBCounts {
  active: number;
  intro: number;
  classPacks: number;
  declined: number;
  attendance: { zero: number; low: number; mid: number; high: number };
  milestones: { at50: number; at100: number; at200: number; at500: number; at1000: number };
  ranged: {
    week: RangedMetrics;
    month: RangedMetrics;
    ytd: RangedMetrics;
  };
}

interface MBData {
  counts: MBCounts;
  mock?: boolean;
  cached?: boolean;
  refreshing?: boolean;
  updatedAt?: string;
  error?: string;
}

// MindBody Business Portal — direct links to specific reports
const MB_REPORTS = {
  // Members Report — filter by Membership type and Member Status (Active/Intro/Declined/Terminated/etc.)
  members: 'https://clients.mindbodyonline.com/app/business/VIPMembershipReport/MembersReport',
  // Attendance Analysis — visit history by time of day
  attendance: 'https://clients.mindbodyonline.com/app/business/Report/Clients/AttendanceAnalysis?category=Clients',
  // Membership summary (legacy ASP) — counts by membership type
  membershipSummary: 'https://clients.mindbodyonline.com/app/business/ASP/adm/adm_rpt_membership_stats.asp?category=Clients',
  // Reports landing
  reports: 'https://clients.mindbodyonline.com/app/business/reportslandingpage',
};

const RANGE_LABELS: Record<RangeKey, string> = {
  week: 'This Week',
  month: 'This Month',
  ytd: 'Year to Date',
};

const RANGE_SUB: Record<RangeKey, string> = {
  week: 'Mon–Sun (Sydney)',
  month: 'Calendar month so far',
  ytd: 'Jan 1 – today',
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

function RangeFilter({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (r: RangeKey) => void;
}) {
  const options: RangeKey[] = ['week', 'month', 'ytd'];
  return (
    <div className="inline-flex bg-gym-surface border border-gym-border rounded-lg p-1">
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`px-3 py-1.5 text-sm rounded-md transition ${
              active
                ? 'bg-gym-text/10 text-gym-text'
                : 'text-gym-muted hover:text-gym-text'
            }`}
          >
            {RANGE_LABELS[opt]}
          </button>
        );
      })}
    </div>
  );
}

const EMPTY_RANGED: RangedMetrics = { newIntros: 0, newActive: 0, terminations: 0 };
const EMPTY_COUNTS: MBCounts = {
  active: 0,
  intro: 0,
  classPacks: 0,
  declined: 0,
  attendance: { zero: 0, low: 0, mid: 0, high: 0 },
  milestones: { at50: 0, at100: 0, at200: 0, at500: 0, at1000: 0 },
  ranged: {
    week: { ...EMPTY_RANGED },
    month: { ...EMPTY_RANGED },
    ytd: { ...EMPTY_RANGED },
  },
};

export default function MindBodyPage() {
  const [data, setData] = useState<MBData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState<RangeKey>('month');

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
  const ranged = counts.ranged[range];
  const v = (n: number) => (loading ? '—' : n);
  const rangeSub = RANGE_SUB[range];

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

      <div className="flex items-center justify-between mb-2">
        <p className="text-gym-muted text-sm">
          Filter applies to <span className="text-gym-text">Activity</span> cards below
        </p>
        <RangeFilter value={range} onChange={setRange} />
      </div>

      {/* Section 1: Memberships (snapshot — current state) */}
      <SectionHeader title="Memberships" subtitle="Current membership status across the studio" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Members"
          value={v(counts.active)}
          sub="Foundation T1 & T2, TYG, VIP, Black Friday"
          color="green"
          href={MB_REPORTS.members}
        />
        <StatCard
          label="Intro Offers"
          value={v(counts.intro)}
          sub="All current intro memberships"
          color="blue"
          href={MB_REPORTS.members}
        />
        <StatCard
          label="Class Packs"
          value={v(counts.classPacks)}
          sub="Casual session packs"
          color="purple"
          href={MB_REPORTS.members}
        />
        <StatCard
          label="Declined Members"
          value={v(counts.declined)}
          sub="Failed payment status"
          color="red"
          href={MB_REPORTS.members}
        />
      </div>

      {/* Section 2: Activity (filtered by range) */}
      <SectionHeader
        title={`Activity · ${RANGE_LABELS[range]}`}
        subtitle="New sign-ups, new intros, and ended memberships in the selected range"
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="New Active Members"
          value={v(ranged.newActive)}
          sub={rangeSub}
          color="teal"
          href={MB_REPORTS.members}
        />
        <StatCard
          label="New Intro Offers"
          value={v(ranged.newIntros)}
          sub={rangeSub}
          color="yellow"
          href={MB_REPORTS.members}
        />
        <StatCard
          label="Terminated Members"
          value={v(ranged.terminations)}
          sub="Members whose active-tier membership ended"
          color="red"
          href={MB_REPORTS.members}
        />
      </div>

      {/* Section 3: Attendance (active members, last 30 days) */}
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
          href={MB_REPORTS.attendance}
        />
        <StatCard
          label="1–10 Visits"
          value={v(counts.attendance.low)}
          sub="Light attendance"
          color="yellow"
          href={MB_REPORTS.attendance}
        />
        <StatCard
          label="11–20 Visits"
          value={v(counts.attendance.mid)}
          sub="Regular attendance"
          color="blue"
          href={MB_REPORTS.attendance}
        />
        <StatCard
          label="20+ Visits"
          value={v(counts.attendance.high)}
          sub="Highly active"
          color="green"
          href={MB_REPORTS.attendance}
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
          href={MB_REPORTS.members}
        />
        <StatCard
          label="100+ Classes"
          value={v(counts.milestones.at100)}
          sub="Signed-in classes, excludes creche"
          color="blue"
          href={MB_REPORTS.members}
        />
        <StatCard
          label="200+ Classes"
          value={v(counts.milestones.at200)}
          sub="Signed-in classes, excludes creche"
          color="purple"
          href={MB_REPORTS.members}
        />
        <StatCard
          label="500+ Classes"
          value={v(counts.milestones.at500)}
          sub="Signed-in classes, excludes creche"
          color="pink"
          href={MB_REPORTS.members}
        />
        <StatCard
          label="1000+ Classes"
          value={v(counts.milestones.at1000)}
          sub="Signed-in classes, excludes creche"
          color="orange"
          href={MB_REPORTS.members}
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
