'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Urgency = 'high' | 'medium' | 'low';
type Task = { title: string; detail: string; urgency: Urgency; source: string; url?: string | null };
type EmailItem = { from: string; subject: string; date: string; snippet: string; url: string | null };
type Brief = {
  summary: string | null;
  tasks: Task[] | unknown;
  emails: EmailItem[] | unknown;
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

const URGENCY: Record<Urgency, { dot: string; ring: string }> = {
  high: { dot: 'bg-rose-500', ring: 'border-l-rose-500' },
  medium: { dot: 'bg-amber-500', ring: 'border-l-amber-500' },
  low: { dot: 'bg-emerald-500', ring: 'border-l-emerald-500' },
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function relativeDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((d: DashboardData) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 md:p-8 min-h-screen bg-white">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{greeting()}, Hassan</h1>
        <p className="text-gray-500 text-sm mt-1">
          {new Date().toLocaleDateString('en-AU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            timeZone: 'Australia/Sydney',
          })}
        </p>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm py-16 text-center">Loading your dashboard…</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <InboxCard data={data} />
          </div>
          <div>
            <MindBodyRetentionSidebar insights={data?.insights ?? null} />
          </div>
        </div>
      )}
    </div>
  );
}

function InboxCard({ data }: { data: DashboardData | null }) {
  const [tab, setTab] = useState<'business' | 'personal'>('business');
  const [view, setView] = useState<'tasks' | 'emails'>('tasks');

  const brief = tab === 'business' ? data?.briefs.business : data?.briefs.personal;
  const connected =
    tab === 'business' ? data?.config.businessConnected : data?.config.personalConnected;
  const tasks: Task[] = Array.isArray(brief?.tasks) ? (brief!.tasks as Task[]) : [];
  const emails: EmailItem[] = Array.isArray(brief?.emails) ? (brief!.emails as EmailItem[]) : [];

  return (
    <div className="bg-white border border-gym-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gym-border flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-gym-border p-0.5 bg-gray-50">
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
        {brief && <span className="text-[11px] text-gym-muted">{brief.emails_scanned} emails scanned</span>}
      </div>

      <div className="p-5">
        {!connected ? (
          <ConnectInbox scope={tab} />
        ) : !brief ? (
          <div className="border border-gym-border rounded-xl p-5 text-center text-sm text-gray-500">
            Inbox connected — your first brief will appear after tonight's run.
          </div>
        ) : (
          <div className="space-y-4">
            {brief.summary && (
              <div className="bg-gradient-to-br from-gray-50 to-white border border-gym-border rounded-xl p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gym-muted mb-1.5">
                  How things are running
                </p>
                <p className="text-gray-800 text-sm leading-relaxed">{brief.summary}</p>
              </div>
            )}

            <div className="inline-flex rounded-lg border border-gym-border p-0.5 bg-gray-50">
              <button
                type="button"
                onClick={() => setView('tasks')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
                  view === 'tasks' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                What needs your attention {tasks.length > 0 && `(${tasks.length})`}
              </button>
              <button
                type="button"
                onClick={() => setView('emails')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
                  view === 'emails' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Recent emails {emails.length > 0 && `(${emails.length})`}
              </button>
            </div>

            {view === 'tasks' ? (
              tasks.length === 0 ? (
                <div className="border border-gym-border rounded-xl p-5 text-center text-sm text-gray-500">
                  Nothing needs action right now. ✅
                </div>
              ) : (
                <ul className="space-y-2">
                  {tasks.map((t, i) => {
                    const inner = (
                      <div className="flex items-start gap-2">
                        <span className={`mt-1.5 w-2 h-2 rounded-full flex-none ${URGENCY[t.urgency]?.dot ?? 'bg-gray-300'}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{t.title}</p>
                          {t.detail && <p className="text-sm text-gray-600 mt-0.5">{t.detail}</p>}
                          {t.source && (
                            <p className="text-[11px] text-gray-400 mt-1.5 truncate">
                              from: {t.source}
                              {t.url && <span className="text-gym-accent"> · open →</span>}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                    const cls = `block bg-white border border-gym-border border-l-4 ${URGENCY[t.urgency]?.ring ?? 'border-l-gray-300'} rounded-xl p-4 ${t.url ? 'hover:border-gray-300 hover:shadow-sm transition cursor-pointer' : ''}`;
                    return (
                      <li key={i}>
                        {t.url ? (
                          <a href={t.url} target="_blank" rel="noopener noreferrer" className={cls}>
                            {inner}
                          </a>
                        ) : (
                          <div className={cls}>{inner}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )
            ) : emails.length === 0 ? (
              <div className="border border-gym-border rounded-xl p-5 text-center text-sm text-gray-500">
                No recent emails.
              </div>
            ) : (
              <ul className="divide-y divide-gym-border border border-gym-border rounded-xl overflow-hidden">
                {emails.map((e, i) => (
                  <li key={i} className="p-3 hover:bg-gray-50 transition">
                    <a
                      href={e.url ?? undefined}
                      target={e.url ? '_blank' : undefined}
                      rel={e.url ? 'noopener noreferrer' : undefined}
                      className={e.url ? 'block cursor-pointer' : 'block cursor-default'}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">{e.subject}</span>
                        <span className="text-[11px] text-gym-muted flex-none">{relativeDate(e.date)}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{e.from}</p>
                      {e.snippet && <p className="text-xs text-gray-400 truncate mt-0.5">{e.snippet}</p>}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ConnectInbox({ scope }: { scope: 'business' | 'personal' }) {
  if (scope === 'business') {
    return (
      <div className="border border-gym-border rounded-xl p-5 text-center">
        <p className="text-2xl mb-2">📥</p>
        <p className="text-sm font-medium text-gray-800">Connect your business inbox</p>
        <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto mb-3">
          Once connected, your agent reads it each morning and lists what needs doing here. The
          Yard's Workspace requires Google sign-in rather than an app password.
        </p>
        <a
          href="/api/auth/gmail/connect?scope=business"
          className="inline-block text-xs font-medium text-white bg-gym-accent hover:bg-gym-accent-hover rounded-lg px-4 py-2 transition-colors"
        >
          Connect with Google
        </a>
      </div>
    );
  }
  return (
    <div className="border border-gym-border rounded-xl p-5 text-center">
      <p className="text-2xl mb-2">📥</p>
      <p className="text-sm font-medium text-gray-800">Connect your {scope} inbox</p>
      <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
        Once connected, your agent reads it each morning and lists what needs doing here. Ask your
        admin to add the {scope} email’s app password.
      </p>
    </div>
  );
}

function MindBodyRetentionSidebar({ insights }: { insights: Insights }) {
  if (!insights) {
    return (
      <div className="bg-white border border-gym-border rounded-xl p-5 text-sm text-gym-muted">
        MindBody insights unavailable.
      </div>
    );
  }
  const atRiskCount = insights.risk.high + insights.risk.medium;
  return (
    <div className="bg-white border border-gym-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gym-border">
        <h2 className="text-sm font-semibold text-gray-900">MindBody & Retention</h2>
      </div>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3 text-center">
          <Stat label="Active members" value={insights.activeMembers} />
          <Stat label="At risk" value={atRiskCount} tone="warn" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="border border-dashed border-gray-300 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-400">New leads</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Not synced yet</p>
          </div>
          <div className="border border-dashed border-gray-300 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-400">Missed payments</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Not synced yet</p>
          </div>
        </div>

        {insights.atRisk.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gym-muted mb-2">
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

        <div className="flex gap-2 pt-3 border-t border-gym-border">
          <Link
            href="/retention"
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gym-border text-gray-700 hover:bg-gray-50 transition"
          >
            Retention →
          </Link>
          <Link
            href="/mindbody"
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gym-border text-gray-700 hover:bg-gray-50 transition"
          >
            MindBody →
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <div>
      <p className={`text-2xl font-bold ${tone === 'warn' ? 'text-amber-600' : 'text-gray-900'}`}>{value}</p>
      <p className="text-[11px] text-gym-muted uppercase tracking-wider">{label}</p>
    </div>
  );
}
