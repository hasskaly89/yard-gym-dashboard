'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { displayNameForEmail } from '@/lib/retention/users';
import type { Band } from '@/lib/retention/priority';
import { createAdminClient } from '@/lib/supabase/admin';
import { draftMessage, categoryFor, type DraftCategory } from '@/lib/ai/draft-message';
import { sendGHLSms, isGHLContactOptedOut } from '@/lib/ghl/api';
import { dispatch } from '@/lib/outbound/dispatch';
import { bookingWhen } from '@/lib/retention/reasons';

type Channel = 'sms' | 'call' | 'in_person' | 'ghl' | 'other';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { supabase: null, user: null, error: 'Not authenticated' };
  }
  return { supabase, user: data.user, error: null };
}

export async function logContact(input: {
  memberId: string;
  memberName: string;
  band: Band;
  channel?: Channel;
  outcome?: string;
}): Promise<ActionResult<{ id: string }>> {
  const { supabase, user, error } = await requireUser();
  if (!supabase || !user) return { ok: false, error: error ?? 'No user' };

  const byName = displayNameForEmail(user.email);

  const { data, error: insertErr } = await supabase
    .from('member_contacts')
    .insert({
      member_id: input.memberId,
      member_name: input.memberName,
      band: input.band,
      contacted_by: user.id,
      contacted_by_name: byName,
      channel: input.channel ?? null,
      outcome: input.outcome ?? null,
    })
    .select('id')
    .single();

  if (insertErr || !data) {
    return { ok: false, error: insertErr?.message ?? 'Insert failed' };
  }

  revalidatePath('/retention');
  return { ok: true, data: { id: data.id } };
}

export async function snoozeMember(input: {
  memberId: string;
  days?: number;
  reason?: string;
}): Promise<ActionResult<{ snoozedUntil: string }>> {
  const { supabase, user, error } = await requireUser();
  if (!supabase || !user) return { ok: false, error: error ?? 'No user' };

  const days = input.days ?? 7;
  const until = new Date(Date.now() + days * 86400000).toISOString();
  const byName = displayNameForEmail(user.email);

  const { data, error: upsertErr } = await supabase
    .from('member_snoozes')
    .upsert(
      {
        member_id: input.memberId,
        snoozed_until: until,
        snoozed_by: user.id,
        snoozed_by_name: byName,
        reason: input.reason ?? null,
      },
      { onConflict: 'member_id' },
    )
    .select('snoozed_until')
    .single();

  if (upsertErr || !data) {
    return { ok: false, error: upsertErr?.message ?? 'Snooze failed' };
  }

  revalidatePath('/retention');
  return { ok: true, data: { snoozedUntil: data.snoozed_until } };
}

export async function addNote(input: {
  memberId: string;
  memberName: string;
  note: string;
}): Promise<ActionResult<{ id: string }>> {
  const { supabase, user, error } = await requireUser();
  if (!supabase || !user) return { ok: false, error: error ?? 'No user' };

  const note = input.note.trim();
  if (!note) return { ok: false, error: 'Note is empty' };
  if (note.length > 2000) {
    return { ok: false, error: 'Note is too long (2000 char max)' };
  }

  const byName = displayNameForEmail(user.email);

  const { data, error: insertErr } = await supabase
    .from('member_notes')
    .insert({
      member_id: input.memberId,
      member_name: input.memberName,
      note,
      author_id: user.id,
      author_name: byName,
    })
    .select('id')
    .single();

  if (insertErr || !data) {
    return { ok: false, error: insertErr?.message ?? 'Insert failed' };
  }

  revalidatePath('/retention/logs');
  return { ok: true, data: { id: data.id } };
}

export async function deleteNote(input: {
  noteId: string;
}): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (!supabase || !user) return { ok: false, error: error ?? 'No user' };

  // RLS enforces "own note + within 10 minutes" — we just attempt the delete.
  const { error: delErr } = await supabase
    .from('member_notes')
    .delete()
    .eq('id', input.noteId);

  if (delErr) return { ok: false, error: delErr.message };

  revalidatePath('/retention/logs');
  return { ok: true, data: undefined };
}

export async function undoLastContact(input: {
  memberId: string;
}): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (!supabase || !user) return { ok: false, error: error ?? 'No user' };

  // RLS policy enforces "own + within 5 minutes" — we just pick the most recent
  // contact for this member by this user and try to delete it. If RLS rejects,
  // we surface the error.
  const { data: latest, error: selErr } = await supabase
    .from('member_contacts')
    .select('id, created_at')
    .eq('member_id', input.memberId)
    .eq('contacted_by', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selErr) return { ok: false, error: selErr.message };
  if (!latest) return { ok: false, error: 'No contact to undo' };

  const ageMs = Date.now() - new Date(latest.created_at).getTime();
  if (ageMs > 5 * 60 * 1000) {
    return { ok: false, error: 'Undo window expired (5 min)' };
  }

  const { error: delErr } = await supabase
    .from('member_contacts')
    .delete()
    .eq('id', latest.id);

  if (delErr) return { ok: false, error: delErr.message };

  revalidatePath('/retention');
  return { ok: true, data: undefined };
}

// One owner per member; assigning again replaces the previous owner.
export async function assignMember(input: {
  memberId: string;
  memberName: string;
  assigneeId: string;
  assigneeName: string;
}): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (!supabase || !user) return { ok: false, error: error ?? 'No user' };

  const { error: upErr } = await supabase.from('member_assignments').upsert(
    {
      member_id: input.memberId,
      member_name: input.memberName,
      assigned_to: input.assigneeId,
      assigned_to_name: input.assigneeName,
      assigned_by: user.id,
      assigned_by_name: displayNameForEmail(user.email),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'member_id' },
  );
  if (upErr) return { ok: false, error: upErr.message };

  revalidatePath('/retention');
  return { ok: true, data: undefined };
}

export async function unassignMember(input: { memberId: string }): Promise<ActionResult> {
  const { supabase, user, error } = await requireUser();
  if (!supabase || !user) return { ok: false, error: error ?? 'No user' };

  const { error: delErr } = await supabase
    .from('member_assignments')
    .delete()
    .eq('member_id', input.memberId);
  if (delErr) return { ok: false, error: delErr.message };

  revalidatePath('/retention');
  return { ok: true, data: undefined };
}

// The member's usual class, from their last attended visits: the weekday and
// start time they come to most. "Monday 6:30 pm" — what the house closing
// line needs. Null below four visits.
async function usualSlotFor(memberId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('member_visits')
    .select('visit_at')
    .eq('mindbody_client_id', memberId)
    .eq('status', 'attended')
    .order('visit_at', { ascending: false })
    .limit(16);
  const rows = data ?? [];
  if (rows.length < 4) return null;
  const counts = new Map<string, number>();
  for (const r of rows) {
    const d = new Date(r.visit_at);
    const key =
      d.toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'long' }) +
      ' ' +
      d.toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit' }).toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const [slot, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return n >= 2 ? slot : null;
}

export type DraftResult = {
  text: string;
  category: DraftCategory;
  optedOut: boolean;
  usualSlot: string | null;
};

// Drafts an SMS for the drawer. Reads only; nothing is sent, nothing stored.
export async function draftSms(input: {
  memberId: string;
  firstName: string;
  band: string;
  daysSinceLastVisit: number | null;
  totalVisitCount: number;
  last56: number;
  prior56: number;
  nextBookingAt: string | null;
  packageName: string | null;
  packageEndsInDays: number | null;
  isIntro: boolean;
  ghlContactId: string | null;
}): Promise<ActionResult<DraftResult>> {
  const { user, error } = await requireUser();
  if (!user) return { ok: false, error: error ?? 'No user' };

  const admin = createAdminClient();
  const [usualSlot, note, optedOut] = await Promise.all([
    usualSlotFor(input.memberId),
    admin
      .from('member_notes')
      .select('note')
      .eq('member_id', input.memberId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((r) => r.data?.note ?? null),
    input.ghlContactId ? isGHLContactOptedOut(input.ghlContactId).catch(() => false) : Promise.resolve(false),
  ]);

  const category = categoryFor({
    band: input.band,
    daysSinceLastVisit: input.daysSinceLastVisit,
    totalVisitCount: input.totalVisitCount,
    last56: input.last56,
    prior56: input.prior56,
    isIntro: input.isIntro,
  });
  const text = await draftMessage({
    firstName: input.firstName,
    category,
    daysSinceLastVisit: input.daysSinceLastVisit,
    usualSlot,
    nextBooking: input.nextBookingAt ? bookingWhen(input.nextBookingAt, Date.now()) : null,
    packageName: input.packageName,
    packageEndsInDays: input.packageEndsInDays,
    totalSessions: input.totalVisitCount,
    recentNote: note,
    signOff: displayNameForEmail(user.email),
  });
  if (!text) return { ok: false, error: 'AI drafting is not configured' };
  return { ok: true, data: { text, category, optedOut, usualSlot } };
}

// Sends an SMS the staff member has read and approved, through GHL, through
// dispatch() — so outside production it is logged and not delivered. A sent
// message is a contact: it enters member_contacts as channel 'sms' with the
// text as the outcome, which is what the queues, the timeline and (later) the
// Results engine read.
export async function sendSms(input: {
  memberId: string;
  memberName: string;
  band: Band;
  ghlContactId: string;
  text: string;
}): Promise<ActionResult<{ status: string }>> {
  const { supabase, user, error } = await requireUser();
  if (!supabase || !user) return { ok: false, error: error ?? 'No user' };

  const text = input.text.trim();
  if (!text) return { ok: false, error: 'Empty message' };
  if (text.length > 320) return { ok: false, error: 'Message is over two SMS segments (320 characters)' };

  // Checked again at send time, not just at draft time.
  if (await isGHLContactOptedOut(input.ghlContactId).catch(() => false)) {
    return { ok: false, error: 'This member has opted out of SMS (STOP). Not sent.' };
  }

  const r = await dispatch({
    channel: 'ghl_sms',
    memberId: input.memberId,
    recipient: input.ghlContactId,
    purpose: 'retention:sms',
    payload: { text, by: user.email ?? user.id },
    send: async (target) => {
      await sendGHLSms(target, text);
    },
  });
  if (r.status === 'failed') return { ok: false, error: r.reason ?? 'Send failed' };

  // Log it as a contact whatever happened at the gate: on a laptop the row says
  // "would have sent", and the member is held out of the queues for a week
  // exactly as if it had. (A suppressed send on a laptop is still a staff
  // decision to contact.)
  await supabase.from('member_contacts').insert({
    member_id: input.memberId,
    member_name: input.memberName,
    band: input.band,
    contacted_by: user.id,
    contacted_by_name: displayNameForEmail(user.email),
    channel: 'sms',
    outcome: (r.status === 'sent' ? '' : `[${r.status}] `) + text,
  });

  revalidatePath('/retention');
  return { ok: true, data: { status: r.status } };
}
