'use client';

import { useMemo, useState } from 'react';
import { priorityScore, type Band } from '@/lib/retention/priority';
import { daysSinceSydney } from '@/lib/retention/dates';
import LogButton, { type LogOptions } from './LogButton';
import type {
  ContactInfo,
  SnoozeInfo,
} from '@/app/api/retention/contact-state/route';

export type TodayCallsMember = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobilePhone: string;
  trendCategory: Band;
  last30d: number;
  prior30d: number;
  ghlContactId: string | null;
};

const BAND_PILL: Record<Band, string> = {
  STABLE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  SLOWING: 'bg-amber-50 text-amber-700 border-amber-200',
  SLIDING: 'bg-rose-50 text-rose-700 border-rose-200',
  STOPPED: 'bg-gray-100 text-gray-700 border-gray-200',
};

function daysSince(iso: string): number {
  return daysSinceSydney(iso) ?? 0;
}

function declinePct(last: number, prior: number): number | null {
  if (prior <= 0) return null;
  const pct = Math.round(((prior - last) / prior) * 100);
  return pct;
}

const ghlContactDetailUrl = (
  portalUrl: string,
  locationId: string,
  contactId: string,
) =>
  `${portalUrl}/v2/location/${encodeURIComponent(locationId)}/contacts/detail/${encodeURIComponent(contactId)}`;

export default function TodayCalls({
  members,
  contacts,
  snoozes,
  ghlLocationId,
  ghlPortalUrl,
  copiedId,
  actionPending,
  refreshedAt,
  totalAtRisk,
  onCopy,
  onLog,
  onSnooze,
  onSelect,
}: {
  members: TodayCallsMember[];
  contacts: Record<string, ContactInfo>;
  snoozes: Record<string, SnoozeInfo>;
  ghlLocationId: string;
  ghlPortalUrl: string;
  copiedId: string | null;
  actionPending: Set<string>;
  refreshedAt?: string;
  totalAtRisk: number;
  onCopy: (m: TodayCallsMember) => void;
  onLog: (m: TodayCallsMember, opts?: LogOptions) => void;
  onSnooze: (m: TodayCallsMember) => void;
  onSelect: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const top = useMemo(() => {
    const nowMs = Date.now();
    const sevenDaysMs = 7 * 86400000;

    const scored = members
      .filter((m) => m.trendCategory !== 'STABLE')
      .filter((m) => {
        const snooze = snoozes[m.id];
        if (snooze && new Date(snooze.snoozedUntil).getTime() > nowMs) {
          return false;
        }
        const c = contacts[m.id];
        if (c && nowMs - new Date(c.contactedAt).getTime() < sevenDaysMs) {
          return false;
        }
        return true;
      })
      .map((m) => {
        const c = contacts[m.id];
        return {
          member: m,
          score: priorityScore({
            band: m.trendCategory,
            visitsCurrent: m.last30d,
            visitsPrior: m.prior30d,
            daysSinceLastContact: c ? daysSince(c.contactedAt) : null,
          }),
        };
      });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 10).map((s) => s.member);
  }, [members, contacts, snoozes]);

  const refreshedLabel = refreshedAt
    ? new Date(refreshedAt).toLocaleTimeString('en-AU', {
        timeZone: 'Australia/Sydney',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <section className="mb-6 bg-white border border-gray-200 rounded-xl p-4 md:p-5">
      <header
        role="button"
        tabIndex={0}
        onClick={() => setCollapsed((c) => !c)}
        onKeyDown={(e) => e.key === 'Enter' && setCollapsed((c) => !c)}
        className={`flex items-end justify-between gap-3 cursor-pointer select-none ${collapsed ? '' : 'mb-4'}`}
      >
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Today&rsquo;s Calls
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {top.length} of {totalAtRisk} at-risk members
            {refreshedLabel ? ` · refreshed ${refreshedLabel}` : ''}
          </p>
        </div>
        <span className="text-xs font-medium text-gray-500 flex items-center gap-1 flex-none">
          {collapsed ? 'Show' : 'Minimise'}
          <svg
            className={`w-3.5 h-3.5 transition-transform ${collapsed ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </header>

      {collapsed ? null : top.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">
          Nothing in your inbox today. Either you&rsquo;re caught up, everyone&rsquo;s
          snoozed, or the data hasn&rsquo;t synced. Hit Refresh.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {top.map((m) => {
            const c = contacts[m.id];
            const pct = declinePct(m.last30d, m.prior30d);
            const showGhl = Boolean(
              ghlLocationId && ghlPortalUrl && m.ghlContactId,
            );
            const pending = actionPending.has(m.id);
            const copied = copiedId === m.id;

            return (
              <div
                key={m.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(m.id)}
                onKeyDown={(e) => e.key === 'Enter' && onSelect(m.id)}
                className="border border-gray-200 rounded-lg p-2 bg-gray-50 hover:bg-white hover:border-gray-300 transition cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {m.firstName} {m.lastName}
                  </p>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 ${BAND_PILL[m.trendCategory]}`}
                  >
                    {m.trendCategory}
                  </span>
                </div>

                <p className="text-xs text-gray-600 mb-1">
                  {m.prior30d} →{' '}
                  <span className="text-gray-900 font-medium">{m.last30d}</span>{' '}
                  visits
                  {pct !== null && pct > 0 && (
                    <span className="text-rose-600 font-medium">
                      {' '}
                      · -{pct}%
                    </span>
                  )}
                  {' · '}
                  {c ? `contacted ${daysSince(c.contactedAt)}d ago` : 'never contacted'}
                </p>

                <div
                  className="flex flex-wrap items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {showGhl && (
                    <a
                      href={ghlContactDetailUrl(
                        ghlPortalUrl,
                        ghlLocationId,
                        m.ghlContactId!,
                      )}
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
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
