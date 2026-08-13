'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import TodayCalls, { type TodayCallsMember } from '@/components/retention/TodayCalls';
import LogButton, { type LogOptions } from '@/components/retention/LogButton';
import { logContact, snoozeMember } from './actions';
import { daysSinceSydney } from '@/lib/retention/dates';
import type {
  ContactInfo,
  ContactStateResponse,
  SnoozeInfo,
} from '@/app/api/retention/contact-state/route';

type TrendCategory = 'STABLE' | 'SLOWING' | 'SLIDING' | 'STOPPED';
type RiskBand = 'healthy' | 'medium' | 'high';

interface RetentionMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobilePhone: string;
  trendCategory: TrendCategory;
  last30d: number;
  prior30d: number;
  last7d: number;
  prior7d: number;
  trend: number;
  ghlContactId: string | null;
  healthScore: number;
  riskBand: RiskBand;
  reasons: string[];
  daysSinceLastVisit: number | null;
  aiSummary: string | null;
}

// Health-score chip styling by band. Low score = high risk (Recovr-style).
const HEALTH_STYLE: Record<RiskBand, string> = {
  healthy: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high: 'bg-rose-50 text-rose-700 border-rose-200',
};

function daysSinceIso(iso: string): number {
  return daysSinceSydney(iso) ?? 0;
}

function snoozeDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'short',
  });
}

interface RetentionData {
  members: RetentionMember[];
  ghlLocationId?: string;
  ghlPortalUrl?: string;
  mock?: boolean;
  cached?: boolean;
  refreshing?: boolean;
  updatedAt?: string;
  error?: string;
}

const mindBodyProfileUrl = (clientId: string) =>
  `https://clients.mindbodyonline.com/app/clients/${encodeURIComponent(clientId)}/client-info`;

// Deep-link to a specific contact in the GHL whitelabel portal — one click
// from a retention card straight to the contact detail / conversation panel.
const ghlContactDetailUrl = (
  portalUrl: string,
  locationId: string,
  contactId: string,
) =>
  `${portalUrl}/v2/location/${encodeURIComponent(locationId)}/contacts/detail/${encodeURIComponent(contactId)}`;

type ColumnDef = {
  key: TrendCategory;
  label: string;
  hint: string;
  text: string;
  bar: string;
  pill: string;
  headerBg: string;
  headerText: string;
  headerPill: string;
};

const COLUMN_DEFS: ColumnDef[] = [
  {
    key: 'STABLE',
    label: 'Stable',
    hint: 'Holding pace vs. last month',
    text: 'text-emerald-700',
    bar: 'bg-emerald-500',
    pill: 'bg-emerald-50 text-emerald-700',
    headerBg: 'bg-emerald-600',
    headerText: 'text-white',
    headerPill: 'bg-white/20 text-white',
  },
  {
    key: 'SLOWING',
    label: 'Slowing',
    hint: 'Early warning · down 15–45%',
    text: 'text-amber-700',
    bar: 'bg-amber-500',
    pill: 'bg-amber-50 text-amber-700',
    headerBg: 'bg-amber-500',
    headerText: 'text-white',
    headerPill: 'bg-white/25 text-white',
  },
  {
    key: 'SLIDING',
    label: 'Sliding',
    hint: 'At risk · down 45–75%',
    text: 'text-rose-700',
    bar: 'bg-rose-500',
    pill: 'bg-rose-50 text-rose-700',
    headerBg: 'bg-rose-600',
    headerText: 'text-white',
    headerPill: 'bg-white/20 text-white',
  },
  {
    key: 'STOPPED',
    label: 'Stopped',
    hint: 'Down 75%+ or zero visits',
    text: 'text-gray-700',
    bar: 'bg-gray-400',
    pill: 'bg-gray-100 text-gray-700',
    headerBg: 'bg-gray-700',
    headerText: 'text-white',
    headerPill: 'bg-white/20 text-white',
  },
];

function trendLabel(m: RetentionMember): string {
  if (m.last30d === 0) return 'No visits in 30d';
  if (m.prior30d === 0) return 'New activity';
  const pct = Math.round((m.trend - 1) * 100);
  if (pct === 0) return 'Same as last month';
  return pct > 0 ? `↑ ${pct}% vs last month` : `↓ ${Math.abs(pct)}% vs last month`;
}

function MemberCard({
  member,
  col,
  copied,
  ghlLocationId,
  ghlPortalUrl,
  contact,
  snooze,
  pending,
  onCopy,
  onLog,
  onSnooze,
  onSelect,
}: {
  member: RetentionMember;
  col: ColumnDef;
  copied: boolean;
  ghlLocationId: string;
  ghlPortalUrl: string;
  contact: ContactInfo | undefined;
  snooze: SnoozeInfo | undefined;
  pending: boolean;
  onCopy: (m: RetentionMember) => void;
  onLog: (m: TodayCallsMember, opts?: LogOptions) => void;
  onSnooze: (m: TodayCallsMember) => void;
  onSelect: (id: string) => void;
}) {
  // Bar fill: 100% = held pace, less than 100% = decline, more = growth.
  // Cap at 100% so growth doesn't visually swamp the column.
  const barPct = Math.min(Math.round(member.trend * 100), 100);
  const showGhl = Boolean(
    ghlLocationId && ghlPortalUrl && member.ghlContactId,
  );

  const isSnoozed =
    snooze && new Date(snooze.snoozedUntil).getTime() > Date.now();
  const contactDays =
    contact && daysSinceIso(contact.contactedAt) <= 14
      ? daysSinceIso(contact.contactedAt)
      : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(member.id)}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(member.id)}
      className="bg-white border border-gray-200 rounded-lg p-3 mb-2 hover:border-gray-300 hover:shadow-sm transition cursor-pointer"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-gray-900 text-sm font-medium truncate flex-1">
          {member.firstName} {member.lastName}
        </p>
        <div className="flex items-center gap-1 shrink-0">
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${HEALTH_STYLE[member.riskBand]}`}
            title={`Health score ${member.healthScore}/100 · ${member.riskBand} risk${member.reasons[0] ? ` · ${member.reasons[0]}` : ''}`}
          >
            {member.healthScore}
          </span>
          {showGhl && (
            <a
              href={ghlContactDetailUrl(
                ghlPortalUrl,
                ghlLocationId,
                member.ghlContactId!,
              )}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in GHL"
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition"
            >
              GHL
            </a>
          )}
          {member.mobilePhone && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCopy(member);
              }}
              title={copied ? 'Copied' : `Copy ${member.mobilePhone}`}
              className={`text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 rounded border transition ${
                copied
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs text-gray-500">
          {member.prior30d} → <span className="text-gray-900 font-medium">{member.last30d}</span> visits
        </p>
        <p className={`text-xs font-semibold ${col.text}`}>{trendLabel(member)}</p>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${col.bar} transition-all`}
          style={{ width: `${Math.max(barPct, 2)}%` }}
        />
      </div>
      {(member.aiSummary || member.reasons[0]) && (
        <p className="text-[11px] text-gray-600 mt-2 leading-snug">
          {member.aiSummary ?? member.reasons[0]}
        </p>
      )}
      {(isSnoozed || contactDays !== null) && (
        <p className="text-[10px] text-gray-500 mt-1.5">
          {isSnoozed
            ? `Snoozed until ${snoozeDateLabel(snooze!.snoozedUntil)} by ${snooze!.snoozedByName}`
            : `Last contact: ${contactDays}d ago by ${contact!.contactedByName}`}
        </p>
      )}
      <div
        className="flex flex-wrap items-start gap-1 mt-2"
        onClick={(e) => e.stopPropagation()}
      >
        <LogButton member={member} pending={pending} onLog={onLog} />
        <button
          type="button"
          disabled={pending}
          onClick={(e) => {
            e.preventDefault();
            onSnooze(member);
          }}
          className="text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition"
        >
          Snooze 7d
        </button>
      </div>
    </div>
  );
}

function DrawerStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function MemberDrawer({
  member,
  contact,
  snooze,
  ghlLocationId,
  ghlPortalUrl,
  copied,
  pending,
  onCopy,
  onLog,
  onSnooze,
  onClose,
}: {
  member: RetentionMember;
  contact: ContactInfo | undefined;
  snooze: SnoozeInfo | undefined;
  ghlLocationId: string;
  ghlPortalUrl: string;
  copied: boolean;
  pending: boolean;
  onCopy: (m: RetentionMember) => void;
  onLog: (m: TodayCallsMember, opts?: LogOptions) => void;
  onSnooze: (m: TodayCallsMember) => void;
  onClose: () => void;
}) {
  const showGhl = Boolean(ghlLocationId && ghlPortalUrl && member.ghlContactId);
  const isSnoozed = snooze && new Date(snooze.snoozedUntil).getTime() > Date.now();

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {member.firstName} {member.lastName}
            </h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded border ${HEALTH_STYLE[member.riskBand]}`}
              >
                {member.healthScore}/100 · {member.riskBand}
              </span>
              <span className="text-xs text-gray-400 uppercase font-semibold tracking-wide">
                {member.trendCategory}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none flex-none"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex flex-wrap gap-2">
            <a
              href={mindBodyProfileUrl(member.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
            >
              Open MindBody profile ↗
            </a>
            {showGhl && (
              <a
                href={ghlContactDetailUrl(ghlPortalUrl, ghlLocationId, member.ghlContactId!)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition"
              >
                Open in GHL ↗
              </a>
            )}
          </div>

          {member.aiSummary && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                AI summary
              </p>
              <p className="text-sm text-gray-800 leading-relaxed">{member.aiSummary}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <DrawerStat label="Visits (30d)" value={`${member.prior30d} → ${member.last30d}`} />
            <DrawerStat label="Visits (7d)" value={`${member.prior7d} → ${member.last7d}`} />
            <DrawerStat
              label="Days since last visit"
              value={member.daysSinceLastVisit ?? '—'}
            />
            <DrawerStat label="Trend" value={trendLabel(member)} />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Contact status
            </p>
            {isSnoozed ? (
              <p className="text-sm text-gray-600">
                Snoozed until {snoozeDateLabel(snooze!.snoozedUntil)} by {snooze!.snoozedByName}
              </p>
            ) : contact ? (
              <p className="text-sm text-gray-600">
                Last contacted {daysSinceIso(contact.contactedAt)}d ago by{' '}
                {contact.contactedByName}
              </p>
            ) : (
              <p className="text-sm text-gray-400">Never contacted</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-200">
            {member.mobilePhone && (
              <button
                type="button"
                onClick={() => onCopy(member)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                  copied
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {copied ? 'Copied' : `Copy ${member.mobilePhone}`}
              </button>
            )}
            <LogButton member={member} pending={pending} onLog={onLog} />
            <button
              type="button"
              disabled={pending}
              onClick={() => onSnooze(member)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition"
            >
              Snooze 7d
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RetentionPage() {
  const [data, setData] = useState<RetentionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<Set<RiskBand>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [contactState, setContactState] = useState<ContactStateResponse>({
    contacts: {},
    snoozes: {},
  });
  const [actionPending, setActionPending] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/mindbody/retention${refresh ? '?refresh=true' : ''}`,
      );
      const d: RetentionData = await res.json();
      if (d.error) setError(d.error);
      else setData(d);
    } catch {
      setError('Failed to connect to retention API');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadContactState = useCallback(async () => {
    try {
      const res = await fetch('/api/retention/contact-state');
      if (!res.ok) return;
      const d = (await res.json()) as ContactStateResponse;
      setContactState(d);
    } catch {
      // Best-effort — badges and Today's Calls degrade gracefully without it.
    }
  }, []);

  useEffect(() => {
    load();
    loadContactState();
  }, [load, loadContactState]);

  const markPending = useCallback((memberId: string, on: boolean) => {
    setActionPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(memberId);
      else next.delete(memberId);
      return next;
    });
  }, []);

  const handleLog = useCallback(
    async (m: TodayCallsMember, opts?: LogOptions) => {
      markPending(m.id, true);
      try {
        const result = await logContact({
          memberId: m.id,
          memberName: `${m.firstName} ${m.lastName}`.trim(),
          band: m.trendCategory,
          channel: opts?.channel,
          outcome: opts?.outcome,
        });
        if (!result.ok) {
          setError(result.error);
        } else {
          await loadContactState();
        }
      } finally {
        markPending(m.id, false);
      }
    },
    [loadContactState, markPending],
  );

  const handleSnooze = useCallback(
    async (m: TodayCallsMember) => {
      markPending(m.id, true);
      try {
        const result = await snoozeMember({ memberId: m.id, days: 7 });
        if (!result.ok) {
          setError(result.error);
        } else {
          await loadContactState();
        }
      } finally {
        markPending(m.id, false);
      }
    },
    [loadContactState, markPending],
  );

  const members = data?.members ?? [];
  const selectedMember = members.find((m) => m.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (q && !`${m.firstName} ${m.lastName}`.toLowerCase().includes(q)) return false;
      if (riskFilter.size > 0 && !riskFilter.has(m.riskBand)) return false;
      return true;
    });
  }, [members, search, riskFilter]);

  const grouped = useMemo(() => {
    const groups: Record<TrendCategory, RetentionMember[]> = {
      STABLE: [],
      SLOWING: [],
      SLIDING: [],
      STOPPED: [],
    };
    for (const m of filtered) groups[m.trendCategory].push(m);
    // Worst trend first within each column — the steepest decline at the top.
    for (const cat of Object.keys(groups) as TrendCategory[]) {
      groups[cat].sort((a, b) => a.trend - b.trend);
    }
    return groups;
  }, [filtered]);

  async function copyPhone(m: TodayCallsMember) {
    if (!m.mobilePhone) return;
    try {
      await navigator.clipboard.writeText(m.mobilePhone);
      setCopiedId(m.id);
      setTimeout(
        () => setCopiedId((id) => (id === m.id ? null : id)),
        1500,
      );
    } catch {
      // clipboard blocked — ignore silently
    }
  }

  return (
    <div className="p-4 md:p-8 min-h-screen bg-white">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Retention</h1>
          <p className="text-gray-500 text-sm mt-1">
            Active members grouped by attendance trend (last 30d vs. prior 30d) · click a name to open their MindBody profile
          </p>
        </div>
        <span
          className={`text-xs px-3 py-1 rounded-full font-medium ${
            loading
              ? 'bg-amber-50 text-amber-700'
              : error
                ? 'bg-rose-50 text-rose-700'
                : data?.mock
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {loading
            ? 'Loading…'
            : error
              ? 'Error'
              : data?.mock
                ? 'No API Key'
                : 'Live'}
        </span>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-6">
          <p className="text-rose-700 text-sm">{error}</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members by name…"
          className="flex-1 bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-100"
        />
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing || loading}
          className="px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <Link
          href="/retention/logs"
          className="px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gym-accent hover:bg-gray-50 hover:border-gray-300 transition whitespace-nowrap text-center"
        >
          View Logs →
        </Link>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-6 text-xs">
        <span className="text-gray-400 uppercase tracking-wider font-semibold mr-1">
          Risk
        </span>
        {(['high', 'medium', 'healthy'] as RiskBand[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() =>
              setRiskFilter((prev) => {
                const next = new Set(prev);
                if (next.has(r)) next.delete(r);
                else next.add(r);
                return next;
              })
            }
            className={`px-2.5 py-1 rounded-full border capitalize transition ${
              riskFilter.has(r)
                ? HEALTH_STYLE[r]
                : 'border-gray-200 text-gray-400 hover:text-gray-600'
            }`}
          >
            {r}
          </button>
        ))}
        {riskFilter.size > 0 && (
          <button
            type="button"
            onClick={() => setRiskFilter(new Set())}
            className="text-gym-accent hover:underline ml-1"
          >
            Clear
          </button>
        )}
      </div>

      {!loading && members.length > 0 && (
        <TodayCalls
          members={filtered}
          contacts={contactState.contacts}
          snoozes={contactState.snoozes}
          ghlLocationId={data?.ghlLocationId ?? ''}
          ghlPortalUrl={data?.ghlPortalUrl ?? ''}
          copiedId={copiedId}
          actionPending={actionPending}
          refreshedAt={data?.updatedAt}
          totalAtRisk={
            filtered.filter((m) => m.trendCategory !== 'STABLE').length
          }
          onCopy={copyPhone}
          onLog={handleLog}
          onSnooze={handleSnooze}
          onSelect={setSelectedId}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {COLUMN_DEFS.map((col) => {
          const list = grouped[col.key];
          return (
            <section
              key={col.key}
              className="bg-gray-50 border border-gray-200 rounded-xl flex flex-col min-h-[40vh] max-h-[78vh]"
            >
              <header className={`px-4 py-3 rounded-t-xl ${col.headerBg}`}>
                <div className="flex items-center justify-between">
                  <h2
                    className={`text-sm font-semibold uppercase tracking-wider ${col.headerText}`}
                  >
                    {col.label}
                  </h2>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${col.headerPill}`}
                  >
                    {list.length}
                  </span>
                </div>
                <p className={`text-[11px] mt-0.5 ${col.headerText} opacity-80`}>{col.hint}</p>
              </header>
              <div className="flex-1 overflow-y-auto p-3 scroll-smooth">
                {loading ? (
                  <p className="text-gray-400 text-xs text-center py-8">
                    Loading…
                  </p>
                ) : list.length === 0 ? (
                  <p className="text-gray-400 text-xs text-center py-8">
                    No members
                  </p>
                ) : (
                  list.map((m) => (
                    <MemberCard
                      key={m.id}
                      member={m}
                      col={col}
                      copied={copiedId === m.id}
                      ghlLocationId={data?.ghlLocationId ?? ''}
                      ghlPortalUrl={data?.ghlPortalUrl ?? ''}
                      contact={contactState.contacts[m.id]}
                      snooze={contactState.snoozes[m.id]}
                      pending={actionPending.has(m.id)}
                      onCopy={copyPhone}
                      onLog={handleLog}
                      onSnooze={handleSnooze}
                      onSelect={setSelectedId}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      {selectedMember && (
        <MemberDrawer
          member={selectedMember}
          contact={contactState.contacts[selectedMember.id]}
          snooze={contactState.snoozes[selectedMember.id]}
          ghlLocationId={data?.ghlLocationId ?? ''}
          ghlPortalUrl={data?.ghlPortalUrl ?? ''}
          copied={copiedId === selectedMember.id}
          pending={actionPending.has(selectedMember.id)}
          onCopy={copyPhone}
          onLog={handleLog}
          onSnooze={handleSnooze}
          onClose={() => setSelectedId(null)}
        />
      )}

      {!loading && data?.updatedAt && (
        <p className="text-gray-400 text-xs text-center mt-8">
          Last updated:{' '}
          {new Date(data.updatedAt).toLocaleString('en-AU', {
            timeZone: 'Australia/Sydney',
          })}
          {data.refreshing && ' · Refreshing…'}
        </p>
      )}
    </div>
  );
}
