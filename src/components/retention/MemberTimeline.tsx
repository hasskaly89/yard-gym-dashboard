'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CalendarCheck,
  CalendarClock,
  CalendarX,
  Ban,
  Phone,
  StickyNote,
  Package,
  PackageX,
  Activity,
  UserPlus,
} from 'lucide-react';
import type { TimelineKind, TimelineResponse } from '@/app/api/retention/timeline/route';
import { addNote } from '@/app/retention/actions';

// The member's history as one feed, newest first, with a notes box at the top.
// Lives in the drawer so what you learn is next to what you do.

const ICON: Record<TimelineKind, typeof CalendarCheck> = {
  attended: CalendarCheck,
  booked: CalendarClock,
  no_show: CalendarX,
  late_cancelled: Ban,
  contact: Phone,
  note: StickyNote,
  package_start: Package,
  package_end: PackageX,
  band_change: Activity,
  joined: UserPlus,
};

// Status colours as data encoding only (DESIGN.md).
const TONE: Record<TimelineKind, string> = {
  attended: 'text-emerald-600',
  booked: 'text-sky-600',
  no_show: 'text-rose-600',
  late_cancelled: 'text-amber-600',
  contact: 'text-gray-700',
  note: 'text-gray-700',
  package_start: 'text-gray-500',
  package_end: 'text-gray-500',
  band_change: 'text-gray-500',
  joined: 'text-gray-500',
};

function when(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit' });
  return time === '12:00 am' ? date : `${date} · ${time}`;
}

export default function MemberTimeline({
  memberId,
  memberName,
}: {
  memberId: string;
  memberName: string;
}) {
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch(`/api/retention/timeline?memberId=${encodeURIComponent(memberId)}`);
      const d = await res.json();
      if (d.error) setError(d.error);
      else setData(d);
    } catch {
      setError('Could not load history');
    }
  }, [memberId]);

  useEffect(() => {
    setData(null);
    setShowAll(false);
    load();
  }, [load]);

  async function submitNote() {
    const text = note.trim();
    if (!text) return;
    setSaving(true);
    try {
      const res = await addNote({ memberId, memberName, note: text });
      if (!res.ok) setError(res.error);
      else {
        setNote('');
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  const events = data?.events ?? [];
  const visible = showAll ? events : events.slice(0, 30);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
        Timeline
        {data && (
          <span className="font-normal normal-case tracking-normal">
            {' · '}{data.totalAttended} sessions all time
          </span>
        )}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitNote();
        }}
        className="flex gap-2 mb-3"
      >
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note…"
          maxLength={2000}
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
        <button
          type="submit"
          disabled={saving || !note.trim()}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition"
        >
          {saving ? 'Saving…' : 'Add'}
        </button>
      </form>

      {error && <p className="text-sm text-rose-600 mb-2">{error}</p>}

      {!data ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-gray-400">Nothing in the last six months.</p>
      ) : (
        <ul>
          {visible.map((ev, i) => {
            const Icon = ICON[ev.kind];
            return (
              <li key={`${ev.kind}-${ev.at}-${i}`} className="flex gap-2.5 py-1.5 border-b border-gray-100 last:border-0">
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${TONE[ev.kind]}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800 leading-snug">
                    <span className="font-medium">{ev.title}</span>
                    {ev.detail && ev.kind !== 'note' && (
                      <span className="text-gray-500"> · {ev.detail}</span>
                    )}
                  </p>
                  {ev.kind === 'note' && ev.detail && (
                    <p className="text-sm text-gray-700 whitespace-pre-wrap mt-0.5">{ev.detail}</p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {when(ev.at)}
                    {ev.by ? ` · ${ev.by}` : ''}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {data && events.length > 30 && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 text-xs font-medium text-gray-600 hover:text-gray-900"
        >
          Show all {events.length}
        </button>
      )}
    </div>
  );
}
