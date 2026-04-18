'use client';

import { useEffect, useState } from 'react';

interface MBCounts {
  active: number;
  intro: number;
  introLast7Days: number;
  classPacks: number;
  declined: number;
}

interface MBData {
  counts: MBCounts;
  mock?: boolean;
  cached?: boolean;
  refreshing?: boolean;
  updatedAt?: string;
  error?: string;
}

// MindBody Business Portal (newer UI) report links.
// Studio ID: 5741283
const MB_REPORTS = {
  active: 'https://clients.mindbodyonline.com/ASP/adm/adm_clt_srch.asp?studioid=5741283',
  intro: 'https://clients.mindbodyonline.com/ASP/adm/adm_clt_srch.asp?studioid=5741283',
  introLast7Days: 'https://clients.mindbodyonline.com/ASP/main_reports.asp?studioid=5741283',
  classPacks: 'https://clients.mindbodyonline.com/ASP/adm/adm_clt_srch.asp?studioid=5741283',
  declined: 'https://clients.mindbodyonline.com/ASP/main_reports.asp?studioid=5741283',
};

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
  color?: 'green' | 'blue' | 'purple' | 'red' | 'yellow';
  href?: string;
}) {
  const colorMap = {
    green: 'text-green-400',
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    red: 'text-red-400',
    yellow: 'text-yellow-400',
  };

  const inner = (
    <div className="bg-gym-surface border border-gym-border rounded-xl p-6 h-full transition hover:border-gym-text/30 hover:bg-gym-surface/80">
      <div className="flex items-start justify-between mb-2">
        <p className="text-gym-muted text-xs uppercase tracking-wider">{label}</p>
        {href && (
          <svg
            className="w-3.5 h-3.5 text-gym-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
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

export default function MindBodyPage() {
  const [data, setData] = useState<MBData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/mindbody')
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError('Failed to connect to MindBody'))
      .finally(() => setLoading(false));
  }, []);

  const counts = data?.counts ?? { active: 0, intro: 0, introLast7Days: 0, classPacks: 0, declined: 0 };

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gym-text">MindBody</h1>
          <p className="text-gym-muted text-sm mt-1">Membership overview · click any card to open the MindBody report</p>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard
          label="Active Members"
          value={loading ? '—' : counts.active}
          sub="Foundation T1 & T2, TYG, VIP, Black Friday"
          color="green"
          href={MB_REPORTS.active}
        />
        <StatCard
          label="Intro Offers"
          value={loading ? '—' : counts.intro}
          sub="All current intro memberships"
          color="blue"
          href={MB_REPORTS.intro}
        />
        <StatCard
          label="New Intro Offers"
          value={loading ? '—' : counts.introLast7Days}
          sub="Signed up in the last 7 days"
          color="yellow"
          href={MB_REPORTS.introLast7Days}
        />
        <StatCard
          label="Class Packs"
          value={loading ? '—' : counts.classPacks}
          sub="Casual session packs"
          color="purple"
          href={MB_REPORTS.classPacks}
        />
        <StatCard
          label="Declined Members"
          value={loading ? '—' : counts.declined}
          sub="Failed payment status"
          color="red"
          href={MB_REPORTS.declined}
        />
      </div>

      {!loading && data?.updatedAt && (
        <p className="text-gym-muted text-xs text-center mt-6">
          Last updated: {new Date(data.updatedAt).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}
          {data.refreshing && ' · Refreshing…'}
        </p>
      )}
    </div>
  );
}
