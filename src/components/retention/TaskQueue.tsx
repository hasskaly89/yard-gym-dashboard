'use client';

import { useMemo, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { buildQueues, QUEUE_LABELS, type QueueKey, type QueueMember } from '@/lib/retention/queues';
import { daysSinceSydney } from '@/lib/retention/dates';
import { bookingWhen } from '@/lib/retention/reasons';
import { HEALTH_STYLE } from './bands';
import LogButton, { type LogOptions } from './LogButton';
import type {
  Assignee,
  AssignmentInfo,
  ContactInfo,
  SnoozeInfo,
} from '@/app/api/retention/contact-state/route';

export type { QueueMember };

const QUEUE_ORDER: QueueKey[] = ['high', 'medium', 'conversions', 'renewals', 'assigned'];

const ghlContactDetailUrl = (portalUrl: string, locationId: string, contactId: string) =>
  `${portalUrl}/v2/location/${encodeURIComponent(locationId)}/contacts/detail/${encodeURIComponent(contactId)}`;

function lastActivity(days: number | null): string {
  if (days === null) return 'no visits';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 60) return `${days} days ago`;
  if (days < 365) return `about ${Math.round(days / 30)} months ago`;
  return 'over a year ago';
}

// Recovr's Conversions/Renewals progress block: sessions used of total, and
// time elapsed of the package.
function ProgressBars({ m, nowMs }: { m: QueueMember; nowMs: number }) {
  const ms = m.membership;
  if (!ms) return null;
  const hasSessions = ms.totalSessions !== null && ms.remainingSessions !== null && ms.totalSessions > 0;
  const used = hasSessions ? ms.totalSessions! - ms.remainingSessions! : 0;
  const sessionsPct = hasSessions ? Math.min(100, Math.round((used / ms.totalSessions!) * 100)) : 0;
  const start = ms.activeDate ? Date.parse(ms.activeDate) : null;
  const end = ms.expirationDate ? Date.parse(ms.expirationDate) : null;
  const timePct =
    start !== null && end !== null && end > start
      ? Math.max(0, Math.min(100, Math.round(((nowMs - start) / (end - start)) * 100)))
      : null;
  const days = ms.daysToExpiry;

  return (
    <div className="mt-1.5 space-y-1">
      {hasSessions && (
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <span className="w-12 shrink-0">Sessions</span>
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gray-400" style={{ width: `${sessionsPct}%` }} />
          </div>
          <span className="tabular-nums shrink-0">{used} / {ms.totalSessions}</span>
        </div>
      )}
      {timePct !== null && (
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <span className="w-12 shrink-0">Time</span>
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gray-400" style={{ width: `${timePct}%` }} />
          </div>
          <span className="tabular-nums shrink-0">
            {days === null ? '' : days < 0 ? 'expired' : days === 0 ? 'today' : days === 1 ? '1 day' : `${days} days`}
          </span>
        </div>
      )}
    </div>
  );
}

export default function TaskQueue({
  members,
  contacts,
  snoozes,
  assignments,
  assignees,
  currentUserId,
  ghlLocationId,
  ghlPortalUrl,
  copiedId,
  actionPending,
  refreshedAt,
  onCopy,
  onLog,
  onSnooze,
  onAssign,
  onSelect,
}: {
  members: QueueMember[];
  contacts: Record<string, ContactInfo>;
  snoozes: Record<string, SnoozeInfo>;
  assignments: Record<string, AssignmentInfo>;
  assignees: Assignee[];
  currentUserId: string | null;
  ghlLocationId: string;
  ghlPortalUrl: string;
  copiedId: string | null;
  actionPending: Set<string>;
  refreshedAt?: string;
  onCopy: (m: QueueMember) => void;
  onLog: (m: QueueMember, opts?: LogOptions) => void;
  onSnooze: (m: QueueMember) => void;
  onAssign: (m: QueueMember, assignee: Assignee | null) => void;
  onSelect: (id: string) => void;
}) {
  const [active, setActive] = useState<QueueKey>('high');
  const nowMs = Date.now();

  const queues = useMemo(
    () => buildQueues({ members, contacts, snoozes, assignments, currentUserId, nowMs }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [members, contacts, snoozes, assignments, currentUserId],
  );
  const list = queues[active];

  const refreshedLabel = refreshedAt
    ? new Date(refreshedAt).toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <section className="mb-6 bg-white border border-gray-200 rounded-xl">
      <header className="flex items-end justify-between gap-3 px-4 md:px-5 pt-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">My Tasks</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Worst score first · snoozed and contacted-this-week members are held back
            {refreshedLabel ? ` · refreshed ${refreshedLabel}` : ''}
          </p>
        </div>
      </header>

      <div className="flex gap-1 px-4 md:px-5 mt-3 border-b border-gray-200 overflow-x-auto">
        {QUEUE_ORDER.map((key) => {
          const isActive = key === active;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActive(key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition ${
                isActive
                  ? 'border-gray-900 text-gray-900 font-semibold'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {QUEUE_LABELS[key]}
              <span
                className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums ${
                  isActive ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {queues[key].length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="p-4 md:p-5">
        {list.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">
            {active === 'conversions'
              ? 'No members on an intro offer or class pack in the synced data.'
              : active === 'assigned'
                ? 'Nobody is assigned. Use Assign on any card.'
                : 'Nothing here — everyone is either fine, snoozed, or contacted this week.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {list.map((m) => {
              const c = contacts[m.id];
              const a = assignments[m.id];
              const showGhl = Boolean(ghlLocationId && ghlPortalUrl && m.ghlContactId);
              const pending = actionPending.has(m.id);
              const copied = copiedId === m.id;
              const showProgress = active === 'conversions' || active === 'renewals';

              return (
                <div
                  key={m.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(m.id)}
                  onKeyDown={(e) => e.key === 'Enter' && onSelect(m.id)}
                  className="border border-gray-200 rounded-lg p-2.5 bg-gray-50 hover:bg-white hover:border-gray-300 transition cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {m.firstName} {m.lastName}
                    </p>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 tabular-nums ${HEALTH_STYLE[m.riskBand]}`}
                      title={`Health score ${m.healthScore}/100 · ${m.riskBand}`}
                    >
                      {m.healthScore}
                    </span>
                  </div>

                  <p className="text-xs text-gray-700 mt-1 leading-snug">{m.reason}</p>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[11px] text-gray-500">
                    <span>{lastActivity(m.daysSinceLastVisit)}</span>
                    {m.nextBookingAt && (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CalendarCheck className="w-3 h-3" aria-hidden />
                        {bookingWhen(m.nextBookingAt, nowMs)}
                      </span>
                    )}
                    {c && <span>· contacted {daysSinceSydney(c.contactedAt) ?? 0}d ago</span>}
                    {a && <span>· {a.assignedToName}</span>}
                  </div>

                  {showProgress && <ProgressBars m={m} nowMs={nowMs} />}

                  <div
                    className="flex flex-wrap items-center gap-1 mt-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {showGhl && (
                      <a
                        href={ghlContactDetailUrl(ghlPortalUrl, ghlLocationId, m.ghlContactId!)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-medium tracking-wide uppercase px-2 py-1 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition"
                      >
                        GHL
                      </a>
                    )}
                    {m.mobilePhone && (
                      <button
                        type="button"
                        onClick={() => onCopy(m)}
                        className={`text-[10px] font-medium tracking-wide uppercase px-2 py-1 rounded border transition ${
                          copied
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    )}
                    <LogButton member={m} pending={pending} onLog={onLog} />
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => onSnooze(m)}
                      className="text-[10px] font-medium tracking-wide uppercase px-2 py-1 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition"
                    >
                      Snooze 7d
                    </button>
                    <select
                      aria-label="Assign to"
                      disabled={pending}
                      value={a?.assignedTo ?? ''}
                      onChange={(e) => {
                        const who = assignees.find((p) => p.id === e.target.value) ?? null;
                        onAssign(m, who);
                      }}
                      className="text-[10px] font-medium tracking-wide uppercase px-1.5 py-1 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition"
                    >
                      <option value="">Assign</option>
                      {assignees.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
