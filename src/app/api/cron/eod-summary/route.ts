import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { startOfDay, endOfDay } from 'date-fns';
import { createAdminClient } from '@/lib/supabase/admin';

// Uses Gmail SMTP via the same env vars as /api/timesheets/route.ts:
// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS. No additional setup needed.

const TZ = 'Australia/Sydney';
const RECIPIENTS = [
  'hasskaly89@gmail.com',
  'jasminrose.albos@remotetalentstaff.com',
];
const REPLY_TO = 'hasskaly89@gmail.com';
const DASHBOARD_URL =
  process.env.DASHBOARD_URL ?? 'https://yard-gym-dashboard.vercel.app';

type ContactRow = {
  member_id: string;
  member_name: string;
  band: 'STABLE' | 'SLOWING' | 'SLIDING' | 'STOPPED';
  contacted_at: string;
  contacted_by_name: string;
};

type SnoozeRow = {
  member_id: string;
  snoozed_until: string;
  snoozed_by_name: string;
  created_at: string;
};

function sydneyDayBoundsUtc(now = new Date()): {
  startUtc: Date;
  endUtc: Date;
  label: string;
} {
  // toZonedTime returns a Date whose wall-clock fields represent Sydney time;
  // we apply startOfDay/endOfDay against that, then convert back to real UTC
  // via fromZonedTime so the resulting ISO strings can be passed to Postgres.
  const sydneyNow = toZonedTime(now, TZ);
  return {
    startUtc: fromZonedTime(startOfDay(sydneyNow), TZ),
    endUtc: fromZonedTime(endOfDay(sydneyNow), TZ),
    label: formatInTimeZone(now, TZ, 'EEE d MMM yyyy'),
  };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET ?? process.env.SYNC_SECRET;
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpUser || !smtpPass) {
    return NextResponse.json(
      { error: 'SMTP_USER / SMTP_PASS not configured' },
      { status: 500 },
    );
  }

  const supabase = createAdminClient();
  const { startUtc, endUtc, label } = sydneyDayBoundsUtc();

  const [{ data: contactsToday }, { data: snoozesToday }, { data: weekContacts }] =
    await Promise.all([
      supabase
        .from('member_contacts')
        .select('member_id, member_name, band, contacted_at, contacted_by_name')
        .gte('contacted_at', startUtc.toISOString())
        .lt('contacted_at', endUtc.toISOString())
        .order('contacted_at', { ascending: true })
        .returns<ContactRow[]>(),
      supabase
        .from('member_snoozes')
        .select('member_id, snoozed_until, snoozed_by_name, created_at')
        .gte('created_at', startUtc.toISOString())
        .lt('created_at', endUtc.toISOString())
        .returns<SnoozeRow[]>(),
      supabase
        .from('member_contacts')
        .select('id')
        .gte(
          'contacted_at',
          new Date(startUtc.getTime() - 6 * 86400000).toISOString(),
        )
        .lt('contacted_at', endUtc.toISOString()),
    ]);

  const contacts = contactsToday ?? [];
  const snoozes = snoozesToday ?? [];

  const byUser: Record<string, number> = {};
  const byBand: Record<string, number> = {
    SLIDING: 0,
    SLOWING: 0,
    STOPPED: 0,
    STABLE: 0,
  };
  for (const c of contacts) {
    byUser[c.contacted_by_name] = (byUser[c.contacted_by_name] ?? 0) + 1;
    byBand[c.band] = (byBand[c.band] ?? 0) + 1;
  }

  const topToday = contacts.slice(0, 5);

  const userBreakdown = Object.entries(byUser)
    .map(([who, n]) => `  ${who}: ${n}`)
    .join('\n');

  const topLines = topToday.length
    ? topToday
        .map(
          (c, i) =>
            `  ${i + 1}. ${c.member_name} — ${c.band} — by ${c.contacted_by_name}`,
        )
        .join('\n')
    : '  (none)';

  const text = [
    `Yard Retention — ${label}`,
    '',
    `CHECK-INS LOGGED TODAY: ${contacts.length}`,
    userBreakdown || '  (none)',
    '',
    'BY BAND REACHED:',
    `  SLIDING: ${byBand.SLIDING}`,
    `  SLOWING: ${byBand.SLOWING}`,
    `  STOPPED: ${byBand.STOPPED}`,
    '',
    'TOP 5 LOGGED TODAY:',
    topLines,
    '',
    `SNOOZED TODAY: ${snoozes.length}`,
    '',
    `WEEK SO FAR (last 7 days): ${weekContacts?.length ?? 0} check-ins`,
    '',
    '— Yard Dashboard',
    DASHBOARD_URL,
  ].join('\n');

  const subject = `Yard Retention · ${label} · ${contacts.length} check-ins`;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const sendResults = await Promise.allSettled(
    RECIPIENTS.map((to) =>
      transporter.sendMail({
        from: `"Yard Dashboard" <${smtpUser}>`,
        to,
        replyTo: REPLY_TO,
        subject,
        text,
      }),
    ),
  );

  const failed = sendResults.filter((r) => r.status === 'rejected');
  if (failed.length) {
    return NextResponse.json(
      {
        ok: false,
        sent: sendResults.length - failed.length,
        errors: failed.map((r) =>
          r.status === 'rejected' ? String(r.reason) : null,
        ),
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    sent: sendResults.length,
    totalContacts: contacts.length,
    label,
  });
}
