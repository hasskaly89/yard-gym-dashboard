'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Urgency = 'high' | 'medium' | 'low';
type Task = { title: string; detail: string; urgency: Urgency; source: string };
type Brief = {
  summary: string | null;
  tasks: Task[] | unknown;
  generated_at: string;
  emails_scanned: number;
} | null;

type Insights = {
  activeMembers: number;
  risk: { high: number; medium: number; healthy: number };
  sessionsLast7: number;
  sessionsPrior7: number;
  atRisk: Array<{ id: string; name: string; score: number | null; summary: string | null }>;
  updatedAt: string | null;
} | null;

type DashboardData = {
  insights: Insights;
  briefs: { personal: Brief; business: Brief };
  config: { personalConnected: boolean; businessConnected: boolean };
};

const URGENCY: Record<Urgency, { dot: string; label: string; ring: string }> = {
  high: { dot: 'bg-rose-500', label: 'text-rose-700', ring: 'border-l-rose-500' },
  medium: { dot: 'bg-amber-500', label: 'text-amber-700', ring: 'border-l-amber-500' },
  low: { dot: 'bg-emerald-500', label: 'text-emerald-700', ring: 'border-l-emerald-500' },
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'business' | 'personal'>('business');

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((d: DashboardData) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const brief = tab === 'business' ? data?.briefs.business : data?.briefs.personal;
  const connected =
    tab === 'business' ? data?.config.businessConnected : data?.config.personalConnected;
  const tasks: Task[] = Array.isArray(brief?.tasks) ? (brief!.tasks as Task[]) : [];

  return (
    <div className="p-4 md:p-8 min-h-screen bg-white">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{greeting()}, Hassan</h1>
          <p className="text-gray-500 text-sm mt-1">
            {new Date().toLocaleDateString('en-AU', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              timeZone: 'Australia/Sydney',
            })}{' '}
            · your daily brief
          </p>
        </div>
        {/* Tabs */}
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
          {(['business', 'personal'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md capitalize transition ${
                tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm py-16 text-center">Loading your brief…</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left / main: tasks */}
          <div className="lg:col-span-2 space-y-6">
            {/* Summary */}
            {brief?.summary && (
              <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-xl p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  How things are running
                </p>
                <p className="text-gray-800 text-sm leading-relaxed">{brief.summary}</p>
              </div>
            )}

            {/* Task list */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
                  What needs your attention
                </h2>
                {brief && (
                  <span className="text-[11px] text-gray-400">
                    {brief.emails_scanned} emails scanned
                  </span>
                )}
              </div>

              {!connected ? (
                <ConnectInbox scope={tab} />
              ) : !brief ? (
                <div className="border border-dashed border-gray-300 rounded-xl p-6 text-center text-sm text-gray-500">
                  Inbox connected — your first brief will appear after tonight's run (or trigger it
                  manually).
                </div>
              ) : tasks.length === 0 ? (
                <div className="border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-500">
                  Nothing needs action right now. ✅
                </div>
              ) : (
                <ul className="space-y-2">
                  {tasks.map((t, i) => (
                    <li
                      key={i}
                      className={`bg-white border border-gray-200 border-l-4 ${URGENCY[t.urgency]?.ring ?? 'border-l-gray-300'} rounded-lg p-4`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`mt-1.5 w-2 h-2 rounded-full flex-none ${URGENCY[t.urgency]?.dot ?? 'bg-gray-300'}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{t.title}</p>
                          {t.detail && <p className="text-sm text-gray-600 mt-0.5">{t.detail}</p>}
                          {t.source && (
                            <p className="text-[11px] text-gray-400 mt-1.5 truncate">from: {t.source}</p>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Right: MindBody insights */}
          <div className="space-y-4">
            <MindBodyInsights insights={data?.insights ?? null} />
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectInbox({ scope }: { scope: 'business' | 'personal' }) {
  return (
    <div className="border border-dashed border-gray-300 rounded-xl p-6 text-center">
      <p className="text-2xl mb-2">📥</p>
      <p className="text-sm font-medium text-gray-800">Connect your {scope} inbox</p>
      <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
        Once connected, your agent reads it each morning and lists what needs doing here. Ask your
        admin to add the {scope} email’s app password.
      </p>
    </div>
  );
}

function MindBodyInsights({ insights }: { insights: Insights }) {
  if (!insights) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 text-sm text-gray-400">
        MindBody insights unavailable.
      </div>
    );
  }
  const trend = insights.sessionsLast7 - insights.sessionsPrior7;
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">MindBody Insights</h2>
        <Link href="/retention" className="text-xs text-gym-accent font-medium hover:underline">
          Retention →
        </Link>
      </div>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Active" value={insights.activeMembers} />
          <Stat label="At risk" value={insights.risk.high + insights.risk.medium} tone="warn" />
          <Stat label="Sessions/wk" value={insights.sessionsLast7} sub={trend >= 0 ? `▲ ${trend}` : `▼ ${Math.abs(trend)}`} />
        </div>

        {insights.atRisk.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Call these members
            </p>
            <ul className="space-y-2">
              {insights.atRisk.map((m) => (
                <li key={m.id} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-900 truncate">{m.name}</span>
                    <span className="text-xs font-bold text-rose-600 flex-none">{m.score ?? '—'}</span>
                  </div>
                  {m.summary && <p className="text-xs text-gray-500 leading-snug mt-0.5">{m.summary}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: 'warn' }) {
  return (
    <div>
      <p className={`text-2xl font-bold ${tone === 'warn' ? 'text-amber-600' : 'text-gray-900'}`}>{value}</p>
      <p className="text-[11px] text-gray-400 uppercase tracking-wider">{label}</p>
      {sub && <p className="text-[11px] text-gray-500">{sub}</p>}
    </div>
  );
}
