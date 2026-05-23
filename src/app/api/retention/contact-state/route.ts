import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export type ContactInfo = {
  contactedAt: string;
  contactedByName: string;
};

export type SnoozeInfo = {
  snoozedUntil: string;
  snoozedByName: string;
};

export type ContactStateResponse = {
  // Most recent contact per member (only members contacted in last 30 days
  // — older history is in the DB but irrelevant for badges and prioritisation).
  contacts: Record<string, ContactInfo>;
  // Active snoozes only (snoozed_until > now).
  snoozes: Record<string, SnoozeInfo>;
};

export async function GET() {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sinceIso = new Date(Date.now() - 30 * 86400000).toISOString();

  // Pull last 30d of contacts and reduce to most-recent-per-member client-side.
  // Querying ~hundreds of rows is fine; a DISTINCT ON would be cleaner but
  // requires raw SQL through Supabase RPC. Not worth the indirection for v1.
  const [{ data: contactRows, error: cErr }, { data: snoozeRows, error: sErr }] =
    await Promise.all([
      supabase
        .from('member_contacts')
        .select('member_id, contacted_at, contacted_by_name')
        .gte('contacted_at', sinceIso)
        .order('contacted_at', { ascending: false }),
      supabase
        .from('member_snoozes')
        .select('member_id, snoozed_until, snoozed_by_name')
        .gt('snoozed_until', new Date().toISOString()),
    ]);

  if (cErr || sErr) {
    return NextResponse.json(
      { error: cErr?.message ?? sErr?.message ?? 'Query failed' },
      { status: 500 },
    );
  }

  const contacts: Record<string, ContactInfo> = {};
  for (const row of contactRows ?? []) {
    if (!contacts[row.member_id]) {
      contacts[row.member_id] = {
        contactedAt: row.contacted_at,
        contactedByName: row.contacted_by_name,
      };
    }
  }

  const snoozes: Record<string, SnoozeInfo> = {};
  for (const row of snoozeRows ?? []) {
    snoozes[row.member_id] = {
      snoozedUntil: row.snoozed_until,
      snoozedByName: row.snoozed_by_name,
    };
  }

  const body: ContactStateResponse = { contacts, snoozes };
  return NextResponse.json(body);
}
