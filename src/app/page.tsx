'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PERIODS, type PeriodKey } from '@/lib/periods';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Clock,
  ExternalLink,
  Gavel,
  HeartPulse,
  Inbox as InboxIcon,
  Receipt,
  ShieldAlert,
  Star,
  Undo2,
} from 'lucide-react';

// Money/legal categories get a shape as well as a colour, so severity survives a
// glance and doesn't depend on distinguishing red from amber.
const FLAG_META: Record<string, { icon: typeof Receipt; label: string }> = {
  'payment overdue': { icon: Receipt, label: 'Payment overdue' },
  invoice: { icon: Receipt, label: 'Invoice' },
  'refund request': { icon: Receipt, label: 'Refund' },
  complaint: { icon: ShieldAlert, label: 'Complaint' },
  legal: { icon: Gavel, label: 'Legal' },
  insurance: { icon: Gavel, label: 'Insurance' },
  workcover: { icon: ShieldAlert, label: 'WorkCover' },
};

const VIP_LABEL: Record<string, string> = {
  staff: 'Staff',
  'at-risk member': 'At-risk member',
  'crm contact': 'Open deal',
};

type Urgency = 'high' | 'medium' | 'low';
type Task = {
  title: string;
  detail: string;
  urgency: Urgency;
  source: string;
  url?: string | null;
  id?: string;
  completedAt?: string | null;
  snoozedUntil?: string | null;
  flags?: string[];
  deadline?: string | null;
  vip?: string | null;
};
type EmailItem = { from: string; subject: string; date: string; snippet: string; url: string | null };
type Brief = {
  summary: string | null;
  tasks: Task[] | unknown;
  emails: EmailItem[] | unknown;
  generated_at: string;
  emails_scanned: number;
  truncated?: boolean;
} | null;

type Insights = {
  activeMembers: number;
  risk: { high: number; medium: number; healthy: number };
  sessionsThisWeek: number;
  sessionsLastWeekToDate: number;
  sessionsLastWeekFull: number;
  weekStart: string;
  declined?: number;
  suspended?: number;
  atRisk: Array<{ id: string; name: string; score: number | null; summary: string | null }>;
  updatedAt: string | null;
} | null;

type DashboardData = {
  access?: { role: 'admin' | 'staff'; allowedPages: string[] };
  insights: Insights;
  briefs: { personal: Brief; business: Brief };
  config: { personalConnected: boolean; businessConnected: boolean };
};

type MetaAdsSummary = {
  tokenPending: boolean;
  totals: { spend: number; leads: number };
} | null;

type GhlSummary = {
  mock?: boolean;
  totalUnread?: number;
  contacts: { total: number; newThisWeek: number };
  opportunities: { total: number };
} | null;

const fmtAud = (n: number) =>
  `$${n.toLocaleString('en-AU', { maximumFractionDigits: 0 })}`;

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

function activeTaskCount(brief: Brief): number {
  if (!brief || !Array.isArray(brief.tasks)) return 0;
  const now = Date.now();
  return (brief.tasks as Task[]).filter(
    (t) => !t.completedAt && !(t.snoozedUntil && new Date(t.snoozedUntil).getTime() > now),
  ).length;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [metaAds, setMetaAds] = useState<MetaAdsSummary>(null);
  const [ghl, setGhl] = useState<GhlSummary>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((d: DashboardData) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch('/api/meta-ads?range=last_30d')
      .then((r) => r.json())
      .then((d: MetaAdsSummary) => setMetaAds(d))
      .catch(() => {});

    fetch('/api/gohighlevel')
      .then((r) => r.json())
      .then((d: GhlSummary) => setGhl(d))
      .catch(() => {});
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
        <div className="space-y-6">
          <DataFreshness updatedAt={data?.insights?.updatedAt ?? null} />
          <BusinessBar />
          <DeskTiles data={data} metaAds={metaAds} ghl={ghl} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2">
              <InboxCard data={data} />
            </div>
            {data?.insights && <MindBodyRetentionSidebar insights={data.insights} ghl={ghl} />}
          </div>
        </div>
      )}
    </div>
  );
}

// Member and attendance figures come from a nightly sync. When that sync stops,
// every number below keeps rendering as though nothing is wrong — which is
// exactly how a 3-day gap once showed up as a 30% attendance collapse. Say so
// rather than quietly serving stale figures with full confidence.
function DataFreshness({ updatedAt }: { updatedAt: string | null }) {
  if (!updatedAt) return null;
  const ageHours = (Date.now() - new Date(updatedAt).getTime()) / 3600000;
  if (ageHours < 36) return null;

  const days = Math.floor(ageHours / 24);
  const when = new Date(updatedAt).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Australia/Sydney',
  });

  return (
    <div className="flex items-start gap-2.5 border border-amber-300 bg-amber-50 rounded-xl px-4 py-3">
      <AlertTriangle size={16} className="text-amber-700 flex-none mt-0.5" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-amber-900">
          Member data hasn&apos;t synced for {days} {days === 1 ? 'day' : 'days'}
        </p>
        <p className="text-xs text-amber-800 mt-0.5">
          Last updated {when}. Active members, attendance and the at-risk list below are from that
          date — a part-synced week reads as a decline even when attendance is fine. Money, visits
          and leads in the bar below are live and unaffected.
        </p>
      </div>
    </div>
  );
}

type BusinessSummary = {
  period: { key: string; label: string; start: string; end: string; inProgress: boolean };
  revenue: { total: number; transactions: number; compare: number | null };
  visits: {
    signedIn: number;
    booked: number;
    capacity: number;
    classes: number;
    utilisation: number | null;
    compare: number | null;
  };
  leads: { created: number; won: number; open: number; compare: number | null } | null;
  costCalls: number;
  errors: string[];
  moneyHidden?: boolean;
} | null;

// Money, visits and leads on one calendar, for one chosen period. Weeks run
// Monday–Sunday to match the MindBody Classes report.
function BusinessBar() {
  const [period, setPeriod] = useState<PeriodKey>('this-week');
  const [data, setData] = useState<BusinessSummary>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetch(`/api/business?period=${period}`)
      .then((r) => r.json())
      .then((d: BusinessSummary) => {
        if (live) setData(d);
      })
      .catch(() => {})
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [period]);

  const range = data
    ? `${new Date(data.period.start).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' })} – ${new Date(
        new Date(data.period.end).getTime() - 1,
      ).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' })}`
    : '';

  return (
    <div className="bg-white border border-gym-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gym-border flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-gym-border p-0.5 bg-gray-50 flex-wrap">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
                period === p.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {data && (
          <span className="text-[11px] text-gym-muted">
            {range}
            {data.period.inProgress && ' · in progress'}
          </span>
        )}
      </div>

      <div
        className={`grid grid-cols-1 divide-y sm:divide-y-0 sm:divide-x divide-gym-border ${
          data?.moneyHidden ? 'sm:grid-cols-2' : 'sm:grid-cols-3'
        }`}
      >
        {/* Takings are dropped entirely for profiles without money access —
            an empty or zeroed tile invites the wrong conclusion. */}
        {!data?.moneyHidden && (
          <Metric
            label="Money in"
            value={data ? `$${data.revenue.total.toLocaleString('en-AU', { maximumFractionDigits: 0 })}` : null}
            sub={data ? `${data.revenue.transactions} transactions` : ''}
            delta={pctDelta(data?.revenue.total, data?.revenue.compare)}
            loading={loading}
          />
        )}
        <Metric
          label="Visits"
          value={data ? data.visits.signedIn.toLocaleString('en-AU') : null}
          sub={
            data
              ? `${data.visits.classes} classes · ${data.visits.utilisation ?? '—'}% full`
              : ''
          }
          delta={pctDelta(data?.visits.signedIn, data?.visits.compare)}
          loading={loading}
        />
        <Metric
          label="New leads"
          value={data?.leads ? data.leads.created.toLocaleString('en-AU') : null}
          sub={data?.leads ? `${data.leads.won} won · ${data.leads.open} open` : 'CRM not connected'}
          delta={pctDelta(data?.leads?.created, data?.leads?.compare)}
          loading={loading}
        />
      </div>

      {data && data.errors.length > 0 && (
        <p className="px-5 py-2 text-[11px] text-amber-700 bg-amber-50 border-t border-amber-200">
          Some figures unavailable: {data.errors.join('; ')}
        </p>
      )}
    </div>
  );
}

function pctDelta(now?: number, before?: number | null): number | null {
  if (now === undefined || before === null || before === undefined || before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}

function Metric({
  label,
  value,
  sub,
  delta,
  loading,
}: {
  label: string;
  value: string | null;
  sub: string;
  delta: number | null;
  loading: boolean;
}) {
  return (
    <div className="p-5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gym-muted">{label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <p className="text-3xl font-bold text-gray-900 tabular-nums">
          {loading ? <span className="text-gray-300">—</span> : (value ?? '—')}
        </p>
        {!loading && delta !== null && (
          <span className={`text-xs font-semibold ${delta < 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
            {delta > 0 ? '+' : ''}
            {delta}%
          </span>
        )}
      </div>
      <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}

function DeskTiles({
  data,
  metaAds,
  ghl,
}: {
  data: DashboardData | null;
  metaAds: MetaAdsSummary;
  ghl: GhlSummary;
}) {
  const inboxCount = activeTaskCount(data?.briefs.business ?? null) + activeTaskCount(data?.briefs.personal ?? null);
  const atRiskCount = data?.insights ? data.insights.risk.high + data.insights.risk.medium : 0;
  const marketingConnected = !!metaAds && !metaAds.tokenPending;
  const ghlConnected = !!ghl && !ghl.mock;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-gym-muted mb-2">Your Desk</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <DeskTile label="Inbox" value={inboxCount} sub="need you" href="#inbox" />
        <DeskTile label="Retention" value={atRiskCount} sub="to call" href="/retention" tone="warn" />
        <DeskTile
          label="Marketing"
          value={marketingConnected ? metaAds!.totals.leads : null}
          sub={marketingConnected ? `leads · ${fmtAud(metaAds!.totals.spend)} spent` : 'not connected'}
          href="/meta-ads"
        />
        <DeskTile
          label="Leads"
          value={ghlConnected ? ghl!.contacts.newThisWeek : null}
          sub={ghlConnected ? `new this week · ${ghl!.totalUnread ?? 0} unread` : 'not synced'}
          href="/gohighlevel"
        />
      </div>
    </div>
  );
}

function DeskTile({
  label,
  value,
  sub,
  href,
  tone,
}: {
  label: string;
  value: number | null;
  sub: string;
  href: string;
  tone?: 'warn';
}) {
  const inner = (
    <div className="bg-white border border-gym-border rounded-xl p-3 h-full hover:border-gray-300 hover:shadow-sm transition">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gym-muted truncate">{label}</p>
      {value === null ? (
        <p className="text-lg font-bold text-gray-300 mt-1">—</p>
      ) : (
        <p className={`text-2xl font-bold mt-0.5 ${tone === 'warn' && value > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
          {value}
        </p>
      )}
      <p className="text-[10px] text-gray-400 mt-0.5 truncate">{sub}</p>
    </div>
  );
  return href.startsWith('#') ? (
    <a href={href}>{inner}</a>
  ) : (
    <Link href={href}>{inner}</Link>
  );
}

type TaskOverride = { completedAt?: string | null; snoozedUntil?: string | null };

async function postTaskAction(
  scope: 'business' | 'personal',
  t: Task,
  action: 'complete' | 'uncomplete' | 'snooze' | 'unsnooze',
  days?: number,
) {
  await fetch('/api/dashboard/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope, title: t.title, source: t.source, action, days }),
  }).catch(() => {});
}

function InboxCard({ data }: { data: DashboardData | null }) {
  // The personal brief is the owner's own mailbox; the API returns null for
  // anyone but an admin, so the tab simply doesn't exist for staff.
  const canSeePersonal = !!data?.briefs.personal || data?.access?.role === 'admin';
  const scopes: Array<'business' | 'personal'> = canSeePersonal
    ? ['business', 'personal']
    : ['business'];
  const [tab, setTab] = useState<'business' | 'personal'>('business');
  const [view, setView] = useState<'tasks' | 'completed' | 'emails'>('tasks');
  const [overrides, setOverrides] = useState<Record<string, TaskOverride>>({});

  const brief = tab === 'business' ? data?.briefs.business : data?.briefs.personal;
  const connected =
    tab === 'business' ? data?.config.businessConnected : data?.config.personalConnected;
  const emails: EmailItem[] = Array.isArray(brief?.emails) ? (brief!.emails as EmailItem[]) : [];

  const rawTasks: Task[] = Array.isArray(brief?.tasks) ? (brief!.tasks as Task[]) : [];
  const allTasks = rawTasks.map((t) => {
    const key = t.id ?? t.title;
    const o = overrides[key];
    return o ? { ...t, ...o } : t;
  });
  const now = Date.now();
  const activeTasks = allTasks.filter(
    (t) => !t.completedAt && !(t.snoozedUntil && new Date(t.snoozedUntil).getTime() > now),
  );
  const completedTasks = allTasks.filter((t) => t.completedAt);

  function applyOverride(t: Task, patch: TaskOverride) {
    setOverrides((prev) => ({ ...prev, [t.id ?? t.title]: { ...prev[t.id ?? t.title], ...patch } }));
  }

  return (
    <div id="inbox" className="bg-white border border-gym-border rounded-xl overflow-hidden scroll-mt-8">
      <div className="px-5 py-4 border-b border-gym-border flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-gym-border p-0.5 bg-gray-50">
          {scopes.map((t) => (
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
            {brief.truncated && (
              <div className="border border-amber-300 bg-amber-50 rounded-xl px-4 py-3">
                <p className="text-sm font-semibold text-amber-900">This list may be incomplete</p>
                <p className="text-xs text-amber-800 mt-0.5">
                  The agent had more to report than it could return in one pass, so lower-priority
                  items may be missing. {brief.emails_scanned} emails were scanned — check the inbox
                  directly before treating this as the full picture.
                </p>
              </div>
            )}
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
                What needs your attention {activeTasks.length > 0 && `(${activeTasks.length})`}
              </button>
              <button
                type="button"
                onClick={() => setView('completed')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
                  view === 'completed' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Completed {completedTasks.length > 0 && `(${completedTasks.length})`}
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
              activeTasks.length === 0 ? (
                <div className="border border-gym-border rounded-xl p-5 text-center text-sm text-gray-500">
                  Nothing needs action right now.
                </div>
              ) : (
                <ul className="space-y-2">
                  {activeTasks.map((t, i) => (
                    <TaskCard
                      key={t.id ?? i}
                      task={t}
                      onComplete={() => {
                        applyOverride(t, { completedAt: new Date().toISOString() });
                        postTaskAction(tab, t, 'complete');
                      }}
                      onSnooze={(days) => {
                        applyOverride(t, {
                          snoozedUntil: new Date(Date.now() + days * 86400000).toISOString(),
                        });
                        postTaskAction(tab, t, 'snooze', days);
                      }}
                    />
                  ))}
                </ul>
              )
            ) : view === 'completed' ? (
              completedTasks.length === 0 ? (
                <div className="border border-gym-border rounded-xl p-5 text-center text-sm text-gray-500">
                  Nothing completed yet.
                </div>
              ) : (
                <ul className="space-y-2">
                  {completedTasks.map((t, i) => (
                    <li
                      key={t.id ?? i}
                      className="bg-gray-50 border border-gym-border rounded-xl p-4 flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-500 line-through truncate">{t.title}</p>
                        <p className="text-[11px] text-gray-400 mt-1">
                          Completed {t.completedAt ? relativeDate(t.completedAt) : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          applyOverride(t, { completedAt: null });
                          postTaskAction(tab, t, 'uncomplete');
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-gym-accent hover:underline flex-none"
                      >
                        <Undo2 size={11} strokeWidth={2.5} aria-hidden />
                        Undo
                      </button>
                    </li>
                  ))}
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

const SNOOZE_OPTIONS = [
  { label: 'Tomorrow', days: 1 },
  { label: '3 days', days: 3 },
  { label: 'Next week', days: 7 },
];

function TaskCard({
  task: t,
  onComplete,
  onSnooze,
}: {
  task: Task;
  onComplete: () => void;
  onSnooze: (days: number) => void;
}) {
  const [snoozing, setSnoozing] = useState(false);

  const flags = (t.flags ?? []).filter((f) => FLAG_META[f]);
  const hasSignals = flags.length > 0 || !!t.deadline || !!t.vip;

  const content = (
    <div className="flex items-start gap-2.5">
      <span className={`mt-1.5 w-2 h-2 rounded-full flex-none ${URGENCY[t.urgency]?.dot ?? 'bg-gray-300'}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 leading-snug">{t.title}</p>

        {/* Why it's urgent, stated rather than implied by colour alone. */}
        {hasSignals && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {flags.map((f) => {
              const { icon: Icon, label } = FLAG_META[f];
              return (
                <span
                  key={f}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded border border-rose-200 bg-rose-50 text-rose-800"
                >
                  <Icon size={11} strokeWidth={2.5} aria-hidden />
                  {label}
                </span>
              );
            })}
            {t.deadline && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-800">
                <CalendarClock size={11} strokeWidth={2.5} aria-hidden />
                {t.deadline}
              </span>
            )}
            {t.vip && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded border border-gym-border bg-gray-50 text-gray-700">
                {t.vip === 'at-risk member' ? (
                  <HeartPulse size={11} strokeWidth={2.5} aria-hidden />
                ) : (
                  <Star size={11} strokeWidth={2.5} aria-hidden />
                )}
                {VIP_LABEL[t.vip] ?? t.vip}
              </span>
            )}
          </div>
        )}

        {t.detail && <p className="text-sm text-gray-600 mt-1.5 leading-snug">{t.detail}</p>}
        {t.source && (
          <p className="text-[11px] text-gray-400 mt-1.5 truncate inline-flex items-center gap-1 max-w-full">
            <span className="truncate">{t.source}</span>
            {t.url && <ExternalLink size={11} className="text-gym-accent flex-none" aria-hidden />}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <li className={`bg-white border border-gym-border border-l-4 ${URGENCY[t.urgency]?.ring ?? 'border-l-gray-300'} rounded-xl p-4`}>
      {t.url ? (
        <a href={t.url} target="_blank" rel="noopener noreferrer" className="block hover:opacity-80 transition">
          {content}
        </a>
      ) : (
        content
      )}

      {snoozing ? (
        <div className="mt-2.5 pt-2.5 border-t border-gray-100 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-gray-500 mr-1">Remind me:</span>
          {SNOOZE_OPTIONS.map((o) => (
            <button
              key={o.days}
              type="button"
              onClick={() => {
                onSnooze(o.days);
                setSnoozing(false);
              }}
              className="text-[11px] font-medium px-2 py-1 rounded border border-gym-border text-gray-700 hover:bg-gray-50 transition"
            >
              {o.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSnoozing(false)}
            className="text-[11px] text-gray-400 hover:text-gray-600 ml-1"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-2.5 pt-2.5 border-t border-gray-100 flex items-center gap-1.5">
          <button
            type="button"
            onClick={onComplete}
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 transition"
          >
            <Check size={12} strokeWidth={2.5} aria-hidden />
            Mark complete
          </button>
          <button
            type="button"
            onClick={() => setSnoozing(true)}
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded border border-gym-border text-gray-600 hover:bg-gray-50 transition"
          >
            <Clock size={12} strokeWidth={2.5} aria-hidden />
            Remind me later
          </button>
        </div>
      )}
    </li>
  );
}

function ConnectInbox({ scope }: { scope: 'business' | 'personal' }) {
  if (scope === 'business') {
    return (
      <div className="border border-gym-border rounded-xl p-5 text-center">
        <InboxIcon size={22} className="mx-auto mb-2 text-gym-muted" aria-hidden />
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
      <InboxIcon size={22} className="mx-auto mb-2 text-gym-muted" aria-hidden />
      <p className="text-sm font-medium text-gray-800">Connect your {scope} inbox</p>
      <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
        Once connected, your agent reads it each morning and lists what needs doing here. Ask your
        admin to add the {scope} email’s app password.
      </p>
    </div>
  );
}

function MindBodyRetentionSidebar({ insights, ghl }: { insights: Insights; ghl: GhlSummary }) {
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
        {/* Active / declined / suspended are three different problems, so they
            stay three numbers — a suspended member needs a different call than
            a failed payment. */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Active" value={insights.activeMembers} />
          <Stat label="Declined" value={insights.declined ?? null} tone="warn" />
          <Stat label="Suspended" value={insights.suspended ?? null} />
        </div>

        <AttendanceWeek insights={insights} />

        <div className="grid grid-cols-2 gap-3 text-center border-t border-gym-border pt-4">
          <Stat label="At risk" value={atRiskCount} tone="warn" />
          <Stat label="Healthy" value={insights.risk.healthy} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {ghl && !ghl.mock ? (
            <div className="border border-gym-border rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-gray-900">{ghl.contacts.newThisWeek}</p>
              <p className="text-xs text-gym-muted">New leads</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Last 7 days</p>
            </div>
          ) : (
            <div className="border border-dashed border-gray-300 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-400">New leads</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Not synced yet</p>
            </div>
          )}
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

function Stat({ label, value, tone }: { label: string; value: number | null; tone?: 'warn' }) {
  return (
    <div>
      {value === null ? (
        <p className="text-2xl font-bold text-gray-300">—</p>
      ) : (
        <p className={`text-2xl font-bold ${tone === 'warn' && value > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
          {value}
        </p>
      )}
      <p className="text-[11px] text-gym-muted uppercase tracking-wider">{label}</p>
    </div>
  );
}

// Attendance on the Monday-start week Hassan reads off MindBody. The headline
// is this week so far; the comparison is the SAME elapsed slice of last week,
// never the full week, so a Tuesday can't read as a collapse.
function AttendanceWeek({ insights }: { insights: NonNullable<Insights> }) {
  const { sessionsThisWeek: now, sessionsLastWeekToDate: then, sessionsLastWeekFull: full } = insights;
  const delta = then > 0 ? Math.round(((now - then) / then) * 100) : null;
  const weekOf = new Date(insights.weekStart).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Australia/Sydney',
  });

  return (
    <div className="border border-gym-border rounded-lg p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-gym-muted">
          Attendance · week of {weekOf}
        </p>
        {delta !== null && (
          <span
            className={`text-[11px] font-semibold ${
              delta < 0 ? 'text-amber-600' : 'text-emerald-700'
            }`}
          >
            {delta > 0 ? '+' : ''}
            {delta}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-0.5">{now}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">
        vs {then} at the same point last week · {full} last week total
      </p>
    </div>
  );
}
