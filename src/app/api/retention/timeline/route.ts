import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// One member's history as a single dated feed — Recovr's Timeline tab.
// Attended, booked, no-show and late-cancel classes; staff contacts; notes;
// packages starting and ending; the days the risk band changed. Messages are
// not here: they live in GoHighLevel and are not mirrored yet.

export type TimelineKind =
  | 'attended'
  | 'booked'
  | 'no_show'
  | 'late_cancelled'
  | 'contact'
  | 'note'
  | 'package_start'
  | 'package_end'
  | 'band_change'
  | 'joined';

export type TimelineEvent = {
  kind: TimelineKind;
  at: string; // ISO
  title: string;
  detail?: string;
  by?: string;
};

export type TimelineResponse = {
  events: TimelineEvent[]; // newest first
  totalAttended: number;
};

const CHANNEL: Record<string, string> = {
  call: 'Call',
  sms: 'SMS',
  in_person: 'In person',
  ghl: 'GHL message',
  other: 'Contact',
};

const BAND_LABEL: Record<string, string> = {
  healthy: 'Healthy',
  medium: 'Medium risk',
  high: 'High risk',
  lost: 'Lost',
};

const VISIT_TITLE: Record<string, string> = {
  attended: 'Attended',
  booked: 'Booked',
  no_show: 'No show',
  late_cancelled: 'Late cancel',
};

export async function GET(request: Request) {
  const session = await createClient();
  const { data: userData } = await session.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const memberId = new URL(request.url).searchParams.get('memberId');
  if (!memberId) {
    return NextResponse.json({ error: 'memberId required' }, { status: 400 });
  }

  // Visits, memberships and snapshots are service-role tables; contacts and
  // notes carry per-user RLS and are read through the session client.
  const admin = createAdminClient();
  const since = new Date(Date.now() - 180 * 86400000).toISOString();
  const sinceDay = since.slice(0, 10);

  const [visits, contacts, notes, memberships, snapshots, member] = await Promise.all([
    admin
      .from('member_visits')
      .select('visit_at, class_name, status')
      .eq('mindbody_client_id', memberId)
      .gte('visit_at', since)
      .order('visit_at', { ascending: false })
      .limit(400),
    session
      .from('member_contacts')
      .select('contacted_at, contacted_by_name, channel, outcome')
      .eq('member_id', memberId)
      .order('contacted_at', { ascending: false }),
    session
      .from('member_notes')
      .select('created_at, author_name, note')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false }),
    admin
      .from('member_memberships')
      .select('name, active_date, expiration_date, still_returned, last_seen_at')
      .eq('mindbody_client_id', memberId),
    admin
      .from('member_score_snapshots')
      .select('snapshot_date, score, band')
      .eq('mindbody_client_id', memberId)
      .gte('snapshot_date', sinceDay)
      .order('snapshot_date', { ascending: true }),
    admin
      .from('members')
      .select('membership_start_date, total_visit_count')
      .eq('mindbody_client_id', memberId)
      .maybeSingle(),
  ]);

  const events: TimelineEvent[] = [];

  for (const v of visits.data ?? []) {
    events.push({
      kind: v.status as TimelineKind,
      at: v.visit_at,
      title: VISIT_TITLE[v.status] ?? v.status,
      detail: v.class_name ?? undefined,
    });
  }

  for (const c of contacts.data ?? []) {
    events.push({
      kind: 'contact',
      at: c.contacted_at,
      title: c.channel ? (CHANNEL[c.channel] ?? c.channel) : 'Contacted',
      detail: c.outcome ?? undefined,
      by: c.contacted_by_name,
    });
  }

  for (const n of notes.data ?? []) {
    events.push({ kind: 'note', at: n.created_at, title: 'Note', detail: n.note, by: n.author_name });
  }

  // A weekly membership re-issues itself: MindBody returns a new row with a
  // later active_date and stops returning the old one. That is a renewal, not
  // an end and a start — show it once. A package that ended with nothing of
  // the same name taking over is a real end.
  const rows = memberships.data ?? [];
  const renewedNames = new Set(
    rows.filter((m) => m.still_returned && m.name).map((m) => m.name as string),
  );
  for (const m of rows) {
    const name = m.name ?? 'Membership';
    if (m.active_date && m.active_date >= sinceDay) {
      const isRenewal = rows.some(
        (o) => o !== m && o.name === m.name && !o.still_returned && (o.active_date ?? '') < m.active_date!,
      );
      events.push({
        kind: 'package_start',
        at: `${m.active_date}T00:00:00+10:00`,
        title: isRenewal ? 'Renewed' : 'Package started',
        detail: `${name}${m.expiration_date ? ` · to ${m.expiration_date}` : ''}`,
      });
    }
    if (!m.still_returned && m.last_seen_at >= since && !renewedNames.has(name)) {
      events.push({ kind: 'package_end', at: m.last_seen_at, title: 'Package ended', detail: name });
    }
  }

  // Only the days the band changed, and only when it changed DIRECTION — a
  // slide from healthy to lost over three weeks is one story, not three lines.
  // A later entry in the same direction replaces the earlier one, so the feed
  // shows where the slide ended, with where it began in the detail.
  const ORDER: Record<string, number> = { healthy: 0, medium: 1, high: 2, lost: 3 };
  let prevBand: string | null = null;
  let run: { idx: number; fromBand: string; dir: number } | null = null;
  for (const s of snapshots.data ?? []) {
    if (prevBand !== null && s.band !== prevBand) {
      const dir = Math.sign((ORDER[s.band] ?? 0) - (ORDER[prevBand] ?? 0));
      const ev: TimelineEvent = {
        kind: 'band_change',
        at: `${s.snapshot_date}T07:30:00+10:00`,
        title: BAND_LABEL[s.band] ?? s.band,
        detail: `Score ${s.score} · was ${BAND_LABEL[run && run.dir === dir ? run.fromBand : prevBand] ?? prevBand}`,
      };
      if (run && run.dir === dir) {
        events[run.idx] = ev;
      } else {
        run = { idx: events.length, fromBand: prevBand, dir };
        events.push(ev);
      }
    }
    prevBand = s.band;
  }

  const joined = member.data?.membership_start_date;
  if (joined && joined >= sinceDay) {
    events.push({ kind: 'joined', at: `${joined}T00:00:00+10:00`, title: 'Joined' });
  }

  events.sort((a, b) => b.at.localeCompare(a.at));

  return NextResponse.json({
    events,
    totalAttended: member.data?.total_visit_count ?? 0,
  } satisfies TimelineResponse);
}
