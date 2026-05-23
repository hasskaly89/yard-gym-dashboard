'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { displayNameForEmail } from '@/lib/retention/users';
import type { Band } from '@/lib/retention/priority';

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
