'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

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
};
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

function activeTaskCount(brief: Brief): number {
  if (!brief || !Array.isArray(brief.tasks)) return 0;
  const now = Date.now();
  return (brief.tasks as Task[]).filter(
    (t) => !t.completedAt && !(t.snoozedUntil && new Date(t.snoozedUntil).getTime() > now),
  ).length;
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
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          <div className="space-y-6">
            <DeskTiles data={data} />
            <InboxCard data={data} />
            <MindBodyRetentionSidebar insights={data?.insights ?? null} />
          </div>
          <div className="xl:sticky xl:top-8">
            <ChatPanel data={data} />
          </div>
        </div>
      )}
    </div>
  );
}

function DeskTiles({ data }: { data: DashboardData | null }) {
  const inboxCount = activeTaskCount(data?.briefs.business ?? null) + activeTaskCount(data?.briefs.personal ?? null);
  const atRiskCount = data?.insights ? data.insights.risk.high + data.insights.risk.medium : 0;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-gym-muted mb-2">Your Desk</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <DeskTile label="Inbox" value={inboxCount} sub="need you" href="#inbox" />
        <DeskTile label="Retention" value={atRiskCount} sub="to call" href="/retention" tone="warn" />
        <DeskTile label="Marketing" value={null} sub="not connected" href="/meta-ads" />
        <DeskTile label="Leads" value={null} sub="not synced" href="/gohighlevel" />
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

type ChatMsg = { role: 'user' | 'assistant'; content: string };

function buildOpeningMessage(data: DashboardData | null): string {
  if (!data) return "Loading today's picture…";
  const lines: string[] = [];
  const bizTasks = activeTaskCount(data.briefs.business);
  const persTasks = activeTaskCount(data.briefs.personal);
  const atRisk = data.insights ? data.insights.risk.high + data.insights.risk.medium : 0;
  const topAtRisk = data.insights?.atRisk?.[0];

  if (topAtRisk) {
    lines.push(`${topAtRisk.name} is flagged high retention risk — worth a call today.`);
  }
  if (bizTasks > 0) lines.push(`${bizTasks} business task${bizTasks === 1 ? '' : 's'} need your attention.`);
  if (persTasks > 0) lines.push(`${persTasks} personal task${persTasks === 1 ? '' : 's'} waiting on you.`);
  if (atRisk > 0) lines.push(`${atRisk} members flagged at risk overall.`);

  if (lines.length === 0) {
    return "Nothing urgent on the board right now — you're caught up. ✅";
  }
  const numbered = lines.slice(0, 4).map((l, i) => `${i + 1}. ${l}`).join('\n');
  return `Here's where things stand today:\n\n${numbered}\n\nAsk me anything, or head to the tiles to chip away at it.`;
}

function ChatPanel({ data }: { data: DashboardData | null }) {
  const [messages, setMessages] = useState<ChatMsg[] | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (data && messages === null) {
      setMessages([{ role: 'assistant', content: buildOpeningMessage(data) }]);
    }
  }, [data, messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const history = messages ?? [];
    const next = [...history, { role: 'user' as const, content: trimmed }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const res = await fetch('/api/dashboard/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history }),
      });
      const json = await res.json();
      setMessages([...next, { role: 'assistant', content: json.reply ?? json.error ?? 'No reply.' }]);
    } catch {
      setMessages([...next, { role: 'assistant', content: "Couldn't reach the assistant — try again." }]);
    } finally {
      setSending(false);
    }
  }

  const topTask =
    (Array.isArray(data?.briefs.business?.tasks) ? (data!.briefs.business!.tasks as Task[]) : []).find(
      (t) => !t.completedAt,
    ) ?? null;
  const topAtRisk = data?.insights?.atRisk?.[0];

  const chips = [
    topTask && { label: `Follow up: ${topTask.title}`, msg: `What's the situation with "${topTask.title}"?` },
    topAtRisk && { label: `Call ${topAtRisk.name.split(' ')[0]}`, msg: `Why should I call ${topAtRisk.name}?` },
    { label: 'What needs attention this week?', msg: 'What needs my attention this week?' },
  ].filter(Boolean) as { label: string; msg: string }[];

  return (
    <div className="bg-white border border-gym-border rounded-xl overflow-hidden flex flex-col h-[calc(100vh-180px)] min-h-[500px]">
      <div className="px-5 py-3 border-b border-gym-border">
        <h2 className="text-sm font-semibold text-gray-900">Chat</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {(messages ?? []).map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-line ${
                m.role === 'user'
                  ? 'bg-gym-accent text-white'
                  : 'bg-gray-50 border border-gym-border text-gray-800'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-gray-50 border border-gym-border rounded-xl px-4 py-2.5 text-sm text-gray-400">
              Thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="px-5 pb-3 flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => send(c.msg)}
            disabled={sending}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gym-border text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
          >
            {c.label}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="p-4 border-t border-gym-border flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about today, or tell it to do something…"
          disabled={sending}
          className="flex-1 bg-gray-50 border border-gym-border rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:ring-1 focus:ring-gray-200 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="px-4 py-2 rounded-lg bg-gym-accent text-white text-sm font-medium hover:bg-gym-accent-hover transition disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
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
                  Nothing needs action right now. ✅
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
                        className="text-[11px] font-medium text-gym-accent hover:underline flex-none"
                      >
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

  const content = (
    <div className="flex items-start gap-2">
      <span className={`mt-1.5 w-2 h-2 rounded-full flex-none ${URGENCY[t.urgency]?.dot ?? 'bg-gray-300'}`} />
      <div className="min-w-0 flex-1">
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
            className="text-[11px] font-medium px-2 py-1 rounded border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 transition"
          >
            Mark complete
          </button>
          <button
            type="button"
            onClick={() => setSnoozing(true)}
            className="text-[11px] font-medium px-2 py-1 rounded border border-gym-border text-gray-600 hover:bg-gray-50 transition"
          >
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
