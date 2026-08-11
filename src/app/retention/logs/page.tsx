'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Band } from '@/lib/retention/priority';
import type { LogRow, LogsResponse } from '@/app/api/retention/logs/route';
import type { NoteRow, NotesResponse } from '@/app/api/retention/notes/route';
import { addNote } from '../actions';

const BAND_PILL: Record<Band, string> = {
  STABLE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  SLOWING: 'bg-amber-50 text-amber-700 border-amber-200',
  SLIDING: 'bg-rose-50 text-rose-700 border-rose-200',
  STOPPED: 'bg-gray-100 text-gray-700 border-gray-200',
};

const CHANNEL_LABEL: Record<string, string> = {
  call: 'Call',
  sms: 'SMS',
  in_person: 'In person',
  ghl: 'GHL',
  other: 'Other',
};

const mindBodyProfileUrl = (clientId: string) =>
  `https://clients.mindbodyonline.com/app/clients/${encodeURIComponent(clientId)}/client-info`;

type Preset = 7 | 30 | 90 | 0; // 0 = all time

function startOfDayIso(yyyymmdd: string): string {
  return new Date(`${yyyymmdd}T00:00:00`).toISOString();
}
function endOfDayIso(yyyymmdd: string): string {
  return new Date(`${yyyymmdd}T23:59:59`).toISOString();
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRelative(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function RetentionLogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [preset, setPreset] = useState<Preset>(30);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [staff, setStaff] = useState('all');
  const [band, setBand] = useState<'all' | Band>('all');
  const [search, setSearch] = useState('');

  // Drawer
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(
    null,
  );

  const { since, until } = useMemo(() => {
    if (from) {
      return {
        since: startOfDayIso(from),
        until: to ? endOfDayIso(to) : undefined,
      };
    }
    if (preset === 0) {
      return { since: '2020-01-01T00:00:00.000Z', until: undefined };
    }
    return {
      since: new Date(Date.now() - preset * 86400000).toISOString(),
      until: undefined,
    };
  }, [preset, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ since });
      if (until) params.set('until', until);
      const res = await fetch(`/api/retention/logs?${params.toString()}`);
      const d: LogsResponse & { error?: string } = await res.json();
      if (d.error) setError(d.error);
      else setLogs(d.logs);
    } catch {
      setError('Failed to load retention logs');
    } finally {
      setLoading(false);
    }
  }, [since, until]);

  useEffect(() => {
    load();
  }, [load]);

  const staffOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs) set.add(l.contactedByName);
    return Array.from(set).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (staff !== 'all' && l.contactedByName !== staff) return false;
      if (band !== 'all' && l.band !== band) return false;
      if (q && !l.memberName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [logs, staff, band, search]);

  const uniqueMembers = useMemo(
    () => new Set(filtered.map((l) => l.memberId)).size,
    [filtered],
  );

  function resetCustom() {
    setFrom('');
    setTo('');
  }

  return (
    <div className="p-4 md:p-8 min-h-screen bg-white">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Retention Logs</h1>
          <p className="text-gray-500 text-sm mt-1">
            Every logged contact — who was reached, by whom, how, and what
            happened. Click a name to view their history and add a note.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-6">
          <p className="text-rose-700 text-sm">{error}</p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 mr-1">
            Range
          </span>
          {([7, 30, 90, 0] as Preset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                resetCustom();
                setPreset(p);
              }}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                !from && preset === p
                  ? 'border-gym-accent bg-gym-accent text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {p === 0 ? 'All time' : `Last ${p}d`}
            </button>
          ))}
          <div className="flex items-center gap-1.5 ml-1">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="text-xs rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-gray-700"
            />
            <span className="text-gray-400 text-xs">→</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="text-xs rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-gray-700"
            />
            {from && (
              <button
                type="button"
                onClick={resetCustom}
                className="text-xs text-gray-500 hover:text-gray-700 px-1"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={staff}
            onChange={(e) => setStaff(e.target.value)}
            className="text-xs rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-gray-700"
          >
            <option value="all">All staff</option>
            {staffOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={band}
            onChange={(e) => setBand(e.target.value as 'all' | Band)}
            className="text-xs rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-gray-700"
          >
            <option value="all">All bands</option>
            <option value="STABLE">Stable</option>
            <option value="SLOWING">Slowing</option>
            <option value="SLIDING">Sliding</option>
            <option value="STOPPED">Stopped</option>
          </select>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search member name…"
            className="flex-1 min-w-[160px] text-xs rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-gray-900 placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="flex flex-wrap gap-4 mb-4 text-sm">
        <span className="text-gray-500">
          <span className="font-semibold text-gray-900">{filtered.length}</span>{' '}
          contacts
        </span>
        <span className="text-gray-500">
          <span className="font-semibold text-gray-900">{uniqueMembers}</span>{' '}
          unique members
        </span>
      </div>

      {/* Table */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Band</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3">Logged by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    No contacts logged in this range.
                  </td>
                </tr>
              ) : (
                filtered.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {formatDateTime(l.contactedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() =>
                          setSelected({ id: l.memberId, name: l.memberName })
                        }
                        className="font-medium text-gray-900 hover:text-gym-accent hover:underline transition text-left"
                      >
                        {l.memberName}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${BAND_PILL[l.band]}`}
                      >
                        {l.band}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {l.channel ? (CHANNEL_LABEL[l.channel] ?? l.channel) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[260px] truncate">
                      {l.outcome || '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {l.contactedByName}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <MemberDrawer
          memberId={selected.id}
          memberName={selected.name}
          history={logs.filter((l) => l.memberId === selected.id)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function MemberDrawer({
  memberId,
  memberName,
  history,
  onClose,
}: {
  memberId: string;
  memberName: string;
  history: LogRow[];
  onClose: () => void;
}) {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const loadNotes = useCallback(async () => {
    setLoadingNotes(true);
    try {
      const res = await fetch(
        `/api/retention/notes?memberId=${encodeURIComponent(memberId)}`,
      );
      const d: NotesResponse & { error?: string } = await res.json();
      if (!d.error) setNotes(d.notes);
    } catch {
      // best-effort
    } finally {
      setLoadingNotes(false);
    }
  }, [memberId]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  async function submit() {
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    setErr('');
    const result = await addNote({ memberId, memberName, note: text });
    if (!result.ok) {
      setErr(result.error);
    } else {
      setDraft('');
      await loadNotes();
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} aria-hidden="true" />
      <aside className="w-full max-w-md h-full bg-white shadow-xl border-l border-gray-200 flex flex-col">
        <header className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
          <div>
            <a
              href={mindBodyProfileUrl(memberId)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-lg font-bold text-gray-900 hover:text-gym-accent hover:underline"
            >
              {memberName}
            </a>
            <p className="text-xs text-gray-500 mt-0.5">
              {history.length} logged contact{history.length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 -mr-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Add note */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Add a note
            </p>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              placeholder="e.g. Left a voicemail, said they'd be back next week…"
              className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:border-gym-accent focus:ring-2 focus:ring-gray-100"
            />
            {err && <p className="text-xs text-rose-600 mt-1">{err}</p>}
            <button
              type="button"
              onClick={submit}
              disabled={saving || !draft.trim()}
              className="mt-2 px-4 py-2 bg-gym-accent text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
            >
              {saving ? 'Saving…' : 'Add note'}
            </button>
          </div>

          {/* Notes thread */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Notes
            </p>
            {loadingNotes ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : notes.length === 0 ? (
              <p className="text-sm text-gray-400">No notes yet.</p>
            ) : (
              <ul className="space-y-3">
                {notes.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                  >
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">
                      {n.note}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1.5">
                      {n.authorName} · {formatDateTime(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Contact history */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Contact history
            </p>
            {history.length === 0 ? (
              <p className="text-sm text-gray-400">No contacts in range.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-start justify-between gap-2 text-sm border-b border-gray-100 pb-2"
                  >
                    <div>
                      <p className="text-gray-800">
                        {h.channel
                          ? (CHANNEL_LABEL[h.channel] ?? h.channel)
                          : 'Contacted'}
                        {h.outcome ? ` — ${h.outcome}` : ''}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {h.contactedByName} · {formatRelative(h.contactedAt)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${BAND_PILL[h.band]}`}
                    >
                      {h.band}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
