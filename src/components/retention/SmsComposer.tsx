'use client';

import { useState } from 'react';
import { MessageSquareText, Sparkles } from 'lucide-react';
import { draftSms, sendSms, type DraftResult } from '@/app/retention/actions';
import { DRAFT_CATEGORY_LABEL } from '@/lib/ai/draft-message';
import type { Band } from './bands';

// Draft → edit → send, inside the drawer. Recovr's composer, minus the parts
// that were theatre. The draft is a starting point a human rewrites; the send
// is one explicit click; the result says what actually happened, including
// "not delivered — this isn't production", because that is the truth on a
// laptop and the member must not be told otherwise.

export type ComposerMember = {
  id: string;
  firstName: string;
  lastName: string;
  mobilePhone: string;
  ghlContactId: string | null;
  riskBand: string;
  trendCategory: Band;
  daysSinceLastVisit: number | null;
  totalVisitCount: number;
  last56d: number;
  prior56d: number;
  nextBookingAt: string | null;
  membership: { name: string; kind: string; daysToExpiry: number | null } | null;
};

const SEGMENT = 160;

export default function SmsComposer({
  member,
  onSent,
}: {
  member: ComposerMember;
  onSent: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [busy, setBusy] = useState<'draft' | 'send' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  const canSend = Boolean(member.ghlContactId);

  async function doDraft() {
    setBusy('draft');
    setNotice(null);
    try {
      const r = await draftSms({
        memberId: member.id,
        firstName: member.firstName,
        band: member.riskBand,
        daysSinceLastVisit: member.daysSinceLastVisit,
        totalVisitCount: member.totalVisitCount,
        last56: member.last56d,
        prior56: member.prior56d,
        nextBookingAt: member.nextBookingAt,
        packageName: member.membership?.name ?? null,
        packageEndsInDays: member.membership?.daysToExpiry ?? null,
        isIntro: member.membership?.kind === 'intro' || member.membership?.kind === 'class_pack',
        ghlContactId: member.ghlContactId,
      });
      if (!r.ok) {
        setNotice({ tone: 'err', text: r.error });
        return;
      }
      setDraft(r.data);
      setText(r.data.text);
      if (r.data.optedOut) {
        setNotice({ tone: 'warn', text: 'This member has texted STOP. The draft is here for a call, not a send.' });
      }
    } finally {
      setBusy(null);
    }
  }

  async function doSend() {
    if (!member.ghlContactId) return;
    setBusy('send');
    setNotice(null);
    try {
      const r = await sendSms({
        memberId: member.id,
        memberName: `${member.firstName} ${member.lastName}`.trim(),
        band: member.trendCategory,
        ghlContactId: member.ghlContactId,
        text,
      });
      if (!r.ok) {
        setNotice({ tone: 'err', text: r.error });
        return;
      }
      const s = r.data.status;
      setNotice(
        s === 'sent'
          ? { tone: 'ok', text: 'Sent, and logged as a contact.' }
          : s === 'redirected'
            ? { tone: 'ok', text: 'Sent to the redirect address (test mode), and logged.' }
            : { tone: 'warn', text: 'Not delivered — this is not production. Logged as a contact so the queue treats it as done.' },
      );
      setText('');
      setDraft(null);
      onSent();
    } finally {
      setBusy(null);
    }
  }

  const over = text.length > SEGMENT;
  const segments = Math.max(1, Math.ceil(text.length / SEGMENT));

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition inline-flex items-center gap-1.5"
      >
        <MessageSquareText className="w-3.5 h-3.5" aria-hidden />
        Message
      </button>
    );
  }

  return (
    <div className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          SMS
          {draft && (
            <span className="font-normal normal-case tracking-normal">
              {' · '}{DRAFT_CATEGORY_LABEL[draft.category]}
              {draft.usualSlot ? ` · usually ${draft.usualSlot}` : ''}
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={doDraft}
          disabled={busy !== null}
          className="text-xs font-medium px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition inline-flex items-center gap-1"
        >
          <Sparkles className="w-3 h-3" aria-hidden />
          {busy === 'draft' ? 'Drafting…' : draft ? 'Redraft' : 'Draft with AI'}
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={320}
        placeholder={`Text ${member.firstName}…`}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
      />

      <div className="flex items-center justify-between gap-2">
        <p className={`text-[11px] tabular-nums ${over ? 'text-amber-700' : 'text-gray-400'}`}>
          {text.length}/{SEGMENT}
          {segments > 1 ? ` · ${segments} segments` : ''}
          {!canSend ? ' · no GHL contact — copy and send by hand' : ''}
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setNotice(null);
            }}
            className="text-xs font-medium px-2.5 py-1 rounded-lg text-gray-500 hover:text-gray-800"
          >
            Close
          </button>
          <button
            type="button"
            onClick={doSend}
            disabled={busy !== null || !text.trim() || !canSend || draft?.optedOut === true}
            className="text-xs font-semibold px-3 py-1 rounded-lg bg-gym-accent text-white hover:bg-gym-accent-hover disabled:opacity-40 transition"
          >
            {busy === 'send' ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>

      {notice && (
        <p
          className={`text-xs ${
            notice.tone === 'ok' ? 'text-emerald-700' : notice.tone === 'warn' ? 'text-amber-700' : 'text-rose-700'
          }`}
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}
