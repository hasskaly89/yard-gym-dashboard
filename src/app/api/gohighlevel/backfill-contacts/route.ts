import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { findGHLContactByEmail, findGHLContactByPhone } from '@/lib/ghl/api';

// One-off backfill: links existing members to their GHL contact by email/phone
// lookup. LINK ONLY — never creates a GHL contact, to avoid duplicating
// contacts GHL doesn't already have (unlike the milestone-trigger path, which
// creates on first touch). Most members predate that trigger code and have
// never been linked, so their "Open in GHL" link is just missing, not dead.
//
// Manual trigger only (Bearer SYNC_SECRET), not on any cron — this is a
// one-time catch-up, re-run safe (skips already-linked members).
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

type MemberRow = {
  mindbody_client_id: string;
  email: string | null;
  phone: string | null;
};

const DELAY_MS = 250;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  const secret = process.env.SYNC_SECRET ?? process.env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const PAGE = 1000;
  let from = 0;
  const members: MemberRow[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from('members')
      .select('mindbody_client_id, email, phone')
      .eq('status', 'active')
      .eq('has_paid_membership', true)
      .is('ghl_contact_id', null)
      .range(from, from + PAGE - 1)
      .returns<MemberRow[]>();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    members.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }

  let linked = 0;
  let notFound = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const m of members) {
    try {
      let contactId: string | null = null;
      if (m.email) contactId = await findGHLContactByEmail(m.email);
      if (!contactId && m.phone) contactId = await findGHLContactByPhone(m.phone);

      if (contactId) {
        const { error } = await supabase
          .from('members')
          .update({ ghl_contact_id: contactId })
          .eq('mindbody_client_id', m.mindbody_client_id);
        if (error) errors.push(`${m.mindbody_client_id}: ${error.message}`);
        else linked++;
      } else if (!m.email && !m.phone) {
        skipped++;
      } else {
        notFound++;
      }
    } catch (e) {
      errors.push(`${m.mindbody_client_id}: ${(e as Error).message}`);
    }
    await sleep(DELAY_MS);
  }

  return NextResponse.json({
    ok: true,
    scanned: members.length,
    linked,
    notFound,
    skipped,
    errors,
  });
}
