'use client';

import { useState } from 'react';
import type { TodayCallsMember } from './TodayCalls';

export type LogOptions = { channel?: Channel; outcome?: string };
export type Channel = 'call' | 'sms' | 'in_person' | 'ghl' | 'other';

const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'call', label: 'Call' },
  { key: 'sms', label: 'SMS' },
  { key: 'in_person', label: 'In person' },
  { key: 'ghl', label: 'GHL' },
  { key: 'other', label: 'Other' },
];

// "Logged ✓" control with an inline channel + optional outcome picker.
// Rendered inline (not as an absolute popover) so it never clips inside the
// scrollable retention columns. Shared by the trend board and Today's Calls.
export default function LogButton({
  member,
  pending,
  onLog,
}: {
  member: TodayCallsMember;
  pending: boolean;
  onLog: (m: TodayCallsMember, opts?: LogOptions) => void;
}) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState('');

  function submit(channel: Channel) {
    onLog(member, {
      channel,
      outcome: outcome.trim() || undefined,
    });
    setOutcome('');
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
        className="text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 rounded border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 transition"
      >
        Logged ✓
      </button>
    );
  }

  return (
    <div className="mt-1 w-full rounded-md border border-emerald-200 bg-emerald-50/60 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800 mb-1.5">
        How did you reach them?
      </p>
      <div className="flex flex-wrap gap-1 mb-1.5">
        {CHANNELS.map((c) => (
          <button
            key={c.key}
            type="button"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              submit(c.key);
            }}
            className="text-[10px] font-medium px-2 py-1 rounded border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition"
          >
            {c.label}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={outcome}
        onChange={(e) => setOutcome(e.target.value)}
        placeholder="Outcome (optional)…"
        className="w-full text-[11px] rounded border border-gray-200 px-2 py-1 text-gray-900 placeholder:text-gray-400 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit('other');
          }
        }}
      />
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setOutcome('');
          setOpen(false);
        }}
        className="mt-1.5 text-[10px] text-gray-500 hover:text-gray-700"
      >
        Cancel
      </button>
    </div>
  );
}
